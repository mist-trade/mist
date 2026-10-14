import type { ProjectedStrategyBar } from '@app/market-data';
import { InMemoryFactorPluginRegistry } from './factor-plugin-registry';
import type { FactorContext, FactorPlugin } from './factor.types';
import { ChanBspFactorPlugin } from './plugins/chan-bsp.plugin';
import { LegacyRuleDslPlugin } from './plugins/legacy-rule-dsl.plugin';
import { FinancialSafetyGuardPlugin } from './plugins/financial-guard.plugin';
import { NorthboundCapitalPlugin } from './plugins/northbound-capital.plugin';
import { HttpProxyFactorPlugin } from './plugins/http-proxy.plugin';

function makeMockBar(
  time: Date,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 10000,
): ProjectedStrategyBar {
  return {
    rawBar: {
      securityId: 1,
      source: 'tdx',
      period: 5,
      timestamp: time,
      open,
      high,
      low,
      close,
      volume: String(volume),
      amount: String(volume * close),
      type: 'complete',
    },
    tradingDay: '2026-09-07',
    ohlc: {
      raw: { open, high, low, close },
      effective: { open, high, low, close },
      resolution: 'observed',
    },
    volume: {
      raw: String(volume),
      effective: String(volume),
      resolution: 'observed',
    },
    amount: {
      raw: String(volume * close),
      effective: String(volume * close),
      resolution: 'observed',
    },
  };
}

describe('Phase 1: Factor Plugins & Registry', () => {
  describe('FactorPluginRegistry', () => {
    it('registers and retrieves plugins by id and category', () => {
      const registry = new InMemoryFactorPluginRegistry();
      const plugin: FactorPlugin = {
        id: 'plugin.test.dummy',
        name: 'Dummy Plugin',
        category: 'TECHNICAL',
        version: '1.0.0',
        description: 'Test dummy',
        evaluate: async () => ({
          action: 'BUY',
          confidence: 0.9,
          reason: 'test',
        }),
      };

      registry.register(plugin);
      expect(registry.has('plugin.test.dummy')).toBe(true);
      expect(registry.get('plugin.test.dummy')).toBe(plugin);
      expect(registry.listByCategory('TECHNICAL')).toHaveLength(1);
      expect(registry.listByCategory('FUNDAMENTAL')).toHaveLength(0);
      expect(registry.listByCategory()).toHaveLength(1);

      registry.clear();
      expect(registry.has('plugin.test.dummy')).toBe(false);
    });

    it('rejects plugins without valid id', () => {
      const registry = new InMemoryFactorPluginRegistry();
      expect(() => registry.register({} as any)).toThrow();
    });
  });

  describe('FinancialSafetyGuardPlugin', () => {
    const plugin = new FinancialSafetyGuardPlugin();

    it('returns BUY when ROE and debt ratio are safe', async () => {
      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 1440,
        bars: [],
        attributes: new Map([
          ['fundamental.roe', 25.5],
          ['fundamental.debtRatio', 32.0],
        ]),
      };

      const opinion = await plugin.evaluate(context, {
        minRoe: 10.0,
        maxDebtRatio: 60.0,
      });

      expect(opinion.action).toBe('BUY');
      expect(opinion.confidence).toBe(0.9);
      expect(opinion.evidence?.passed).toBe(true);
    });

    it('returns SELL (veto) when ROE is below threshold or debt ratio is too high', async () => {
      const context: FactorContext = {
        securityId: 2,
        securityCode: '000002',
        timestamp: new Date(),
        period: 1440,
        bars: [],
        attributes: new Map([
          ['fundamental.roe', 3.2],
          ['fundamental.debtRatio', 85.0],
        ]),
      };

      const opinion = await plugin.evaluate(context, {
        minRoe: 8.0,
        maxDebtRatio: 70.0,
      });

      expect(opinion.action).toBe('SELL');
      expect(opinion.confidence).toBe(0.95);
      expect(opinion.evidence?.passed).toBe(false);
    });
  });

  describe('NorthboundCapitalPlugin', () => {
    const plugin = new NorthboundCapitalPlugin();

    it('returns BUY when net inflow exceeds threshold', async () => {
      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 1440,
        bars: [],
        attributes: new Map([['capital.northbound_inflow_wan', 3500]]),
      };

      const opinion = await plugin.evaluate(context, { minInflowWan: 2000 });
      expect(opinion.action).toBe('BUY');
      expect(opinion.confidence).toBeGreaterThan(0.75);
    });

    it('returns SELL when net outflow exceeds threshold', async () => {
      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 1440,
        bars: [],
        attributes: new Map([['capital.northbound_inflow_wan', -2500]]),
      };

      const opinion = await plugin.evaluate(context, { minInflowWan: 2000 });
      expect(opinion.action).toBe('SELL');
      expect(opinion.confidence).toBe(0.85);
    });
  });

  describe('HttpProxyFactorPlugin', () => {
    it('safely handles timeouts and degrades to NEUTRAL', async () => {
      const plugin = new HttpProxyFactorPlugin({
        id: 'plugin.ai.mock',
        name: 'Mock AI',
        endpointUrl: 'http://127.0.0.1:59999/timeout-test',
        timeoutMs: 50,
      });

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map(),
      };

      const opinion = await plugin.evaluate(context);
      expect(opinion.action).toBe('NEUTRAL');
      expect(opinion.confidence).toBe(0.0);
      expect(opinion.reason).toContain('自动弃权');
    });
  });

  describe('ChanBspFactorPlugin', () => {
    const plugin = new ChanBspFactorPlugin();

    it('returns NEUTRAL if bar count is below minimum required', async () => {
      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [makeMockBar(new Date(), 10, 11, 9, 10)],
        attributes: new Map(),
      };

      const opinion = await plugin.evaluate(context, { requiredBarCount: 50 });
      expect(opinion.action).toBe('NEUTRAL');
      expect(opinion.confidence).toBe(0.0);
      expect(opinion.reason).toContain('K线不足');
    });
  });

  describe('LegacyRuleDslPlugin', () => {
    const plugin = new LegacyRuleDslPlugin();

    it('evaluates compiled strategy rules and returns BUY on entry match', async () => {
      const baseTime = new Date('2026-09-07T09:30:00Z');
      const bars = [
        makeMockBar(new Date(baseTime.getTime()), 10, 10.5, 9.8, 10.2),
        makeMockBar(
          new Date(baseTime.getTime() + 60000),
          10.2,
          11.0,
          10.1,
          10.8,
        ),
      ];

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(baseTime.getTime() + 60000),
        period: 5,
        bars,
        attributes: new Map(),
      };

      // 规则：最新价 > 10.5
      const rule = {
        all: [
          {
            field: 'k.close',
            operator: 'gt',
            value: 10.5,
          },
        ],
      };

      const opinion = await plugin.evaluate(context, {
        rule,
        signalKind: 'entry',
      });

      expect(opinion.action).toBe('BUY');
      expect(opinion.confidence).toBe(0.8);
      expect(opinion.evidence?.matched).toBe(true);
    });

    it('returns NEUTRAL when rule conditions are not matched', async () => {
      const baseTime = new Date('2026-09-07T09:30:00Z');
      const bars = [
        makeMockBar(new Date(baseTime.getTime()), 10, 10.5, 9.8, 10.2),
      ];

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: baseTime,
        period: 5,
        bars,
        attributes: new Map(),
      };

      // 规则：最新价 > 20.0 (不匹配)
      const rule = {
        all: [
          {
            field: 'k.close',
            operator: 'gt',
            value: 20.0,
          },
        ],
      };

      const opinion = await plugin.evaluate(context, {
        rule,
        signalKind: 'entry',
      });

      expect(opinion.action).toBe('NEUTRAL');
      expect(opinion.confidence).toBe(0.0);
      expect(opinion.evidence?.matched).toBe(false);
    });
  });
});

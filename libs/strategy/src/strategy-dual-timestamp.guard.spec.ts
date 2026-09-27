import { StrategySimulationEngine } from './simulation/strategy-simulation.engine';
import { createChanBspDecisionFlow } from './simulation/standard-simulation-flows';
import { ChanBspFactorPlugin } from './factor/plugins/chan-bsp.plugin';
import type { StrategyBar } from '@app/market-data';
import { normalizeExternalDecimalText } from '../../decimal/src/decimal8';

describe('Strategy Dual-Timestamp & Frontier Parity Boundary Guard (架构红线门禁)', () => {
  function makeStrategyBar(time: Date, close = 10, period = 30): StrategyBar {
    return Object.freeze({
      securityId: 1,
      source: 'tdx',
      period,
      timestamp: time,
      open: close - 0.5,
      high: close + 1.0,
      low: close - 1.0,
      close,
      volume: normalizeExternalDecimalText('1000'),
      amount: normalizeExternalDecimalText('10000'),
      type: 'complete',
    });
  }

  describe('1. 双时间戳法定分离契约 (Dual-Timestamp Contract)', () => {
    it('SimulationSignal 必须严格分离 signalTime (决策触发时刻) 与 pivotTime (形态极值时刻)', async () => {
      const startTime = new Date('2025-07-01T09:30:00.000Z');
      const bars: StrategyBar[] = Array.from({ length: 65 }, (_, i) =>
        makeStrategyBar(
          new Date(startTime.getTime() + i * 30 * 60000),
          10 + i * 0.1,
        ),
      );

      const flow = createChanBspDecisionFlow({
        units: 'bi',
        direction: 'both',
        requiredBarCount: 50,
      });

      const engine = new StrategySimulationEngine(bars, {
        securityCode: '000001',
        period: 30,
        flow,
      });

      // 推进多步
      for (let i = 0; i < 60; i++) {
        const frame = await engine.stepNext();
        if (frame && frame.latestSignals && frame.latestSignals.length > 0) {
          for (const sig of frame.latestSignals) {
            // 契约断言 1: signalTime 必须严格等于当前确认 Bar 的时间戳 (右侧确立时刻)
            expect(sig.signalTime).toBe(frame.bar.timestamp.toISOString());
            expect(sig.triggerTime).toBe(frame.bar.timestamp.toISOString());

            // 契约断言 2: pivotTime 必须存在且时间戳必然早于或等于 signalTime (绝对无未来极值)
            expect(sig.pivotTime).toBeDefined();
            const pivotMs = new Date(sig.pivotTime).getTime();
            const signalMs = new Date(sig.signalTime).getTime();
            expect(pivotMs).toBeLessThanOrEqual(signalMs);

            // 契约断言 3: triggerPrice 必须等于当前 Bar 的收盘价 (真实撮合基准)
            expect(sig.triggerPrice).toBe(frame.bar.close);

            // 契约断言 4: pivotPrice 必须为正数 (止损参考基准)
            expect(sig.pivotPrice).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('2. 单调前沿与方向门禁守护 (Monotonic & Direction Parity)', () => {
    it('ChanBspFactorPlugin 严禁回溯发射时间早于已处理极值的历史点 (Monotonicity)', async () => {
      const plugin = new ChanBspFactorPlugin();
      plugin.resetCursors();

      const time2 = new Date('2025-09-15T10:30:00.000Z');
      const timeOld = new Date('2025-09-15T09:30:00.000Z'); // 过去的时间

      const makeContext = (time: Date) => ({
        securityId: 1,
        securityCode: '000001',
        timestamp: time,
        period: 30,
        bars: Array.from({ length: 60 }, (_, i) => ({
          rawBar: makeStrategyBar(new Date(time.getTime() + i * 60000)),
          tradingDay: '2025-09-15',
          ohlc: {
            raw: { open: 10, high: 11, low: 9, close: 10 },
            effective: { open: 10, high: 11, low: 9, close: 10 },
            resolution: 'observed' as const,
          },
          volume: {
            raw: '1000',
            effective: '1000',
            resolution: 'observed' as const,
          },
          amount: {
            raw: '10000',
            effective: '10000',
            resolution: 'observed' as const,
          },
        })),
        attributes: new Map(),
      });

      // 第 1 步：在 time2 发射了 3买
      jest.spyOn(plugin as any, 'detectEvents').mockReturnValue([
        {
          type: 'third_buy' as const,
          units: 'bi' as const,
          time: time2,
          price: 3800,
          zhongshuIndex: 1,
          zg: 3850,
          zd: 3750,
          unitIndex: 10,
        },
      ]);
      const op1 = await plugin.evaluate(makeContext(time2) as any, {
        direction: 'both',
      });
      expect(op1.action).toBe('BUY');
      expect(op1.evidence?.candidateEvents).toHaveLength(1);

      // 第 2 步：后续求值突然回溯扫描到了更早历史时间 (timeOld < time2) 的事件
      jest.spyOn(plugin as any, 'detectEvents').mockReturnValue([
        {
          type: 'first_sell' as const,
          units: 'bi' as const,
          time: timeOld,
          price: 3900,
          zhongshuIndex: 0,
          zg: 3850,
          zd: 3750,
          unitIndex: 5,
        },
      ]);
      const op2 = await plugin.evaluate(makeContext(time2) as any, {
        direction: 'both',
      });
      // 刚性门禁：早于上次已发射极值时间的历史点必须被彻底拦截，严禁历史累积倾泻！
      expect(op2.action).toBe('NEUTRAL');
      expect(op2.reason).toContain('无需重复触发');
    });

    it('StrategySimulationEngine 单帧严禁混杂反向买卖点 (Direction Parity)', async () => {
      const plugin = new ChanBspFactorPlugin();
      plugin.resetCursors();

      const timeNow = new Date('2025-10-17T03:00:00.000Z');
      const timePast = new Date('2025-10-16T03:30:00.000Z');

      // 模拟底层出现 1卖 与 3买 跨历史时间并存
      const mockEvents = [
        {
          type: 'first_sell' as const,
          units: 'bi' as const,
          time: timePast,
          price: 3931.05,
          zhongshuIndex: 1,
          zg: 3950,
          zd: 3850,
          unitIndex: 8,
        },
        {
          type: 'third_buy' as const,
          units: 'bi' as const,
          time: timeNow,
          price: 3875.92,
          zhongshuIndex: 1,
          zg: 3950,
          zd: 3850,
          unitIndex: 10,
        },
      ];

      jest.spyOn(plugin as any, 'detectEvents').mockReturnValue(mockEvents);

      const context = {
        securityId: 1,
        securityCode: '000001',
        timestamp: timeNow,
        period: 30,
        bars: Array.from({ length: 60 }, (_, i) => ({
          rawBar: makeStrategyBar(new Date(timeNow.getTime() + i * 60000)),
          tradingDay: '2025-10-17',
          ohlc: {
            raw: { open: 10, high: 11, low: 9, close: 10 },
            effective: { open: 10, high: 11, low: 9, close: 10 },
            resolution: 'observed' as const,
          },
          volume: {
            raw: '1000',
            effective: '1000',
            resolution: 'observed' as const,
          },
          amount: {
            raw: '10000',
            effective: '10000',
            resolution: 'observed' as const,
          },
        })),
        attributes: new Map(),
      };

      const opinion = await plugin.evaluate(context as any, {
        direction: 'both',
      });
      // 主要决策为 BUY (以最新形态 third_buy 为主导)
      expect(opinion.action).toBe('BUY');

      // 核心门禁：finalCandidates 必须与 action 同向，严禁在 BUY 决策中携带 SELL 候选！
      const candidates = opinion.evidence?.candidateEvents as any[];
      expect(candidates).toBeDefined();
      for (const cand of candidates) {
        expect(cand.eventType.endsWith('_buy')).toBe(true);
        expect(cand.eventType.endsWith('_sell')).toBe(false);
      }
    });
  });
});

import { StrategyAlertEvent, StrategySignal } from '@app/shared-data';
import {
  buildGroupedNotificationMessage,
  renderTraceChain,
  type GroupedNotificationItem,
} from './notification-envelope';

const alertEvent = {
  id: 42,
  strategySignalId: 7,
  dedupeKey: 'live-v1:..',
} as StrategyAlertEvent;

function item(
  signal: Partial<StrategySignal>,
  overrides: {
    security?: { code: string; name: string } | null;
    strategy?: { name: string } | null;
    alertEvent?: { id: number; strategySignalId: number };
  } = {},
): GroupedNotificationItem {
  return {
    alertEvent: (overrides.alertEvent ?? alertEvent) as StrategyAlertEvent,
    signal: (signal ?? null) as StrategySignal,
    security: (overrides.security ?? null) as any,
    strategyDefinition: (overrides.strategy ?? null) as any,
  };
}

describe('buildGroupedNotificationMessage', () => {
  it('single item keeps the legacy summary: shanghai time, chinese direction, strategy + period', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'entry',
      period: 1,
      signalTime: new Date('2026-08-13T01:30:00.000Z'), // 09:30 in UTC+8
      contextSnapshot: { triggerPrice: 19.87 },
    } as unknown as StrategySignal;

    const text = buildGroupedNotificationMessage([
      item(signal, {
        security: { code: '300059', name: '东方财富' },
        strategy: { name: '均线策略' },
      }),
    ]);

    expect(text).toContain('300059');
    expect(text).toContain('东方财富');
    expect(text).toContain('买入');
    expect(text).toContain('19.87');
    expect(text).toContain('均线策略');
    // UTC 01:30 -> Shanghai 09:30; 1m 标签 09:30 -> 内容封存 09:31
    expect(text).toContain('2026-08-13 09:31');
  });

  it('maps exit -> 卖出 and day period -> 15:01(D) availability', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'exit',
      period: 1440,
      // 日线标签 = 交易日 00:00(D)，内容封存 = 15:01(D)
      signalTime: new Date('2026-08-12T16:00:00.000Z'),
      contextSnapshot: {},
    } as unknown as StrategySignal;

    const text = buildGroupedNotificationMessage([item(signal)]);

    expect(text).toContain('卖出');
    expect(text).toContain('日线');
    expect(text).toContain('2026-08-13 15:01');
  });

  it('falls back when signal/security/strategy are null', () => {
    const text = buildGroupedNotificationMessage([item(null as any)]);
    expect(text).toContain('7'); // strategySignalId fallback
    expect(text).toContain('signal'); // direction fallback
  });

  it('ignores non-numeric triggerPrice in contextSnapshot', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'entry',
      period: 1,
      signalTime: new Date(),
      contextSnapshot: { triggerPrice: 'not-a-number' },
    } as unknown as StrategySignal;

    const text = buildGroupedNotificationMessage([item(signal)]);
    expect(text).not.toContain('@ not-a-number');
  });

  it('renders chanBsp type and unit level into the single summary', () => {
    const signal = {
      securityId: 1,
      strategyDefinitionId: 10,
      signalKind: 'entry',
      period: 5,
      signalTime: new Date('2026-08-26T01:35:00.000Z'), // 09:35 in UTC+8
      contextSnapshot: {
        triggerPrice: 3050.25,
        badgeText: '一买 (笔级)',
        chanBsp: {
          type: 'first_buy',
          units: 'bi',
          level: 5,
          zhongshuIndex: 0,
          zg: 3060,
          zd: 3040,
        },
      },
    } as unknown as StrategySignal;

    const text = buildGroupedNotificationMessage([
      item(signal, {
        security: { code: '000001', name: '上证指数' },
        strategy: { name: '上证指数 5m 笔级缠论买卖点' },
      }),
    ]);

    expect(text).toBe(
      '[Mist] 000001 上证指数 一买 (笔级) @ 3050.25 | 上证指数 5m 笔级缠论买卖点 | 5m | 2026-08-26 09:35',
    );
  });

  it('renders duan-level chanBsp sell point into the single summary', () => {
    const signal = {
      securityId: 2,
      strategyDefinitionId: 11,
      signalKind: 'exit',
      period: 30,
      signalTime: new Date('2026-08-26T06:00:00.000Z'), // 14:00 in UTC+8
      contextSnapshot: {
        triggerPrice: 1620.1,
        badgeText: '三卖 (段级)',
        chanBsp: {
          type: 'third_sell',
          units: 'duan',
          level: 30,
          zhongshuIndex: 1,
          zg: 1650,
          zd: 1630,
        },
      },
    } as unknown as StrategySignal;
    const security = { code: '399006', name: '创业板指' };
    const strategy = { name: '创业板指 30m 段级缠论买卖点' };

    const text = buildGroupedNotificationMessage([
      item(signal, { security, strategy }),
    ]);

    expect(text).toBe(
      '[Mist] 399006 创业板指 三卖 (段级) @ 1620.1 | 创业板指 30m 段级缠论买卖点 | 30m | 2026-08-26 14:00',
    );
  });

  it('prioritizes transparent badgeText over the default direction word', () => {
    const signal = {
      securityId: 3,
      strategyDefinitionId: 12,
      signalKind: 'entry',
      period: 15,
      signalTime: new Date('2026-08-26T02:00:00.000Z'),
      badgeText: '左侧1买',
      contextSnapshot: {},
    } as unknown as StrategySignal;

    const text = buildGroupedNotificationMessage([item(signal)]);
    expect(text).toContain('左侧1买');
  });

  it('appends the compact trace chain to a single item with decisionTrace', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'entry',
      period: 30,
      signalTime: new Date('2026-08-12T01:35:00.000Z'),
      confidence: 88.5,
      confidenceLevel: 'HIGH',
      contextSnapshot: { triggerPrice: 12.5, badgeText: '二买' },
      decisionTrace: {
        trace: [
          { pluginId: 'plugin.regime.shanghai-index', name: 'regime 门禁' },
          { pluginId: 'plugin.chan.bsp', name: 'chan 二买' },
        ],
      },
    } as unknown as StrategySignal;

    const text = buildGroupedNotificationMessage([
      item(signal, {
        security: { code: '000001', name: '平安银行' },
        strategy: { name: '全共振战术' },
      }),
    ]);

    expect(text).toContain('链路：regime 门禁 ✓ → chan 二买 ✓');
  });

  it('multi-item group: one header, sells first, one compact chain line per signal', () => {
    const buy = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'entry',
      period: 30,
      signalTime: new Date('2026-08-12T01:35:00.000Z'),
      confidence: 88.5,
      confidenceLevel: 'HIGH',
      contextSnapshot: { triggerPrice: 12.5, badgeText: '二买' },
      decisionTrace: {
        trace: [{ pluginId: 'plugin.chan.bsp', name: 'chan 二买' }],
      },
    } as unknown as StrategySignal;
    const sell = {
      securityId: 9,
      strategyDefinitionId: 4,
      signalKind: 'exit',
      period: 60,
      signalTime: new Date('2026-08-12T01:35:00.000Z'),
      confidence: 80.4,
      confidenceLevel: 'MEDIUM',
      contextSnapshot: { triggerPrice: 12.1, badgeText: '顶背离' },
      decisionTrace: {
        trace: [{ pluginId: 'plugin.tactics.volume-price-confirmation' }],
      },
    } as unknown as StrategySignal;
    const security = { code: '000001', name: '平安银行' };

    const text = buildGroupedNotificationMessage([
      item(buy, { security, strategy: { name: '全共振战术' } }),
      item(sell, {
        security,
        strategy: { name: '波动压制突破' },
        alertEvent: { id: 43, strategySignalId: 8 },
      }),
    ]);

    const lines = text.split('\n');
    expect(lines[0]).toBe('[Mist] 000001 平安银行 | 2026-08-12 09:35');
    expect(lines[1]).toContain('- 卖出');
    expect(lines[2]).toContain('- 买入');
    expect(text.indexOf('卖出')).toBeLessThan(text.indexOf('买入'));
    // 每信号一行紧凑链：无 name 的节点回退 pluginId（剥 'plugin.' 前缀）
    expect(text).toContain('tactics.volume-price-confirmation ✓');
    expect(text).toContain('chan 二买 ✓');
  });

  it('renderTraceChain returns null for empty/missing traces', () => {
    expect(renderTraceChain(null)).toBeNull();
    expect(
      renderTraceChain({ decisionTrace: null } as unknown as StrategySignal),
    ).toBeNull();
    expect(
      renderTraceChain({
        decisionTrace: { trace: [] },
      } as unknown as StrategySignal),
    ).toBeNull();
  });
});

import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import {
  DEFAULT_TACTICAL_AGGREGATOR_CONFIG,
  type TacticalAggregatorConfig,
} from './tactical-event.types';
import { TacticalEventAggregator } from './tactical-event-aggregator';

describe('TacticalEventAggregator', () => {
  function createBar(timestamp: string, close = 10.0): StrategyBar {
    return {
      securityId: 1,
      securityCode: '600519',
      source: 'tdx',
      period: 5,
      timestamp: new Date(timestamp),
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: '10000',
      amount: '100000',
      type: 'complete',
    };
  }

  function createSignal(params: {
    signalType: string;
    displayTag?: string;
    badgeText?: string;
    action?: 'BUY' | 'SELL';
    signalKind?: 'entry' | 'exit';
    triggerPrice?: number;
    pivotTime?: string | null;
    pivotPrice?: number | null;
    securityCode?: string;
    time?: Date;
  }): KernelSignal {
    const signalTime = params.time ?? new Date('2026-10-28T09:30:00.000Z');
    return {
      definitionId: 201,
      versionId: 1,
      signalKind:
        params.signalKind ?? (params.action === 'SELL' ? 'exit' : 'entry'),
      signalTime,
      triggerTime: signalTime.toISOString(),
      triggerPrice: params.triggerPrice ?? 10.0,
      pivotTime: params.pivotTime ?? null,
      pivotPrice: params.pivotPrice ?? null,
      signalType: params.signalType,
      confidence: 0.95,
      confidenceLevel: 'HIGH',
      badgeText: params.badgeText,
      displayTag: params.displayTag,
      decisionTrace: {
        action: params.action ?? 'BUY',
        pluginId: params.signalType,
      },
      contextSnapshot: params.securityCode
        ? { securityCode: params.securityCode }
        : {},
      ruleSnapshot: {},
      ...(params.securityCode
        ? { securityCode: params.securityCode }
        : ({} as any)),
    };
  }

  it('runs complete pipeline EdgeDetector -> TemporalWindowEngine -> TacticalCooldownTracker', () => {
    const config: TacticalAggregatorConfig = {
      edgePlugins: ['plugin.regime.shanghai-index'],
      windows: [
        {
          triggerTag: 'chan_1b',
          windowBars: 3,
          requiredConfirmationTags: ['vpci_surge'],
          compositeBadgeText: '1买+放量',
        },
      ],
      cooldownBars: 3,
    };
    const aggregator = new TacticalEventAggregator(config);

    // Bar 0:
    // 包含持续态插件信号（第一次 0->1 发射）+ 扳机信号（开窗）
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const regimeSignal0 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
      securityCode: '000001.SH',
      time: bar0.timestamp,
    });
    const triggerSignal0 = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      badgeText: '1买',
      pivotTime: '2026-10-28T09:15:00.000Z',
      pivotPrice: 9.6,
      securityCode: '600519',
      time: bar0.timestamp,
    });

    const events0 = aggregator.push([regimeSignal0, triggerSignal0], bar0);
    // regimeSignal0 没有观察窗规则，作为单点事件发出；triggerSignal0 开启观察窗，暂不发射
    expect(events0).toHaveLength(1);
    expect(events0[0].badgeText).toBe('plugin.regime.shanghai-index');
    expect(events0[0].securityCode).toBe('000001.SH');

    // Bar 1:
    // regimeSignal 仍为 BUY，应被 EdgeDetector 抑制；无其它信号
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.1);
    const regimeSignal1 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
      securityCode: '000001.SH',
      time: bar1.timestamp,
    });
    const events1 = aggregator.push([regimeSignal1], bar1);
    expect(events1).toHaveLength(0); // 边沿抑制，无事件

    // Bar 2:
    // 收到确认信号 vpci_surge，合成 1买+放量 战术入场事件
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.5);
    const confirmSignal2 = createSignal({
      signalType: 'vpci_surge',
      displayTag: 'vpci_surge',
      badgeText: '放量',
      securityCode: '600519',
      time: bar2.timestamp,
    });
    const events2 = aggregator.push([confirmSignal2], bar2);
    expect(events2).toHaveLength(1);
    const compositeEvent = events2[0];
    expect(compositeEvent.badgeText).toBe('1买+放量');
    expect(compositeEvent.elapsedBars).toBe(2);
    expect(compositeEvent.timestamp).toEqual(bar2.timestamp);
    expect(compositeEvent.pivotTime).toBe('2026-10-28T09:15:00.000Z');
    expect(compositeEvent.pivotPrice).toBe(9.6);
    expect(compositeEvent.securityCode).toBe('600519');
    expect(compositeEvent.action).toBe('BUY');
    expect(compositeEvent.kind).toBe('ENTRY');

    // Bar 3:
    // 600519 再次触发买入，此时处于 Bar 2 入场后的 3 根 Bar 冷却闭锁中（1 <= 3），被 TacticalCooldownTracker 抑制
    const bar3 = createBar('2026-10-28T09:45:00.000Z', 10.6);
    const triggerSignal3 = createSignal({
      signalType: 'chan_2b',
      badgeText: '2买',
      action: 'BUY',
      securityCode: '600519',
      time: bar3.timestamp,
    });
    const events3 = aggregator.push([triggerSignal3], bar3);
    expect(events3).toHaveLength(0);
  });

  it('suppresses subsequent same-direction entry triggers within K bars after entry event (cooldown de-bounce)', () => {
    const config: TacticalAggregatorConfig = {
      cooldownBars: 3, // K = 3
    };
    const aggregator = new TacticalEventAggregator(config);

    // Bar 0: 首个入场事件，成功发射
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const entry0 = createSignal({
      signalType: 'breakout_buy',
      displayTag: 'breakout',
      badgeText: '突破买入',
      action: 'BUY',
      signalKind: 'entry',
      time: bar0.timestamp,
    });
    const events0 = aggregator.push([entry0], bar0);
    expect(events0).toHaveLength(1);
    expect(events0[0].badgeText).toBe('突破买入');

    // Bar 1 (offset 1 <= K): 同向入场被冷却抑制
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.2);
    const entry1 = createSignal({
      signalType: 'pullback_buy',
      displayTag: 'pullback',
      badgeText: '回踩买入',
      action: 'BUY',
      signalKind: 'entry',
      time: bar1.timestamp,
    });
    const events1 = aggregator.push([entry1], bar1);
    expect(events1).toHaveLength(0);

    // Bar 2 (offset 2 <= K): 同向入场仍被抑制
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.3);
    const entry2 = createSignal({
      signalType: 'volume_buy',
      displayTag: 'vol_buy',
      badgeText: '放量买入',
      action: 'BUY',
      signalKind: 'entry',
      time: bar2.timestamp,
    });
    const events2 = aggregator.push([entry2], bar2);
    expect(events2).toHaveLength(0);

    // Bar 2: 同时若发出反向卖出/出场信号，不受买入冷却拦截，必须放行！
    const exit2 = createSignal({
      signalType: 'stop_profit',
      displayTag: 'exit_tag',
      badgeText: '止盈',
      action: 'SELL',
      signalKind: 'exit',
      time: bar2.timestamp,
    });
    const exitEvents = aggregator.push([exit2], bar2);
    expect(exitEvents).toHaveLength(1);
    expect(exitEvents[0].action).toBe('SELL');
    expect(exitEvents[0].kind).toBe('EXIT');

    // Bar 3 (offset 3 <= K): 同向买入仍处于 3 根 Bar 冷却闭锁中
    const bar3 = createBar('2026-10-28T09:45:00.000Z', 10.4);
    const entry3 = createSignal({
      signalType: 'breakout_buy',
      action: 'BUY',
      signalKind: 'entry',
      time: bar3.timestamp,
    });
    const events3 = aggregator.push([entry3], bar3);
    expect(events3).toHaveLength(0);

    // Bar 4 (offset 4 > K): 冷却结束，新的同向买入正常放行
    const bar4 = createBar('2026-10-28T09:50:00.000Z', 10.6);
    const entry4 = createSignal({
      signalType: 'breakout_buy',
      badgeText: '二次突破',
      action: 'BUY',
      signalKind: 'entry',
      time: bar4.timestamp,
    });
    const events4 = aggregator.push([entry4], bar4);
    expect(events4).toHaveLength(1);
    expect(events4[0].badgeText).toBe('二次突破');
  });

  it('resets all internal state and cooldowns on reset()', () => {
    const config: TacticalAggregatorConfig = {
      cooldownBars: 5,
    };
    const aggregator = new TacticalEventAggregator(config);

    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const entry0 = createSignal({
      signalType: 'buy_1',
      action: 'BUY',
      signalKind: 'entry',
      time: bar0.timestamp,
    });
    expect(aggregator.push([entry0], bar0)).toHaveLength(1);

    // Bar 1 同向抑制
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.1);
    expect(aggregator.push([entry0], bar1)).toHaveLength(0);

    // reset 后再次放行
    aggregator.reset();
    expect(aggregator.push([entry0], bar1)).toHaveLength(1);
  });

  it('works seamlessly with DEFAULT_TACTICAL_AGGREGATOR_CONFIG for both chan.bsp and bull-left-right-bsp', () => {
    const aggregator = new TacticalEventAggregator(
      DEFAULT_TACTICAL_AGGREGATOR_CONFIG,
    );

    // Bar 0: 宏观牛市跃迁 (BUY) + 专属战术买点触发
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const regimeSignal = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      displayTag: 'REGIME_BULL',
      action: 'BUY',
      securityCode: '600519',
      time: bar0.timestamp,
    });
    const tacticsSignal = createSignal({
      signalType: 'plugin.tactics.bull-left-right-bsp',
      displayTag: 'BUY_SUB_CROSS_ZERO_RIGHT',
      badgeText: '次级别零轴穿越买点',
      pivotPrice: 9.8,
      pivotTime: '2026-10-28T09:15:00.000Z',
      securityCode: '600519',
      time: bar0.timestamp,
    });

    const events0 = aggregator.push([regimeSignal, tacticsSignal], bar0);
    // 观察窗开启，等待确认，当前不产生战术开仓
    // 注意：regime 信号通过边沿跃迁透传（若无窗口拦截）
    const entryEvents0 = events0.filter((e) => e.kind === 'ENTRY');
    expect(entryEvents0).toHaveLength(0);

    // Bar 1: VPCI 放量确认到来，成功合成专属战术事件
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.2);
    const vpciSignal = createSignal({
      signalType: 'plugin.tactics.volume-price-confirmation',
      displayTag: 'plugin.tactics.volume-price-confirmation',
      securityCode: '600519',
      time: bar1.timestamp,
    });

    const events1 = aggregator.push([vpciSignal], bar1);
    const entryEvents1 = events1.filter((e) => e.kind === 'ENTRY');
    expect(entryEvents1).toHaveLength(1);
    expect(entryEvents1[0].badgeText).toBe('专属战术+放量确认');
    expect(entryEvents1[0].triggerPrice).toBe(10.2);
    expect(entryEvents1[0].pivotPrice).toBe(9.8);
  });

  it('DEFAULT_TACTICAL_AGGREGATOR_CONFIG: 熊市逃命风控规则 (bear-left-right-bsp) 0 延迟发射、清仓风控 (RISK_CUT) 并不受冷却拦截，同时即刻作废未决多头观察窗', () => {
    const aggregator = new TacticalEventAggregator(
      DEFAULT_TACTICAL_AGGREGATOR_CONFIG,
    );

    // Bar 0: 牛市环境 + 多头买点开窗
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const regimeBull = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      displayTag: 'REGIME_BULL',
      action: 'BUY',
      securityCode: '600519',
      time: bar0.timestamp,
    });
    const bullTrigger = createSignal({
      signalType: 'plugin.tactics.bull-left-right-bsp',
      displayTag: 'BUY_1B_EXTREME_LEFT',
      badgeText: '极限左侧1买',
      pivotPrice: 9.8,
      securityCode: '600519',
      time: bar0.timestamp,
    });

    const events0 = aggregator.push([regimeBull, bullTrigger], bar0);
    expect(events0.filter((e) => e.kind === 'ENTRY')).toHaveLength(0);

    // Bar 1: 突发熊市极速逃命卖点（例如跳空低开或次级破零）
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 9.5);
    const bearEscapeSignal = createSignal({
      signalType: 'plugin.tactics.bear-left-right-bsp',
      displayTag: 'BEAR_EXIT_GAP_DOWN',
      badgeText: '跳空低开卖',
      action: 'SELL',
      signalKind: 'exit',
      triggerPrice: 9.5,
      securityCode: '600519',
      time: bar1.timestamp,
    });

    const events1 = aggregator.push([bearEscapeSignal], bar1);
    // 验证 0 延迟发射极速逃命风控卖点
    expect(events1).toHaveLength(1);
    const escapeEvent = events1[0];
    expect(escapeEvent.action).toBe('SELL');
    expect(escapeEvent.kind).toBe('RISK_CUT');
    expect(escapeEvent.badgeText).toBe('熊市极速逃命');
    expect(escapeEvent.triggerPrice).toBe(9.5);

    // Bar 2: 此时即便迟到的 VPCI 放量信号到来，原有的多头观察窗已在 Bar 1 被作废，严禁形成买入
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 9.6);
    const vpciSignal = createSignal({
      signalType: 'plugin.tactics.volume-price-confirmation',
      displayTag: 'plugin.tactics.volume-price-confirmation',
      securityCode: '600519',
      time: bar2.timestamp,
    });

    const events2 = aggregator.push([vpciSignal], bar2);
    expect(events2.filter((e) => e.kind === 'ENTRY')).toHaveLength(0);
  });
});

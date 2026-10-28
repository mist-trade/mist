import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import type { TacticalWindowRule } from './tactical-event.types';
import { TemporalWindowEngine } from './temporal-window-engine';

describe('TemporalWindowEngine', () => {
  function createBar(
    timestamp: string,
    close = 10.0,
    high?: number,
    low?: number,
  ): StrategyBar {
    return {
      securityId: 1,
      securityCode: '600519',
      source: 'tdx',
      period: 5,
      timestamp: new Date(timestamp),
      open: close - 0.1,
      high: high ?? close + 0.2,
      low: low ?? close - 0.2,
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
    time?: Date;
    confidence?: number;
    evidence?: Record<string, unknown>;
  }): KernelSignal {
    const signalTime = params.time ?? new Date('2026-10-28T09:30:00.000Z');
    return {
      definitionId: 101,
      versionId: 1,
      signalKind:
        params.signalKind ?? (params.action === 'SELL' ? 'exit' : 'entry'),
      signalTime,
      triggerTime: signalTime.toISOString(),
      triggerPrice: params.triggerPrice ?? 10.0,
      pivotTime: params.pivotTime ?? null,
      pivotPrice: params.pivotPrice ?? null,
      signalType: params.signalType,
      confidence: params.confidence ?? 0.95,
      confidenceLevel: 'HIGH',
      badgeText: params.badgeText,
      displayTag: params.displayTag,
      decisionTrace: {
        action: params.action ?? 'BUY',
      },
      evidence: params.evidence,
      contextSnapshot: {},
      ruleSnapshot: {},
    } as any;
  }

  it('directly generates single-point TacticalEvent if trigger signal has no configured observation window', () => {
    const engine = new TemporalWindowEngine([]);

    const bar = createBar('2026-10-28T09:35:00.000Z', 10.2);
    const signal = createSignal({
      signalType: 'first_buy',
      displayTag: 'chan_1b',
      badgeText: '1买',
      pivotTime: '2026-10-28T09:30:00.000Z',
      pivotPrice: 9.8,
      triggerPrice: 10.2,
      time: bar.timestamp,
    });

    const events = engine.push(signal, bar, 0);

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.definitionId).toBe(101);
    expect(event.securityCode).toBe('600519');
    expect(event.action).toBe('BUY');
    expect(event.kind).toBe('ENTRY');
    expect(event.timestamp).toEqual(bar.timestamp);
    expect(event.triggerPrice).toBe(10.2);
    expect(event.pivotTime).toBe('2026-10-28T09:30:00.000Z');
    expect(event.pivotPrice).toBe(9.8);
    expect(event.badgeText).toBe('1买');
    expect(event.displayTag).toBe('chan_1b');
    expect(event.elapsedBars).toBe(0);
    expect(event.triggerSignal).toBe(signal);
    expect(event.confirmingSignals).toHaveLength(0);
  });

  it('opens window at t without immediate emit, and synthesizes TacticalEvent at t+2 when confirmed', () => {
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 3,
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      badgeText: '1买',
      pivotTime: '2026-10-28T09:20:00.000Z',
      pivotPrice: 9.5,
      triggerPrice: 10.0,
      time: bar0.timestamp,
    });

    // 收到扳机信号在 t 开窗（不立即发射）
    const eventsT0 = engine.push(triggerSignal, bar0, 0);
    expect(eventsT0).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t+1: 中间 Bar 推进，无信号
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.2);
    const eventsT1 = engine.onBar(bar1, 1);
    expect(eventsT1).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t+2 (<= W): 收到 VPCI 放量确认
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.5);
    const confirmSignal = createSignal({
      signalType: 'vpci_surge',
      displayTag: 'vpci_surge',
      badgeText: '放量',
      pivotTime: null,
      pivotPrice: null,
      triggerPrice: 10.5,
      time: bar2.timestamp,
    });

    const eventsT2 = engine.push(confirmSignal, bar2, 2);
    expect(eventsT2).toHaveLength(1);

    const event = eventsT2[0];
    // 双时间戳法定契约校验：
    // 1. timestamp 必须严格等于确认 Bar（t+2）的 timestamp
    expect(event.timestamp).toEqual(bar2.timestamp);
    // 2. pivotTime 与 pivotPrice 必须继承扳机信号（t）的几何形态极值
    expect(event.pivotTime).toBe('2026-10-28T09:20:00.000Z');
    expect(event.pivotPrice).toBe(9.5);
    // 3. 价格为确认 Bar 的收盘观察价
    expect(event.triggerPrice).toBe(10.5);
    // 4. elapsedBars 必须精准等于 2
    expect(event.elapsedBars).toBe(2);
    // 5. 复合标签与确认证据链
    expect(event.badgeText).toBe('1买+放量');
    expect(event.triggerSignal).toBe(triggerSignal);
    expect(event.confirmingSignals).toHaveLength(1);
    expect(event.confirmingSignals[0]).toBe(confirmSignal);

    // 窗口完成后已出池，无残留
    expect(engine.getActiveWindows()).toHaveLength(0);
  });

  it('silently cancels expired window with no events emitted and zero residue when confirmation window times out', () => {
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 2, // W = 2
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
    });

    engine.push(triggerSignal, bar0, 0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=1: <= W, 窗口活跃
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.1);
    engine.onBar(bar1, 1);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=2: == W, 仍活跃
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.2);
    engine.onBar(bar2, 2);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=3: > W, 窗口超时静默注销
    const bar3 = createBar('2026-10-28T09:45:00.000Z', 10.3);
    const timeoutEvents = engine.onBar(bar3, 3);
    expect(timeoutEvents).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(0);

    // 在 t=3 迟到的确认信号不被处理，无事件发射，无残留
    const lateConfirmSignal = createSignal({
      signalType: 'vpci_surge',
      displayTag: 'vpci_surge',
      time: bar3.timestamp,
    });
    const lateEvents = engine.push(lateConfirmSignal, bar3, 3);
    expect(lateEvents).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(0);
  });

  it('resets all active windows on reset()', () => {
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 5,
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
    });

    engine.push(triggerSignal, bar0, 0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    engine.reset();
    expect(engine.getActiveWindows()).toHaveLength(0);
  });

  it('rejects opening window when requiredSetupTag is not in matching state', () => {
    const rules: TacticalWindowRule[] = [
      {
        requiredSetupTag: 'plugin.regime.shanghai-index',
        triggerTag: 'chan_1b',
        windowBars: 3,
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '牛市1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    // 未收到宏观牛市信号前，触发信号拒绝开窗
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
    });

    const events0 = engine.push(triggerSignal, bar0, 0);
    expect(events0).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(0);

    // 收到宏观牛市信号 (BUY)
    const regimeBullSignal = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      displayTag: 'REGIME_BULL',
      action: 'BUY',
      time: bar0.timestamp,
    });
    engine.push(regimeBullSignal, bar0, 0);
    expect(engine.getActiveSetupState('plugin.regime.shanghai-index')).toBe(
      'BUY',
    );

    // 宏观达标后，再次触发即可成功开启观察窗
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.1);
    const events1 = engine.push(triggerSignal, bar1, 1);
    expect(events1).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // 若突发宏观转熊 (SELL)，未决买入观察窗立即作废斩断
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 9.8);
    const regimeBearSignal = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      displayTag: 'REGIME_BEAR',
      action: 'SELL',
      time: bar2.timestamp,
    });
    engine.push(regimeBearSignal, bar2, 2);
    expect(engine.getActiveWindows()).toHaveLength(0); // 观察窗被避险清理
  });

  it('boosts confidence and appends badge when optionalBoostTags is captured without blocking confirmation', () => {
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 3,
        requiredConfirmationTags: ['vpci_surge'],
        optionalBoostTags: ['squeeze_fire'],
        compositeBadgeText: '战术买点',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
      confidence: 0.8,
    });

    engine.push(triggerSignal, bar0, 0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=1: 捕获可选加成标签 squeeze_fire
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.1);
    const boostSignal = createSignal({
      signalType: 'squeeze_fire',
      displayTag: 'squeeze_fire',
      time: bar1.timestamp,
    });
    engine.push(boostSignal, bar1, 1);
    expect(engine.getActiveWindows()[0].boostSignals).toHaveLength(1);

    // t=2: 捕获必选确认标签 vpci_surge，成功合成并触发加成
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.3);
    const confirmSignal = createSignal({
      signalType: 'vpci_surge',
      displayTag: 'vpci_surge',
      time: bar2.timestamp,
    });
    const events = engine.push(confirmSignal, bar2, 2);
    expect(events).toHaveLength(1);
    expect(events[0].badgeText).toBe('战术买点+爆发');
    expect(events[0].confidence).toBeGreaterThan(0.8);
    expect(events[0].confirmingSignals).toHaveLength(2); // vpci_surge + squeeze_fire
  });

  it('holds window alive on inside bars without consuming effective window bars, and synthesizes event when confirmed', () => {
    // 规则：windowBars: 2, maxContainmentHoldBars: 2
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 2,
        maxContainmentHoldBars: 2,
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    // t=0: 开窗基准 Bar (high: 10.5, low: 9.5, close: 10.0)
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0, 10.5, 9.5);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
      pivotPrice: 9.2,
    });
    engine.push(triggerSignal, bar0, 0);

    expect(engine.getActiveWindows()).toHaveLength(1);
    const win = engine.getActiveWindows()[0];
    expect(win.elapsedEffectiveBars).toBe(0);
    expect(win.heldContainmentBars).toBe(0);

    // t=1: 孕线十字星 1 (high: 10.2, low: 9.8, close: 10.0)
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.0, 10.2, 9.8);
    engine.onBar(bar1, 1);
    expect(engine.getActiveWindows()).toHaveLength(1);
    expect(win.heldContainmentBars).toBe(1);
    expect(win.elapsedEffectiveBars).toBe(0);

    // t=2: 孕线十字星 2 (high: 10.1, low: 9.9, close: 10.0)
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.0, 10.1, 9.9);
    engine.onBar(bar2, 2);
    expect(engine.getActiveWindows()).toHaveLength(1);
    expect(win.heldContainmentBars).toBe(2);
    expect(win.elapsedEffectiveBars).toBe(0);

    // t=3: 第 3 根突破放量确认 (high: 10.8, low: 9.9, close: 10.6)
    // 此时物理已过 3 根，若无保活机制 (windowBars=2) 早已超时注销；
    // 但因前 2 根为孕线保活，此处 elapsedEffectiveBars 仅为 1 <= 2，成功合成！
    const bar3 = createBar('2026-10-28T09:45:00.000Z', 10.6, 10.8, 9.9);
    const confirmSignal = createSignal({
      signalType: 'vpci_surge',
      displayTag: 'vpci_surge',
      time: bar3.timestamp,
    });
    const events = engine.push(confirmSignal, bar3, 3);
    expect(events).toHaveLength(1);
    expect(events[0].badgeText).toBe('1买+放量');
    expect(events[0].elapsedBars).toBe(3);
    expect(engine.getActiveWindows()).toHaveLength(0);
  });

  it('starts deducting effective bars when containment hold quota is exhausted and cancels on timeout', () => {
    // 规则：windowBars: 1, maxContainmentHoldBars: 2
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 1,
        maxContainmentHoldBars: 2,
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    // t=0: 开窗基准 Bar (high: 10.5, low: 9.5, close: 10.0)
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0, 10.5, 9.5);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
    });
    engine.push(triggerSignal, bar0, 0);

    const win = engine.getActiveWindows()[0];

    // t=1: 孕线 1 (held=1, elapsed=0)
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.0, 10.3, 9.7);
    engine.onBar(bar1, 1);
    expect(win.heldContainmentBars).toBe(1);
    expect(win.elapsedEffectiveBars).toBe(0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=2: 孕线 2 (held=2, elapsed=0) - 达到配额上限 2
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.0, 10.2, 9.8);
    engine.onBar(bar2, 2);
    expect(win.heldContainmentBars).toBe(2);
    expect(win.elapsedEffectiveBars).toBe(0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=3: 孕线 3 (虽仍为包含，但配额已耗尽，开始消耗有效步长 elapsed=1 <= windowBars=1)
    const bar3 = createBar('2026-10-28T09:45:00.000Z', 10.0, 10.1, 9.9);
    engine.onBar(bar3, 3);
    expect(win.heldContainmentBars).toBe(2);
    expect(win.elapsedEffectiveBars).toBe(1);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=4: 无论是否包含，步长累计为 elapsed=2 > windowBars=1，超时清退！
    const bar4 = createBar('2026-10-28T09:50:00.000Z', 10.0, 10.05, 9.95);
    engine.onBar(bar4, 4);
    expect(engine.getActiveWindows()).toHaveLength(0);
  });

  it('invalidates observation window immediately when close drops below pivotPrice and rejects subsequent confirmations', () => {
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 3,
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '1买+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    // t=0: 一买扳机开窗 (pivotPrice: 9.8, close: 10.0)
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0, 10.2, 9.8);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      pivotPrice: 9.8,
      triggerPrice: 10.0,
      time: bar0.timestamp,
    });
    engine.push(triggerSignal, bar0, 0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    // t=1: 突发破位大阴线，收盘价 9.5 跌破 pivotPrice 9.8
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 9.5, 9.9, 9.4);
    engine.onBar(bar1, 1);
    // 窗口应被立即清退作废
    expect(engine.getActiveWindows()).toHaveLength(0);

    // t=2: 即使后续出现反弹放量，也绝不触发合成事件
    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.2, 10.3, 9.6);
    const confirmSignal = createSignal({
      signalType: 'vpci_surge',
      displayTag: 'vpci_surge',
      time: bar2.timestamp,
    });
    const events = engine.push(confirmSignal, bar2, 2);
    expect(events).toHaveLength(0);
    expect(engine.getActiveWindows()).toHaveLength(0);
  });

  it('allows signal.evidence to autonomously override rule windowBars and maxContainmentHoldBars', () => {
    const rules: TacticalWindowRule[] = [
      {
        triggerTag: 'chan_1b',
        windowBars: 2, // 默认规则为 2
        maxContainmentHoldBars: 1, // 默认规则为 1
        requiredConfirmationTags: ['vpci_surge'],
        compositeBadgeText: '自适应买点+放量',
      },
    ];
    const engine = new TemporalWindowEngine(rules);

    // t=0: 扳机信号通过 evidence 自主携带策略
    const bar0 = createBar('2026-10-28T09:30:00.000Z', 10.0, 10.5, 9.5);
    const triggerSignal = createSignal({
      signalType: 'chan_1b',
      displayTag: 'chan_1b',
      time: bar0.timestamp,
      evidence: {
        windowBars: 5,
        maxContainmentHoldBars: 3,
      },
    });

    engine.push(triggerSignal, bar0, 0);
    expect(engine.getActiveWindows()).toHaveLength(1);

    const win = engine.getActiveWindows()[0];
    expect(win.targetWindowBars).toBe(5);
    expect(win.maxContainmentHoldBars).toBe(3);

    // 连续 3 根孕线保活 (held=1, 2, 3，均在自主配额 3 范围内)
    const bar1 = createBar('2026-10-28T09:35:00.000Z', 10.0, 10.3, 9.7);
    engine.onBar(bar1, 1);
    expect(win.heldContainmentBars).toBe(1);
    expect(win.elapsedEffectiveBars).toBe(0);

    const bar2 = createBar('2026-10-28T09:40:00.000Z', 10.0, 10.2, 9.8);
    engine.onBar(bar2, 2);
    expect(win.heldContainmentBars).toBe(2);
    expect(win.elapsedEffectiveBars).toBe(0);

    const bar3 = createBar('2026-10-28T09:45:00.000Z', 10.0, 10.1, 9.9);
    engine.onBar(bar3, 3);
    expect(win.heldContainmentBars).toBe(3);
    expect(win.elapsedEffectiveBars).toBe(0);

    // 随后持续推进 5 根有效非包含 Bar (elapsed 1..5 <= 5，窗口持续存活)
    for (let i = 1; i <= 5; i++) {
      const bar = createBar(
        `2026-10-28T09:${45 + i * 5}:00.000Z`,
        10.0 + i * 0.2,
        10.5 + i * 0.2,
        9.5 + i * 0.2,
      );
      engine.onBar(bar, 3 + i);
      expect(win.elapsedEffectiveBars).toBe(i);
      expect(engine.getActiveWindows()).toHaveLength(1);
    }

    // 第 6 根有效非包含 Bar：elapsed = 6 > 5，超时注销
    const bar9 = createBar('2026-10-28T10:15:00.000Z', 11.5, 12.0, 11.0);
    engine.onBar(bar9, 9);
    expect(engine.getActiveWindows()).toHaveLength(0);
  });
});

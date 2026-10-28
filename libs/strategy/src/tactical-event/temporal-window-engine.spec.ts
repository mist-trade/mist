import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import type { TacticalWindowRule } from './tactical-event.types';
import { TemporalWindowEngine } from './temporal-window-engine';

describe('TemporalWindowEngine', () => {
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
    time?: Date;
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
      confidence: 0.95,
      confidenceLevel: 'HIGH',
      badgeText: params.badgeText,
      displayTag: params.displayTag,
      decisionTrace: {
        action: params.action ?? 'BUY',
      },
      contextSnapshot: {},
      ruleSnapshot: {},
    };
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
});

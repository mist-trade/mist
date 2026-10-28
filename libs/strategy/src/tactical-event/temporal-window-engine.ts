import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import {
  DEFAULT_MAX_CONTAINMENT_HOLD_BARS,
  DEFAULT_TACTICAL_WINDOW_BARS,
  type ActiveObservationWindow,
  type TacticalAction,
  type TacticalEvent,
  type TacticalEventKind,
  type TacticalWindowRule,
} from './tactical-event.types';

export class TemporalWindowEngine {
  private activeWindows: ActiveObservationWindow[] = [];
  private readonly rules: readonly TacticalWindowRule[];
  private readonly allConfirmationTags: Set<string>;
  private readonly allBoostTags: Set<string>;
  private readonly allSetupTags: Set<string>;
  private readonly activeSetupStates = new Map<
    string,
    TacticalAction | 'NEUTRAL'
  >();
  private windowCounter = 0;
  private eventCounter = 0;

  constructor(rules: readonly TacticalWindowRule[] = []) {
    this.rules = rules;
    this.allConfirmationTags = new Set(
      rules.flatMap((r) => r.requiredConfirmationTags),
    );
    this.allBoostTags = new Set(
      rules.flatMap((r) => r.optionalBoostTags ?? []),
    );
    this.allSetupTags = new Set(
      rules
        .map((r) => r.requiredSetupTag)
        .filter((t): t is string => typeof t === 'string' && t.length > 0),
    );
  }

  public push(
    signal: KernelSignal,
    bar: StrategyBar,
    currentBarIndex: number,
  ): TacticalEvent[] {
    // 0. 更新环境门禁状态，并在空头/破位时即时清洗未决多头观察窗
    this.updateSetupState(signal);

    // 1. 步进并修剪活跃观察窗（破位、孕线保活、超时清退）
    this.advanceWindows(bar, currentBarIndex);

    // 2. 检查当前信号是否命中已开启观察窗的确认条件或可选加成
    const completedEvents: TacticalEvent[] = [];
    let confirmedAnyWindow = false;
    const remainingWindows: ActiveObservationWindow[] = [];

    for (const win of this.activeWindows) {
      // 检查可选加成标签
      if (win.rule.optionalBoostTags) {
        for (const boostTag of win.rule.optionalBoostTags) {
          if (this.signalMatchesTag(signal, boostTag)) {
            win.boostSignals.push(signal);
            break;
          }
        }
      }

      let matchedTag: string | undefined;
      for (const tag of win.pendingTags) {
        if (this.signalMatchesTag(signal, tag)) {
          matchedTag = tag;
          break;
        }
      }

      if (matchedTag) {
        win.pendingTags.delete(matchedTag);
        win.confirmingSignals.push(signal);
        confirmedAnyWindow = true;

        if (win.pendingTags.size === 0) {
          // 窗口条件全部满足，合成战术事件
          completedEvents.push(
            this.createCompositeEvent(win, bar, currentBarIndex),
          );
          continue; // 出池
        }
      }

      remainingWindows.push(win);
    }

    this.activeWindows = remainingWindows;

    // 3. 检查当前信号是否属于某个规则的扳机信号（Trigger）
    const matchedRules = this.rules.filter((r) =>
      this.signalMatchesTag(signal, r.triggerTag),
    );

    if (matchedRules.length > 0) {
      for (const rule of matchedRules) {
        // 若配置了前置宏观门禁，校验当前环境是否达标（如牛市）；不达标严禁开窗
        if (
          rule.requiredSetupTag &&
          !this.isSetupSatisfied(rule.requiredSetupTag, rule.action ?? 'BUY')
        ) {
          continue;
        }

        const targetWindowBars =
          (typeof (signal as any).evidence?.windowBars === 'number'
            ? (signal as any).evidence.windowBars
            : undefined) ??
          rule.windowBars ??
          DEFAULT_TACTICAL_WINDOW_BARS;

        const maxContainmentHoldBars =
          (typeof (signal as any).evidence?.maxContainmentHoldBars === 'number'
            ? (signal as any).evidence.maxContainmentHoldBars
            : undefined) ??
          rule.maxContainmentHoldBars ??
          DEFAULT_MAX_CONTAINMENT_HOLD_BARS;

        const stopLossPrice =
          typeof signal.pivotPrice === 'number' ? signal.pivotPrice : null;

        if (
          rule.requiredConfirmationTags.length === 0 ||
          targetWindowBars <= 0
        ) {
          // 0 窗口或无需确认：直接发射
          completedEvents.push(
            this.createSinglePointEvent(
              signal,
              bar,
              rule.compositeBadgeText,
              rule.action,
              rule.kind,
            ),
          );
        } else {
          // 开辟活跃观察窗
          this.activeWindows.push({
            windowId: `win_${signal.definitionId}_${currentBarIndex}_${++this.windowCounter}`,
            rule,
            triggerSignal: signal,
            triggerBarIndex: currentBarIndex,
            openTimestamp: bar.timestamp,
            confirmingSignals: [],
            pendingTags: new Set(rule.requiredConfirmationTags),
            boostSignals: [],
            targetWindowBars,
            maxContainmentHoldBars,
            stopLossPrice,
            elapsedEffectiveBars: 0,
            heldContainmentBars: 0,
            lastBarRange: { high: bar.high, low: bar.low },
            lastEvaluatedBarIndex: currentBarIndex,
          });
        }
      }
      return completedEvents;
    }

    // 4. 未匹配任何扳机规则
    if (confirmedAnyWindow) {
      return completedEvents;
    }

    // 若属于环境门禁标签（如宏观体制）或确认/加成标签，静默记录状态，不作为独立开仓事件发射
    if (
      this.isSetupOnlySignal(signal) ||
      this.isConfirmationOrBoostOnlySignal(signal)
    ) {
      return completedEvents;
    }

    // 普通无窗口规则的信号，原样生成单点战术事件
    return [...completedEvents, this.createSinglePointEvent(signal, bar)];
  }

  public onBar(bar: StrategyBar, currentBarIndex: number): TacticalEvent[] {
    this.advanceWindows(bar, currentBarIndex);
    return [];
  }

  public reset(): void {
    this.activeWindows = [];
    this.activeSetupStates.clear();
    this.windowCounter = 0;
    this.eventCounter = 0;
  }

  public getActiveWindows(): readonly ActiveObservationWindow[] {
    return this.activeWindows;
  }

  public getActiveSetupState(
    setupTag: string,
  ): TacticalAction | 'NEUTRAL' | undefined {
    for (const [key, state] of this.activeSetupStates.entries()) {
      if (this.tagMatches(key, setupTag)) {
        return state;
      }
    }
    return undefined;
  }

  private isSetupSatisfied(
    setupTag: string,
    targetAction: TacticalAction = 'BUY',
  ): boolean {
    const state = this.getActiveSetupState(setupTag);
    if (state !== undefined) {
      return state === targetAction;
    }
    return false;
  }

  private updateSetupState(signal: KernelSignal): void {
    const action = this.extractSignalAction(signal);
    const keys = [
      signal.signalType,
      signal.displayTag,
      signal.badgeText,
      signal.decisionTrace?.pluginId,
      (signal as any).pluginId,
    ].filter((k): k is string => typeof k === 'string' && k.length > 0);

    for (const key of keys) {
      this.activeSetupStates.set(key, action);
    }

    // 若收到空头/逃命风控信号（如熊市确立或极速逃命卖点），立即清洗未决多头观察窗（避险斩断）
    if (action === 'SELL' || signal.signalKind === 'exit') {
      this.activeWindows = this.activeWindows.filter((win) => {
        const targetAction = win.rule.action ?? 'BUY';
        if (targetAction === 'BUY') {
          const isSetupMatch = win.rule.requiredSetupTag
            ? keys.some((k) => this.tagMatches(k, win.rule.requiredSetupTag!))
            : false;
          const isBearExit = keys.some((k) =>
            this.tagMatches(k, 'plugin.tactics.bear-left-right-bsp'),
          );
          if (isSetupMatch || isBearExit) {
            return false;
          }
        }
        return true;
      });
    }
  }

  private extractSignalAction(
    signal: KernelSignal,
  ): TacticalAction | 'NEUTRAL' {
    if (typeof (signal as any).action === 'string') {
      const act = (signal as any).action.toUpperCase();
      if (act === 'BUY' || act === 'SELL') return act;
      if (act === 'NEUTRAL') return 'NEUTRAL';
    }
    if (typeof signal.decisionTrace?.action === 'string') {
      const act = signal.decisionTrace.action.toUpperCase();
      if (act === 'BUY' || act === 'SELL') return act;
      if (act === 'NEUTRAL') return 'NEUTRAL';
    }
    if (signal.signalKind === 'exit') return 'SELL';
    if (signal.signalKind === 'entry') return 'BUY';
    return 'BUY';
  }

  private tagMatches(actualTag: string, expectedTag: string): boolean {
    if (actualTag === expectedTag) return true;
    if (actualTag.includes(expectedTag) || expectedTag.includes(actualTag))
      return true;
    return false;
  }

  private advanceWindows(bar: StrategyBar, currentBarIndex: number): void {
    const remaining: ActiveObservationWindow[] = [];

    for (const win of this.activeWindows) {
      if (win.lastEvaluatedBarIndex === currentBarIndex) {
        remaining.push(win);
        continue;
      }

      // 1. 结构破位清退：若 win.stopLossPrice != null && bar.close < win.stopLossPrice，立即作废注销
      const action =
        win.rule.action ??
        (win.triggerSignal.signalKind === 'exit' ? 'SELL' : 'BUY');
      const isBroken =
        action === 'SELL'
          ? win.stopLossPrice != null && bar.close > win.stopLossPrice
          : win.stopLossPrice != null && bar.close < win.stopLossPrice;

      if (win.rule.invalidateOnPivotBreak !== false && isBroken) {
        continue;
      }

      // 2. 孕线包含判断
      const isContained =
        bar.high <= win.lastBarRange.high && bar.low >= win.lastBarRange.low;

      // 3. 倒计时推进
      if (isContained && win.heldContainmentBars < win.maxContainmentHoldBars) {
        win.heldContainmentBars += 1;
        // 触发形态停顿保活，不递增 elapsedEffectiveBars
      } else {
        win.elapsedEffectiveBars += 1;
        win.lastBarRange = { high: bar.high, low: bar.low };
      }

      // 4. 超时判定：若 win.elapsedEffectiveBars > win.targetWindowBars，则窗口超时注销
      if (win.elapsedEffectiveBars > win.targetWindowBars) {
        continue;
      }

      win.lastEvaluatedBarIndex = currentBarIndex;
      remaining.push(win);
    }

    this.activeWindows = remaining;
  }

  private signalMatchesTag(signal: KernelSignal, tag: string): boolean {
    if (signal.displayTag === tag) return true;
    if (signal.signalType === tag) return true;
    if (signal.badgeText === tag) return true;
    if (
      typeof signal.decisionTrace?.signalTag === 'string' &&
      signal.decisionTrace.signalTag === tag
    ) {
      return true;
    }
    if (
      typeof (signal as any).tag === 'string' &&
      (signal as any).tag === tag
    ) {
      return true;
    }
    return false;
  }

  private isSetupOnlySignal(signal: KernelSignal): boolean {
    for (const tag of this.allSetupTags) {
      if (this.signalMatchesTag(signal, tag)) {
        return true;
      }
    }
    return false;
  }

  private isConfirmationOrBoostOnlySignal(signal: KernelSignal): boolean {
    for (const tag of this.allConfirmationTags) {
      if (this.signalMatchesTag(signal, tag)) {
        return true;
      }
    }
    for (const tag of this.allBoostTags) {
      if (this.signalMatchesTag(signal, tag)) {
        return true;
      }
    }
    return false;
  }

  private createCompositeEvent(
    win: ActiveObservationWindow,
    bar: StrategyBar,
    currentBarIndex: number,
  ): TacticalEvent {
    const elapsedBars = currentBarIndex - win.triggerBarIndex;
    const trigger = win.triggerSignal;
    const isBuy =
      (win.rule.action ?? (trigger.signalKind === 'exit' ? 'SELL' : 'BUY')) ===
      'BUY';
    const defaultKind: TacticalEventKind =
      trigger.signalKind === 'exit' ? 'EXIT' : 'ENTRY';

    const hasBoost = (win.boostSignals?.length ?? 0) > 0;
    const confidence = hasBoost
      ? Math.min(1.0, Number((trigger.confidence * 1.05).toFixed(4)))
      : trigger.confidence;
    const badgeText = hasBoost
      ? `${win.rule.compositeBadgeText}+爆发`
      : win.rule.compositeBadgeText;

    const allSignals = [...win.confirmingSignals, ...(win.boostSignals ?? [])];

    return {
      eventId: `evt_${trigger.definitionId}_${bar.timestamp.getTime()}_${++this.eventCounter}`,
      definitionId: trigger.definitionId,
      versionId: trigger.versionId,
      securityCode:
        (trigger as any).securityCode ??
        (trigger.contextSnapshot?.securityCode as string) ??
        bar.securityCode ??
        (bar.securityId ? String(bar.securityId) : 'UNKNOWN'),
      action: win.rule.action ?? (isBuy ? 'BUY' : 'SELL'),
      kind: win.rule.kind ?? defaultKind,
      timestamp: bar.timestamp,
      triggerPrice: bar.close,
      pivotTime: trigger.pivotTime,
      pivotPrice: trigger.pivotPrice,
      confidence,
      badgeText,
      displayTag: win.rule.triggerTag,
      triggerSignal: trigger,
      confirmingSignals: allSignals,
      elapsedBars,
      reason: `Trigger [${win.rule.triggerTag}] confirmed by [${win.confirmingSignals.map((s) => s.displayTag ?? s.signalType).join(', ')}]${hasBoost ? ' with squeeze fire boost' : ''} after ${elapsedBars} bars`,
      styleMeta: trigger.styleMeta,
    };
  }

  private createSinglePointEvent(
    signal: KernelSignal,
    bar: StrategyBar,
    customBadgeText?: string,
    customAction?: TacticalAction,
    customKind?: TacticalEventKind,
  ): TacticalEvent {
    const isBuy =
      (customAction ?? (signal.signalKind === 'exit' ? 'SELL' : 'BUY')) ===
      'BUY';
    const defaultKind: TacticalEventKind =
      signal.signalKind === 'exit' ? 'EXIT' : 'ENTRY';

    return {
      eventId: `evt_${signal.definitionId}_${bar.timestamp.getTime()}_${++this.eventCounter}`,
      definitionId: signal.definitionId,
      versionId: signal.versionId,
      securityCode:
        (signal as any).securityCode ??
        (signal.contextSnapshot?.securityCode as string) ??
        bar.securityCode ??
        (bar.securityId ? String(bar.securityId) : 'UNKNOWN'),
      action: customAction ?? (isBuy ? 'BUY' : 'SELL'),
      kind: customKind ?? defaultKind,
      timestamp: bar.timestamp,
      triggerPrice: signal.triggerPrice ?? bar.close,
      pivotTime: signal.pivotTime,
      pivotPrice: signal.pivotPrice,
      confidence: signal.confidence,
      badgeText: customBadgeText ?? signal.badgeText ?? signal.signalType,
      displayTag: signal.displayTag ?? signal.signalType,
      triggerSignal: signal,
      confirmingSignals: [],
      elapsedBars: 0,
      reason:
        (signal.decisionTrace?.reason as string) ??
        `${signal.signalType} triggered`,
      styleMeta: signal.styleMeta,
    };
  }
}

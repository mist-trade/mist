import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import type {
  ActiveObservationWindow,
  TacticalAction,
  TacticalEvent,
  TacticalEventKind,
  TacticalWindowRule,
} from './tactical-event.types';

export class TemporalWindowEngine {
  private activeWindows: ActiveObservationWindow[] = [];
  private readonly rules: readonly TacticalWindowRule[];
  private readonly allConfirmationTags: Set<string>;
  private windowCounter = 0;
  private eventCounter = 0;

  constructor(rules: readonly TacticalWindowRule[] = []) {
    this.rules = rules;
    this.allConfirmationTags = new Set(
      rules.flatMap((r) => r.requiredConfirmationTags),
    );
  }

  public push(
    signal: KernelSignal,
    bar: StrategyBar,
    currentBarIndex: number,
  ): TacticalEvent[] {
    // 1. 先修剪已过期的窗口
    this.pruneExpired(currentBarIndex);

    // 2. 检查当前信号是否命中已开启观察窗的确认条件
    const completedEvents: TacticalEvent[] = [];
    let confirmedAnyWindow = false;
    const remainingWindows: ActiveObservationWindow[] = [];

    for (const win of this.activeWindows) {
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
        if (
          rule.requiredConfirmationTags.length === 0 ||
          rule.windowBars <= 0
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
          });
        }
      }
      return completedEvents;
    }

    // 4. 未匹配任何扳机规则
    if (confirmedAnyWindow) {
      return completedEvents;
    }

    // 若属于仅确认标签（如纯放量因子），无对应开窗时静默过滤
    if (this.isConfirmationOnlySignal(signal)) {
      return completedEvents;
    }

    // 普通无窗口规则的信号，原样生成单点战术事件
    return [...completedEvents, this.createSinglePointEvent(signal, bar)];
  }

  public onBar(_bar: StrategyBar, currentBarIndex: number): TacticalEvent[] {
    this.pruneExpired(currentBarIndex);
    return [];
  }

  public reset(): void {
    this.activeWindows = [];
    this.windowCounter = 0;
    this.eventCounter = 0;
  }

  public getActiveWindows(): readonly ActiveObservationWindow[] {
    return this.activeWindows;
  }

  private pruneExpired(currentBarIndex: number): void {
    this.activeWindows = this.activeWindows.filter(
      (win) => currentBarIndex - win.triggerBarIndex <= win.rule.windowBars,
    );
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

  private isConfirmationOnlySignal(signal: KernelSignal): boolean {
    for (const tag of this.allConfirmationTags) {
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
      confidence: trigger.confidence,
      badgeText: win.rule.compositeBadgeText,
      displayTag: win.rule.triggerTag,
      triggerSignal: trigger,
      confirmingSignals: [...win.confirmingSignals],
      elapsedBars,
      reason: `Trigger [${win.rule.triggerTag}] confirmed by [${win.confirmingSignals.map((s) => s.displayTag ?? s.signalType).join(', ')}] after ${elapsedBars} bars`,
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

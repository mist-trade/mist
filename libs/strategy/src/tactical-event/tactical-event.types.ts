import type { KernelSignal } from '../kernel/kernel.types';

export type TacticalAction = 'BUY' | 'SELL';

export type TacticalEventKind = 'ENTRY' | 'EXIT' | 'RISK_CUT';

export interface TacticalEvent {
  readonly eventId: string;
  readonly definitionId: number;
  readonly versionId: number;
  readonly securityCode: string;
  readonly action: TacticalAction;
  readonly kind: TacticalEventKind;
  /** 决策确立时刻（当前确认 Bar timestamp），遵守双时间戳契约 */
  readonly timestamp: Date;
  /** 决策确立基准观察价（当前确认 Bar 收盘价） */
  readonly triggerPrice: number;
  /** 形态几何极值时刻（图表 Marker 定位，继承自 triggerSignal） */
  readonly pivotTime: string | null;
  /** 形态几何极值点价格（继承自 triggerSignal） */
  readonly pivotPrice: number | null;
  readonly confidence: number;
  readonly badgeText: string;
  readonly displayTag: string;
  readonly triggerSignal: KernelSignal;
  readonly confirmingSignals: readonly KernelSignal[];
  readonly elapsedBars: number;
  readonly reason: string;
  readonly styleMeta?: Readonly<{
    color?: string;
    position?: 'above' | 'below';
  }>;
}

export interface TacticalWindowRule {
  readonly triggerTag: string;
  readonly windowBars: number;
  readonly requiredConfirmationTags: readonly string[];
  readonly compositeBadgeText: string;
  readonly action?: TacticalAction;
  readonly kind?: TacticalEventKind;
}

export interface TacticalAggregatorConfig {
  readonly edgePlugins?: readonly string[];
  readonly windows?: readonly TacticalWindowRule[];
  readonly cooldownBars?: number;
}

export interface ActiveObservationWindow {
  readonly windowId: string;
  readonly rule: TacticalWindowRule;
  readonly triggerSignal: KernelSignal;
  readonly triggerBarIndex: number;
  readonly openTimestamp: Date;
  readonly confirmingSignals: KernelSignal[];
  readonly pendingTags: Set<string>;
}

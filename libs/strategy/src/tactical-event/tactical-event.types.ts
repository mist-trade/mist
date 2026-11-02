import type { KernelSignal } from '../kernel/kernel.types';

export const DEFAULT_TACTICAL_WINDOW_BARS = 3;
export const DEFAULT_MAX_CONTAINMENT_HOLD_BARS = 2;
export const DEFAULT_TACTICAL_COOLDOWN_BARS = 3;

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
  readonly requiredSetupTag?: string;
  readonly windowBars: number;
  readonly maxContainmentHoldBars?: number;
  readonly invalidateOnPivotBreak?: boolean;
  readonly requiredConfirmationTags: readonly string[];
  readonly optionalBoostTags?: readonly string[];
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
  readonly boostSignals: KernelSignal[];
  readonly targetWindowBars: number;
  readonly maxContainmentHoldBars: number;
  readonly stopLossPrice: number | null;
  elapsedEffectiveBars: number;
  heldContainmentBars: number;
  lastBarRange: { high: number; low: number };
  lastEvaluatedBarIndex?: number;
}

/**
 * 战术汇聚层配置不含任何默认实现。
 *
 * 组合根（apps/backtest、apps/signal、tools/strategy-dev）必须显式注入配置，
 * 由 `loadTacticalAggregatorConfig` 从私有挂载目录解析，未挂载时降级为空配置。
 * 开源仓不得出现任何私有插件 id、战术名称或参数。
 */

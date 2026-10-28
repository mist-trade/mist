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

/**
 * 全系统标准战术汇聚层默认配置。
 * 供回测运行时（apps/backtest）、实时告警（apps/signal）与推演开发网关（tools/strategy-dev）共用，
 * 保持三链路同构。
 */
export const DEFAULT_TACTICAL_AGGREGATOR_CONFIG: TacticalAggregatorConfig =
  Object.freeze({
    edgePlugins: Object.freeze([
      'plugin.regime.shanghai-index',
      'plugin.tactics.bull-left-right-bsp',
      'plugin.tactics.bear-left-right-bsp',
      'plugin.tactics.volume-price-confirmation',
    ]),
    windows: Object.freeze([
      Object.freeze({
        triggerTag: 'plugin.chan.bsp',
        windowBars: 5,
        requiredConfirmationTags: Object.freeze([
          'plugin.tactics.volume-price-confirmation',
          'plugin.tactics.volatility-squeeze-fire',
        ]),
        compositeBadgeText: '战术共振买点',
      }),
      Object.freeze({
        triggerTag: 'plugin.tactics.bull-left-right-bsp',
        windowBars: 3,
        requiredConfirmationTags: Object.freeze([
          'plugin.tactics.volume-price-confirmation',
        ]),
        compositeBadgeText: '多头战术+放量确认',
      }),
    ]),
    cooldownBars: 3,
  });

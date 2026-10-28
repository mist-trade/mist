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
  /**
   * 可选的前置宏观/环境门禁标识（例如 'plugin.regime.shanghai-index' 或 'REGIME_BULL'）。
   * 若配置，则只有在当前环境门禁处于匹配状态（如多头）时才允许开启观察窗；
   * 若观察窗等待期间环境转熊，未决观察窗立即作废清退。
   */
  readonly requiredSetupTag?: string;
  /**
   * 可选的置信度加成标识（例如 'plugin.tactics.volatility-squeeze-fire'）。
   * 观察窗期间若捕获该标签，触发置信度与徽标加成，但不作为硬阻断门禁。
   */
  readonly optionalBoostTags?: readonly string[];
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
}

/**
 * 全系统标准战术汇聚层默认配置。
 * 供回测运行时（apps/backtest）、实时告警（apps/signal）与推演开发网关（tools/strategy-dev）共用，
 * 保持三链路同构。
 *
 * 核心设计（Setup -> Trigger -> Confirmation 三段论）：
 * 1. 宏观体制门禁（Setup）：以 'plugin.regime.shanghai-index' 为一票否决前置条件；
 * 2. 结构形态扳机（Trigger 双轨制）：
 *    - 规则 1（开源基线）：'plugin.chan.bsp' 标准 1/2/3 类买卖点直出；
 *    - 规则 2（私有增强）：'plugin.tactics.bull-left-right-bsp' 专属微观多级别买卖点直出；
 * 3. 时序观察窗（Confirmation）：3 根 Bar 内只需 VPCI 放量确认即可成交；
 *    挤压点火（Squeeze）降级为可选加成项，杜绝极低频因子扼杀有效信号。
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
      // 规则 1：开源基线（标准缠论 1/2/3 买直出 + 宏观牛市前置门禁 + VPCI 放量确认）
      Object.freeze({
        requiredSetupTag: 'plugin.regime.shanghai-index',
        triggerTag: 'plugin.chan.bsp',
        windowBars: 3,
        requiredConfirmationTags: Object.freeze([
          'plugin.tactics.volume-price-confirmation',
        ]),
        optionalBoostTags: Object.freeze([
          'plugin.tactics.volatility-squeeze-fire',
        ]),
        compositeBadgeText: '缠论多头+放量确认',
      }),
      // 规则 2：私有增强（专属微观多级别战术买点直出 + 宏观牛市前置门禁 + VPCI 放量确认）
      Object.freeze({
        requiredSetupTag: 'plugin.regime.shanghai-index',
        triggerTag: 'plugin.tactics.bull-left-right-bsp',
        windowBars: 3,
        requiredConfirmationTags: Object.freeze([
          'plugin.tactics.volume-price-confirmation',
        ]),
        optionalBoostTags: Object.freeze([
          'plugin.tactics.volatility-squeeze-fire',
        ]),
        compositeBadgeText: '专属战术+放量确认',
      }),
    ]),
    cooldownBars: 3,
  });

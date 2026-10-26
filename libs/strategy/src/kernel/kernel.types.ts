import type {
  DecisionFlowNode,
  ConfidenceLevel,
} from '../decision-flow/decision-flow.types';
import type { FactorPluginRegistry } from '../factor/factor-plugin-registry';

/**
 * 组内单条策略的内核求值计划（编译边界产物，运行时唯一形态）。
 * 三条链路（实时 / 单步推演 / 批量回测）共用同一形态，求值层禁止按 legacy kind 分派。
 */
export interface KernelPlan {
  readonly definitionId: number;
  readonly versionId: number;
  readonly flow: DecisionFlowNode;
  readonly signalKind?: 'entry' | 'exit';
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
  /** 求值周期：该 plan 只在此周期的 bar 收盘时求值 */
  readonly period: number;
  /** 求值周期窗口预算 */
  readonly requiredBarCount: number;
  /**
   * context 周期 → 最少保留根数（编译边界由插件元数据推导，不含求值周期）。
   * 任一声明窗口不足 → 该 plan 本次不判定（insufficient_history，fail-closed）。
   */
  readonly contextRequirements: Readonly<Record<number, number>>;
}

export interface KernelConfig {
  readonly securityId: number;
  readonly securityCode: string;
  /**
   * 相位边界：`timestamp < publicFrom` 为预热相（静默求值、插件游标推进、不发射）；
   * `>= publicFrom` 为公开相（发射当期增量信号）。
   */
  readonly publicFrom: Date;
  readonly plans: readonly KernelPlan[];
  readonly registry?: FactorPluginRegistry;
  /**
   * 多周期：不再有单值 period——内核周期集合 = ∪ plans 的求值周期 ∪ contextRequirements keys，
   * 每周期一个独立滑窗（StrategySeriesImputer）与单调游标。
   */
}

/** 双时间戳法定分离契约的内核信号形状（三链路统一，输出适配器各自映射）。 */
export interface KernelSignal {
  readonly definitionId: number;
  readonly versionId: number;
  readonly signalKind: 'entry' | 'exit';
  /** 决策确立时刻 = 当前确认 Bar timestamp（纯观点确立时刻） */
  readonly signalTime: Date;
  /** 与 signalTime 严格等价（ISO 字符串） */
  readonly triggerTime: string;
  /** 决策确立基准观察价（当前确认 Bar 收盘价，非成交价；实际撮合由交易引擎在 Next-Bar 执行） */
  readonly triggerPrice: number;
  /** 形态几何极值时刻（图表 Marker 定位），无 pivot 语义时为 null */
  readonly pivotTime: string | null;
  /** 形态几何极值点价格（初始止损关键参考基准），无 pivot 语义时为 null */
  readonly pivotPrice: number | null;
  readonly signalType: string;
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly badgeText?: string;
  readonly displayTag?: string;
  readonly styleMeta?: Readonly<{
    color?: string;
    position?: 'above' | 'below';
  }>;
  readonly decisionTrace: Record<string, unknown>;
  readonly contextSnapshot: Record<string, unknown>;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

/**
 * 预热状态（数据源适配器供给预热段不足时的统一降级标记）：
 * - full：预热段满额，首个公开 Bar 到达时窗口已热；
 * - partial：预热段有供给但不足额；
 * - empty：预热段 0 根（数据源起点即公开起点等预热踩空场景）。
 * 窗口不足 requiredBarCount 期间三链路统一不判定不发射。
 */
export type PrewarmStatus = 'full' | 'partial' | 'empty';

export interface KernelPeriodDiagnostics {
  readonly period: number;
  readonly windowSize: number;
  readonly budget: number;
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;
  readonly prewarmExpected: number;
}

export interface KernelDiagnostics {
  /** 全周期最大游标（兼容字段） */
  readonly lastPushedTimestamp: string | null;
  /** 跨周期最差预热状态 */
  readonly prewarmStatus: PrewarmStatus;
  /** 跨周期最小预热实际根数（最差）与其对应预算 */
  readonly prewarmActual: number;
  readonly prewarmExpected: number;
  readonly publicBarCount: number;
  readonly emittedSignalCount: number;
  /** 因声明 context 不足 / 缺键而被跳过的 plan 求值次数（有界诊断） */
  readonly planSkips: number;
  readonly perPeriod: readonly KernelPeriodDiagnostics[];
}

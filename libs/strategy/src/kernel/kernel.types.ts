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
  readonly requiredBarCount: number;
}

export interface KernelConfig {
  readonly securityId: number;
  readonly securityCode: string;
  readonly period: number;
  /**
   * 相位边界：`timestamp < publicFrom` 为预热相（静默求值、插件游标推进、不发射）；
   * `>= publicFrom` 为公开相（发射当期增量信号）。
   */
  readonly publicFrom: Date;
  readonly plans: readonly KernelPlan[];
  readonly registry?: FactorPluginRegistry;
}

/** 双时间戳法定分离契约的内核信号形状（三链路统一，输出适配器各自映射）。 */
export interface KernelSignal {
  readonly definitionId: number;
  readonly versionId: number;
  readonly signalKind: 'entry' | 'exit';
  /** 决策触发时刻 = 当前确认 Bar timestamp（撮合/游标唯一认可时刻） */
  readonly signalTime: Date;
  /** 与 signalTime 严格等价（ISO 字符串） */
  readonly triggerTime: string;
  /** 确认 Bar 收盘市价（撮合基准价） */
  readonly triggerPrice: number;
  /** 形态几何极值时刻（图表 Marker 定位），无 pivot 语义时为 null */
  readonly pivotTime: string | null;
  /** 形态几何极值点价格（止损参考），无 pivot 语义时为 null */
  readonly pivotPrice: number | null;
  readonly signalType: string;
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
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

export interface KernelDiagnostics {
  readonly windowSize: number;
  readonly windowBudget: number;
  readonly lastPushedTimestamp: string | null;
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;
  readonly prewarmExpected: number;
  readonly publicBarCount: number;
  readonly emittedSignalCount: number;
}

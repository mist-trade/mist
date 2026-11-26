import type { FactorAction } from '../factor/factor.types';

export type DecisionFlowNode =
  | GuardNode
  | BranchNode
  | ExtractorNode
  | TerminalNode;

/**
 * 门禁节点：用于前置条件断言与快速短路
 */
export interface GuardNode {
  readonly id: string;
  readonly type: 'GUARD';
  readonly name: string;
  /** 引用的插件标识 */
  readonly pluginId: string;
  /**
   * 插件参数。wire-safe 契约：params 会进入黑板缓存键的字符串序列化
   * （`contextOpinionKey`），必须可 JSON 序列化——进程内定点类型（Decimal8）
   * 不得入 params；编译边界负责剥除（legacy-strategy-compiler.toWireSafePlan），
   * 插件求值时从 canonical 字符串重建。违规由 Decimal8.toJSON 哨兵显式抛错。
   */
  readonly params?: Record<string, unknown>;
  /** 期望通过的动作，通常为 'BUY'，多空并存时可指定为 'BOTH' 或 'ANY' */
  readonly requiredAction: FactorAction | 'BOTH' | 'ANY';
  /** 门禁通过后流向的下一个节点 */
  readonly onPass: DecisionFlowNode;
  /** 门禁未通过后流向的节点（可选，若未指定则默认静默 Abort 剪枝） */
  readonly onFail?: DecisionFlowNode;
}

/**
 * 条件分支路由节点：用于多路径决策分流
 */
export interface BranchNode {
  readonly id: string;
  readonly type: 'BRANCH';
  readonly name: string;
  /** 分支判定条件 */
  readonly condition: {
    readonly attributeKey?: string;
    readonly pluginId?: string;
    readonly operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
    readonly value: unknown;
  };
  /** 分支映射字典 */
  readonly branches: {
    readonly true: DecisionFlowNode;
    readonly false: DecisionFlowNode;
  };
}

/**
 * 特征提取与黑板富化节点：执行计算并向共享黑板写入派生特征
 */
export interface ExtractorNode {
  readonly id: string;
  readonly type: 'EXTRACTOR';
  readonly name: string;
  /** 负责计算的插件标识 */
  readonly pluginId: string;
  readonly params?: Record<string, unknown>;
  /** 写入共享黑板的属性键名（如 'chan.central'） */
  readonly exportAttributeKey: string;
  /** 特征提取完成后流向的下一个节点 */
  readonly next: DecisionFlowNode;
}

/**
 * 终结执行节点：决策流的叶子节点，负责发出交易信号或记录终止阻断
 */
export interface TerminalNode {
  readonly id: string;
  readonly type: 'TERMINAL';
  /** 最终裁决：产生买入/卖出信号，或显式记录终止阻断，或继承前置门禁动作 (INHERIT) */
  readonly action: 'BUY' | 'SELL' | 'ABORT' | 'INHERIT';
  /** 信号业务标签（如 'BREAKOUT_RESONANCE', 'OVERSOLD_REBOUND'） */
  readonly signalTag?: string;
  /** 终止说明 */
  readonly reason?: string;
}

/**
 * 决策流节点白盒执行轨迹明细
 */
export interface DecisionExecutionTraceItem {
  readonly nodeId: string;
  readonly type: 'GUARD' | 'BRANCH' | 'EXTRACTOR' | 'TERMINAL';
  /** 产出该节点意见的插件 id（BRANCH/TERMINAL 等非插件节点为空） */
  readonly pluginId?: string;
  readonly name?: string;
  readonly action?: FactorAction | 'ABORT';
  readonly signalTag?: string;
  readonly reason?: string;
  readonly exportedKey?: string;
  readonly conditionResult?: boolean;
  /** GUARD 节点是否通过（用于隔离 onFail 路径上的失败轨迹项） */
  readonly passed?: boolean;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly badgeText?: string;
  readonly displayTag?: string;
  readonly styleMeta?: Readonly<{
    color?: string;
    position?: 'above' | 'below';
  }>;
}

export type DecisionStatus = 'SIGNAL_EMITTED' | 'ABORTED';

/**
 * 决策流最终求值结果
 */
export interface DecisionResult {
  readonly status: DecisionStatus;
  readonly action?: 'BUY' | 'SELL';
  /** 业务标签 */
  readonly signalTag?: string;
  /** 人类可读说明 */
  readonly reason: string;
  /** 插件自主生成的展示徽标（如 "左侧1买", "三卖", "爆量突破"） */
  readonly badgeText?: string;
  readonly displayTag?: string;
  readonly styleMeta?: Readonly<{
    color?: string;
    position?: 'above' | 'below';
  }>;
  /** 白盒执行轨迹 */
  readonly trace: readonly DecisionExecutionTraceItem[];
  /** 附加证据载荷（如出场匹配的买入 ID、批次快照等） */
  readonly evidence?: Readonly<Record<string, unknown>>;
}

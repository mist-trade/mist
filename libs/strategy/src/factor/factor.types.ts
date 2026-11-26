export type FactorCategory =
  | 'REGIME'
  | 'FUNDAMENTAL'
  | 'CAPITAL'
  | 'EVENT'
  | 'TECHNICAL'
  | 'CHAN'
  | 'AI_SENTIMENT'
  | 'EXIT'
  // 私仓插件类别（2026-11-24 结构兼容守卫 REQ-FACADE-06 收敛）：
  // 私有战术插件的真实类别值，公共展示侧按原样渲染。
  | 'TACTICAL'
  | 'TACTICAL_SWING';

export type FactorAction = 'BUY' | 'SELL' | 'NEUTRAL';

export interface FactorOpinion {
  /** 插件观点：看多(BUY)、看空/风控(SELL)、弃权/中立(NEUTRAL) */
  readonly action: FactorAction;

  /** 人类可读的原因说明，用于白盒归因和前端展示 */
  readonly reason: string;

  /** 插件自主生成的展示徽标（如 "左侧1买", "三卖", "爆量突破"） */
  readonly badgeText?: string;

  /** 插件自主分类标签 */
  readonly displayTag?: string;

  /** 插件自主指定的渲染建议（可选） */
  readonly styleMeta?: Readonly<{
    color?: string;
    position?: 'above' | 'below';
  }>;

  /**
   * 结构化特征快照（可选），用于复盘调试与原生终端绘图回写
   * 例如：缠论中枢可附带 { zd: 15.2, zg: 16.8 }；资金流可附带 { netInflow: 50000000 }
   */
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface FactorContext {
  /** 标的唯一ID与代码 */
  readonly securityId: number;
  readonly securityCode: string;

  /** 当前评估基准时间戳（撮合时间点） */
  readonly timestamp: Date;

  /** 当前评估周期（分钟，如 1, 5, 15, 30, 60, 1440） */
  readonly period: number;

  /**
   * 规范化行情序列：
   * 100% 复用底层已有的 StrategySeriesImputer（停牌缺口补齐与时段对齐）与 KPriceProjector，
   * 因子插件直接消费处理完毕的纯净行情序列，绝不重复解析或造轮子做填补。
   */

  /**
   * 共享黑板 (BlackBoard)：
   * 用于树状决策流中前序节点与后序节点之间传递派生特征。
   * 命名规范推荐使用领域前缀，如 'chan.central', 'capital.main_inflow'
   */
  readonly attributes: Map<string, unknown>;

  /** 外部特征代理端口（如需按需拉取外部财务/资金流等，按需提供） */
  readonly featureProvider?: {
    getFeature(key: string, symbol: string): Promise<unknown>;
  };
}

export interface ContextRequirementResolveOptions {
  /** 策略评估主周期（用于未在 params 显式指定周期时自适应推导上下文周期） */
  readonly evaluationPeriod?: number;
}

export interface FactorPluginMetadata {
  /** 全局唯一ID，命名规范：plugin.<category>.<name>，如 'plugin.chan.bsp', 'plugin.fundamental.roe' */
  readonly id: string;
  /** 插件名称 */
  readonly name: string;
  /** 领域分类 */
  readonly category: FactorCategory;
  /** 插件语义版本 */
  readonly version: string;
  /** 详细功能描述 */
  readonly description: string;
  /** 参数配置 Schema（用于前台动态渲染配置表单，可选） */
  readonly paramSchema?: Record<string, unknown>;

  /** 插件角色（可选，默认 'signal'，2026-11-24 定稿）：
   *  - 'signal'（默认）：参与决策流求值路径，可作为终端信号来源；
   *  - 'context'：上下文提供者——内核每 Bar 先于 plan 求值一次并缓存进黑板
   *    （`contextOpinion.<pluginId>`），GUARD 节点读缓存、不再重复求值；
   *    **严禁作为终端信号发射源**（状态可见性走 decisionTrace.trace，不走告警）。
   */
  readonly role?: 'signal' | 'context';

  /**
   * 声明多周期上下文需求（可选）：context 周期 → 最少保留根数。
   * 编译边界遍历决策流树按 period 取 max 合并进 plan.contextRequirements；
   * 这是 context 需求的唯一来源（延续"策略定义不存调用方 lookback"契约），
   * 运行时内核据此注入 `attributes['series.<period>']` 只读快照。
   */
  resolveContextRequirements?(
    params?: Record<string, unknown>,
    options?: ContextRequirementResolveOptions,
  ): Readonly<Record<number, number>>;

  /**
   * 声明跨标的上下文依赖（可选）：内核为外部标的维护独立窗口，
   * 并以 `series.<securityCode>.<period>` 注入黑板。窗口不足 → fail-closed。
   */
  resolveExternalContextRequirements?(
    params?: Record<string, unknown>,
  ): readonly {
    securityCode: string;
    securityId?: number;
    period: number;
    minBars: number;
  }[];

  /**
   * 声明通道级虚拟出场规则（可选，信号侧）。
   * 规则由聚合层的 VirtualExitGovernor 依据通道虚拟持仓求值，
   * 插件本身保持无状态——只声明"什么条件算出场"，不持有持仓。
   */
  virtualExitRules?(
    params?: Record<string, unknown>,
  ): readonly import('../virtual-exit/virtual-exit.port').VirtualExitRule[];
}

export interface FactorPlugin extends FactorPluginMetadata {
  /**
   * 核心求值入口（无状态纯函数）
   * @param context 评估上下文（含黑板与数据代理）
   * @param params 策略实例在装配该插件时传入的具体参数配置
   */
  evaluate(
    context: FactorContext,
    params?: Record<string, unknown>,
  ): Promise<FactorOpinion>;
}

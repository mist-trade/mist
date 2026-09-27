export enum StrategyKind {
  RULE_DSL = 'rule_dsl',
  /**
   * @deprecated 独立执行分支已退役（2026-09-27，unify-strategy-evaluation-pipeline）：
   * 存量 chan_bsp 配置在编译边界经 LegacyStrategyCompiler 透明编译为决策流树执行，
   * 新建 chan_bsp 定义被拒绝（CHAN_BSP_KIND_RETIRED）。枚举值仅为 DB 历史数据保留，
   * 禁止在新代码中创建或引用该 kind 的执行语义。
   */
  CHAN_BSP = 'chan_bsp',
  DECISION_FLOW = 'decision_flow',
}

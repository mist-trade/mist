import type {
  CompiledStrategyExecutionPlan,
  CompiledStrategyExpression,
  StrategyRuleExpression,
  StrategySignalKind,
} from '../rules/strategy-rule.types';
import { compileStoredStrategyRule } from '../rules/strategy-rule.compiler';
import type { DecisionFlowNode } from './decision-flow.types';

export interface LegacyChanBspPlanLike {
  readonly units: 'bi' | 'duan';
  readonly direction: 'buy' | 'sell' | 'both';
  readonly points: {
    readonly first: boolean;
    readonly second: boolean;
    readonly third: boolean;
  };
  readonly requiredBarCount?: number;
}

/**
 * 决策流 params 的 wire-safe 契约（黑板上 params 会进缓存键字符串序列化）：
 * 进程内定点类型（Decimal8）不得入 params——剥除条件上的 decimalValue，
 * 插件求值时从 canonical 字符串（condition.value）按需重建。
 * 违规者由 Decimal8.toJSON 哨兵在键序列化处显式抛错拦截。
 */
function toWireSafePlan(
  plan: CompiledStrategyExecutionPlan,
): CompiledStrategyExecutionPlan {
  const walk = (
    expr: CompiledStrategyExpression,
  ): CompiledStrategyExpression => {
    if (expr.kind === 'condition') {
      if (expr.decimalValue === undefined) return expr;
      const { decimalValue: omitted, ...rest } = expr;
      void omitted;
      return rest;
    }
    return { ...expr, children: expr.children.map(walk) };
  };
  return { ...plan, root: walk(plan.root) };
}

/**
 * 存量策略透明编译器 (LegacyStrategyCompiler)
 * 将数据库中已有的历史规则定义（DSL Rule 或 Chan BSP）自动编译为等价的决策流树，
 * 保障存量策略无需迁移数据库即可在通用决策流引擎上零感知运行。
 */
export class LegacyStrategyCompiler {
  /**
   * 将旧版 DSL 规则编译为单门禁决策流树
   */
  public static compileRuleToDecisionFlow(
    ruleOrPlan: StrategyRuleExpression | CompiledStrategyExecutionPlan,
    signalKind: StrategySignalKind = 'entry',
  ): DecisionFlowNode {
    const plan: CompiledStrategyExecutionPlan =
      'root' in ruleOrPlan
        ? ruleOrPlan
        : compileStoredStrategyRule(ruleOrPlan, signalKind);

    const action = plan.signalKind === 'entry' ? 'BUY' : 'SELL';
    const idSuffix = plan.signalKind === 'exit' ? '_exit' : '';

    return {
      id: `guard_legacy_rule${idSuffix}`,
      type: 'GUARD',
      name: '存量规则DSL门禁',
      pluginId: 'plugin.legacy.rule-dsl',
      params: { plan: toWireSafePlan(plan) },
      requiredAction: action,
      onPass: {
        id: `term_legacy_matched${idSuffix}`,
        type: 'TERMINAL',
        action,
        signalTag: 'LEGACY_DSL',
        reason: '存量规则条件满足，触发信号',
      },
      onFail: {
        id: `term_legacy_unmatched${idSuffix}`,
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '存量规则条件未满足',
      },
    };
  }

  /**
   * 将旧版缠论三类买卖点计划编译为决策流树
   */
  public static compileChanBspToDecisionFlow(
    plan: LegacyChanBspPlanLike,
  ): DecisionFlowNode {
    const isBoth = plan.direction === 'both';
    const requiredAction = isBoth
      ? 'BOTH'
      : plan.direction === 'sell'
        ? 'SELL'
        : 'BUY';
    const action = isBoth
      ? 'INHERIT'
      : plan.direction === 'sell'
        ? 'SELL'
        : 'BUY';

    return {
      id: 'guard_chan_bsp',
      type: 'GUARD',
      name: '缠论买卖点门禁',
      pluginId: 'plugin.chan.bsp',
      params: {
        units: plan.units,
        direction: plan.direction,
        points: plan.points,
        requiredBarCount: plan.requiredBarCount,
        deduplicate: true,
      },
      requiredAction,
      onPass: {
        id: 'term_chan_bsp_matched',
        type: 'TERMINAL',
        action,
        signalTag: 'CHAN_BSP',
        reason: '缠论买卖点结构确立',
      },
      onFail: {
        id: 'term_chan_bsp_unmatched',
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '缠论形态未出现或未达买卖点确认门槛',
      },
    };
  }
}

import type {
  CompiledStrategyExecutionPlan,
  StrategyRuleExpression,
  StrategySignalKind,
} from '../../rules/strategy-rule.types';
import { compileStoredStrategyRule } from '../../rules/strategy-rule.compiler';
import { readContextSeries } from '../../kernel/availability';
import { evaluateStrategyPlan } from '../../evaluation/strategy-rule.evaluator';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface LegacyRuleDslPluginParams {
  readonly plan?: CompiledStrategyExecutionPlan;
  readonly rule?: StrategyRuleExpression;
  readonly signalKind?: StrategySignalKind;
}

/**
 * 存量规则 DSL 兼容插件
 * 将历史系统中的 StrategyRuleExpression / CompiledStrategyExecutionPlan 无缝封装为通用因子插件
 */
const MAX_COMPILED_DSL_STRING_CACHE = 128;

export class LegacyRuleDslPlugin implements FactorPlugin {
  private readonly compiledPlanByRuleObj = new WeakMap<
    object,
    Map<StrategySignalKind, CompiledStrategyExecutionPlan>
  >();
  private readonly compiledPlanBySerialized = new Map<
    string,
    CompiledStrategyExecutionPlan
  >();
  public readonly id = 'plugin.legacy.rule-dsl';
  public readonly name = '存量规则DSL兼容插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '将原有基于指标Catalog与条件树的DSL规则无缝接入因子插件体系';

  public readonly paramSchema = {
    plan: {
      type: 'object',
      description: '编译后的执行计划 CompiledStrategyExecutionPlan',
    },
    rule: {
      type: 'object',
      description: '原始规则表达式 StrategyRuleExpression',
    },
    signalKind: { type: 'string', enum: ['entry', 'exit'], default: 'entry' },
  };

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const params = rawParams as LegacyRuleDslPluginParams | undefined;
    const plan = this.resolvePlan(params);

    if (!plan) {
      return {
        action: 'NEUTRAL',
        reason: '未提供有效的规则计划(plan)或规则定义(rule)',
      };
    }

    const outcome = evaluateStrategyPlan(
      plan,
      readContextSeries(context, context.period) ?? [],
    );

    if (outcome.status === 'unavailable') {
      return {
        action: 'NEUTRAL',
        reason: `存量规则所需数据未就绪: ${outcome.reason}`,
      };
    }

    if (!outcome.matched) {
      return {
        action: 'NEUTRAL',
        reason: '存量规则条件未满足',
        evidence: {
          matched: false,
          fields: outcome.context.fields,
        },
      };
    }

    const isEntry = plan.signalKind === 'entry';
    const action = isEntry ? 'BUY' : 'SELL';

    return {
      action,
      reason: `存量规则 DSL 匹配成功 (${isEntry ? '入场/开仓' : '出场/平仓'})`,
      evidence: {
        matched: true,
        signalKind: plan.signalKind,
        fields: outcome.context.fields,
        barType: outcome.context.barType,
      },
    };
  }

  private resolvePlan(
    params?: LegacyRuleDslPluginParams,
  ): CompiledStrategyExecutionPlan | undefined {
    if (params?.plan) {
      return params.plan;
    }
    if (params?.rule) {
      const signalKind = params.signalKind ?? 'entry';
      const byKind = this.compiledPlanByRuleObj.get(params.rule);
      const hitByObj = byKind?.get(signalKind);
      if (hitByObj) {
        return hitByObj;
      }

      const serialized = `${signalKind}\u0000${JSON.stringify(params.rule)}`;
      const hitBySerialized = this.compiledPlanBySerialized.get(serialized);
      if (hitBySerialized) {
        this.compiledPlanBySerialized.delete(serialized);
        this.compiledPlanBySerialized.set(serialized, hitBySerialized);
        return hitBySerialized;
      }

      const compiled = compileStoredStrategyRule(params.rule, signalKind);
      if (byKind) {
        byKind.set(signalKind, compiled);
      } else {
        this.compiledPlanByRuleObj.set(
          params.rule,
          new Map([[signalKind, compiled]]),
        );
      }
      if (this.compiledPlanBySerialized.size >= MAX_COMPILED_DSL_STRING_CACHE) {
        const oldestKey = this.compiledPlanBySerialized.keys().next().value;
        if (oldestKey !== undefined) {
          this.compiledPlanBySerialized.delete(oldestKey);
        }
      }
      this.compiledPlanBySerialized.set(serialized, compiled);
      return compiled;
    }
    return undefined;
  }
}

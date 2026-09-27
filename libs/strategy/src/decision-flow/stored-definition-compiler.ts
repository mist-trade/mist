import type { DecisionFlowNode } from './decision-flow.types';
import {
  LegacyStrategyCompiler,
  type LegacyChanBspPlanLike,
} from './legacy-strategy-compiler';
import { compileStoredStrategyRuleWithNormalized } from '../rules/strategy-rule.compiler';
import type { StrategySignalKind } from '../rules/strategy-rule.types';

export type StoredDefinitionSourceKind =
  | 'rule_dsl'
  | 'chan_bsp'
  | 'decision_flow';

export interface StoredDefinitionCompileInput {
  readonly kind: StoredDefinitionSourceKind;
  /** version.rule 原始 JSON */
  readonly rule: Record<string, unknown>;
  readonly signalKind?: StrategySignalKind;
}

export interface CompiledStoredDefinition {
  /** 统一决策流树（运行时唯一求值形态） */
  readonly flow: DecisionFlowNode;
  readonly requiredBarCount: number;
  readonly sourceKind: StoredDefinitionSourceKind;
  /** 快照：rule_dsl 为归一化规则，其余为原 rule */
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export type StoredDefinitionCompileErrorCode =
  | 'RULE_DSL_COMPILE_FAILED'
  | 'CHAN_BSP_CONFIG_INVALID'
  | 'DECISION_FLOW_RULE_INVALID';

export class StoredDefinitionCompileError extends Error {
  constructor(
    public readonly code: StoredDefinitionCompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoredDefinitionCompileError';
  }
}

const CHAN_BSP_UNITS = new Set(['bi', 'duan']);
const CHAN_BSP_DIRECTIONS = new Set(['buy', 'sell', 'both']);
const DECISION_FLOW_DEFAULT_REQUIRED_BAR_COUNT = 50;

/**
 * 存量策略定义统一编译入口（编译边界唯一收口）。
 *
 * 三种来源 kind 全部产出 decision_flow 求值计划：
 * - decision_flow：rule 即树，直接采用；
 * - rule_dsl：编译为执行计划后经 LegacyStrategyCompiler 套单 GUARD 树
 *   （插件内复用同一 DSL 求值器，字段/算子语义不变）；
 * - chan_bsp：结构化校验后经 LegacyStrategyCompiler 套 plugin.chan.bsp GUARD 树。
 *
 * 调用方（signal registry / 回测命令服务 / dev-server 会话）禁止各自实现分派。
 */
export function compileStoredDefinitionVersion(
  input: StoredDefinitionCompileInput,
): CompiledStoredDefinition {
  switch (input.kind) {
    case 'decision_flow': {
      const flow = input.rule as unknown as DecisionFlowNode;
      if (!flow || typeof flow !== 'object' || !flow.id || !flow.type) {
        throw new StoredDefinitionCompileError(
          'DECISION_FLOW_RULE_INVALID',
          'decision flow rule payload is not a valid DecisionFlowNode',
        );
      }
      return {
        flow,
        requiredBarCount:
          typeof input.rule.requiredBarCount === 'number'
            ? input.rule.requiredBarCount
            : DECISION_FLOW_DEFAULT_REQUIRED_BAR_COUNT,
        sourceKind: 'decision_flow',
        ruleSnapshot: input.rule,
      };
    }
    case 'rule_dsl': {
      try {
        const compilation = compileStoredStrategyRuleWithNormalized(
          input.rule,
          input.signalKind ?? 'entry',
        );
        const flow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
          compilation.plan,
          input.signalKind ?? 'entry',
        );
        return {
          flow,
          requiredBarCount: compilation.plan.requiredBarCount,
          sourceKind: 'rule_dsl',
          ruleSnapshot: compilation.normalizedRule as Readonly<
            Record<string, unknown>
          >,
        };
      } catch (error) {
        throw new StoredDefinitionCompileError(
          'RULE_DSL_COMPILE_FAILED',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    case 'chan_bsp': {
      const chanPlan = validateChanBspRule(input.rule);
      const flow =
        LegacyStrategyCompiler.compileChanBspToDecisionFlow(chanPlan);
      return {
        flow,
        requiredBarCount:
          chanPlan.requiredBarCount ?? DEFAULT_REQUIRED_BAR_COUNT,
        sourceKind: 'chan_bsp',
        ruleSnapshot: input.rule,
      };
    }
    default: {
      throw new StoredDefinitionCompileError(
        'DECISION_FLOW_RULE_INVALID',
        `unsupported strategy kind: ${String((input as { kind?: unknown }).kind)}`,
      );
    }
  }
}

const DEFAULT_REQUIRED_BAR_COUNT = 60;

function validateChanBspRule(
  rule: Record<string, unknown>,
): LegacyChanBspPlanLike {
  const units = rule.units;
  if (typeof units !== 'string' || !CHAN_BSP_UNITS.has(units)) {
    throw new StoredDefinitionCompileError(
      'CHAN_BSP_CONFIG_INVALID',
      `chan_bsp config units must be 'bi' or 'duan', got: ${String(units)}`,
    );
  }
  const direction = rule.direction;
  if (typeof direction !== 'string' || !CHAN_BSP_DIRECTIONS.has(direction)) {
    throw new StoredDefinitionCompileError(
      'CHAN_BSP_CONFIG_INVALID',
      `chan_bsp config direction must be 'buy' | 'sell' | 'both', got: ${String(direction)}`,
    );
  }
  const rawPoints = rule.points;
  if (!rawPoints || typeof rawPoints !== 'object' || Array.isArray(rawPoints)) {
    throw new StoredDefinitionCompileError(
      'CHAN_BSP_CONFIG_INVALID',
      'chan_bsp config points must be an object of booleans',
    );
  }
  const selection = rawPoints as Record<string, unknown>;
  const points = {
    first: selection.first === true,
    second: selection.second === true,
    third: selection.third === true,
  };
  if (!points.first && !points.second && !points.third) {
    throw new StoredDefinitionCompileError(
      'CHAN_BSP_CONFIG_INVALID',
      'at least one of points.first/second/third must be enabled',
    );
  }
  const requiredBarCount = rule.requiredBarCount;
  return {
    units: units as 'bi' | 'duan',
    direction: direction as 'buy' | 'sell' | 'both',
    points,
    ...(typeof requiredBarCount === 'number' ? { requiredBarCount } : {}),
  };
}

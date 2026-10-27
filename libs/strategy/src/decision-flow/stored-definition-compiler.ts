import type { DecisionFlowNode } from './decision-flow.types';
import {
  LegacyStrategyCompiler,
  type LegacyChanBspPlanLike,
} from './legacy-strategy-compiler';
import { compileStoredStrategyRuleWithNormalized } from '../rules/strategy-rule.compiler';
import type { StrategySignalKind } from '../rules/strategy-rule.types';
import { ensureStandardPluginsRegistered } from '../factor/standard-plugins';
import {
  factorPluginRegistry,
  type FactorPluginRegistry,
} from '../factor/factor-plugin-registry';

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
  /** context 周期 → 最少保留根数（由插件元数据推导，可能为空对象） */
  readonly contextRequirements: Readonly<Record<number, number>>;
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
 * `registry` 缺省时使用全局单例注册表（生产编译路径）；显式传入时
 * （dev server 本地会话，含外部私有插件）以传入注册表解析插件引用。
 * 调用方（signal registry / 回测命令服务 / dev-server 会话）禁止各自实现分派。
 */
export function compileStoredDefinitionVersion(
  input: StoredDefinitionCompileInput,
  registry: FactorPluginRegistry = factorPluginRegistry,
): CompiledStoredDefinition {
  switch (input.kind) {
    case 'decision_flow': {
      // 创建链路（strategy-definition.service）以 { rootNode, requiredBarCount }
      // 包装存储；裸树形状（rule 即节点）兼容直存。
      const payload = input.rule as {
        rootNode?: DecisionFlowNode;
        requiredBarCount?: unknown;
      };
      const flow = (payload?.rootNode ?? payload) as DecisionFlowNode;
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
        contextRequirements: deriveContextRequirements(flow, registry),
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
          contextRequirements: deriveContextRequirements(flow, registry),
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
        contextRequirements: deriveContextRequirements(flow, registry),
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

/**
 * 遍历决策流树收集全部插件引用（GUARD/EXTRACTOR 单插件，CONSENSUS 多插件）。
 */
function collectPluginReferences(
  root: DecisionFlowNode,
): Map<string, Record<string, unknown> | undefined> {
  const references = new Map<string, Record<string, unknown> | undefined>();
  const visited = new Set<string>();
  const visit = (node: DecisionFlowNode): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    switch (node.type) {
      case 'GUARD':
        references.set(node.pluginId, node.params);
        visit(node.onPass);
        if (node.onFail) visit(node.onFail);
        return;
      case 'BRANCH':
        visit(node.branches.true);
        visit(node.branches.false);
        return;
      case 'EXTRACTOR':
        references.set(node.pluginId, node.params);
        visit(node.next);
        return;
      case 'CONSENSUS':
        for (const item of node.plugins) {
          references.set(item.pluginId, item.params);
        }
        visit(node.onSuccess);
        if (node.onFailure) visit(node.onFailure);
        return;
      case 'TERMINAL':
        return;
    }
  };
  visit(root);
  return references;
}

/**
 * context 需求推导（编译边界唯一实现）：
 * 遍历树内插件节点，从插件注册表取 `resolveContextRequirements(params)`，
 * 按 period 取 max 合并。插件未注册或声明非法 → 编译失败（fail-closed）。
 * 未声明 context 的插件不产生任何需求（等价现状）。
 *
 * `registry` 缺省时使用全局单例注册表（存量编译路径，自动补注册标准插件）；
 * 显式传入时（dev server 本地会话等）以传入注册表为准，不做模块级补注册。
 */
export function deriveContextRequirements(
  flow: DecisionFlowNode,
  registry: FactorPluginRegistry = factorPluginRegistry,
): Readonly<Record<number, number>> {
  const references = collectPluginReferences(flow);
  if (references.size === 0) return {};
  if (registry === factorPluginRegistry) {
    ensureStandardPluginsRegistered();
  }
  const merged: Record<number, number> = {};
  for (const [pluginId, params] of references) {
    const plugin = registry.get(pluginId);
    if (!plugin) {
      throw new StoredDefinitionCompileError(
        'DECISION_FLOW_RULE_INVALID',
        `decision flow references unknown factor plugin: ${pluginId}`,
      );
    }
    const resolved = plugin.resolveContextRequirements?.(params);
    if (!resolved) continue;
    for (const [rawPeriod, rawBars] of Object.entries(resolved)) {
      const period = Number(rawPeriod);
      if (
        !Number.isSafeInteger(period) ||
        period <= 0 ||
        typeof rawBars !== 'number' ||
        !Number.isSafeInteger(rawBars) ||
        rawBars <= 0
      ) {
        throw new StoredDefinitionCompileError(
          'DECISION_FLOW_RULE_INVALID',
          `factor plugin ${pluginId} declared an invalid context requirement: ${rawPeriod}=${String(rawBars)}`,
        );
      }
      merged[period] = Math.max(merged[period] ?? 0, rawBars as number);
    }
  }
  return merged;
}

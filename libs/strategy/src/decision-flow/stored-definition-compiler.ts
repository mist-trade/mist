import type { DecisionFlowNode } from './decision-flow.types';
import type { ExternalContextRequirement } from '../kernel/kernel.types';
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
  /** 可选评估主周期（透传给插件 resolveContextRequirements，缺省保持插件默认） */
  readonly evaluationPeriod?: number;
}

export interface CompiledStoredDefinition {
  /** 统一决策流树（运行时唯一求值形态） */
  readonly flow: DecisionFlowNode;
  readonly requiredBarCount: number;
  /** context 周期 → 最少保留根数（由插件元数据推导，可能为空对象） */
  readonly contextRequirements: Readonly<Record<number, number>>;
  /** 跨标的上下文依赖（由插件元数据推导，可能为空数组） */
  readonly externalContextRequirements: readonly ExternalContextRequirement[];
  /** 轻量监控周期集合（如 [5]，由规则或插件元数据汇总，可能为空数组） */
  readonly surveillancePeriods: readonly number[];
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
const ERROR_CODE_FLOW_INVALID: StoredDefinitionCompileErrorCode =
  'DECISION_FLOW_RULE_INVALID';
const NODE_TYPE_GUARD = 'GUARD';
const NODE_TYPE_BRANCH = 'BRANCH';
const NODE_TYPE_EXTRACTOR = 'EXTRACTOR';
const NODE_TYPE_TERMINAL = 'TERMINAL';
const RETIRED_MIN_CONFIDENCE_KEY = 'minConfidence';

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
        surveillancePeriods?: unknown;
      };
      const rawFlow = payload?.rootNode ?? payload;
      const flow = validateDecisionFlowTree(rawFlow);
      return {
        flow,
        requiredBarCount:
          typeof input.rule.requiredBarCount === 'number'
            ? input.rule.requiredBarCount
            : DECISION_FLOW_DEFAULT_REQUIRED_BAR_COUNT,
        contextRequirements: deriveContextRequirements(
          flow,
          registry,
          input.evaluationPeriod,
        ),
        externalContextRequirements: deriveExternalContextRequirements(
          flow,
          registry,
        ),
        surveillancePeriods: deriveSurveillancePeriods(
          flow,
          registry,
          input.evaluationPeriod,
          payload?.surveillancePeriods,
        ),
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
          contextRequirements: deriveContextRequirements(
            flow,
            registry,
            input.evaluationPeriod,
          ),
          externalContextRequirements: deriveExternalContextRequirements(
            flow,
            registry,
          ),
          surveillancePeriods: deriveSurveillancePeriods(
            flow,
            registry,
            input.evaluationPeriod,
          ),
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
        contextRequirements: deriveContextRequirements(
          flow,
          registry,
          input.evaluationPeriod,
        ),
        externalContextRequirements: deriveExternalContextRequirements(
          flow,
          registry,
        ),
        surveillancePeriods: deriveSurveillancePeriods(
          flow,
          registry,
          input.evaluationPeriod,
        ),
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
 * 递归校验决策流树（严格 fail-closed、零兼容忽略）：
 * - 任一节点包含已退役 `minConfidence`（非 undefined）→ 抛 `DECISION_FLOW_RULE_INVALID`；
 * - 任一节点 `type === 'CONSENSUS'` 或未知节点类型 → 抛 `DECISION_FLOW_RULE_INVALID`；
 * - 缺失必要结构（id/type/子节点）→ 抛 `DECISION_FLOW_RULE_INVALID`。
 */
const VALID_BRANCH_OPERATORS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
]);
const VALID_TERMINAL_ACTIONS = new Set(['BUY', 'SELL', 'ABORT', 'INHERIT']);

export function validateDecisionFlowTree(rawRoot: unknown): DecisionFlowNode {
  const activePath = new Set<object>();
  const validated = new Set<object>();
  const seenIds = new Map<string, object>();

  const visit = (rawNode: unknown, pathDesc: string): void => {
    if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        `decision flow node at ${pathDesc} must be a non-null object`,
      );
    }

    if (activePath.has(rawNode)) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        `decision flow contains a cycle at ${pathDesc}`,
      );
    }
    if (validated.has(rawNode)) return;

    const record = rawNode as Record<string, unknown>;
    if (typeof record.id !== 'string' || record.id.length === 0) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        `decision flow node at ${pathDesc} must have a non-empty string id`,
      );
    }
    const existingWithSameId = seenIds.get(record.id);
    if (existingWithSameId !== undefined && existingWithSameId !== rawNode) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        `decision flow contains duplicate node id "${record.id}" at ${pathDesc}`,
      );
    }
    seenIds.set(record.id, rawNode);
    if (typeof record.type !== 'string' || record.type.length === 0) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        `decision flow node [${record.id}] at ${pathDesc} must have a string type`,
      );
    }

    if (
      RETIRED_MIN_CONFIDENCE_KEY in record &&
      record[RETIRED_MIN_CONFIDENCE_KEY] !== undefined
    ) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        `decision flow node [${record.id}] contains retired field "${RETIRED_MIN_CONFIDENCE_KEY}"`,
      );
    }

    activePath.add(rawNode);

    switch (record.type) {
      case NODE_TYPE_GUARD:
        if (
          typeof record.pluginId !== 'string' ||
          record.pluginId.trim().length === 0
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow GUARD node [${record.id}] must define a non-empty string pluginId`,
          );
        }
        visit(record.onPass, `${record.id}.onPass`);
        if (record.onFail !== undefined) {
          visit(record.onFail, `${record.id}.onFail`);
        }
        break;
      case NODE_TYPE_BRANCH: {
        const condition = record.condition;
        if (
          !condition ||
          typeof condition !== 'object' ||
          Array.isArray(condition)
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow BRANCH node [${record.id}] must define condition`,
          );
        }
        const condRecord = condition as Record<string, unknown>;
        if (
          typeof condRecord.operator !== 'string' ||
          !VALID_BRANCH_OPERATORS.has(condRecord.operator)
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow BRANCH node [${record.id}] has invalid condition operator: ${String(condRecord.operator)}`,
          );
        }
        if (
          condRecord.pluginId !== undefined &&
          (typeof condRecord.pluginId !== 'string' ||
            condRecord.pluginId.trim().length === 0)
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow BRANCH node [${record.id}] condition.pluginId must be a non-empty string`,
          );
        }
        const branches = record.branches;
        if (
          !branches ||
          typeof branches !== 'object' ||
          Array.isArray(branches)
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow BRANCH node [${record.id}] must define branches`,
          );
        }
        const branchRecord = branches as Record<string, unknown>;
        visit(branchRecord.true, `${record.id}.branches.true`);
        visit(branchRecord.false, `${record.id}.branches.false`);
        break;
      }
      case NODE_TYPE_EXTRACTOR:
        if (
          typeof record.pluginId !== 'string' ||
          record.pluginId.trim().length === 0
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow EXTRACTOR node [${record.id}] must define a non-empty string pluginId`,
          );
        }
        if (
          typeof record.exportAttributeKey !== 'string' ||
          record.exportAttributeKey.trim().length === 0
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow EXTRACTOR node [${record.id}] must define a non-empty string exportAttributeKey`,
          );
        }
        visit(record.next, `${record.id}.next`);
        break;
      case NODE_TYPE_TERMINAL:
        if (
          typeof record.action !== 'string' ||
          !VALID_TERMINAL_ACTIONS.has(record.action)
        ) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `decision flow TERMINAL node [${record.id}] has invalid action: ${String(record.action)}`,
          );
        }
        break;
      default:
        throw new StoredDefinitionCompileError(
          ERROR_CODE_FLOW_INVALID,
          `decision flow node [${record.id}] has unsupported or retired type: ${record.type}`,
        );
    }

    activePath.delete(rawNode);
    validated.add(rawNode);
  };

  visit(rawRoot, 'root');
  return rawRoot as DecisionFlowNode;
}

/**
 * 遍历决策流树收集全部插件引用（GUARD/EXTRACTOR 节点及 BRANCH 条件插件）。
 */
function collectPluginReferences(
  root: DecisionFlowNode,
): Map<string, Record<string, unknown> | undefined> {
  const references = new Map<string, Record<string, unknown> | undefined>();
  const visited = new Set<string>();
  const visit = (node: DecisionFlowNode | null | undefined): void => {
    if (!node) return;
    if (visited.has(node.id)) return;
    visited.add(node.id);
    switch (node.type) {
      case NODE_TYPE_GUARD:
        references.set(node.pluginId, node.params);
        visit(node.onPass);
        if (node.onFail) visit(node.onFail);
        return;
      case NODE_TYPE_BRANCH:
        if (
          node.condition.pluginId &&
          !references.has(node.condition.pluginId)
        ) {
          references.set(node.condition.pluginId, undefined);
        }
        visit(node.branches.true);
        visit(node.branches.false);
        return;
      case NODE_TYPE_EXTRACTOR:
        references.set(node.pluginId, node.params);
        visit(node.next);
        return;
      case NODE_TYPE_TERMINAL:
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
  evaluationPeriod?: number,
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
    const resolved =
      evaluationPeriod !== undefined
        ? plugin.resolveContextRequirements?.(params, { evaluationPeriod })
        : plugin.resolveContextRequirements?.(params);
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

/**
 * 收集决策流所引用插件的跨标的上下文依赖（resolveExternalContextRequirements）。
 * 同一 (securityCode, period) 取 minBars 最大值；声明非法 → 编译失败（fail-closed）。
 */
export function deriveExternalContextRequirements(
  flow: DecisionFlowNode,
  registry: FactorPluginRegistry = factorPluginRegistry,
): readonly ExternalContextRequirement[] {
  const references = collectPluginReferences(flow);
  if (references.size === 0) return [];
  if (registry === factorPluginRegistry) {
    ensureStandardPluginsRegistered();
  }
  const merged = new Map<string, ExternalContextRequirement>();
  for (const [pluginId, params] of references) {
    const plugin = registry.get(pluginId);
    if (!plugin) {
      throw new StoredDefinitionCompileError(
        'DECISION_FLOW_RULE_INVALID',
        `decision flow references unknown factor plugin: ${pluginId}`,
      );
    }
    const resolved = plugin.resolveExternalContextRequirements?.(params);
    if (!resolved) continue;
    for (const req of resolved) {
      const securityCode =
        typeof req.securityCode === 'string' ? req.securityCode.trim() : '';
      if (!securityCode) {
        throw new StoredDefinitionCompileError(
          'DECISION_FLOW_RULE_INVALID',
          `factor plugin ${pluginId} declared an external context requirement without securityCode`,
        );
      }
      const period = Number(req.period);
      const minBars = Number(req.minBars);
      if (
        !Number.isSafeInteger(period) ||
        period <= 0 ||
        !Number.isSafeInteger(minBars) ||
        minBars <= 0
      ) {
        throw new StoredDefinitionCompileError(
          'DECISION_FLOW_RULE_INVALID',
          `factor plugin ${pluginId} declared an invalid external context requirement: ${securityCode}@${String(req.period)} x${String(req.minBars)}`,
        );
      }
      const securityId = Number.isSafeInteger(req.securityId)
        ? req.securityId
        : undefined;
      const key = `${securityCode}|${period}`;
      const existing = merged.get(key);
      if (!existing || minBars > existing.minBars) {
        merged.set(key, { securityCode, securityId, period, minBars });
      }
    }
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.securityCode.localeCompare(right.securityCode) ||
      left.period - right.period,
  );
}

/**
 * 汇总决策流所需的轻量监控周期（rule.surveillancePeriods ∪ 插件 resolveSurveillancePeriods）。
 * 仅保留严格小于 evaluationPeriod（当指定时）的正整数周期，升序去重。
 */
export function deriveSurveillancePeriods(
  flow: DecisionFlowNode,
  registry: FactorPluginRegistry = factorPluginRegistry,
  evaluationPeriod?: number,
  explicitSurveillancePeriods?: unknown,
): readonly number[] {
  const merged = new Set<number>();

  if (explicitSurveillancePeriods !== undefined) {
    if (!Array.isArray(explicitSurveillancePeriods)) {
      throw new StoredDefinitionCompileError(
        ERROR_CODE_FLOW_INVALID,
        'decision flow surveillancePeriods must be an array of positive integers',
      );
    }
    for (const raw of explicitSurveillancePeriods) {
      const period = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isSafeInteger(period) || period <= 0) {
        throw new StoredDefinitionCompileError(
          ERROR_CODE_FLOW_INVALID,
          `decision flow contains invalid surveillance period: ${String(raw)}`,
        );
      }
      if (evaluationPeriod === undefined || period < evaluationPeriod) {
        merged.add(period);
      }
    }
  }

  const references = collectPluginReferences(flow);
  if (references.size > 0) {
    if (registry === factorPluginRegistry) {
      ensureStandardPluginsRegistered();
    }
    for (const [pluginId, params] of references) {
      const plugin = registry.get(pluginId);
      if (!plugin) {
        throw new StoredDefinitionCompileError(
          ERROR_CODE_FLOW_INVALID,
          `decision flow references unknown factor plugin: ${pluginId}`,
        );
      }
      const resolved =
        evaluationPeriod !== undefined
          ? plugin.resolveSurveillancePeriods?.(params, { evaluationPeriod })
          : plugin.resolveSurveillancePeriods?.(params);
      if (!resolved) continue;
      for (const rawPeriod of resolved) {
        const period = Number(rawPeriod);
        if (!Number.isSafeInteger(period) || period <= 0) {
          throw new StoredDefinitionCompileError(
            ERROR_CODE_FLOW_INVALID,
            `factor plugin ${pluginId} declared an invalid surveillance period: ${String(rawPeriod)}`,
          );
        }
        if (evaluationPeriod === undefined || period < evaluationPeriod) {
          merged.add(period);
        }
      }
    }
  }

  return [...merged].sort((left, right) => left - right);
}

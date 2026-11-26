import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor/factor.types';
import { contextOpinionKey } from '../kernel/availability';
import {
  factorPluginRegistry,
  type FactorPluginRegistry,
} from '../factor/factor-plugin-registry';
import { ensureStandardPluginsRegistered } from '../factor/standard-plugins';
import type {
  DecisionExecutionTraceItem,
  DecisionFlowNode,
  DecisionResult,
} from './decision-flow.types';
import { DECISION_ACTIONS } from '../strategy.constants';

export interface DecisionFlowEvaluatorOptions {
  readonly registry?: FactorPluginRegistry;
}

const NODE_TYPE_GUARD = 'GUARD';
const NODE_TYPE_BRANCH = 'BRANCH';
const NODE_TYPE_EXTRACTOR = 'EXTRACTOR';
const NODE_TYPE_TERMINAL = 'TERMINAL';
const ACTION_INHERIT = 'INHERIT';
const ACTION_ABORT = 'ABORT';
const ACTION_BOTH = 'BOTH';
const ACTION_ANY = 'ANY';
const STATUS_ABORTED = 'ABORTED';
const STATUS_SIGNAL_EMITTED = 'SIGNAL_EMITTED';

/**
 * 树状决策流通用求值器 (DecisionFlowEvaluator)
 * 采用 Top-Down 递归求值算法，支持毫秒级短路剪枝与黑板属性流转
 */
export class DecisionFlowEvaluator {
  private readonly registry: FactorPluginRegistry;

  constructor(options?: DecisionFlowEvaluatorOptions) {
    this.registry = options?.registry ?? factorPluginRegistry;
    ensureStandardPluginsRegistered(this.registry);
  }

  public async evaluate(
    rootNode: DecisionFlowNode,
    context: FactorContext,
  ): Promise<DecisionResult> {
    const trace: DecisionExecutionTraceItem[] = [];

    return this.evaluateNode(rootNode, context, trace);
  }

  private async evaluateNode(
    node: DecisionFlowNode,
    context: FactorContext,
    trace: DecisionExecutionTraceItem[],
    inheritedAction?: 'BUY' | 'SELL',
    inheritedMeta?: {
      readonly badgeText?: string;
      readonly displayTag?: string;
      readonly styleMeta?: Readonly<{
        color?: string;
        position?: 'above' | 'below';
      }>;
    },
  ): Promise<DecisionResult> {
    switch (node.type) {
      case NODE_TYPE_GUARD: {
        const opinion = await this.resolveOpinion(
          node.pluginId,
          context,
          node.params,
        );

        const actionMatches =
          node.requiredAction === ACTION_BOTH ||
          node.requiredAction === ACTION_ANY
            ? opinion.action === DECISION_ACTIONS.BUY ||
              opinion.action === DECISION_ACTIONS.SELL
            : opinion.action === node.requiredAction;

        // 方向隔离守门：若上游已确立买卖方向（inheritedAction 为 BUY 或 SELL），
        // 且当下门禁要求了特定方向（node.requiredAction 非 BOTH/ANY），
        // 则上游方向必须与门禁期望方向严格一致，绝对禁止将 SELL 信号送入 BUY 门禁或反向篡改。
        const directionConsistent =
          !inheritedAction ||
          node.requiredAction === ACTION_BOTH ||
          node.requiredAction === ACTION_ANY ||
          node.requiredAction === inheritedAction;

        const passed = actionMatches && directionConsistent;

        trace.push({
          nodeId: node.id,
          type: NODE_TYPE_GUARD,
          pluginId: node.pluginId,
          name: node.name,
          action: opinion.action,
          passed,
          reason: directionConsistent
            ? opinion.reason
            : `方向隔离阻断：上游已确立【${inheritedAction}】决策，与本门禁要求【${node.requiredAction}】方向冲突`,
          evidence: opinion.evidence,
          badgeText: opinion.badgeText,
          displayTag: opinion.displayTag,
          styleMeta: opinion.styleMeta,
        });

        const nextInheritedAction =
          opinion.action === DECISION_ACTIONS.BUY ||
          opinion.action === DECISION_ACTIONS.SELL
            ? opinion.action
            : inheritedAction;

        const nextInheritedMeta = {
          badgeText: opinion.badgeText ?? inheritedMeta?.badgeText,
          displayTag: opinion.displayTag ?? inheritedMeta?.displayTag,
          styleMeta: opinion.styleMeta ?? inheritedMeta?.styleMeta,
        };

        if (passed) {
          return this.evaluateNode(
            node.onPass,
            context,
            trace,
            nextInheritedAction,
            nextInheritedMeta,
          );
        } else if (node.onFail) {
          return this.evaluateNode(
            node.onFail,
            context,
            trace,
            inheritedAction,
            inheritedMeta,
          );
        }

        return {
          status: STATUS_ABORTED,
          reason: `前置门禁[${node.name}]未通过: ${opinion.reason}`,
          trace,
        };
      }

      case NODE_TYPE_BRANCH: {
        const conditionResult = this.resolveCondition(node.condition, context);
        trace.push({
          nodeId: node.id,
          type: NODE_TYPE_BRANCH,
          name: node.name,
          conditionResult,
        });

        const nextNode = conditionResult
          ? node.branches.true
          : node.branches.false;
        return this.evaluateNode(
          nextNode,
          context,
          trace,
          inheritedAction,
          inheritedMeta,
        );
      }

      case NODE_TYPE_EXTRACTOR: {
        const opinion = await this.resolveOpinion(
          node.pluginId,
          context,
          node.params,
        );

        if (opinion.evidence) {
          context.attributes.set(node.exportAttributeKey, opinion.evidence);
        } else {
          context.attributes.set(node.exportAttributeKey, opinion);
        }

        trace.push({
          nodeId: node.id,
          type: NODE_TYPE_EXTRACTOR,
          pluginId: node.pluginId,
          name: node.name,
          exportedKey: node.exportAttributeKey,
          evidence: opinion.evidence,
          badgeText: opinion.badgeText,
          displayTag: opinion.displayTag,
          styleMeta: opinion.styleMeta,
        });

        const nextInheritedMeta = {
          badgeText: opinion.badgeText ?? inheritedMeta?.badgeText,
          displayTag: opinion.displayTag ?? inheritedMeta?.displayTag,
          styleMeta: opinion.styleMeta ?? inheritedMeta?.styleMeta,
        };

        return this.evaluateNode(
          node.next,
          context,
          trace,
          inheritedAction,
          nextInheritedMeta,
        );
      }

      case NODE_TYPE_TERMINAL: {
        const finalAction =
          node.action === ACTION_INHERIT
            ? inheritedAction || DECISION_ACTIONS.BUY
            : node.action;

        trace.push({
          nodeId: node.id,
          type: NODE_TYPE_TERMINAL,
          action: finalAction,
          signalTag: node.signalTag,
          reason: node.reason,
        });

        if (finalAction === ACTION_ABORT) {
          return {
            status: STATUS_ABORTED,
            signalTag: node.signalTag,
            reason: node.reason ?? '决策流执行终止',
            trace,
          };
        }

        const badgeText =
          inheritedMeta?.badgeText ?? this.findBadgeTextFromTrace(trace);
        const displayTag = inheritedMeta?.displayTag;
        const styleMeta = inheritedMeta?.styleMeta;
        const evidence = this.findEvidenceFromTrace(trace);

        return {
          status: STATUS_SIGNAL_EMITTED,
          action: finalAction,
          signalTag: node.signalTag,
          reason:
            node.reason ??
            `决策流信号发射 (${finalAction === DECISION_ACTIONS.BUY ? '买入/开仓' : '卖出/平仓'})`,
          badgeText,
          displayTag,
          styleMeta,
          trace,
          ...(evidence ? { evidence } : {}),
        };
      }
    }
  }

  private findEvidenceFromTrace(
    trace: readonly DecisionExecutionTraceItem[],
  ): Readonly<Record<string, unknown>> | undefined {
    for (let i = trace.length - 1; i >= 0; i--) {
      if (trace[i].passed === false) continue;
      const ev = trace[i].evidence as Record<string, unknown> | undefined;
      if (ev && typeof ev === 'object' && Object.keys(ev).length > 0) {
        return ev;
      }
    }
    return undefined;
  }

  private findBadgeTextFromTrace(
    trace: readonly DecisionExecutionTraceItem[],
  ): string | undefined {
    for (let i = trace.length - 1; i >= 0; i--) {
      const item = trace[i];
      if (item.passed === false) continue;
      if (item.badgeText) return item.badgeText;
      const ev = item.evidence as Record<string, unknown> | undefined;
      if (ev?.badgeText && typeof ev.badgeText === 'string') {
        return ev.badgeText;
      }
    }
    return undefined;
  }

  /** context 角色缓存读取（2026-11-24，决策文档 7.1.1）：内核对 role:'context'
   *  插件每 Bar 先于 plan 预求值一次并写入黑板 `contextOpinion.<pluginId>`；
   *  命中缓存则不再重复求值。未命中（非 context 插件或未经内核预取）回退直连
   *  求值，语义与旧路径完全一致。 */
  private async resolveOpinion(
    pluginId: string,
    context: FactorContext,
    params?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const cacheKey = contextOpinionKey(pluginId, params);
    const cached = context.attributes.get(cacheKey);
    if (cached) {
      return cached as FactorOpinion;
    }
    const plugin = this.getPlugin(pluginId);
    const opinion = await plugin.evaluate(context, params);
    // 仅 role:'context' 插件写回缓存（同 Bar 内参数相同的后续节点直接命中，
    // 如双 regime 门禁共用 {mode:'dual_speed'} 组合时只求值一次）；
    // 'signal' 插件保持逐次调用语义不变（有状态游标插件依赖每次调用推进）。
    if (plugin.role === 'context') {
      context.attributes.set(cacheKey, opinion);
    }
    return opinion;
  }

  private getPlugin(pluginId: string): FactorPlugin {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new Error(
        `DecisionFlowEvaluator: 未在注册表中找到插件 [${pluginId}]`,
      );
    }
    return plugin;
  }

  private resolveCondition(
    condition: {
      readonly attributeKey?: string;
      readonly operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
      readonly value: unknown;
    },
    context: FactorContext,
  ): boolean {
    if (!condition.attributeKey) {
      return true;
    }

    const actual = this.resolveAttributeValue(
      context.attributes,
      condition.attributeKey,
    );
    const expected = condition.value;

    switch (condition.operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'in':
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;
      default:
        return false;
    }
  }

  private resolveAttributeValue(
    attributes: Map<string, unknown>,
    key: string,
  ): unknown {
    if (attributes.has(key)) {
      return attributes.get(key);
    }
    const parts = key.split('.');
    if (parts.length > 1) {
      for (let i = parts.length - 1; i >= 1; i--) {
        const prefix = parts.slice(0, i).join('.');
        if (attributes.has(prefix)) {
          let cur: unknown = attributes.get(prefix);
          const rest = parts.slice(i);
          for (const p of rest) {
            if (cur == null || typeof cur !== 'object') {
              cur = undefined;
              break;
            }
            cur = (cur as Record<string, unknown>)[p];
          }
          return cur;
        }
      }
    }
    return undefined;
  }
}

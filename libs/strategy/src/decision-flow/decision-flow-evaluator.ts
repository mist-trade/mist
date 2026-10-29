import type { FactorContext, FactorPlugin } from '../factor/factor.types';
import {
  factorPluginRegistry,
  type FactorPluginRegistry,
} from '../factor/factor-plugin-registry';
import { ensureStandardPluginsRegistered } from '../factor/standard-plugins';
import type {
  ConfidenceLevel,
  ConsensusVoteBreakdown,
  DecisionExecutionTraceItem,
  DecisionFlowNode,
  DecisionResult,
} from './decision-flow.types';
import { DECISION_ACTIONS } from '../strategy.constants';

export interface DecisionFlowEvaluatorOptions {
  readonly registry?: FactorPluginRegistry;
}

/**
 * 树状决策流通用求值器 (DecisionFlowEvaluator)
 * 采用 Top-Down 递归求值算法，支持毫秒级短路剪枝、黑板属性流转与局部加权打分
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
    let activeScore: number | undefined;

    return this.evaluateNode(rootNode, context, trace, activeScore);
  }

  private async evaluateNode(
    node: DecisionFlowNode,
    context: FactorContext,
    trace: DecisionExecutionTraceItem[],
    currentScore?: number,
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
      case 'GUARD': {
        const plugin = this.getPlugin(node.pluginId);
        const opinion = await plugin.evaluate(context, node.params);

        const minConf = node.minConfidence ?? 0.0;
        const actionMatches =
          node.requiredAction === 'BOTH' || node.requiredAction === 'ANY'
            ? opinion.action === DECISION_ACTIONS.BUY ||
              opinion.action === DECISION_ACTIONS.SELL
            : opinion.action === node.requiredAction;

        // 方向隔离守门：若上游已确立买卖方向（inheritedAction 为 BUY 或 SELL），
        // 且当下门禁要求了特定方向（node.requiredAction 非 BOTH/ANY），
        // 则上游方向必须与门禁期望方向严格一致，绝对禁止将 SELL 信号送入 BUY 门禁或反向篡改。
        const directionConsistent =
          !inheritedAction ||
          node.requiredAction === 'BOTH' ||
          node.requiredAction === 'ANY' ||
          node.requiredAction === inheritedAction;

        const passed =
          actionMatches && directionConsistent && opinion.confidence >= minConf;

        trace.push({
          nodeId: node.id,
          type: 'GUARD',
          name: node.name,
          action: opinion.action,
          confidence: opinion.confidence,
          reason: directionConsistent
            ? opinion.reason
            : `方向隔离阻断：上游已确立【${inheritedAction}】决策，与本门禁要求【${node.requiredAction}】方向冲突`,
          evidence: opinion.evidence,
          badgeText: opinion.badgeText,
          displayTag: opinion.displayTag,
          styleMeta: opinion.styleMeta,
        });

        const nextScore =
          currentScore ?? Number((opinion.confidence * 100).toFixed(1));

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
            nextScore,
            nextInheritedAction,
            nextInheritedMeta,
          );
        } else if (node.onFail) {
          return this.evaluateNode(
            node.onFail,
            context,
            trace,
            nextScore,
            inheritedAction,
            inheritedMeta,
          );
        }

        return {
          status: 'ABORTED',
          confidence: 0,
          confidenceLevel: 'LOW',
          reason: `前置门禁[${node.name}]未通过: ${opinion.reason}`,
          trace,
        };
      }

      case 'BRANCH': {
        const conditionResult = this.resolveCondition(node.condition, context);
        trace.push({
          nodeId: node.id,
          type: 'BRANCH',
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
          currentScore,
          inheritedAction,
          inheritedMeta,
        );
      }

      case 'EXTRACTOR': {
        const plugin = this.getPlugin(node.pluginId);
        const opinion = await plugin.evaluate(context, node.params);

        if (opinion.evidence) {
          context.attributes.set(node.exportAttributeKey, opinion.evidence);
        } else {
          context.attributes.set(node.exportAttributeKey, opinion);
        }

        trace.push({
          nodeId: node.id,
          type: 'EXTRACTOR',
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
          currentScore,
          inheritedAction,
          nextInheritedMeta,
        );
      }

      case 'CONSENSUS': {
        const targetAction = node.targetAction ?? DECISION_ACTIONS.BUY;
        const vetoAction =
          targetAction === DECISION_ACTIONS.BUY
            ? DECISION_ACTIONS.SELL
            : DECISION_ACTIONS.BUY;
        let totalWeight = 0;
        let earnedScore = 0;
        let vetoTriggered = false;
        let vetoReason = '';
        const breakdown: ConsensusVoteBreakdown[] = [];

        const evaluationPromises = node.plugins.map(async (item) => {
          const plugin = this.getPlugin(item.pluginId);
          const opinion = await plugin.evaluate(context, item.params);
          return { item, opinion };
        });

        const results = await Promise.all(evaluationPromises);

        for (const { item, opinion } of results) {
          totalWeight += item.weight;
          const isVetoItem = item.isVeto === true;
          const itemVetoTriggered = isVetoItem && opinion.action === vetoAction;

          if (itemVetoTriggered) {
            vetoTriggered = true;
            vetoReason = `插件[${pluginName(item.pluginId)}]行使一票否决权: ${opinion.reason}`;
          }

          if (opinion.action === targetAction) {
            earnedScore += item.weight * opinion.confidence;
          }

          breakdown.push({
            pluginId: item.pluginId,
            weight: item.weight,
            action: opinion.action,
            confidence: opinion.confidence,
            reason: opinion.reason,
            isVeto: isVetoItem,
            vetoTriggered: itemVetoTriggered,
          });
        }

        const calculatedScore =
          vetoTriggered || totalWeight === 0
            ? 0
            : (earnedScore / totalWeight) * 100;

        trace.push({
          nodeId: node.id,
          type: 'CONSENSUS',
          name: node.name,
          score: calculatedScore,
          threshold: node.threshold,
          breakdown,
        });

        const passed = !vetoTriggered && calculatedScore >= node.threshold;
        const nextInheritedAction =
          targetAction === DECISION_ACTIONS.BUY ||
          targetAction === DECISION_ACTIONS.SELL
            ? targetAction
            : inheritedAction;

        if (passed) {
          return this.evaluateNode(
            node.onSuccess,
            context,
            trace,
            calculatedScore,
            nextInheritedAction,
            inheritedMeta,
          );
        } else if (node.onFailure) {
          return this.evaluateNode(
            node.onFailure,
            context,
            trace,
            calculatedScore,
            nextInheritedAction,
            inheritedMeta,
          );
        }

        return {
          status: 'ABORTED',
          confidence: calculatedScore,
          confidenceLevel: this.resolveConfidenceLevel(calculatedScore),
          reason: vetoTriggered
            ? vetoReason
            : `局部加权打分(${calculatedScore.toFixed(1)})未达门槛(${node.threshold.toFixed(1)})`,
          trace,
        };
      }

      case 'TERMINAL': {
        const finalAction =
          node.action === 'INHERIT'
            ? inheritedAction || DECISION_ACTIONS.BUY
            : node.action;

        trace.push({
          nodeId: node.id,
          type: 'TERMINAL',
          action: finalAction,
          signalTag: node.signalTag,
          reason: node.reason,
        });

        const confidence = currentScore ?? (finalAction === 'ABORT' ? 0 : 85);
        const confidenceLevel = this.resolveConfidenceLevel(confidence);

        if (finalAction === 'ABORT') {
          return {
            status: 'ABORTED',
            confidence,
            confidenceLevel,
            signalTag: node.signalTag,
            reason: node.reason ?? '决策流执行终止',
            trace,
          };
        }

        const badgeText =
          inheritedMeta?.badgeText ?? this.findBadgeTextFromTrace(trace);
        const displayTag = inheritedMeta?.displayTag;
        const styleMeta = inheritedMeta?.styleMeta;

        return {
          status: 'SIGNAL_EMITTED',
          action: finalAction,
          confidence,
          confidenceLevel,
          signalTag: node.signalTag,
          reason:
            node.reason ??
            `决策流信号发射 (${finalAction === 'BUY' ? '买入/开仓' : '卖出/平仓'})`,
          badgeText,
          displayTag,
          styleMeta,
          trace,
        };
      }
    }
  }

  private findBadgeTextFromTrace(
    trace: readonly DecisionExecutionTraceItem[],
  ): string | undefined {
    for (let i = trace.length - 1; i >= 0; i--) {
      const item = trace[i];
      if (item.badgeText) return item.badgeText;
      const ev = item.evidence as Record<string, unknown> | undefined;
      if (ev?.badgeText && typeof ev.badgeText === 'string') {
        return ev.badgeText;
      }
    }
    return undefined;
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

    const actual = context.attributes.get(condition.attributeKey);
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

  public resolveConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 80) return 'HIGH';
    if (score >= 65) return 'MEDIUM';
    return 'LOW';
  }
}

function pluginName(pluginId: string): string {
  const parts = pluginId.split('.');
  return parts[parts.length - 1] ?? pluginId;
}

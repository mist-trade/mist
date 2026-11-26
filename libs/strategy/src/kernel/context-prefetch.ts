import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import type { FactorPluginRegistry } from '../factor/factor-plugin-registry';
import { contextOpinionKey } from './availability';

export interface ContextPrefetchSpec {
  readonly pluginId: string;
  readonly params?: Record<string, unknown>;
  /** Blackboard key the prefetch writes and guards read (params-aware). */
  readonly cacheKey: string;
}

/**
 * 收集一个决策流里所有 role:'context' 插件的 (pluginId, params) 求值组合
 * （2026-11-24 定稿，决策文档 7.1.1）。内核每 Bar 对每个组合预求值一次并写入
 * 黑板；GUARD/EXTRACTOR 节点按相同键读缓存，相同参数的组合只求值一次。
 */
export function collectContextPrefetchSpecs(
  flow: DecisionFlowNode,
  registry: FactorPluginRegistry,
): readonly ContextPrefetchSpec[] {
  const specs = new Map<string, ContextPrefetchSpec>();

  const add = (pluginId: string, params?: Record<string, unknown>): void => {
    if (registry.get(pluginId)?.role !== 'context') return;
    const cacheKey = contextOpinionKey(pluginId, params);
    if (!specs.has(cacheKey)) {
      specs.set(cacheKey, { pluginId, params, cacheKey });
    }
  };

  const visit = (node: DecisionFlowNode | undefined): void => {
    if (!node) return;
    switch (node.type) {
      case 'GUARD':
        add(node.pluginId, node.params);
        visit(node.onPass);
        visit(node.onFail);
        break;
      case 'EXTRACTOR':
        add(node.pluginId, node.params);
        visit(node.next);
        break;
      case 'BRANCH':
        if (node.condition.pluginId) add(node.condition.pluginId, undefined);
        visit(node.branches.true);
        visit(node.branches.false);
        break;
      case 'TERMINAL':
        break;
    }
  };

  visit(flow);
  return [...specs.values()];
}

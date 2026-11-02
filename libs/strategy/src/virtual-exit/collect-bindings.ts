import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import type { FactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { VirtualExitRuleBinding } from './virtual-exit.port';

/**
 * 从决策流树收集各插件声明的虚拟出场规则（只做遍历，不求值）。
 * 同一通道内多个插件声明规则时按遍历顺序合并。
 */
export function collectVirtualExitBindings(
  flow: DecisionFlowNode,
  registry: FactorPluginRegistry,
): readonly VirtualExitRuleBinding[] {
  const bindings: VirtualExitRuleBinding[] = [];

  const collect = (
    pluginId: string,
    params?: Record<string, unknown>,
  ): void => {
    const plugin = registry.get(pluginId);
    const rules = plugin?.virtualExitRules?.(params);
    if (!rules || rules.length === 0) return;
    for (const rule of rules) {
      bindings.push({ ownerPluginId: pluginId, rule });
    }
  };

  const visit = (node: DecisionFlowNode | undefined): void => {
    if (!node) return;
    switch (node.type) {
      case 'GUARD':
        collect(node.pluginId, node.params);
        visit(node.onPass);
        visit(node.onFail);
        break;
      case 'EXTRACTOR':
        collect(node.pluginId, node.params);
        visit(node.next);
        break;
      case 'CONSENSUS':
        for (const item of node.plugins) collect(item.pluginId, item.params);
        visit(node.onSuccess);
        visit(node.onFailure);
        break;
      case 'BRANCH':
        if (node.condition.pluginId)
          collect(node.condition.pluginId, undefined);
        visit(node.branches.true);
        visit(node.branches.false);
        break;
      case 'TERMINAL':
        break;
    }
  };

  visit(flow);
  return bindings;
}

import type { DataSource, Period, StrategySignalKind } from '@app/shared-data';
import type { DecisionFlowNode } from '@app/strategy';
import type { StoredDefinitionSourceKind } from '@app/strategy';

/**
 * 统一求值计划（编译边界产物）：运行时只有 decision_flow 单一形态。
 * legacy kind（rule_dsl / chan_bsp）已在编译边界经共享 helper 透明编译为决策流树。
 */
export type SignalRegistryExecutionPlan = {
  readonly kind: 'decision_flow';
  readonly flow: DecisionFlowNode;
  readonly signalKind?: StrategySignalKind;
  readonly requiredBarCount: number;
  readonly sourceKind: StoredDefinitionSourceKind;
};

export interface SignalRegistryDefinition {
  readonly definitionId: number;
  readonly versionId: number;
  readonly signalKind: StrategySignalKind;
  readonly targetUniverse: readonly string[];
  readonly securityIds: ReadonlySet<number>;
  readonly periods: readonly Period[];
  readonly sources: readonly DataSource[];
  readonly executionPlan: SignalRegistryExecutionPlan;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export interface SignalRegistrySnapshot {
  readonly generation: number;
  readonly definitions: ReadonlyMap<number, SignalRegistryDefinition>;
}

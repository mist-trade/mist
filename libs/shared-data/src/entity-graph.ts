import {
  BacktestRun,
  BacktestSignalResult,
  BacktestTradeResult,
  MarketMacroIndicator,
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  KQuality,
  RealtimeSubscriptionAssignment,
  RuntimeConfig,
  Security,
  SecuritySourceConfig,
  StrategyAlertDelivery,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
  StrategyVersion,
} from './entities';

/**
 * Complete TypeORM entity graph for every Mist application.
 *
 * TypeORM requires BOTH sides of a relation to be registered: a class that
 * declares `@ManyToOne/@OneToMany/@OneToOne` towards another entity fails
 * `buildMetadatas()` at boot when the target is missing (`Entity metadata for
 * X#y was not found`) and crash-loops the container. Maintaining one catalog and
 * deriving every application's `entities` array from it removes that class of
 * boot failure (hit in production on 2026-10-24).
 *
 * `entity-graph.spec.ts` builds the metadata without a database and asserts each
 * application registers this catalog instead of a hand-written subset.
 */
export const MIST_ENTITIES = [
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  KQuality,
  Security,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
  RuntimeConfig,
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  StrategyAlertDelivery,
  BacktestRun,
  BacktestSignalResult,
  BacktestTradeResult,
  MarketMacroIndicator,
] as const;

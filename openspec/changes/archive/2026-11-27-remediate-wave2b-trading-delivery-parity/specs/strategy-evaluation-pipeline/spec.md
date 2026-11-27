## ADDED Requirements

### Requirement: Signal Mapper Completeness, Safe VO Projection, And Runtime Singleton Integrity
- `mapKernelSignalToPersistencePayload` SHALL preserve `pivotPrice`, `badgeText`, `displayTag`, `styleMeta`, and `triggerPeriod` inside `contextSnapshot` and typed payload outputs.
- `simulation/kernel-signal-mapper.ts` SHALL derive buy/sell direction from `resolveIntent`, keep `pivotTime`/`pivotPrice` as `null` when absent rather than fabricating from `signalTime`/`triggerPrice`, and filter `decisionTrace` items to exclude `passed === false` and `EXTRACTOR` nodes.
- `StrategySignalService` SHALL project `StrategySignalVo` explicitly without spreading raw TypeORM `StrategySignal` entities (`...signal`), exposing `signalType`, `pivotPrice`, `badgeText`, `displayTag`, `styleMeta`, `triggerPeriod`, and `effectiveTime`.
- `HealthStateService` SHALL inject `RuntimeObservabilityService` as an optional DI dependency rather than instantiating an isolated instance, and `SignalPreMarketWarmupService` SHALL synchronize window warmup under `SignalRuntimeMutex`.

#### Scenario: StrategySignalVo projection omits raw entity fields and includes display metadata
- **WHEN** `StrategySignalService` maps persisted `StrategySignal` rows
- **THEN** each item MUST expose explicit VO fields including `signalType`, `effectiveTime`, and snapshot display metadata without leaking unmapped ORM relations

#### Scenario: Simulation mapper preserves null pivots and filters non-passing or extractor trace nodes
- **WHEN** a `KernelSignal` has no `pivotTime`/`pivotPrice` and a mixed `decisionTrace` containing a failed step and an `EXTRACTOR` step
- **THEN** the mapped simulation frame signal MUST preserve `pivotTime: null`, `pivotPrice: null`
- **AND** the compact trace tags MUST exclude failed and `EXTRACTOR` nodes

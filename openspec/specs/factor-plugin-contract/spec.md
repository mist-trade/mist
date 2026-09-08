# factor-plugin-contract Specification

## Purpose
Define the stateless, domain-neutral factor plugin contract, plugin metadata registry, opinion scoring protocol, and external HTTP plugin bridge.

## Requirements

### Requirement: Factor Plugin Standard Contract And Pure Function Evaluation
Every factor plugin SHALL implement the `FactorPlugin` interface. The `evaluate(context, params)` method MUST be an idempotent pure function without side effects, without modifying external state or writing to the database. All market data and historical bars MUST be injected via read-only `FactorContext`.

#### Scenario: Plugin evaluates context and outputs opinion
- **WHEN** `evaluate` is invoked with valid `FactorContext` and optional params
- **THEN** it MUST return a deterministic `FactorOpinion` (`action`, `confidence`, `reason`, optional `evidence`)
- **AND** it MUST NOT mutate the input `FactorContext` or global application state

#### Scenario: Plugin consumes normalized strategy bars
- **WHEN** a plugin evaluates price action
- **THEN** it MUST consume pre-normalized `ProjectedStrategyBar[]` from `context.bars` without performing private imputation or price adjustment

### Requirement: Factor Opinion Output And Whitebox Evidence
Every plugin evaluation SHALL emit a `FactorOpinion` specifying action (`BUY`, `SELL`, or `NEUTRAL`), confidence score between 0.0 and 1.0, human-readable reason string, and structured evidence object for whitebox attribution.

#### Scenario: Structured evidence is captured for trace inspection
- **WHEN** a plugin (such as Chan BSP or Capital Flow) determines an opinion
- **THEN** it MAY attach structured domain data into `evidence` (e.g. `{ zd, zg }` or `{ netInflow }`)
- **AND** the evidence MUST be serializable for persisted signal records and frontend drawer rendering

### Requirement: Factor Plugin Registry And Classification
The engine SHALL maintain a singleton `FactorPluginRegistry` allowing plugins to be registered, queried by unique identifier (`plugin.<category>.<name>`), and listed by `FactorCategory` (`REGIME`, `FUNDAMENTAL`, `CAPITAL`, `EVENT`, `TECHNICAL`, `CHAN`, `AI_SENTIMENT`).

#### Scenario: Plugin registration and lookup
- **WHEN** an application boots and registers factor plugins
- **THEN** each plugin MUST be accessible via `registry.get(pluginId)`
- **AND** duplicate registrations with the same identifier MUST be rejected or logged

### Requirement: External HTTP Factor Plugin Protocol
The engine SHALL support external AI/Python factor evaluation through a standard `HttpProxyFactorPlugin`. Calls MUST be bounded by a strict timeout (default 200ms).

#### Scenario: External HTTP factor evaluates within deadline
- **WHEN** an external HTTP plugin receives context attributes and responds with HTTP 200 within timeout
- **THEN** its parsed `action`, `confidence`, and `evidence` MUST be returned to the decision flow

#### Scenario: External HTTP factor times out or errors
- **WHEN** an external HTTP plugin fails to respond within the configured timeout or returns a 5xx error
- **THEN** `HttpProxyFactorPlugin` MUST degrade safely to `{ action: 'NEUTRAL', confidence: 0.0, reason: 'Timeout' }`
- **AND** it MUST NOT throw unhandled exceptions or block the primary evaluation pipeline

## Why

Mist has data collection, indicators, Chan Theory analysis, and AstrBot-facing
query skills, but it still lacks the product layer that turns market analysis
into reusable trading strategies, signal events, proactive alerts, and
historical validation. Strategy registration and backtesting share the same
core definition model, so they need a roadmap before either side is implemented
as a standalone feature.

## What Changes

- Add a product capability roadmap for the strategy platform, separate from the
  existing production stabilization roadmap.
- Define a shared strategy-definition foundation for strategy registration,
  realtime signal detection, proactive alert events, and signal-level
  backtesting.
- Choose declaration-first strategy rules for the first phase; arbitrary user
  code strategies remain out of scope until a later explicitly scoped change.
- Split implementation into focused follow-up OpenSpec changes for strategy
  definition, signal alerts, signal-level backtesting, operator UI, and later
  portfolio-level backtesting.
- Require each child change to state repository ownership, API/data-model
  impact, migration requirements, local validation, live-runtime relevance, and
  archive criteria.
- Keep this change as planning and governance only; it does not implement
  backend APIs, database tables, schedulers, frontend screens, AstrBot commands,
  or datasource behavior.

## Capabilities

### New Capabilities

- `strategy-platform-roadmap`: Product roadmap, decomposition rules, shared
  strategy-model decisions, validation gates, and child-change readiness
  requirements for Mist strategy registration, signal alerts, and signal-level
  backtesting.

### Modified Capabilities

None. Existing runtime capabilities remain governed by their own specs and
follow-up changes.

## Impact

- Affects planning and future implementation across:
  - `mist` for the NestJS strategy definition, signal, alert, and backtest APIs.
  - `mist-fe` for strategy operator screens and backtest result views.
  - `mist-skills` for AstrBot-facing alert consumption or push workflows.
  - `mist-monitoring` only when later child changes expose operational metrics
    for strategy runners or alert delivery.
- Future child changes will add MySQL migrations because TypeORM synchronize is
  disabled.
- The roadmap must avoid naming collisions with existing collector
  `DataCollectionStrategy` implementations and datasource-side TDX/QMT strategy
  identity.

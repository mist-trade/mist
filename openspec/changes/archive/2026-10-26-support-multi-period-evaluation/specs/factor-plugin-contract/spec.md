# factor-plugin-contract Specification Delta

## ADDED Requirements

### Requirement: Factor Plugins Shall Declare Multi-Period Context Requirements

A factor plugin that consumes another period's series SHALL declare that demand through optional
plugin metadata (`resolveContextRequirements(params)` returning a period-to-minimum-bars record).
The compile boundary SHALL derive each execution plan's context requirements by walking the
decision flow tree, resolving every plugin node against the plugin registry, and merging the
returned requirements per period with max. The derivation SHALL apply identically to
`decision_flow`, `rule_dsl` and `chan_bsp` compiled plans. Plugin metadata is the only source of
context demand: rule JSON, public DTOs and the database schema SHALL NOT carry a caller-owned
context declaration, and context periods are not a caller-owned lookback.

#### Scenario: A plugin declares its context demand
- **WHEN** a decision flow tree contains a plugin whose metadata returns
  `{ 5: 120, 1440: 10 }` for its params
- **THEN** the compiled plan MUST carry context requirements covering period 5 with 120 bars and
  period 1440 with 10 bars
- **AND** the same declaration MUST drive backtest pre-warm, realtime hydration and kernel
  window budgets

#### Scenario: Multiple plugins declare overlapping contexts
- **WHEN** two plugin nodes in one flow declare context for the same period with different
  minimum bars
- **THEN** the compiled plan MUST retain the maximum of the declared minima for that period

#### Scenario: An unknown plugin reference fails compilation
- **WHEN** a flow node references a plugin id that the registry does not contain while deriving
  context requirements
- **THEN** compilation MUST fail with a bounded compile error
- **AND** the definition MUST NOT be registered for backtest or realtime

#### Scenario: A plugin without context demand is unaffected
- **WHEN** a plugin does not implement `resolveContextRequirements`
- **THEN** its plans MUST compile with empty context requirements
- **AND** evaluation semantics MUST remain identical to the single-period behavior

#### Scenario: Runtime context exposure follows the shared blackboard
- **WHEN** the kernel evaluates a plan with declared context periods
- **THEN** it MUST expose each declared period's window snapshot under the shared blackboard key
  `series.<period>` before plugin evaluation
- **AND** plugins SHALL read context series only through that key contract
- **AND** a plugin that finds a required context key absent MUST surface an explicit bounded
  missing-context failure rather than return a neutral opinion

## MODIFIED Requirements

### Requirement: Decision Flow Engine Shall Focus on Evidence and Signals Decoupled from Virtual Execution
The `DecisionFlowEngine` and factor plugins SHALL evaluate market state as pure functions, outputting
directional opinions (`BUY` / `SELL`), human-readable reasons, and structural evidence (such as stop-loss
anchors, pivot prices, or central boundary levels) without heuristic `confidence` ratings. The decision
flow engine SHALL NOT assume or compute virtual fill execution prices, and factor plugins SHALL NOT
maintain cross-bar trade deduplication cursors. Trade entry suppression during active holdings SHALL be
delegated entirely to the downstream unified trading engine.

#### Scenario: Pure opinion emission
- **WHEN** market conditions satisfy decision flow guard and branch rules
- **THEN** `DecisionFlowEngine` MUST emit `DecisionResult` with `action === 'BUY' | 'SELL'` and `evidence` (without `confidence` or `confidenceLevel`)
- **AND** it MUST NOT enforce virtual fill price mechanics or drop valid pattern occurrences on behalf of broker execution

### Requirement: Cross-Lane Signal Identity and Persistence Parity

Backtest and realtime signal persistence SHALL expose the identical identity and metadata columns so
that parity reconciliation can compare signals per security, strategy version, direction, and signal type
without lossy defaults or table-specific workarounds. The `backtest_signal_results` table SHALL carry
`security_id` (foreign key to `securities.id`), `strategy_definition_id`, `strategy_version_id`,
`period`, `source`, `signal_kind`, and `signal_source`. The `strategy_signals` table SHALL symmetrically
carry `signal_type`. Both lanes SHALL omit the physically retired `confidence` and `confidence_level`
columns (dropped by Migration `038_drop_signal_confidence_columns.sql`). Both lanes SHALL attribute
positions and metrics on an isolated single-security basis (Model A).

#### Scenario: Symmetrical signal persistence parity
- **WHEN** either realtime signal engine or backtest executor persists an emitted signal
- **THEN** both tables MUST record identical schema columns (`security_id`, `strategy_definition_id`,
  `strategy_version_id`, `period`, `source`, `signal_time`, `pivot_time`, `signal_kind`, `signal_type`,
  `signal_source`, `decision_trace`, `context_snapshot`, `rule_snapshot`)
- **AND** neither table SHALL contain `confidence` or `confidence_level` columns
- **AND** `backtest_signal_results` SHALL omit the standalone `security_code` column, relying exclusively
  on `security_id` foreign key relations
- **AND** existing historical backtest rows SHALL be backfilled by resolving `security_code` against `securities`

#### Scenario: Multiple signals on the same bar are not collapsed
- **WHEN** entry and exit (or composite) signals share the same security and signal time
- **THEN** each signal MUST be stored as a distinct row
- **AND** parity reconciliation MUST compare signals by the identity tuple
  `(run_id, security_id, signal_time, signal_kind, strategy_version_id, signal_type)`
  rather than a single prior dedupe key

#### Scenario: Parity reconciliation consumes real signal kind
- **WHEN** the parity replay tool compares live and backtest outputs
- **THEN** it MUST use the persisted `signal_kind` from both lanes
- **AND** it MUST NOT default the backtest side to `entry`

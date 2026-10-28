# tactical-event-pipeline Specification Delta

## ADDED Requirements

### Requirement: Zero-Delay Execution For Tactical Risk Cut And Bear Defense
The `TacticalEventAggregator` SHALL support zero-delay risk cut rules (`windowBars: 0` and `requiredConfirmationTags: []`) for urgent risk mitigation and bear market defense signals (such as `plugin.tactics.bear-left-right-bsp`). When an urgent sell or risk cut signal arrives, the aggregator SHALL emit a `TacticalEvent` of kind `RISK_CUT` or `EXIT` immediately on the same bar without queuing or waiting in an observation window.

#### Scenario: Bear escape signal triggers immediate zero-delay tactical event
- **WHEN** a bear defense plugin (`plugin.tactics.bear-left-right-bsp`) emits an exit signal (e.g. `BEAR_EXIT_GAP_DOWN`, `BEAR_EXIT_BREAK_MA5`, or `BEAR_EXIT_SUB_BREAK_ZERO`)
- **THEN** `TacticalEventAggregator` MUST emit a `TacticalEvent` with `action: 'SELL'` and `kind: 'RISK_CUT'` immediately on the current bar
- **AND** the event MUST NOT be delayed by any temporal observation window
- **AND** the event MUST NOT be suppressed by tactical cooldown (cooldown applies only to `ENTRY`)

#### Scenario: Bear defense signal invalidates all active entry observation windows
- **WHEN** an urgent bear defense signal (`action: 'SELL'`) is processed
- **THEN** all pending buy observation windows requiring a bull setup MUST be invalidated and pruned immediately
- **AND** subsequent late confirmation signals for those pruned windows MUST be ignored without residual state

---

### Requirement: Hierarchical Tactical Buy Points (1B, 2B, 3B)
The tactical layer SHALL support structured 1B (reversal), 2B (confirmation), and 3B (breakout) tactical signals with formal geometric preconditions:
1. **1B (Reversal Buy)**: Under a confirmed bull regime setup, trend divergence requirements SHALL be relaxed to allow single-central consolidation divergence or sub-period extreme oversold turnarounds to qualify as enhanced 1B;
2. **2B (Confirmation Buy)**: A 2B signal SHALL be valid ONLY after a confirmed prior 1B and SHALL strictly enforce the higher-low geometric invariant ($P_{2B} \ge P_{1B}$);
3. **3B (Breakout Buy)**: A 3B signal SHALL be valid ONLY after a confirmed breakout above a target central's upper boundary ($ZG$) and SHALL strictly enforce the non-reentry invariant ($P_{3B} > ZG$).

#### Scenario: Second buy enforces non-lower-low constraint relative to first buy
- **WHEN** a candidate 2B signal is evaluated following a confirmed 1B
- **IF** the current pullback low is lower than the recorded 1B price ($P_{curr} < P_{1B}$)
- **THEN** the candidate 2B MUST be rejected as an invalid continuation
- **IF** the current pullback low is greater than or equal to the 1B price ($P_{curr} \ge P_{1B}$)
- **THEN** the candidate 2B MUST be released as either a sub-fractal left 2B (`BUY_2B_SUB_FENXING_LEFT`) or zero-cross right 2B (`BUY_2B_SUB_CROSS_ZERO_RIGHT`)

#### Scenario: Third buy enforces above-ZG constraint relative to confirmed central
- **WHEN** a candidate 3B signal is evaluated following an upward departure from a confirmed central
- **IF** the current retrace low enters or breaks below the central upper boundary ($P_{curr} \le ZG$)
- **THEN** the candidate 3B MUST be rejected as central re-entry
- **IF** the current retrace low remains strictly above the central upper boundary ($P_{curr} > ZG$)
- **THEN** the candidate 3B MUST be released as either a ZG-edge left 3B (`BUY_3B_ZG_EDGE_LEFT`) or momentum breakout right 3B (`BUY_3B_FIRE_RIGHT`)

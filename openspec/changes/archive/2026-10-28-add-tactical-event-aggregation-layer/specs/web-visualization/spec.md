## ADDED Requirements

### Requirement: Multi-Layer Visual Command Presentation For Tactical Events And Raw Signals
The web frontend visualizer SHALL support distinct visual layers separating raw signal observations (`raw_signals`), consolidated tactical entry/exit events (`tactical_events`), and executed broker fills (`executed_trades`). The user SHALL be able to toggle each layer independently in the chart toolbar.

#### Scenario: User toggles tactical events layer
- **WHEN** the user selects the `tactical_events` layer toggle on the chart
- **THEN** the chart MUST render high-contrast badges for synthesized entry/exit points (e.g. `2买+放量`, `1卖+背驰`)
- **AND** unconfirmed raw signals MUST NOT clutter this layer

#### Scenario: User toggles raw signals layer for debug inspection
- **WHEN** the user enables the `raw_signals` layer toggle
- **THEN** the chart MUST render subtle/translucent markers representing the unsuppressed mathematical outputs of individual factor plugins
- **AND** enabling this layer MUST NOT disrupt the coordinates or visibility of active tactical events

## MODIFIED Requirements

### Requirement: Strategy Engine Shall Support Dynamic External Factor Plugins

The strategy evaluation domain SHALL support discovering and registering external `FactorPlugin`
implementations at runtime from an external directory or environment variable, without compile-time
dependencies.

The public codebase SHALL NOT contain proprietary trading tactic abstractions or personal classification
models. All interactions with external strategies SHALL be mediated solely through the standard `FactorPlugin`
interface (`id`, `name`, `category`, `evaluate(context, params)`).

The public codebase SHALL also remain a transparent pass-through channel for plugin-authored display
metadata. Display labels and styling SHALL originate from the private plugin's `FactorOpinion`
(`badgeText`, `displayTag`, `styleMeta`) and flow verbatim through the kernel, persistence snapshots and
frontend rendering; the public codebase MUST NOT maintain label dictionaries, regex-based text
classification, or per-kind display mappings of its own.

#### Scenario: External plugin loader discovers external plugins
- **WHEN** the engine initializes or plugin registry loads standard plugins
- **THEN** it MUST check `process.env.MIST_PRIVATE_PLUGINS_DIR` and peer workspace directories
- **AND** any valid `FactorPlugin` instance exported by the external module MUST be registered into `FactorPluginRegistry`

#### Scenario: Engine degrades gracefully when external plugins are absent
- **WHEN** no external plugin directory is configured or present (including a single-repository CI
  checkout without the peer private workspace)
- **THEN** the engine MUST continue execution with built-in standard plugins
- **AND** plugin discovery MUST return an empty result without throwing
- **AND** the public test suites and builds MUST pass cleanly without external dependencies; discovery
  assertions that require the peer private workspace SHALL be guarded by its presence and MUST NOT
  hardcode a private plugin inventory

#### Scenario: Private plugin display metadata is passed through verbatim
- **WHEN** a private `FactorPlugin` returns an opinion carrying `badgeText`, `displayTag`, or `styleMeta`
- **THEN** the kernel signal, simulation frame mapper, persisted decision trace and frontend chart labels
  MUST carry those values byte-for-byte without dictionary lookup, regex matching or per-kind remapping
- **AND** when a signal carries no plugin-authored display metadata, the display layer MUST fall back to raw
  signal type instead of inventing a localized label

#### Scenario: Public code carries no proprietary display labels
- **WHEN** the public repositories are scanned for display text associated with external strategies
- **THEN** no hardcoded label dictionary or Chinese display regex MUST exist in the kernel signal mapper,
  decision pivot evidence extraction or frontend signal visualization utilities
- **AND** any private strategy display vocabulary MUST live exclusively in the private plugin repository

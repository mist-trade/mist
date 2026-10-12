## ADDED Requirements

### Requirement: Strategy Engine Shall Support Dynamic External Factor Plugins

The strategy evaluation domain SHALL support discovering and registering external `FactorPlugin`
implementations at runtime from an external directory or environment variable, without compile-time
dependencies.

The public codebase SHALL NOT contain proprietary trading tactic abstractions or personal classification
models. All interactions with external strategies SHALL be mediated solely through the standard `FactorPlugin`
interface (`id`, `name`, `category`, `evaluate(context, params)`).

#### Scenario: External plugin loader discovers external plugins
- **WHEN** the engine initializes or plugin registry loads standard plugins
- **THEN** it MUST check `process.env.MIST_PRIVATE_PLUGINS_DIR` and peer workspace directories
- **AND** any valid `FactorPlugin` instance exported by the external module MUST be registered into `FactorPluginRegistry`

#### Scenario: Engine degrades gracefully when external plugins are absent
- **WHEN** no external plugin directory is configured or present
- **THEN** the engine MUST continue execution with built-in standard plugins
- **AND** the public test suites and builds MUST pass cleanly without external dependencies

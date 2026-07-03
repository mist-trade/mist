## ADDED Requirements

### Requirement: TDX runtime owns datasource lifecycle components

The datasource service SHALL compose TDX adapter, provider, bridge, collector, subscription client, and WebSocket manager through an explicit runtime boundary.

#### Scenario: Application startup creates owned runtime components

- **WHEN** the TDX FastAPI application starts without injected datasource components
- **THEN** the runtime MUST create and initialize the adapter, provider, bridge, collector, subscription client, and WebSocket manager in dependency order
- **AND** route dependencies MUST read these components from the runtime-backed app state

#### Scenario: Application shutdown releases owned runtime components

- **WHEN** the TDX FastAPI application shuts down
- **THEN** the runtime MUST stop the collector before clearing subscription and bridge state
- **AND** it MUST close the provider HTTP client before shutting down the adapter
- **AND** it MUST NOT close components that were injected but not owned by the runtime

### Requirement: Datasource health reports component readiness

The datasource service SHALL expose application-level component readiness in health output while preserving existing health fields used by scripts and operators.

#### Scenario: Health endpoint is called after startup

- **WHEN** `GET /health` is called after datasource startup
- **THEN** the response MUST include the existing top-level health fields
- **AND** it MUST include structured runtime readiness for provider HTTP reachability, adapter initialization, bridge state, collector state, subscription state, and WebSocket connection state

#### Scenario: Provider HTTP probe fails

- **WHEN** the provider health probe cannot reach the TDX HTTP endpoint
- **THEN** health output MUST report provider readiness as false with a stable error field
- **AND** the process MUST remain observable to WinSW and deployment health checks

### Requirement: Runtime boundary is injectable for tests

The datasource runtime SHALL allow tests to inject fake or prebuilt components without changing production startup behavior.

#### Scenario: Test injects prebuilt provider and adapter

- **WHEN** a test creates a runtime with injected provider or adapter instances
- **THEN** startup MUST use the injected instances
- **AND** shutdown MUST preserve injected instances unless the test explicitly marks them as owned

#### Scenario: Test verifies startup failure path

- **WHEN** adapter initialization or provider construction fails during startup
- **THEN** the runtime MUST surface the startup exception
- **AND** any already-owned component MUST be cleaned up before the exception leaves startup

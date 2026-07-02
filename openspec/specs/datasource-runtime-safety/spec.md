# datasource-runtime-safety Specification

## Purpose
TBD - created by archiving change fix-datasource-runtime-safety. Update Purpose after archive.
## Requirements
### Requirement: Blocking provider work is isolated from asyncio handlers

The datasource service SHALL execute blocking native SDK or provider work
through async-safe wrappers instead of running it directly on the event loop.

#### Scenario: Async provider method wraps blocking work

- **WHEN** an async datasource method needs to call a blocking provider or SDK
  function
- **THEN** it MUST execute that work through `asyncio.to_thread`, a dedicated
  executor, or an equivalent async-safe boundary
- **AND** unit tests MUST prove the event loop can continue while the provider
  work is pending

### Requirement: SDK callbacks hand work to the captured running loop

The datasource service SHALL capture the running event loop during subscription
startup and SHALL NOT call `asyncio.get_event_loop()` from SDK callback threads.

#### Scenario: Callback receives a dirty symbol

- **WHEN** a TDX or QMT SDK callback receives a symbol update from a provider
  thread
- **THEN** it MUST hand the symbol to the captured running loop with a
  thread-safe API
- **AND** callback-side code MUST NOT mutate event-loop-owned dirty-symbol
  state directly

### Requirement: Dirty-symbol state is serialized on the event loop

The datasource service SHALL mutate dirty-symbol sets, queues, or deduplication
state only on the event-loop side of the callback boundary.

#### Scenario: Multiple callback threads mark symbols dirty

- **WHEN** multiple callback invocations mark symbols as dirty
- **THEN** loop-side processing MUST deduplicate and store those symbols
- **AND** unit tests MUST prove duplicate callbacks do not corrupt or duplicate
  dirty-symbol state

### Requirement: Unsupported provider subscription capabilities fail explicitly

The datasource service SHALL expose unsupported subscription methods as
structured capability failures, not as ambiguous stubs that look callable.

#### Scenario: Provider does not support quote subscription

- **WHEN** a caller invokes `subscribe_quote` on a provider that cannot support
  quote subscriptions
- **THEN** the provider MUST raise a stable capability error with a machine
  readable code
- **AND** tests MUST assert the error code and relevant details

### Requirement: Native response lookup is symbol-strict

The datasource service SHALL fail explicitly when a native provider response
does not contain the requested symbol.

#### Scenario: Native response is missing requested symbol

- **WHEN** native provider data is wrapped in a supported shape but no item
  matches the requested symbol
- **THEN** the lookup helper MUST raise a datasource error
- **AND** it MUST NOT return the entire native values payload as a fallback


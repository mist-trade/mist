## Why

The review identified datasource runtime risks that can stall asyncio,
mis-handle SDK callback threads, or expose unsupported subscription paths as if
they were usable. These are P0/P1 reliability issues for the host-side Python
datasource service and should be fixed before broader contract cleanup.

## What Changes

- Select review IDs CODE_REVIEW C2, C3, C4 and CODE_SMELL D2.6, U2.3, F2.1,
  F2.2.
- Ensure blocking native SDK or HTTP-adapter work is isolated behind async-safe
  execution boundaries.
- Ensure QMT and TDX subscription callbacks capture the running event loop at
  startup and use thread-safe handoff APIs instead of `asyncio.get_event_loop()`
  inside callback threads.
- Ensure dirty-symbol state is mutated only on the event loop side, preferably
  through queues or equivalent serialized handoff.
- Ensure unsupported `subscribe_quote` implementations are explicit capability
  failures and are not exposed as successful product paths.
- Add targeted Python unit tests for event-loop non-blocking behavior,
  callback loop handoff, dirty-symbol serialization, and native response lookup
  failure behavior.

## Capabilities

### New Capabilities

- `datasource-runtime-safety`: Runtime safety requirements for the Python
  datasource service around async boundaries, SDK callback handoff, dirty-symbol
  state, and unsupported provider capabilities.

### Modified Capabilities

None.

## Impact

- Affected repository:
  - `mist-datasource`
- Affected code areas:
  - `src/datasource/tdx_subscription.py`
  - `src/datasource/tdx_provider.py`
  - `src/adapter/base.py`
  - QMT callback or route code if it still touches event loops directly
  - datasource unit tests under `tests/unit`
- Runtime topology impact:
  - No deployment topology change. The datasource remains a host-side WinSW
    service; this change only hardens its Python runtime behavior.

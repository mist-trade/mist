## Context

The selected review items are runtime-safety issues in the Python datasource
service. The datasource is a host-side WinSW service that bridges Mist to TDX
and QMT provider SDKs. Several provider operations are synchronous or callback
driven, while the service itself exposes async HTTP and WebSocket routes.

The main failure modes are:

- Blocking provider work running directly inside async request handlers.
- SDK callback threads trying to discover or mutate the asyncio event loop.
- Dirty-symbol state being shared across callback and event-loop threads.
- Unsupported subscription methods being exposed as if they were usable.
- Native response lookup falling back to broad payload values when a requested
  symbol cannot be found.

## Goals / Non-Goals

**Goals:**

- Make provider boundary tests prove that blocking SDK work is executed through
  async-safe wrappers.
- Make callback tests prove that running loops are captured on startup and
  callback threads use thread-safe handoff.
- Keep dirty-symbol mutation serialized on the event-loop side.
- Make unsupported subscription methods fail with stable capability errors.
- Make native response lookup fail explicitly when a requested symbol is
  missing.
- Preserve the normalized product-facing datasource contract.

**Non-Goals:**

- Add new live TDX or QMT capabilities.
- Change the deployment topology or move the datasource into Docker.
- Perform broad provider abstraction cleanup beyond the selected review IDs.
- Replace all existing WebSocket payload shapes; broader WS contract alignment
  belongs to `align-datasource-ws-contract`.

## Decisions

### Decision 1: Use thread-safe event-loop handoff instead of callback-side mutation

SDK callbacks should do the smallest possible work: normalize the symbol if
needed, then hand it to the captured running loop through `call_soon_threadsafe`
or an equivalent queueing helper. The loop-side callback owns mutation of
dirty-symbol sets or queues.

Alternative considered: guard shared sets with locks. Locks reduce data races
but still leave callback threads doing product-state work. Loop-side mutation is
easier to reason about and test.

### Decision 2: Use asyncio wrappers for blocking provider calls

Blocking SDK or native client calls should go through `asyncio.to_thread` or a
dedicated executor wrapper, depending on existing code locality. Tests should
prove the async public method yields to the event loop while work is in flight.

Alternative considered: leave calls synchronous and rely on short durations.
That does not protect production from SDK stalls and does not address C2.

### Decision 3: Unsupported capabilities return structured failures

Provider methods that cannot work for the current provider should raise stable
capability exceptions instead of exposing stubs that fail late or ambiguously.
Tests should assert code and details, not string fragments.

Alternative considered: remove methods from base protocols immediately. That
may be right later, but this change keeps scope narrow and makes unsupported
behavior explicit first.

### Decision 4: Native response lookup must be symbol-strict

Lookup helpers may tolerate provider wrapper shapes, but once a requested
symbol is known, a missing match must fail explicitly. Returning the whole
values payload can silently save or stream the wrong instrument.

Alternative considered: keep broad fallback for compatibility. The review risk
is correctness, so compatibility without explicit symbol proof is not accepted.

## Risks / Trade-offs

- Existing tests may rely on broad fallback payloads -> update tests to encode
  the stricter symbol contract.
- Thread-handoff tests can become timing-sensitive -> use deterministic queues
  and direct callback invocation rather than sleeps.
- Some native SDK behavior is only observable on Windows -> local unit tests
  should cover the adapter boundary, while live Windows smoke remains separate.
- Broad WS payload cleanup is tempting nearby -> defer to
  `align-datasource-ws-contract` unless required to prove dirty-symbol safety.

## Migration Plan

1. Add failing unit tests for each selected behavior.
2. Implement minimal async wrappers and callback handoff helpers.
3. Update unsupported capability errors and native lookup behavior.
4. Run datasource unit tests and non-live integration tests.
5. Record review ID evidence in this change.

Rollback is a normal code rollback in `mist-datasource`; no deployment topology
rollback is required.

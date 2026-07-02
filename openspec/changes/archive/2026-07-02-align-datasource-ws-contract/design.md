## Context

The Python datasource exposes TDX on port 9001 and QMT on port 9002. Both
instances use WebSocket routes under `/ws/quote/{client_id}`, but their message
shapes have drifted:

- TDX sends some responses through `TdxBridge.make_*` dict helpers, sends pong
  through a hand-written dict, and sends quote through `WSMessage`.
- QMT sends pong, subscription acknowledgements, and adapter errors through
  different hand-written dict shapes, while only some quote/error paths use
  `WSMessage`.
- The NestJS backend compensates by accepting multiple field names and error
  shapes.
- Old TDX HTTP routes still coexist with `/v1` normalized routes and use a
  different response/error model.

The production deployment boundary remains unchanged: backend, chan, and MySQL
run in Docker Compose, while the datasource stays as a host-side WinSW service.

## Goals / Non-Goals

**Goals:**

- Make `WSMessage` the single datasource WebSocket outbound envelope for ready,
  pong, subscribed, unsubscribed, error, and quote messages.
- Align TDX and QMT error payloads to one machine-readable shape.
- Publish TDX collector snapshots through one serializer so the snapshot quote
  payload has a stable field set.
- Update backend parsing tests so the backend reads canonical WS payloads first
  while retaining temporary legacy fallbacks.
- Record the old-route migration boundary: product callers use `/v1`; old
  routes are deprecated or isolated instead of silently sharing product
  contracts.
- Cover the selected review IDs with targeted unit/integration tests or static
  contract tests.

**Non-Goals:**

- Move the datasource into Docker or change Windows service management.
- Add a broad `70+` method adapter ABC.
- Remove every old route in this change.
- Remove all backend legacy WS parsing fallbacks immediately.
- Add new live TDX/QMT capabilities.

## Decisions

### Decision 1: Canonical WS envelope is `WSMessage`

All datasource WebSocket server responses should be created through
`src/ws/protocol.py`, not ad hoc `json.dumps({...})` dicts. `WSMessage` keeps
the common fields `type`, `provider`, `data`, and `timestamp`.

Alternative considered: keep route-local dicts but make them look similar.
That leaves the same drift risk because each route can still omit fields.

### Decision 2: Message-specific payloads live under `data`

Canonical error messages use:

`{type, provider, timestamp, data: {code, message, retryable, details}}`

Canonical subscription acknowledgements use:

`{type, provider, timestamp, data: {accepted, rejected, active}}`

The backend should read `message.data` first and keep support for the existing
top-level TDX shape during migration.

Alternative considered: keep TDX's top-level `error` object. That would make
`WSMessage.data` optional in practice and would not align QMT.

### Decision 3: Snapshot quote payload uses one serializer

TDX collector quote events remain snapshot-only. The publisher should map a
normalized `TdxSnapshot` to the backend-compatible quote payload through one
serializer, instead of repeating field names inside `tdx/main.py` or routes.
The serializer should avoid duplicate aliases such as `Last` plus `Now` or
`Max` plus `High`; compatibility aliases belong in the backend parser only
during migration.

Alternative considered: switch the quote snapshot payload immediately to the
`TdxSnapshot.model_dump(by_alias=True)` shape. That is cleaner long-term but is
too broad for this pass because the backend currently expects `stock_code` and
a nested snapshot object.

### Decision 4: Old routes are explicitly migration-only

The product path remains normalized `/v1` routes. This change should not try to
build a large adapter hierarchy to make old routes first-class. Instead, tests
and docs should make the old route boundary explicit: either old routes carry
deprecation metadata or a route contract test records that product callers must
not use them.

Alternative considered: delete old routes immediately. That needs a wider
caller audit and is safer as a follow-up once the `/v1` coverage is complete.

## Risks / Trade-offs

- Canonical WS payloads can break consumers that read old top-level fields ->
  keep backend fallback parsing for one cycle and add tests for both canonical
  and legacy shapes.
- QMT quote payloads may be less normalized than TDX snapshots -> align the
  envelope and error/subscription controls first; do not invent unsupported
  normalized quote data.
- Static route-contract tests can become brittle -> target public route
  behavior and protocol constructors, not arbitrary source formatting.
- Old-route deprecation is not the same as deletion -> record it as migration
  evidence and leave deletion to a later, narrower change.

## Migration Plan

1. Add failing datasource tests for `WSMessage` pong/error/subscription helpers
   and TDX/QMT route responses.
2. Add failing backend tests for canonical `data`-based error and subscription
   acknowledgement parsing.
3. Implement the smallest protocol helpers and route changes to pass those
   tests.
4. Add a snapshot quote serializer and replace the hand-mapped TDX publisher.
5. Add old-route migration evidence through docs or route-contract tests.
6. Run datasource unit/non-live tests, backend targeted WS tests, and OpenSpec
   validation.

Rollback is a normal code rollback in `mist-datasource` and `mist`; no
deployment topology rollback is required.

## Open Questions

- Exact QMT quote normalization is intentionally deferred until QMT product use
  is active. This change only aligns the envelope and control/error messages.

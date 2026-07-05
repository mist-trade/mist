## Context

Mist currently has a validated TDX datasource boundary: backend services call
the Python datasource through normalized `/v1` endpoints, while the Windows TDX
terminal remains a host-side runtime. QMT was previously represented in
`mist-datasource` as a MiniQMT/`xtquant` adapter with optional startup, legacy
`/api/qmt/*` routes, and planned provider manifests. That path is no longer
acceptable: future QMT access must run through full QMT built-in Python.

The full QMT documentation describes a Python 3.6 built-in runtime driven by
strategy callbacks such as `handlebar`, `subscribe`, and `run_time`. It also
documents important constraints: third-party libraries must be supplied through
the QMT client, the client must be restarted after library changes, and built-in
Python cannot rely on multi-thread or multi-process execution. Because those
limits affect the transport design directly, production implementation must
start with Windows evidence rather than assumptions.

## Goals / Non-Goals

**Goals:**

- Create a new OpenSpec capability for the full-QMT bridge and make the
  Windows spike evidence a hard enablement gate.
- Remove MiniQMT/`xtquant` from the production QMT path and from future QMT
  implementation guidance.
- Preserve the existing provider-neutral datasource contract for backend and
  NestJS consumers.
- Default to one QMT bridge owner, one command queue, and serial execution of
  native QMT API calls.
- Allow a configured full-QMT local DAT reader as an optional historical-bars
  fast path after file-stability and update-window safeguards are defined.
- Provide local tests and scaffolding for the command-gateway model before
  live QMT is available.

**Non-Goals:**

- Completing live QMT enablement without Windows full-QMT evidence.
- Exposing QMT account, position, order, deal, cancel, or placement APIs.
- Making backend code call QMT built-in APIs, polling internals, or raw command
  endpoints directly.
- Supporting WebSocket as the required internal QMT bridge transport before it
  is proven safe inside the QMT runtime.
- Using local DAT files for realtime snapshots, reference, sector, finance, or
  formula APIs.

## Decisions

### Require Windows spikes before provider enablement

Implementation starts with two evidence-producing spikes. The first validates
library and network capability: Python version, encoding, stdlib imports,
third-party imports, outbound `127.0.0.1` HTTP, port listening, and blocking
behavior. The second validates process and execution model: PID/thread identity,
thread/process/subprocess attempts, two-strategy interaction, `run_time`
blocking impact, exception recovery, and repeated startup.

Alternative considered: implement the bridge against the documentation alone.
That is faster, but the documented library and execution constraints are
exactly where production risk lives.

### Use one full-QMT bridge owner

Only one controlled built-in Python strategy owns QMT API access. It runs as a
normal QMT built-in script with the editor separate-process option disabled. It
does not spawn threads, child processes, or workers. It pulls commands,
executes native QMT calls serially, writes results, and reports health. The
Mist datasource owns concurrency outside the QMT client and treats QMT as a
single-lane provider.

Alternative considered: run one QMT strategy per capability or request family.
That would increase throughput, but it makes shared runtime state, client
locking, strategy interference, and recovery hard to reason about.

Alternative rejected: use the QMT editor separate-process path or external
strategy runner examples. That path changes the runtime boundary and drifts
back toward the legacy SDK-style execution model that this change explicitly
excludes.

### Validate outbound command transport before choosing it

The stable boundary is QMT-initiated outbound communication. The Mist datasource
command gateway runs in the external Python service; the QMT bridge owns a
single outbound command channel, executes native QMT calls serially, and posts
results back. The transport is not promoted until Windows evidence validates
the runtime.

Two transports are under test. HTTP polling is simplest and uses only stdlib
request/response calls. WebSocket duplex is lower-latency and lets the
datasource push commands after QMT opens the outbound connection, but it needs
evidence that a normal single-script QMT runtime can connect, exchange messages,
recover, and avoid blocking.

If either transport needs a periodic pump, `run_time` must be proven outside
trading hours before production can depend on it. `handlebar` is tied to K-line
and tick progression, and `subscribe` is tied to quote events; neither is a
good fit for external datasource command intake because commands must still be
handled when no market event is firing.

The WebSocket spike must go beyond ping/pong. It must prove a bounded
single-thread command loop: QMT opens one WebSocket client connection, the
datasource pushes a health command and a native `get_market_data_ex` command,
the QMT script executes both synchronously on the same script path, and the
result returns over the same connection. The evidence must record elapsed time,
PID, thread counts before and after the loop, command results, disconnect
handling, and whether the loop blocks other QMT strategies. A blocking loop may
be acceptable only if it is bounded during the spike; production use still
requires a separate decision after Windows evidence.

### Add local DAT bars as the first historical fast path

Full-QMT stores downloaded historical bars in local DAT files under its data
directory. That gives QMT bars a safe optimization path for historical reads:
when explicitly enabled and configured to a full-QMT data directory, the
datasource may read stable local DAT files and normalize them into the existing
`/v1/bars/query` contract. This fast path is limited to historical bars. It
does not serve snapshots, subscriptions, reference, sector, finance, or formula
families.

The first supported local periods are `1d`, `1m`, and `5m`, matching the
operator's available full-QMT local downloads. Paths are resolved only under
the configured full-QMT `datadir`: `SH|SZ/86400/{code}.DAT` for daily,
`SH|SZ/60/{code}.DAT` for one-minute bars, and `SH|SZ/300/{code}.DAT` for
five-minute bars. The reader must not fall back to `userdata_mini`, MiniQMT, or
any `xtquant` path.

Daily DAT parsing follows the captured EasyXT-compatible format: an 8-byte
header followed by 32-byte records, with even record indexes carrying valid
bars. Prices are stored as integer price times 1000, volume is stored in lots
and normalized to shares, and amount is not present so it is normalized to `0`.
Minute DAT parsing may use a small, explicit set of candidate record layouts
inspired by the EasyXT analyzer, but it must be stricter than the GUI importer:
the selected format must pass timestamp, OHLC, volume, sorting, and requested
period checks, and unrecognized formats must fail with a structured retryable
error rather than returning guessed data.

The fast path must avoid colliding with operator data updates. The default
configuration blocks local DAT reads after 18:00 China time, because the
operator update job may be writing files then. The block window is configurable
and defaults to `fallback_bridge` when the bridge is healthy, otherwise a
retryable datasource error. Before reading, the datasource must verify the
target file stays stable across a short size/mtime check. Unstable files are
not parsed.

The implementation must keep the existing TDX code style. Route code should
not parse DAT files or branch deeply on QMT internals. QMT exposes a
provider-facing `get_bars(...)` operation shaped like
`TdxMarketOperations.get_bars(...)`; the operation delegates binary parsing to
focused helpers under `src/datasource/qmt`, and those helpers return the
existing `TdxBar` model with `provider=qmt`. No public QMT-specific bar schema
is added.

### Keep product contracts normalized

QMT native shapes are normalized behind provider operations the same way TDX
native shapes are hidden today. Public `/v1` endpoints keep the existing
envelope, symbol, time, numeric, error, and capability-reporting conventions.
Legacy QMT route surfaces are diagnostic or deprecated migration surfaces, not
product contracts.

### Exclude account and trading APIs

The first QMT bridge covers market data, reference/instrument data,
finance/report data, formulas, sectors, calendar, snapshots, bars, and
subscription events. Account, position, order, deal, cancel, and placement
methods remain excluded even when they are read-only. They require a separate
trading/account service design with risk controls and audit boundaries.

## Risks / Trade-offs

- Windows QMT cannot import expected libraries -> Keep the bridge stdlib-only
  and let spike evidence decide whether optional transports are allowed.
- `run_time` polling blocks other strategies -> Keep commands short, serial,
  timeout-bound, and observable; do not enable production QMT until blocking
  evidence is acceptable.
- WebSocket single-thread loop blocks QMT script execution -> Keep the spike
  bounded, record impact on other strategies, and require explicit evidence
  before promoting WebSocket beyond a spike transport.
- DAT files are read while the QMT client or an operator update is writing
  them -> Gate reads with a configurable quiet window, default block after
  18:00, and size/mtime stability checks before parsing.
- QMT cannot safely listen on a local port -> Default design does not require
  QMT to listen; it only makes outbound localhost requests.
- Full API surface is broad -> Provider manifests may report unsupported or
  spike-blocked families until native shapes are captured and normalized.
- Old `xtquant` references return through docs or tests -> Add static guardrail
  tests that allow only historical migration notes and explicit negative tests.

## Migration Plan

1. Add OpenSpec requirements for full-QMT bridge, provider contract changes,
   runtime safety, and backend boundary.
2. Add local static guardrails and command-gateway tests that fail on old QMT
   assumptions.
3. Add stdlib-only QMT bridge scaffolding, single-owner lock semantics,
   command/result queue behavior, and evidence templates.
4. Run local unit and repository-hygiene tests.
5. Run Windows spike A and B on the QMT machine; capture evidence before
   enabling live QMT provider status.
6. Implement and verify full-QMT DAT historical-bars parsing for `1d`, `1m`,
   and `5m`, including the default after-18:00 read block, file-stability
   behavior, normalized `/v1/bars/query` parity, and Windows smoke evidence.
7. Implement provider families incrementally from captured native shapes while
   preserving normalized `/v1` responses.

Rollback is additive before live enablement: keep QMT capability status
disabled/spike-blocked and remove the command-gateway startup path. TDX runtime
and current production deployment remain unchanged.

## Open Questions

- Which exact normal full-QMT screen/run mode should host the bridge strategy
  for the least interference with manual QMT use?
- What command timeout should production use after Windows blocking evidence is
  captured?
- Which additional DAT periods beyond `1d`, `1m`, and `5m` should be added in
  a later change after real Windows samples exist?
- Which non-account QMT API families have stable native shapes and can be
  promoted first after the spike?

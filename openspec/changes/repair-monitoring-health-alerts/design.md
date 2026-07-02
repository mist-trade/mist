## Context

`mist-monitoring` is currently stdlib-only Go plus a small Python AstrBot
client. The Mac watchdog probes remote Mist endpoints and classifies alerts,
while the Windows exporter observes local Windows service, process, Docker, TCP,
and datasource health state.

The selected review items cluster around alert reliability: Mac datasource
health details are not parsed into `Observation`, probe and notifier errors are
lost, shared HTTP probes ignore request context, webhook delivery can wait
forever, and metric rendering lacks Prometheus metadata comments.

## Goals / Non-Goals

**Goals:**

- Make Mac datasource health parsing populate the same fields the Windows
  exporter already understands.
- Make TDX native HTTP and tqcenter initialization failures observable through
  existing watchdog alerts and datasource metrics.
- Preserve probe and notifier errors as metric samples or logged/testable state
  instead of silently discarding them.
- Keep shared HTTP probing context-aware and bounded by timeout.
- Render Prometheus `# HELP` and `# TYPE` lines without adding an external
  client dependency.
- Rename or clarify "business smoke" checks if they remain health endpoint
  alias checks.
- Add tests before each implementation change.

**Non-Goals:**

- Replace the metrics renderer with the Prometheus Go client.
- Add real product-level K-line/snapshot smoke requests unless the current
  change discovers a stable endpoint contract in `mist-monitoring`.
- Redesign the watchdog state machine or recovery action protocol.
- Change production deployment topology.

## Decisions

### Decision 1: Share datasource health parsing semantics

The Mac watchdog should parse datasource health JSON into a datasource health
struct with the same logical fields as the Windows exporter:
`TDXHTTPReachable`, `TQInitialized`, `WSConnected`, and `EventQueueDepth`.
JSON decoding should accept the current camelCase payload names used by the
Windows exporter contract, and tests should cover alert classification after
Mac collection.

Alternative considered: duplicate only the two alert fields in the Mac
collector. That would fix C10 narrowly but leave `contracts/metrics.md` fields
partially unimplemented on Mac.

### Decision 2: Represent probe failures separately from target-down state

Collectors may still emit the existing `*_running`, `*_up`, and
`*_success` metrics for compatibility, but probe errors should also be exposed
through a dedicated error metric with stable labels such as target/probe and
error class. This lets operators distinguish target failure from probe failure
without making the collection API return an error for every observed fault.

Alternative considered: return non-nil `Collect` errors. That would make
`/metrics` fail for ordinary target outages, which is worse for Prometheus
scraping and does not match the existing collector pattern.

### Decision 3: Keep HTTP probing stdlib-only but injectable

Shared HTTP probes should use `http.NewRequestWithContext` and an injectable
`*http.Client`. The default client should have the existing timeout behavior,
while tests can inject transports or servers to verify cancellation and reuse.

Alternative considered: keep `HTTPGet(rawURL, timeout)` only. It cannot accept
caller cancellation, and it constructs a new client for every probe.

### Decision 4: Bound webhook notifier delivery

`WebhookNotifier` should use a default `http.Client` with a finite timeout when
no client is injected. The notifier should still honor the caller context, and
watchdog collection should record notification failures instead of discarding
them.

Alternative considered: require all configs to specify timeout. There is no
current config field for this, and a safe default addresses the reviewed risk
without schema churn.

### Decision 5: Render metric metadata from a local catalog

The renderer should prepend deterministic `# HELP` and `# TYPE` lines per
metric family. Known Mist metric names should use curated help text; unknown
valid names may still render with a generic help line so internal tests can add
metrics incrementally.

Alternative considered: require each sample to carry help/type metadata. That
would spread static metadata through collectors and make simple sample creation
more verbose.

## Risks / Trade-offs

- Datasource JSON may contain snake_case aliases from older services -> tests
  should confirm accepted payload keys before implementation is declared done.
- Adding error metrics increases metric cardinality -> labels must be stable
  enums/classes, not raw error strings.
- Prometheus metadata lines change exact rendered text -> update contract tests
  and keep deterministic ordering.
- Notifier failure samples are scrape-time state -> preserve compatibility by
  adding samples instead of replacing existing alert samples.

## ADDED Requirements

### Requirement: Windows capability spikes gate live QMT enablement
The datasource SHALL NOT mark the full-QMT provider live or supported until
Windows spike evidence validates the QMT built-in Python library, network,
process, and execution-model constraints.

#### Scenario: Library and network spike is missing
- **WHEN** the QMT provider is configured for live full-QMT access
- **THEN** the enablement check MUST require evidence for Python version,
  encoding, standard-library imports, attempted third-party imports, outbound
  localhost HTTP, attempted local port listening, and blocking behavior

#### Scenario: Process and execution spike is missing
- **WHEN** the QMT provider is configured for live full-QMT access
- **THEN** the enablement check MUST require evidence for process id, thread
  identity, thread/process/subprocess attempts, two-strategy interaction,
  `run_time` behavior inside and outside trading hours, exception recovery, and
  repeated startup behavior

#### Scenario: Spike evidence is incomplete
- **WHEN** any required spike evidence item is absent or marked failed
- **THEN** the datasource MUST keep QMT capability status disabled or
  spike-blocked and MUST NOT start live QMT command processing

### Requirement: Full-QMT bridge uses one owner and one command lane
The full-QMT bridge SHALL use a single controlled built-in Python strategy as
the owner of native QMT API access, and SHALL run as a normal QMT built-in
strategy script with the editor separate-process option disabled.

#### Scenario: Bridge strategy starts
- **WHEN** the full-QMT bridge starts inside the QMT client
- **THEN** it MUST claim a single bridge-owner identity before processing
  commands
- **AND** concurrent bridge owners MUST be rejected or treated as unhealthy

#### Scenario: Separate-process editor option is enabled
- **WHEN** the QMT bridge strategy is configured with the editor
  separate-process option enabled
- **THEN** the spike evidence MUST be treated as invalid for production bridge
  enablement
- **AND** production QMT datasource code MUST NOT depend on that execution path

#### Scenario: Commands are processed
- **WHEN** the command gateway has pending QMT commands
- **THEN** the bridge MUST fetch and execute them serially through one command
  lane
- **AND** it MUST report timeout or provider errors in a structured result
  instead of running commands concurrently

### Requirement: Bridge script avoids unverified runtime features
The full-QMT bridge script SHALL avoid runtime features that are not verified
safe inside QMT built-in Python.

#### Scenario: Bridge dependencies are inspected
- **WHEN** repository hygiene checks inspect the QMT bridge script
- **THEN** the bridge MUST NOT import `threading`, `multiprocessing`,
  `subprocess`, `websocket`, `websocket-client`, `requests`, or `xtquant`
- **AND** production QMT paths MUST NOT call QMT strategy-runner helper APIs
  that require the legacy local SDK-style runtime

#### Scenario: Optional transport is proposed
- **WHEN** an implementation wants to use WebSocket, local port listening,
  third-party packages, threads, processes, or subprocesses inside QMT
- **THEN** the change MUST include passing Windows spike evidence for that
  feature before production code can depend on it

### Requirement: QMT-initiated command channel is the default boundary
The datasource SHALL use a QMT-initiated outbound command channel as the bridge
boundary between the built-in QMT script and the external Mist datasource.

#### Scenario: QMT bridge polls for work
- **WHEN** the QMT bridge timer runs through a `run_time` callback
- **THEN** it SHALL call the local command gateway to fetch at most one batch
  of pending commands using standard-library HTTP
- **AND** it SHALL post command results back to the gateway after execution
- **AND** it MUST NOT require `handlebar` K-line callbacks or `subscribe`
  quote callbacks for command polling

#### Scenario: WebSocket duplex is proposed
- **WHEN** the QMT bridge uses WebSocket duplex instead of HTTP polling
- **THEN** Windows spike evidence MUST prove QMT can initiate the WebSocket
  connection, receive datasource-pushed commands, send results, recover from
  disconnects, and avoid blocking the single QMT script
- **AND** if the WebSocket client requires periodic pumping, spike evidence
  MUST prove the pump callback fires outside trading hours

#### Scenario: WebSocket command loop is tested
- **WHEN** a WebSocket transport spike is run inside the normal full-QMT script
- **THEN** the datasource MUST push at least one health command and one native
  market-data command over the QMT-initiated WebSocket connection
- **AND** the QMT spike script MUST execute those commands synchronously in one
  bounded single-thread loop and send structured results over the same
  connection
- **AND** the evidence MUST record PID, thread counts before and after the
  loop, elapsed time, command outcomes, disconnect behavior, and observed
  impact on other QMT strategies

#### Scenario: No command is pending
- **WHEN** the QMT bridge checks its command channel and the gateway has no work
- **THEN** the bridge SHALL return without blocking the QMT strategy loop

### Requirement: Non-account QMT API coverage is provider-normalized
The full-QMT provider SHALL target non-account and non-trading QMT API families
behind the existing normalized datasource contract.

#### Scenario: Non-account market data is requested
- **WHEN** a caller requests QMT bars, snapshots, calendar, securities,
  security info, sectors, finance/report data, reference data, instrument data,
  formulas, or subscriptions through `/v1`
- **THEN** the datasource SHALL return the provider-neutral response envelope
  and normalized field names used by other providers

#### Scenario: Account or trading data is requested
- **WHEN** a caller requests account, position, order, deal, cancel, or
  placement functions through the QMT market datasource
- **THEN** the datasource MUST reject the request as outside this capability
  instead of forwarding it to QMT

### Requirement: Local DAT files may serve historical QMT bars only
The QMT provider SHALL allow full-QMT local DAT files only as an explicitly
configured historical-bars fast path, and SHALL NOT use local files for other
QMT provider families.

#### Scenario: Local DAT periods are supported
- **WHEN** `provider=qmt` receives a `/v1/bars/query` request for period `1d`,
  `1m`, or `5m`
- **THEN** the datasource MAY resolve the file from the configured full-QMT
  data directory using `SH|SZ/86400/{code}.DAT`, `SH|SZ/60/{code}.DAT`, or
  `SH|SZ/300/{code}.DAT`
- **AND** it MUST NOT resolve files from MiniQMT, `userdata_mini`, `xtquant`,
  or external QMT SDK paths

#### Scenario: Unsupported local DAT period is requested
- **WHEN** `provider=qmt` receives a local DAT bars request for any period
  other than `1d`, `1m`, or `5m`
- **THEN** the datasource MUST return a stable unsupported-period or
  capability error instead of guessing a file layout

#### Scenario: Local DAT fast path is enabled
- **WHEN** `provider=qmt` receives a `/v1/bars/query` request and local DAT
  reads are enabled with a configured full-QMT data directory
- **THEN** the datasource MAY parse matching local DAT files for historical
  bars and MUST return the same normalized bar contract as the bridge path
- **AND** every returned bar MUST identify `provider=qmt`

#### Scenario: Daily DAT file is parsed
- **WHEN** the datasource reads a full-QMT daily DAT file
- **THEN** it MUST parse the 8-byte header and 32-byte records
- **AND** it MUST treat even record indexes as valid bars, divide prices by
  1000, convert volume from lots to shares, and normalize missing amount to `0`

#### Scenario: Minute DAT file is parsed
- **WHEN** the datasource reads a full-QMT `1m` or `5m` DAT file
- **THEN** it MUST select only from an explicit set of supported binary record
  layouts
- **AND** the selected layout MUST pass timestamp, OHLC, volume, sorting, and
  period validation before any bars are returned
- **AND** failed detection MUST return a structured retryable DAT format error
  with diagnostic details such as attempted record size, format, or header size

#### Scenario: Local DAT read is inside the update window
- **WHEN** a local DAT bars request occurs after the configured block time,
  defaulting to 18:00 China time
- **THEN** the datasource MUST NOT read the local DAT file
- **AND** it MUST either return a retryable datasource error or fall back to the
  QMT bridge according to configuration

#### Scenario: Local DAT file is unstable
- **WHEN** the target DAT file size or modification time changes during the
  configured stability check
- **THEN** the datasource MUST NOT parse the file
- **AND** it MUST return a retryable datasource error or fall back to the QMT
  bridge according to configuration

#### Scenario: Non-bars family requests local DAT
- **WHEN** snapshots, subscriptions, calendar, sectors, reference, finance, or
  formula operations are requested
- **THEN** the datasource MUST NOT serve those operations from DAT files and
  MUST use the verified QMT bridge path or report the capability unsupported

#### Scenario: Local DAT implementation is inspected
- **WHEN** repository tests inspect the QMT DAT implementation
- **THEN** FastAPI route handlers MUST NOT parse DAT binary payloads directly
- **AND** the provider-facing QMT bars method MUST follow the same parameter
  shape and normalized `TdxBar` return model as the TDX bars operation

### Requirement: Spike evidence is stored with reproducible output
The change SHALL provide a repeatable evidence template for recording Windows
QMT spike results.

#### Scenario: Operator completes a Windows spike
- **WHEN** the operator records spike output
- **THEN** the evidence MUST include timestamp, QMT version if known, script
  mode, QMT model, editor separate-process option state, Python version, tested
  imports, HTTP network checks, WebSocket duplex checks, WebSocket command-loop
  checks, process checks, blocking checks, local DAT read checks, native API
  probes, pass/fail status, and a conclusion about allowed bridge features

# astrbot-integration Specification

## Purpose
Define the NapCat-AstrBot integration path that uses `mist-skills` to call the
Mist backend for pull-based market data, technical indicator, and Chan Theory
queries.
## Requirements
### Requirement: AstrBot shall use mist-skills as the Mist integration layer
The system SHALL integrate the deployed NapCat-AstrBot runtime and supported
agent-facing tool use with Mist through `mist-skills`, not through MCP Server or
Saya.

#### Scenario: User requests market analysis from QQ
- **GIVEN** a QQ user sends a supported market-analysis request
- **AND** AstrBot has loaded the relevant `mist-skills` Skill
- **WHEN** AstrBot executes the Skill script
- **THEN** the script SHALL call the Mist REST API
- **AND** AstrBot SHALL return the result through NapCat

#### Scenario: Agent tool integration is inspected

- **WHEN** a user inspects the supported agent-facing Mist tool path
- **THEN** documentation SHALL point to `mist-skills`
- **AND** the repository SHALL NOT advertise `apps/mcp-server` or `mist-mcp`
  as a supported runtime

### Requirement: AstrBot container shall reach the Mist backend by configuration
The AstrBot runtime SHALL receive the Mist backend base URL from environment
configuration.

#### Scenario: AstrBot and Mist share a Docker network
- **GIVEN** AstrBot and Mist are running on the same Docker network
- **WHEN** `MIST_API_BASE_URL` is set to `http://mist:8001`
- **THEN** Skill scripts SHALL call the Mist backend through that service URL

#### Scenario: AstrBot reaches a host-running Mist backend
- **GIVEN** AstrBot runs in Docker and Mist runs on the host
- **WHEN** `MIST_API_BASE_URL` points at the host-reachable Mist URL
- **THEN** Skill scripts SHALL call the Mist backend without code changes

### Requirement: Skill period values shall be accepted by the integration path
The integration path SHALL support agent-facing period values used by
`mist-skills`, including `1min`, `5min`, `15min`, `30min`, `60min`, and `daily`.

#### Scenario: Skill queries daily K-line data
- **GIVEN** a Skill script requests period `daily`
- **WHEN** the request reaches the Mist backend
- **THEN** the integration path SHALL resolve it to the internal daily period
- **AND** the backend SHALL query daily K-line data

### Requirement: Initial integration shall support pull-based analysis
The first release of this integration SHALL support user-initiated data and
analysis queries.

#### Scenario: User asks for MACD
- **GIVEN** a user asks for MACD on a supported security and period
- **WHEN** AstrBot runs the technical indicator Skill
- **THEN** the Skill SHALL call `POST /indicator/macd`
- **AND** the response SHALL include the calculated MACD data or a clear error

#### Scenario: User asks for Chan Theory analysis
- **GIVEN** a user asks for Chan Theory analysis on a supported security and period
- **WHEN** AstrBot runs the Chan Theory Skill
- **THEN** the Skill SHALL call the relevant `/chan/*` endpoint
- **AND** the response SHALL include analysis data or a clear error

### Requirement: Proactive alerts shall be out of scope for the initial release
The initial integration SHALL NOT require proactive alert push.

#### Scenario: Signal is detected by a future scheduler
- **GIVEN** a future Mist scheduler detects a market signal
- **WHEN** the first NapCat-AstrBot integration is delivered
- **THEN** no proactive QQ message delivery SHALL be required by this change

### Requirement: Saya shall not be a supported AstrBot integration path

The system SHALL expose Mist to AstrBot through `mist-skills` and SHALL NOT
require or advertise Saya as a runtime, fallback, or setup dependency for QQ
market-analysis requests.

#### Scenario: User prepares AstrBot integration

- **WHEN** a user follows current AstrBot integration docs
- **THEN** the docs SHALL configure `mist-skills` with `MIST_API_BASE_URL`
- **AND** the docs SHALL NOT instruct the user to start or configure Saya

#### Scenario: Repository entrypoints are inspected

- **WHEN** a user inspects current runnable app scripts and Nest project entries
- **THEN** Saya SHALL NOT appear as a supported runnable application
- **AND** supported app entries SHALL remain available for Mist REST services and
  current integration surfaces

### Requirement: mist-skills validates backend response envelopes

The `mist-skills` client SHALL convert malformed Mist backend response
envelopes into `MistApiError` instead of leaking Python indexing errors.

#### Scenario: Successful envelope lacks data

- **WHEN** the Mist backend returns `success: true` without a `data` field
- **THEN** `MistClient._parse_response` MUST raise `MistApiError`
- **AND** callers MUST NOT see `KeyError`

#### Scenario: Backend request cannot connect

- **WHEN** `MistClient` cannot connect or times out
- **THEN** scripts using shared entrypoints MUST catch `MistConnectionError`
  and print a stable error message to stderr before exiting non-zero

### Requirement: mist-skills scripts use shared runners

The `mist-skills` scripts SHALL route common request-building and exception
handling through shared runner helpers instead of duplicating the same logic in
each script.

#### Scenario: Simple POST analysis script runs

- **WHEN** a technical indicator or Chan script receives code, period, date
  range, and optional source
- **THEN** it MUST build the backend request through a shared runner helper
- **AND** tests MUST prove each script still calls its expected endpoint

#### Scenario: K-line script retries collection

- **WHEN** stored K-line data is missing and auto-collect is enabled
- **THEN** intraday and daily K-line scripts MUST share collect/retry logic
- **AND** tests MUST cover both period-specific request bodies

### Requirement: mist-skills error handling is consistent

The `mist-skills` scripts SHALL handle API and connection errors through shared
helpers at script entrypoints.

#### Scenario: Script entrypoint catches connection error

- **WHEN** a script entrypoint hits `MistConnectionError`
- **THEN** it MUST print a stable connection error and exit with status 1

#### Scenario: Script entrypoint catches MistApiError

- **WHEN** a script entrypoint hits `MistApiError`
- **THEN** it MUST print the backend error message and code consistently

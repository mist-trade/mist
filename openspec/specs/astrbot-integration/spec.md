# astrbot-integration Specification

## Purpose
Define the NapCat-AstrBot integration path that uses `mist-skills` to call the
Mist backend for pull-based market data, technical indicator, and Chan Theory
queries.

## Requirements
### Requirement: AstrBot shall use mist-skills as the Mist integration layer
The system SHALL integrate the deployed NapCat-AstrBot runtime with Mist through
`mist-skills`, not through Saya.

#### Scenario: User requests market analysis from QQ
- **GIVEN** a QQ user sends a supported market-analysis request
- **AND** AstrBot has loaded the relevant `mist-skills` Skill
- **WHEN** AstrBot executes the Skill script
- **THEN** the script SHALL call the Mist REST API
- **AND** AstrBot SHALL return the result through NapCat

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

## ADDED Requirements

### Requirement: Full-QMT provider forbids MiniQMT and XtQuant
The datasource SHALL implement future QMT production access through full-QMT
built-in Python only, and SHALL NOT depend on MiniQMT, `xtquant`, or XtQuant
documentation as the production QMT provider path.

#### Scenario: Production QMT code is inspected
- **WHEN** repository hygiene checks inspect production QMT provider code,
  route code, deployment scripts, and datasource documentation
- **THEN** they MUST fail on MiniQMT, `xtquant`, `QMT_SDK_PATH`, or XtQuant
  production integration references except in explicit historical migration or
  negative-test contexts

#### Scenario: QMT capability manifest is requested before spike evidence
- **WHEN** a client requests QMT provider metadata before full-QMT spike
  evidence is complete
- **THEN** QMT capabilities MUST report disabled, spike-blocked, unsupported,
  or planned status rather than pretending live QMT access is available

### Requirement: QMT account and trading APIs remain outside market datasource
The market datasource SHALL exclude QMT account, position, order, deal, cancel,
and placement APIs from this provider contract.

#### Scenario: QMT account method appears in documentation
- **WHEN** a QMT method exposes account, position, order, deal, cancel, or
  placement behavior
- **THEN** the coverage decision MUST classify it outside the market datasource
  boundary
- **AND** normalized market datasource endpoints MUST NOT forward the method

#### Scenario: Account support is requested later
- **WHEN** Mist needs QMT account or trading operations
- **THEN** a separate trading/account service design MUST define
  authentication, account isolation, idempotency, audit logging, and risk
  controls before implementation

### Requirement: QMT native shapes are hidden behind normalized contracts
The full-QMT bridge SHALL convert native QMT built-in Python results into the
same provider-neutral response envelope used by TDX.

#### Scenario: QMT native response differs from TDX
- **WHEN** full-QMT returns native dictionaries, tabular objects, empty results,
  or provider-specific errors
- **THEN** the QMT provider MUST normalize the response or return a stable
  datasource error
- **AND** product callers MUST NOT parse QMT-native field names or bridge
  command payloads

#### Scenario: QMT bars are served from local history files
- **WHEN** the QMT provider uses the configured local DAT fast path for
  historical bars
- **THEN** the datasource MUST return the same normalized `/v1/bars/query`
  envelope and bar field names used by the bridge-backed provider path
- **AND** product callers MUST NOT depend on DAT file paths, binary layout, or
  local-reader diagnostics

#### Scenario: QMT bars provider follows TDX operation style
- **WHEN** the datasource implements `provider=qmt` bars from local DAT files
- **THEN** the provider-facing operation MUST accept the same logical request
  shape as TDX bars (`symbols`, `period`, `startTime`, `endTime`, `count`,
  `fields`, `dividendType`, and `fillData`)
- **AND** it MUST return the existing normalized `TdxBar` model with
  `provider=qmt` rather than a new QMT-specific public schema

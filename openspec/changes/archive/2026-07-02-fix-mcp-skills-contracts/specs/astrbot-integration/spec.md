## ADDED Requirements

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

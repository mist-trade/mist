## ADDED Requirements

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

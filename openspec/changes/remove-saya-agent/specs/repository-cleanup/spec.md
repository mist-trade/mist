## ADDED Requirements

### Requirement: Obsolete Saya artifacts shall be removed safely

The cleanup process SHALL remove Saya source, tests, run scripts, project
registration, Saya-only shared config, Saya-only prompt templates, and
Saya-only dependencies after verifying they are not imported by supported
applications.

#### Scenario: Saya app is removed

- **WHEN** the cleanup removes tracked application code
- **THEN** `apps/saya` SHALL be absent from current source, test, and Nest project
  registration
- **AND** current package scripts SHALL NOT include Saya run targets

#### Scenario: Shared Saya-only artifacts are removed

- **WHEN** shared config, prompt templates, or dependencies are candidates for
  removal
- **THEN** the cleanup SHALL verify no supported app imports them before removal
- **AND** package metadata and lockfiles SHALL remain consistent after dependency
  changes

#### Scenario: Current documentation is scanned

- **WHEN** the cleanup updates current docs
- **THEN** current README and roadmap content SHALL NOT describe Saya as an
  active runtime path
- **AND** archived OpenSpec records MAY retain historical Saya mentions

# review-p2-skills-hygiene Specification

## Purpose

Track the P2 `mist-skills` hygiene remediation batch that hardened script
runtime loading, backend API contracts, K-line retry behavior, and Python
quality gates.

## Requirements

### Requirement: Selected P2 skills findings are explicit

This remediation batch SHALL select only CODE_REVIEW L9, CODE_REVIEW L11,
INFRA_REVIEW T7, INFRA_REVIEW T12, CODE_SMELL_REVIEW P4.3, and
CODE_SMELL_REVIEW M4.1 for new implementation work. CODE_REVIEW H10 SHALL be
recorded as already covered by archived evidence when applicable, not claimed as
new work in this batch.

#### Scenario: Batch scope is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** it MUST state that CODE_REVIEW H10 was covered by prior archived
  evidence if no new H10 implementation is included

### Requirement: K-line auto-collection uses structured status codes

The `mist-skills` K-line auto-collection decision SHALL use structured backend
status codes and MUST NOT inspect backend error message text.

#### Scenario: Missing stored data returns a retryable status code

- **WHEN** a K-line query raises `MistApiError` with a retryable status code
- **THEN** the script MUST initialize/attach/collect and retry the query when
  auto-collection is enabled

#### Scenario: Similar message has a non-retryable status code

- **WHEN** a K-line query raises `MistApiError` whose message looks like a
  missing-security error but whose status code is not retryable
- **THEN** the script MUST re-raise the original API error
- **AND** it MUST NOT initialize securities or collect data

### Requirement: Skills scripts and tests avoid local path mutation

`mist-skills` script files and tests SHALL NOT call `sys.path.insert` to load
shared code or sibling scripts.

#### Scenario: Repository is scanned for script path mutation

- **WHEN** the skills hygiene tests run
- **THEN** they MUST fail if any Python file under `skills/` or `tests/` contains
  `sys.path.insert`

#### Scenario: Script modules are tested without path injection

- **WHEN** tests load scripts under hyphenated skill directories
- **THEN** they MUST load them without mutating global `sys.path`
- **AND** the existing script endpoint tests MUST still pass

### Requirement: Mist API paths and payload fields are centralized

Shared `mist-skills` code SHALL define Mist API endpoints, request field names,
security type values, default source priority, and retryable K-line status codes
in one shared contract module.

#### Scenario: Shared runners build requests

- **WHEN** shared script and K-line runners build request bodies or call Mist
  endpoints
- **THEN** they MUST use the shared contract module rather than local literals
- **AND** tests MUST prove the emitted endpoint paths and request bodies remain
  compatible with the current backend API

### Requirement: Skills repository has lint, type, format, and test gates

`mist-skills` SHALL define and run repository-local `ruff`, `pyright`, `black`,
and `pytest` quality gates.

#### Scenario: CI executes Python quality gates

- **WHEN** the `mist-skills` GitHub Actions workflow runs
- **THEN** it MUST install the dev dependencies
- **AND** it MUST run Ruff lint, Pyright type checking, Black format check, and
  pytest

#### Scenario: Local verification runs the same gates

- **WHEN** this remediation batch is verified locally
- **THEN** the evidence MUST include commands for Ruff, Pyright, Black check,
  and pytest

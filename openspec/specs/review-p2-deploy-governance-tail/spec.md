# review-p2-deploy-governance-tail Specification

## Purpose
Track the optional P2 deploy governance tail that centralized deploy defaults
and added Pester-compatible behavior coverage after the required M6.1, S6, L14,
and T9 deploy/runtime batch was already complete.

## Requirements

### Requirement: Optional deploy defaults governance is explicit

This remediation tail SHALL select only the optional governance remainder for
`INFRA_REVIEW M6.1` and `INFRA_REVIEW S6`.

#### Scenario: Tail evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST state that required L14 and T9 work remains closed
- **AND** it MUST NOT claim unrelated P2 findings are newly completed

### Requirement: Deploy defaults have a shared source

Deploy scripts SHALL load intentional production default paths, URLs, ports,
hostnames, image references, and smoke settings from shared defaults modules
instead of repeating those literals in every script body.

#### Scenario: PowerShell defaults are inspected

- **WHEN** deploy PowerShell tests load scripts with `-LoadOnly`
- **THEN** the default values MUST match the shared defaults module
- **AND** operator-provided parameters MUST still override those defaults

#### Scenario: Shell defaults are inspected

- **WHEN** the Mac watchdog script runs or its tests inspect the script
- **THEN** default Windows host, bind address, and port values MUST come from a
  shared shell defaults file
- **AND** command-line flags MUST still override those defaults

### Requirement: Deploy tests include Pester-compatible behavior coverage

Deploy PowerShell validation SHALL include a Pester-compatible behavior test
entry point for runtime defaults in addition to existing source-string guards.

#### Scenario: Pester-compatible tests run locally

- **WHEN** the repository PowerShell verification runs without production paths
- **THEN** it MUST execute behavior assertions that dot-source the shared
  defaults and deploy scripts
- **AND** the same test file MUST be executable by Pester when Pester is
  available

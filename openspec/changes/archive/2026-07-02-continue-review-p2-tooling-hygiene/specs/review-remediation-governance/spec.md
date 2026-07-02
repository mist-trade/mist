## ADDED Requirements

### Requirement: P2 tooling remediation remains evidence-backed

P2 tooling remediation waves SHALL keep the same evidence format as prior
waves, including selected review IDs, changed files, and verification commands.

#### Scenario: Tooling wave completion

- **WHEN** a P2 tooling remediation wave completes
- **THEN** its evidence MUST map each selected review ID to changed files and
  verification commands
- **AND** any selected item without passing verification MUST remain incomplete

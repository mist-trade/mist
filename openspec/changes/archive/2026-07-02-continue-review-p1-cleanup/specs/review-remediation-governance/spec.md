## ADDED Requirements

### Requirement: Follow-up remediation waves remain traceable

Follow-up remediation waves SHALL preserve the same evidence standard as the
first wave: selected review IDs, changed files, and verification commands must
be recorded before the wave is archived.

#### Scenario: Second wave evidence

- **WHEN** a follow-up remediation wave completes
- **THEN** its evidence MUST map every selected review ID to changed files and
  test or substitute verification commands
- **AND** any selected review ID without passing verification MUST remain
  incomplete

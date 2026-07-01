## ADDED Requirements

### Requirement: Roadmap defines ordered stabilization workstreams
The Mist production roadmap SHALL define the next stabilization phase as
ordered workstreams instead of one combined implementation change.

#### Scenario: Roadmap lists required workstreams
- **WHEN** the roadmap is used to plan follow-up work
- **THEN** it MUST include workstreams for production evidence, TDX realtime
  datasource behavior, OpenSpec and branch reconciliation, Windows TDX guard
  validation, monitoring and AstrBot operations, frontend operator UX, and
  engineering hygiene

#### Scenario: Roadmap identifies production-first ordering
- **WHEN** a follow-up item depends on a healthy Windows production baseline
- **THEN** the production evidence workstream MUST be completed or explicitly
  accepted as a blocker before that item is marked ready for implementation

### Requirement: Each roadmap item becomes a child OpenSpec change
The roadmap SHALL require each implementation or live-validation item to enter
its own focused OpenSpec change before work begins.

#### Scenario: User starts a roadmap item
- **WHEN** the user selects one roadmap item for development or validation
- **THEN** a child OpenSpec change MUST be created or continued for that item
- **AND** the child change MUST define its own proposal, specs, tasks, and
  archive criteria

#### Scenario: Child change scope is defined
- **WHEN** a child change is written from the roadmap
- **THEN** it MUST name the owning repository or repositories
- **AND** it MUST name the runtime components affected by the work
- **AND** it MUST avoid unrelated refactors outside that item

### Requirement: Production evidence ledger is required
The roadmap SHALL require a production evidence ledger before broad feature
expansion.

#### Scenario: Production baseline is verified
- **WHEN** the production evidence child change is completed
- **THEN** it MUST record backend image ref, frontend image ref, datasource ref,
  deploy ref, monitoring ref when applicable, deployment output, health-check
  output, datasource runtime smoke output, backup restore rehearsal output, and
  Mac-side gateway probes

#### Scenario: Production baseline is incomplete
- **WHEN** any required production evidence is missing
- **THEN** the production evidence child change MUST remain incomplete
- **AND** dependent child changes MUST state whether they are blocked,
  proceeding with local-only scope, or explicitly deferring live validation

### Requirement: Active changes are reconciled before overlapping work
The roadmap SHALL require existing active OpenSpec changes to be reconciled
before creating new overlapping specs.

#### Scenario: Follow-up overlaps an active change
- **WHEN** a roadmap item touches TDX guard, Python datasource refactor, or
  TDX/QMT datasource contracts
- **THEN** the child change MUST first inspect the relevant active change
- **AND** it MUST either update that active change, archive completed work, or
  explain why a separate child change is the correct owner

#### Scenario: Active task state differs from code state
- **WHEN** an active change task list is stale relative to implemented code
- **THEN** the reconciliation work MUST update the task state or create a
  follow-up task that captures the remaining real work

### Requirement: Windows-only validation is a completion gate
The roadmap SHALL distinguish local validation from Windows runtime validation.

#### Scenario: Item depends on Windows runtime behavior
- **WHEN** a child change depends on TDX desktop, TDX native HTTP, WinSW,
  Docker Desktop on Windows, the self-hosted Windows runner, or the Windows
  LAN host
- **THEN** the child change MUST list Windows runtime validation evidence
- **AND** it MUST NOT be archived as complete until that evidence is recorded

#### Scenario: Item is local-only
- **WHEN** a child change has no Windows runtime dependency
- **THEN** it MUST state that local validation is sufficient
- **AND** it MUST list the local commands that prove completion

### Requirement: Verification commands are part of every child spec
The roadmap SHALL require child specs to include concrete verification commands
and expected outcomes.

#### Scenario: Child spec defines verification
- **WHEN** a child spec is ready for implementation or validation
- **THEN** it MUST list the exact local commands, deploy workflows, smoke
  commands, or manual checks needed to verify completion
- **AND** it MUST define what output or evidence is sufficient

#### Scenario: Verification requires network or external services
- **WHEN** a verification step requires network access, GitHub Actions, GHCR,
  Docker Desktop, Google Fonts, PyPI, TDX, QMT, or AstrBot
- **THEN** the child spec MUST call that dependency out explicitly
- **AND** it MUST provide a fallback or explain why no local fallback is valid

### Requirement: Roadmap archive requires child item disposition
The roadmap change SHALL only be archived after all child roadmap items have a
recorded disposition.

#### Scenario: Roadmap is ready to archive
- **WHEN** the roadmap change is archived
- **THEN** every child item MUST be completed, archived, superseded, deferred,
  or intentionally dropped with rationale

#### Scenario: Roadmap item is deferred
- **WHEN** a child item is deferred
- **THEN** the roadmap MUST record the reason, the current blocker, and the
  condition that would make the item worth reopening

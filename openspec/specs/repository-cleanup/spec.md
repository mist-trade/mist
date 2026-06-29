# repository-cleanup Specification

## Purpose
TBD - created by archiving change cleanup-repo-redundancy. Update Purpose after archive.
## Requirements
### Requirement: Repository inventory
The cleanup process SHALL inventory each child repository independently and SHALL classify root-level workspace artifacts separately from repository files.

#### Scenario: Child repository inventory
- **WHEN** cleanup starts for `mist`, `mist-fe`, `mist-datasource`, `mist-skills`, or `mist-deploy`
- **THEN** the process records tracked files, untracked files, ignored artifacts, current branch/worktree state, and dirty status for that repository before making changes

#### Scenario: Root artifact inventory
- **WHEN** cleanup evaluates files directly under `/Users/moyui/sean/mist`
- **THEN** the process treats them as local workspace artifacts unless they are inside a child git repository

### Requirement: Safe deletion criteria
The cleanup process SHALL delete a file or directory only when it is classified as local/generated or when tracked removal has evidence that the project no longer uses it.

#### Scenario: Generated artifact deletion
- **WHEN** a candidate is ignored by git, reproducible from install/build/test commands, and not referenced by current scripts
- **THEN** the process may delete it as a local artifact without changing business behavior

#### Scenario: Tracked removal
- **WHEN** a tracked source, test, documentation, fixture, or deployment file appears obsolete
- **THEN** the process MUST verify lack of imports/references and run targeted validation before removing it

#### Scenario: Uncertain candidate
- **WHEN** the current workflow dependency of a candidate is unclear
- **THEN** the process MUST keep it and record the uncertainty instead of deleting it

### Requirement: User work protection
The cleanup process SHALL preserve pre-existing modified and untracked user work unless the user explicitly approves changing that work.

#### Scenario: Dirty repository
- **WHEN** a child repository has modified or untracked files before cleanup begins
- **THEN** the process records those files and avoids overwriting, reverting, or deleting them unless they are part of the approved cleanup scope

### Requirement: Recurrence prevention
The cleanup process SHALL update ignore rules or generating scripts when safe so removed artifacts do not repeatedly reappear as commit candidates.

#### Scenario: Recreated local artifact
- **WHEN** a normal test/build/deploy command creates a local artifact that should not be committed
- **THEN** the relevant `.gitignore`, test cleanup, or documentation is updated so future git status remains clean

### Requirement: Verification
The cleanup process SHALL run repository-appropriate verification after tracked cleanup changes.

#### Scenario: Backend verification
- **WHEN** cleanup changes tracked files in `mist`
- **THEN** the process runs an appropriate subset of `pnpm run test`, `pnpm run lint`, or `pnpm run build` based on the changed surface

#### Scenario: Frontend verification
- **WHEN** cleanup changes tracked files in `mist-fe`
- **THEN** the process runs an appropriate subset of `pnpm test`, `pnpm lint`, or `pnpm build` based on the changed surface

#### Scenario: Datasource verification
- **WHEN** cleanup changes tracked files in `mist-datasource`
- **THEN** the process runs an appropriate subset of `uv run pytest -m "not live"` and `uv run ruff check .` based on the changed surface

#### Scenario: Skill and deploy verification
- **WHEN** cleanup changes tracked files in `mist-skills` or `mist-deploy`
- **THEN** the process runs the repository's available tests or script syntax checks for affected files

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


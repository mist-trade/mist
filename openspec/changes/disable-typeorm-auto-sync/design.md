## Context

The Mist backend currently configures TypeORM independently in four NestJS
apps: `mist`, `chan`, `schedule`, and `mcp-server`. Each app gates
`synchronize` on `NODE_ENV !== 'production'`, so a staging, test, or
misconfigured host can let TypeORM mutate tables directly. The repository
already has an explicit SQL migration runner and migration files, so runtime
schema sync is unnecessary and risky.

The same review wave found two schema metadata drift issues in extension
entities: `KExtensionEf.outerVolume` is typed as `bigint` while source payloads
and the SQL column are numeric/decimal, and `KExtensionMqmt` lacks the explicit
`kId` field that the migration creates as a unique one-to-one key.

## Goals / Non-Goals

**Goals:**

- Make TypeORM `synchronize` explicitly false in all app root configurations.
- Keep logging behavior unchanged for now.
- Add tests that inspect the real module source or exported config behavior so
  future changes cannot re-enable synchronize through `NODE_ENV`.
- Align extension entity metadata with the SQL migration contract.
- Add tests that guard the entity metadata/schema contract without requiring a
  live MySQL instance.

**Non-Goals:**

- Replace the duplicated TypeORM configuration with a shared factory in this
  child change unless the tests require it.
- Generate a new database migration for already-correct migration SQL.
- Change `Security.status`, rename `K.timestamp`, or clean lower-priority
  nullable/default semantics from this batch.
- Change production deployment topology or the `db:migrate` runner.

## Decisions

### Decision 1: Set `synchronize: false` directly in each app

The minimum safe fix is explicit and local: each `TypeOrmModule.forRootAsync`
block returns `synchronize: false`. This removes environment-dependent schema
mutation without introducing a shared factory abstraction while the duplicate
config cleanup remains broader than the selected P0/P1 items.

Alternative considered: create a shared TypeORM options factory immediately.
That would address DRY from C7, but it touches app bootstrap shape across four
apps and risks hiding the safety fix inside a larger refactor.

### Decision 2: Use static config guards for app module tests

The tests should fail if any app reintroduces `synchronize:
configService.get('NODE_ENV') !== 'production'` or any other non-false value.
Static source guards are appropriate because the TypeORM options are nested in
Nest module metadata and can be verified without a database connection.

Alternative considered: instantiate every module and inspect provider metadata.
That requires more Nest internals and risks opening DB-related providers during
unit tests.

### Decision 3: Align entity metadata, not migration SQL

The existing `001_init_core_tables.sql` already creates unique `k_id` keys for
all extension tables and declares `outerVolume` as decimal. The code should
match that contract: `outerVolume` becomes a `number` property and
`KExtensionMqmt` gains an explicit `kId` column.

Alternative considered: add a new migration to alter `outerVolume`. That is not
needed because the initial migration is already decimal; the mismatch is in the
entity TypeScript type.

## Risks / Trade-offs

- Static source tests can miss runtime factory abstraction changes -> Keep the
  test focused on the literal app modules for this child; future shared factory
  work should move the guard to the factory.
- Existing local development databases may have relied on auto-sync -> The
  repository already has `db:migrate`; developers must use explicit migrations.
- Entity/source guard tests can be brittle if files are reorganized -> Keep the
  guard scoped to the current app modules and extension entities, and update it
  with any future shared factory or entity layout change.

## Migration Plan

1. Add failing tests for app synchronize settings and extension metadata.
2. Set `synchronize: false` in all four app modules.
3. Align `KExtensionEf.outerVolume` and `KExtensionMqmt.kId` entity fields with
   migration SQL.
4. Run targeted tests, lint, typecheck, and CI tests.
5. Record review ID evidence and update the parent remediation change.

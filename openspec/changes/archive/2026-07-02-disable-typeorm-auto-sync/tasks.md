# Tasks: Disable TypeORM auto sync

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: CODE_REVIEW C7; CODE_SMELL B1.1,
      B1.3.
- [x] 1.2 Inspect all app-level TypeORM root configurations and confirm the
      four `synchronize` call sites before editing.
- [x] 1.3 Inspect extension entity metadata and migration SQL for EF, TDX, and
      MQMT extension tables.
- [x] 1.4 Identify the smallest targeted tests for TypeORM synchronize safety
      and extension schema metadata alignment.

## 2. Add Failing Tests First

- [x] 2.1 Add a test proving every app module uses literal
      `synchronize: false` and does not gate synchronize on `NODE_ENV`.
- [x] 2.2 Add a test proving `KExtensionEf.outerVolume` uses a
      number-compatible TypeScript property for the decimal column.
- [x] 2.3 Add a test proving every extension entity exposes a `kId` column
      mapped to `k_id` when migration SQL declares a unique `k_id`.
- [x] 2.4 Add or update a migration/schema guard proving extension migration
      SQL keeps unique `k_id` keys.
- [x] 2.5 Run the targeted tests and confirm the new assertions fail for the
      intended reason before implementation.

## 3. Implement Schema Safety Fixes

- [x] 3.1 Set `synchronize: false` in `apps/mist/src/app.module.ts`.
- [x] 3.2 Set `synchronize: false` in `apps/chan/src/chan-app.module.ts`.
- [x] 3.3 Set `synchronize: false` in `apps/schedule/src/schedule.module.ts`.
- [x] 3.4 Set `synchronize: false` in
      `apps/mcp-server/src/mcp-server.module.ts`.
- [x] 3.5 Align `KExtensionEf.outerVolume` with its decimal column and source
      payload type.
- [x] 3.6 Add explicit `kId` metadata to `KExtensionMqmt` while preserving the
      existing one-to-one migration contract.
- [x] 3.7 Keep schema changes on the explicit SQL migration path and avoid
      introducing runtime TypeORM schema sync.

## 4. Verify And Record Evidence

- [x] 4.1 Run the targeted TypeORM/module/entity tests added in this change.
- [x] 4.2 Run `pnpm run lint:check` in `mist`.
- [x] 4.3 Run `pnpm run typecheck` in `mist`.
- [x] 4.4 Run `pnpm run test:ci` in `mist`.
- [x] 4.5 Run `openspec validate disable-typeorm-auto-sync --strict`.
- [x] 4.6 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 4.7 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.

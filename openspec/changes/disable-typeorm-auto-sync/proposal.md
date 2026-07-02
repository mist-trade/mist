## Why

Review item C7 identified that four NestJS apps enable TypeORM `synchronize`
outside `NODE_ENV=production`, which can mutate database schema when an
environment is misconfigured. The same first-wave database pass should also
remove the high-risk entity/schema drift called out in B1.1 and B1.3.

## What Changes

- Select review IDs CODE_REVIEW C7 and CODE_SMELL B1.1, B1.3.
- Make every app-level TypeORM root configuration set `synchronize: false`
  explicitly, independent of `NODE_ENV`.
- Add focused tests that prove the app database options cannot enable
  synchronize in development or test environments.
- Align `KExtensionEf.outerVolume` TypeScript type with its decimal database
  column and source payload shape.
- Align extension `k_id` entity metadata with the one-to-one SQL contract,
  including the MQMT extension entity path.
- Keep existing explicit SQL migration flow as the only schema-change path.

## Capabilities

### New Capabilities

- `database-schema-safety`: Runtime and entity requirements that prevent
  TypeORM automatic schema mutation and keep database entity metadata aligned
  with repository migrations.

### Modified Capabilities

None.

## Impact

- Affected repository:
  - `mist`
- Affected code areas:
  - `apps/mist/src/app.module.ts`
  - `apps/chan/src/chan-app.module.ts`
  - `apps/schedule/src/schedule.module.ts`
  - `apps/mcp-server/src/mcp-server.module.ts`
  - `libs/shared-data/src/entities/k-extension-ef.entity.ts`
  - `libs/shared-data/src/entities/k-extension-mqmt.entity.ts`
  - backend unit tests and migration/schema guard tests
- Runtime impact:
  - No API behavior change.
  - Database schema changes remain explicit through `deploy/database/migrations`
    and `node tools/run-migrations.mjs`; TypeORM synchronize must stay off in
    every environment.

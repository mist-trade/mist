# Evidence: Disable TypeORM auto sync

## Review IDs

| Review ID | Changed files | Evidence |
| --- | --- | --- |
| CODE_REVIEW C7 | `apps/mist/src/app.module.ts`, `apps/chan/src/chan-app.module.ts`, `apps/schedule/src/schedule.module.ts`, `apps/mcp-server/src/mcp-server.module.ts`, `apps/mist/src/database-schema-safety.spec.ts`, `README.md`, `apps/mist/README.md`, `deploy/docker/README-Windows-Docker.md` | Added a red test proving all four app modules must contain literal `synchronize: false` and must not gate synchronize on `NODE_ENV`. Replaced all four environment-dependent settings with explicit false and updated docs. |
| CODE_SMELL B1.1 | `libs/shared-data/src/entities/k-extension-ef.entity.ts`, `libs/shared-data/src/entities/extension-schema.spec.ts` | Added a red test proving `KExtensionEf.outerVolume` is number-compatible with the decimal migration/source contract. Changed the entity property from `bigint` to `number`. |
| CODE_SMELL B1.3 | `libs/shared-data/src/entities/k-extension-mqmt.entity.ts`, `libs/shared-data/src/entities/extension-schema.spec.ts`, `deploy/database/migrations/001_init_core_tables.sql` | Added tests proving extension entities expose `kId` mapped to `k_id` and migration SQL keeps unique `k_id` keys. Added explicit `kId` to MQMT; migration SQL already had unique keys and was verified unchanged. |

## Red Test Evidence

- `pnpm exec jest database-schema-safety extension-schema --runInBand --watchman=false` failed before implementation because:
  - the four app modules lacked `synchronize: false`;
  - `KExtensionEf.outerVolume` was `bigint`;
  - `KExtensionMqmt` lacked `@Column({ name: 'k_id', select: false }) kId`.

## Green Verification

- `pnpm exec jest database-schema-safety extension-schema --runInBand --watchman=false` -> 2 suites passed, 7 tests passed.
- `pnpm run lint:check` -> passed.
- `pnpm run typecheck` -> passed.
- `pnpm run test:ci` -> 54 suites passed, 449 tests passed.

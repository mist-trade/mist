# Database migrations

Migration files in this directory are executed by:

```bash
node tools/run-migrations.mjs
```

The runner sorts `*.sql` files by name, creates `schema_migrations`, skips files
already recorded there, and records each migration only after the SQL file
finishes successfully.

Production deployments run this through the one-shot `mist-migrate` service in
the Windows Docker stack before `mist-backend` and `chan-api` are considered
healthy.

Override the directory only when intentionally testing an alternate migration
set:

```bash
MIGRATION_DIR=/path/to/migrations node tools/run-migrations.mjs
```

## Security code identity cleanup

Before applying `003_security_code_identity.sql` on an existing database, run the
audit SQL if there is any doubt about existing data:

```bash
mysql -h <host> -P <port> -u <user> -p <database> < deploy/database/audit-security-identity.sql
```

The audit reports:

- `securities.code` rows that are not canonical internal codes.
- Rows that would collide after canonical normalization.
- Duplicate `security_source_configs` grouped by `(security_id, source)`.
- Exact duplicate source-config rows that the migration can remove safely.
- Non-identical duplicate source-config rows that require manual resolution.

Manual resolution rules:

- If two `securities.code` rows normalize to the same canonical code, decide
  which `securities.id` owns the history before changing data; do not merge
  automatically.
- If a `securities.code` row is provider-formatted but has no collision, update
  it to the canonical pure code before running the migration.
- If duplicate source configs for the same `(security_id, source)` differ by
  `formatCode`, `priority`, or `enabled`, choose the row to keep and delete or
  update the others before running the migration.

`003_security_code_identity.sql` deletes only exact duplicate source-config rows
and then adds a unique index on `(security_id, source)`.

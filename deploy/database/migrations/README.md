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

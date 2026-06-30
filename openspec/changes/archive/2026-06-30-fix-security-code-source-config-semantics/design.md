## Context

`Security.code` is the backend's provider-neutral identity and is documented on the `securities` table as a pure code such as `000001` or `000300`. `SecuritySourceConfig.formatCode` is documented as the provider-specific code format. Production data currently follows that split for securities, but backend services and tests still allow provider-formatted values such as `000001.SH` as `Security.code`.

`security_source_configs` also has no uniqueness guard. The production `600519` security currently has repeated identical TDX source configs, which proves the "add or update source" API is not idempotent.

## Goals / Non-Goals

**Goals:**

- Make `Security.code` canonical and provider-neutral across initialization, lookup, activation, deactivation, and source-config operations.
- Keep provider-specific values in `SecuritySourceConfig.formatCode` only.
- Add a shared utility for converting common provider symbols into canonical internal codes.
- Make source-config writes idempotent so repeated setup calls update the existing source config instead of inserting duplicates.
- Provide a safe cleanup path for duplicate source configs in the existing database.

**Non-Goals:**

- Do not change K-line table identity; `K.securityId` remains the durable relation.
- Do not add snapshot raw storage or partial-K query APIs in this change.
- Do not broaden provider-specific formatting rules beyond formats currently used by Mist: pure six-digit codes, suffix form such as `600519.SH`, and prefix form such as `SH600519`.

## Decisions

1. Canonical code conversion lives in `libs/utils`.

   Rationale: this logic is needed by security services, streaming collectors, and aggregators without introducing Nest service dependencies into pure logic classes. A shared pure function also prevents future TDX/QMT/EastMoney code paths from reimplementing different identity rules.

   Alternative considered: keep private helpers in each service. This already caused drift between `SecurityService.formatCode`, `WebSocketCollectionStrategy`, and `KCandleAggregator`.

2. `SecurityService.formatCode` will use canonical internal-code normalization.

   Rationale: the service is the write/read boundary for `securities.code`. Enforcing normalization here prevents duplicate logical securities such as `600519` and `600519.SH`.

   Alternative considered: normalize only in streaming. This protects the current TDX path but leaves the database vulnerable through security initialization and lookup APIs.

3. `formatCode` remains provider-specific and is not used as internal identity.

   Rationale: providers disagree on required symbol shape. TDX currently uses dotted codes such as `600519.SH`; EastMoney tests use values such as `sh000001`; QMT may require a different shape. These values belong at provider-call boundaries only.

4. Source-config writes become upserts by `(securityId, source)`.

   Rationale: current semantics are "Add or update data source for an existing security"; source selection currently expects one highest-priority enabled config per source. Upserting by `(securityId, source)` makes setup scripts idempotent and prevents repeated subscriptions or ambiguous format-code selection.

   Alternative considered: unique `(securityId, source, formatCode)`. This would still permit multiple active configs for the same provider and would not match the current controller contract.

5. Cleanup is explicit and conservative.

   Rationale: deleting production data should keep the oldest row for each duplicated `(security_id, source)` and remove only exact duplicate configs after verifying the current rows. If non-identical duplicates exist, the implementation should report them rather than guessing.

## Risks / Trade-offs

- Existing callers may pass provider-formatted codes and expect exact lookup by that string -> normalize at the service boundary and update tests/docs so both input shapes resolve to canonical rows.
- Existing database rows may include provider-formatted `securities.code` values -> add an audit step before enforcing constraints; migrate only when there are no collisions or after manually resolving collisions.
- Duplicate source configs may be non-identical -> cleanup scripts must distinguish exact duplicates from conflicts and require manual review for conflicts.
- Adding a database unique constraint can fail if duplicates remain -> deploy cleanup before or in the same migration transaction before adding the constraint.

## Migration Plan

1. Add tests for canonical code normalization, security service lookup/initialization behavior, and source-config idempotency.
2. Add the shared utility and update backend code paths to use it.
3. Add a database migration or deployment script that:
   - audits `securities.code` for non-canonical values,
   - audits `security_source_configs` duplicates by `(security_id, source)`,
   - removes exact duplicate source configs while keeping one row,
   - adds a uniqueness constraint on `(security_id, source)` after duplicates are removed.
4. Deploy code and migration together.
5. Verify:
   - `GET /security/v1/all` returns canonical codes,
   - repeated source setup calls do not create additional rows,
   - TDX streaming still subscribes using `formatCode` and persists K lines by `securityId`.

Rollback: remove the uniqueness constraint if needed and redeploy the prior backend image. Data cleanup that deletes exact duplicates does not need rollback because the deleted rows are redundant; conflicting duplicate rows must not be deleted automatically.

## Open Questions

- Should the uniqueness constraint be `(security_id, source)` for the current "one config per provider" model, or should future multi-account/multi-endpoint providers require a wider key? Current recommendation is `(security_id, source)`.
- Should production cleanup be executed through a backend migration, a one-off SQL script on the Windows Docker host, or a temporary backend maintenance endpoint? Current recommendation is migration/script, not a permanent endpoint.

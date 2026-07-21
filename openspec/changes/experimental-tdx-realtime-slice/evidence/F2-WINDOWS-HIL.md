# F2 Windows HIL Evidence Record

Status: **pending**  
Selected: `2026-07-17`  
Owner: `project-maintainer`  
Due: `2026-08-17`  
Target transition: `HIL-pending` → `transport-HIL-verified`

This record is the acceptance checklist for the bounded Windows transport HIL.
Do not mark task 7.2 complete until every required field and artifact below is
present and independently reviewable.

## Safety envelope

- One Windows machine and one TDX terminal instance only.
- One or two allowlisted symbols only.
- Dedicated or otherwise quiescent HIL database.
- `TDX_REALTIME_MODE=builtin_experimental` on datasource and Mist.
- No K persistence, scanner, signal, alert, or trading side effects.
- Tested rollback to `TDX_REALTIME_MODE=legacy` available before starting.
- Never persist or attach the bridge `leaseToken`.

## Immutable build identity

Fill every value from the deployed machine, not from a developer checkout.

| Field | Captured value |
|---|---|
| HIL start/end time (RFC3339 +08:00) | pending |
| `mist` git SHA | pending |
| `mist-datasource` git SHA | pending |
| bridge artifact SHA-256 | pending |
| `bridgeBuildId` | pending |
| TDX terminal product/version/build | pending |
| embedded Python version | pending |
| `tqcenter` version/build, if exposed | pending |
| Windows version | pending |
| trading phase (pre-open/continuous auction/lunch/close) | pending |
| tested exact symbols | pending |

Required captures:

```powershell
git -C <mist-path> rev-parse HEAD
git -C <mist-datasource-path> rev-parse HEAD
Get-FileHash <TDX-PYPlugins-user-path>\mist_tdx_realtime_bridge.py -Algorithm SHA256
python --version
```

The recorded repository SHAs MUST identify committed, reproducible source.
Dirty or locally edited deployed trees are not accepted F2 evidence.

## Preflight evidence

Attach the following sanitized outputs:

1. Datasource and Mist effective mode configuration.
2. Datasource loopback `GET /tdx/bridge/health` before terminal registration.
3. Mist diagnostic status before terminal registration.
4. DB before-state digest for all protected tables:
   `k`, every `k_extension_*`, `strategy_signal`, and
   `strategy_alert_event`.
5. Confirmation that the legacy rollback procedure was rehearsed or verified
against the exact deployed builds.

These preflight checks, bridge lifecycle observation, and the final rollback
may be performed outside trading hours. They prove control-plane readiness and
process stability only. They do not satisfy the native snapshot, freshness, or
sequence requirements below.

For each protected table, record both row count and a deterministic content
digest. Run against a dedicated/quiescent HIL database so unrelated writers
cannot invalidate the comparison. The SQL may use the following PostgreSQL
shape, substituting only a quoted table name:

```sql
SELECT count(*) AS row_count,
       md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) AS content_digest
FROM (
  SELECT md5(row_to_json(t)::text) AS row_hash
  FROM "k" AS t
) AS rows;
```

## Execution evidence

Steps 4 through 6 are trading-session-only acceptance steps. Run them against
`600519.SH` during a supported TDX market session, away from the open, lunch,
and close boundaries when practical. A cached closing snapshot, a recently
captured transport timestamp, or an owner heartbeat outside the session is not
accepted as F2 realtime evidence.

1. Start datasource, then Mist, then the TDX terminal bridge.
2. Capture registered `ownerId`, `bridgeBuildId`, generation, and
   `streamEpoch` from loopback health/diagnostics.
3. Apply the exact one- or two-symbol desired set and capture convergence.
4. During the recorded trading phase, capture the first accepted snapshot:
   - preserve the SDK `native` object verbatim;
   - preserve the request fields `symbol`, `producerSequence`, `capturedAt`,
     and `streamEpoch`;
   - replace `leaseToken` with `<redacted>` before saving or attaching;
   - capture the gateway acceptance response and Mist diagnostic readback.
5. Capture at least one later snapshot proving strictly increasing outbound
   sequence and an updated latest snapshot for the same exact identity.
6. Restart the terminal bridge once. Capture the new generation/epoch and
   prove Mist atomically reports the new `(streamEpoch, generation, ownerId,
   bridgeBuildId)` tuple while rejecting stale-generation data.
7. Stop the bridge, confirm stale/disconnected diagnostics, then execute the
   documented legacy rollback and capture successful legacy startup.
8. Capture the DB after-state digests using the same queries as preflight.

## Required artifact manifest

Record relative paths and SHA-256 for each attachment.

| Artifact | Path | SHA-256 |
|---|---|---|
| environment/build inventory | pending | pending |
| datasource health before/registered/restarted | pending | pending |
| Mist diagnostics before/registered/restarted/stopped | pending | pending |
| sanitized first accepted F2 envelope | pending | pending |
| verbatim native SDK payload | pending | pending |
| sequence progression capture | pending | pending |
| stale-generation rejection capture | pending | pending |
| DB before/after digest report | pending | pending |
| rollback transcript | pending | pending |

## Acceptance decision

All items must be true:

- [ ] Deployed SHAs, script SHA, terminal version, Python/runtime version, and
      trading phase are recorded.
- [ ] Exact desired/native identities converge for one or two symbols.
- [ ] A real TDX callback produces a snapshot accepted through datasource HTTP,
      experimental WS, Mist codec/allowlist, and latest-snapshot store.
- [ ] Sequence is monotonic and duplicate/out-of-order behavior remains fenced.
- [ ] Owner restart creates a new epoch and Mist commits the generation tuple
      atomically without accepting stale frames.
- [ ] DB before/after row counts and content digests are identical for every
      protected table.
- [ ] No scanner, signal, alert, trading, or other business side effect occurs.
- [ ] Legacy rollback succeeds on the same machine and deployed builds.
- [ ] No lease token appears in any retained artifact.
- [ ] Reviewer records an explicit acceptance below.

Decision: `pending`  
Executed by: `pending`  
Reviewed by: `pending`  
Accepted at: `pending`  
Notes: `pending`

Only after `Decision: accepted` may the lifecycle be changed to
`transport-HIL-verified` and task 7.2 be checked. Acceptance permits transport
claims only; it does not establish production readiness.

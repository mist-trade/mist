# F2 Windows HIL Evidence Record

Status: **transport evidence complete; identity review pending**
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
- Always-on TDX builtin realtime on datasource and Mist; no legacy mode key.
- No K persistence, scanner, signal, alert, or trading side effects.
- Tested rollback to the builtin no-subscription baseline available before starting.
- Never persist or attach the bridge `leaseToken`.

## Immutable build identity

Fill every value from the deployed machine, not from a developer checkout.

| Field | Captured value |
|---|---|
| HIL start/end time (RFC3339 +08:00) | `2026-07-22T09:49:00+08:00` / `2026-07-22T10:37:44+08:00` |
| `mist` git SHA | `a08ac44ea262a1e2b1e0c895b3d57920efef2bde` |
| `mist-datasource` git SHA | `d97e29f3aba61de3eb99baf523b8caa4fe7ab47a` |
| bridge artifact SHA-256 | `063943212180e1c3369905e464c72c35f2a94c62a9513880f70520aaa9a5260c` |
| `bridgeBuildId` | `mist-tdx-bridge-v0.2` |
| TDX terminal product/version/build | pending |
| embedded Python version | pending |
| `tqcenter` version/build, if exposed | pending |
| Windows version | pending |
| trading phase (pre-open/continuous auction/lunch/close) | A-share continuous auction |
| tested exact symbols | `600519.SH` |

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
5. Confirmation that the no-subscription rollback procedure was rehearsed or verified
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
7. Clear the desired set, restore the recorded builtin/QMT-off baseline, and
   capture the empty desired/converged subscription state.
8. Capture the DB after-state digests using the same queries as preflight.

## Required artifact manifest

Record relative paths and SHA-256 for each attachment.

| Artifact | Path | SHA-256 |
|---|---|---|
| environment/build inventory | pending | pending |
| datasource health before/registered/restarted | Actions artifacts from `29884138077`, `29884310794`, `29886212704` | retained by GitHub Actions |
| Mist diagnostics before/registered/restarted/stopped | Actions artifacts from `29884138077`, `29884310794`, `29886212704`, `29886299255` | retained by GitHub Actions |
| sanitized first accepted F2 envelope | `experimental-tdx-enabled/enabled.json` from `29884310794` | `sha256:909810ff30f8f3ca4f1ccedcf372fadf8e1e405d97a6849d05ddeccc2483b9b0` |
| verbatim native SDK payload | `nativeEvidence.native` in the enabled and post-restart artifacts | included in artifact digests |
| sequence progression capture | Runtime smokes `29884263718`, `29884358373`, `29886156553` | retained by GitHub Actions |
| stale-generation/owner replacement capture | Recovery `29885539439` and `post_restart` `29886212704` | `sha256:7523b6028c50e1e0d9d02fc8c05860e2196955a5d70acb50550db6ee68d38088` |
| DB before/after digest report | Four phase JSON files in `29886212704` and `29886299255` | protected-table digests identical |
| rollback transcript | `29886252380` and `experimental-tdx-post_rollback` | `sha256:42619ef407536c3da66c1a479cf445fa818c452282880327e09593082cf5ff4e` |

## Acceptance decision

All items must be true:

- [ ] Deployed SHAs, script SHA, terminal version, Python/runtime version, and
      trading phase are recorded.
- [x] Exact desired/native identities converge for one or two symbols.
- [x] A real TDX callback produces a snapshot accepted through datasource HTTP,
      experimental WS, Mist codec/allowlist, and latest-snapshot store.
- [x] Sequence is monotonic and duplicate/out-of-order behavior remains fenced.
- [x] Owner restart creates a new epoch and Mist commits the generation tuple
      atomically without accepting stale frames.
- [x] DB before/after row counts and content digests are identical for every
      protected table.
- [x] No scanner, signal, alert, trading, or other business side effect occurs.
- [x] Builtin no-subscription rollback succeeds on the same machine and deployed builds.
- [x] No lease token appears in any retained artifact.
- [ ] Reviewer records an explicit acceptance below.

Decision: `pending`  
Executed by: `pending`  
Reviewed by: `pending`  
Accepted at: `pending`  
Notes: `TDX transport, terminal-owner restart, rollback, and no-K evidence passed on 2026-07-22. Immediate 30s/90s post-restart smokes timed out; the same replacement owner resumed snapshots after a multi-minute terminal cold start and the accepted retry/post_restart artifact is fresh. Current terminal product, Python runtime, tqcenter, and Windows versions still require an exact machine inventory before reviewer acceptance.`

Only after `Decision: accepted` may the lifecycle be changed to
`transport-HIL-verified` and task 7.2 be checked. Acceptance permits transport
claims only; it does not establish production readiness.

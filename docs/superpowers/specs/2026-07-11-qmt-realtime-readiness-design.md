# QMT Realtime Readiness Verification Design

**Date:** 2026-07-11
**Status:** Approved direction; implementation not started
**Planned OpenSpec change:** `verify-qmt-realtime-readiness`

## Context

`add-bigqmt-datasource-bridge` has live Windows evidence for the native QMT
historical path. Its 2026-07-11 run proved all required history periods, an
active bridge owner, and working non-realtime bridge commands. The same run did
not prove realtime behavior because `get_full_tick` was correctly skipped
outside a market trading session.

The current product boundary is intentionally narrower than a realtime product
implementation:

- QMT history is a polling product path through `:9002/v1/bars/query`.
- The full-QMT built-in strategy may execute the internal bridge command
  `ContextInfo.get_full_tick`.
- Mist backend's QMT WebSocket branch is explicitly disabled and returns no
  subscription result.
- Product code must not use `/qmt/bridge/*` as a market-data API.

QMT documents `get_full_tick` as a latest full-push snapshot, not a historical
series. It returns a mapping from requested symbol to a tick object containing
quote and turnover fields. References:

- <https://docs.thinktrader.net/pages/fd9cbd/>
- <https://dict.thinktrader.net/innerApi/question_answer.html>

## Goals

1. Prove during a real trading session that the registered full-QMT strategy
   can execute `ContextInfo.get_full_tick` through the existing internal HTTP
   polling bridge.
2. Validate a minimal, stable snapshot contract and freshness signal for
   `000001.SZ`.
3. Record reproducible Windows workflow evidence tied to exact repository refs.
4. Keep QMT product realtime disabled and explicitly unverified until the live
   gate passes.
5. Move realtime verification out of the completed historical-bars change so
   that history can be archived without claiming realtime readiness.

## Non-Goals

- Implementing or enabling a QMT WebSocket product path.
- Exposing `/qmt/bridge/*` endpoints to backend or frontend product callers.
- Implementing continuous QMT subscriptions, callbacks, candle aggregation, or
  database persistence.
- Replacing the existing QMT historical polling strategy.
- Adding account, order, position, deal, or other trading operations.
- Treating a mock, a local DAT file, a weekend run, or a stale cached tick as
  live realtime proof.

## Approaches Considered

### 1. Verification-only readiness child — selected

Keep the existing production boundary, strengthen the Windows smoke into a
strict trading-session check, and store live evidence. This is the smallest
change that resolves the current unknown without silently enabling a product
path.

### 2. Expose the HTTP bridge as the backend realtime API — rejected

This would be quick but would turn a single-owner runtime control channel into a
product contract. It would violate the current datasource boundary and couple
backend behavior to internal queue and ownership semantics.

### 3. Implement end-to-end QMT product realtime now — deferred

This would require a separate decision for snapshot polling versus subscription
push, public payload normalization, lifecycle, persistence, freshness, and
operator behavior. Those decisions are larger than the evidence gap and must
not be smuggled into a smoke-test change.

## Architecture

The verification remains an operator workflow, not a product request path:

```text
GitHub Actions workflow_dispatch
  -> Windows API runner
    -> QMT datasource :9002
      -> internal /qmt/bridge/commands queue
        -> registered full-QMT built-in strategy
          -> ContextInfo.get_full_tick(["000001.SZ"])
        <- native tick result
      <- structured command result
    <- strict validation and sanitized summary
  -> OpenSpec evidence document
```

No Mist backend or frontend runtime component is added to this data flow.

## Components And Responsibilities

### `mist-deploy` smoke wrapper

Extend `scripts/run-qmt-runtime-smoke.ps1` with a strict realtime mode while
preserving the current optional behavior:

- Keep `IncludeFullTick` as the switch that requests the probe.
- Add `RequireRealtimeTick`, defaulting to `false`.
- When strict mode is `false`, an out-of-session run may keep logging a skip.
- When strict mode is `true`, a skip is a failed verification, not success.
- Validate `result.result` from the bridge command instead of only checking that
  the command completed.
- Print one structured, sanitized `QMT_REALTIME_SMOKE` summary.

The summary contains only verification metadata and selected market fields. It
must not print account, trading, environment-secret, or unrelated raw data.

### `mist-deploy` workflow

Extend `.github/workflows/run-windows-qmt-runtime-smoke.yml` with a boolean
`require_realtime_tick` input and forward it to the wrapper. The dedicated live
run uses:

- `include_bridge_commands=true`
- `include_full_tick=true`
- `require_realtime_tick=true`
- `stock_code=000001.SZ`

History-only and weekend diagnostic runs retain the non-strict default.

### OpenSpec and documentation

The focused child owns the smoke contract, tests, live evidence, and final
readiness disposition. It does not claim that a successful native snapshot has
created a product realtime path.

## Snapshot Acceptance Contract

The strict probe passes only when all of the following are true:

1. The workflow runs on a supported market weekday during the existing China
   realtime session gate.
2. `/health` reports the QMT service healthy.
3. `/qmt/bridge/health` reports a registered owner.
4. The `get_full_tick` command completes within the configured timeout with
   `ok=true`.
5. The native result is a mapping containing `000001.SZ`.
6. The symbol value is an object containing at least:
   `lastPrice`, `open`, `high`, `low`, `lastClose`, `volume`, and `amount`.
7. Required quote fields are finite numbers; prices are positive and
   `volume`/`amount` are non-negative.
8. The result exposes a parseable native freshness field such as `timetag`, and
   it belongs to the current Beijing trading date. If the runtime variant does
   not expose a trustworthy freshness value, the run remains incomplete rather
   than substituting the workflow timestamp.

`pvolume`, `openInt`, settlement fields, and broker-specific extensions may be
recorded when present but are not required for this stock snapshot gate.

The structured summary records:

- workflow run URL and exact SHA;
- Beijing probe time;
- stock code;
- bridge `ownerId` and `commandId`;
- observed native field names;
- freshness value;
- selected sanitized values for `lastPrice`, `lastClose`, `volume`, and
  `amount`;
- final result: `passed`, `skipped`, or `failed`, with a stable reason.

## Error Handling

- **Outside trading session:** optional mode logs `skipped`; strict mode fails
  with a stable outside-session reason.
- **Bridge owner missing:** classify as owner-registration readiness failure.
  Do not redeploy Docker or datasource services merely because `/health` is
  green while owner readiness is absent.
- **Command timeout or bridge error:** fail and record the command error without
  retrying deployment.
- **Empty symbol result:** fail; command completion alone is insufficient.
- **Malformed or non-numeric fields:** fail with the missing/invalid field list.
- **Stale or absent freshness:** fail the readiness gate even when prices are
  present.

## Testing And Evidence

Local verification must cover:

- strict versus optional out-of-session behavior;
- strict input forwarding through the workflow;
- symbol presence and required-field validation;
- finite/positive/non-negative numeric rules;
- stale or missing freshness rejection;
- structured summary shape;
- unchanged history and non-realtime bridge checks.

The live evidence must include:

- the exact workflow URL, ref, and SHA;
- runner result and relevant structured log lines;
- registered owner and completed command identifiers;
- sanitized snapshot contract evidence;
- local wrapper/workflow test results;
- strict OpenSpec validation.

## OpenSpec And Roadmap Disposition

1. Create `verify-qmt-realtime-readiness` as the focused G1 child.
2. Rewrite `add-bigqmt-datasource-bridge` task 7.5 as a completed ownership
   transfer to the child, explicitly stating that realtime itself is not yet
   verified.
3. Validate and archive `add-bigqmt-datasource-bridge` with its history evidence
   intact.
4. Update the production roadmap ledger to list the new child.
5. Record the split itself as complete, while keeping a separate roadmap item
   open for either successful live evidence or an explicit accepted deferral.
6. Keep the child active until a trading-session run passes. If access or market
   timing prevents the run, record a deferred disposition, production impact,
   and reopening condition instead of marking the smoke complete.

## Completion Criteria

This child is complete only when:

- local wrapper and workflow tests pass;
- a strict trading-session Windows run produces a fresh, valid native snapshot;
- the evidence document is tied to exact refs and contains the required
  sanitized fields;
- QMT product realtime remains disabled unless a later, separately approved
  implementation change enables it;
- the child and parent roadmap artifacts pass strict OpenSpec validation.

A successful readiness probe proves native snapshot availability only. It does
not by itself approve continuous collection, persistence, alerts, frontend use,
or any trading behavior.

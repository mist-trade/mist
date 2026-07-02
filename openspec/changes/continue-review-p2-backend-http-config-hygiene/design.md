## Context

`EastMoneySource` and `TdxSource` both create Axios clients through
`UtilsService.createAxiosInstance`. The P1 cleanup already moved EF base URL
selection to `AKTOOLS_BASE_URL`, but the review item still needs to remain
covered as part of the P2 HTTP configuration batch. Both EF and TDX still pass
literal `30000` timeout values, and the helper returns `any`, forcing callers
such as `TimezoneService` to inherit weak typing.

## Goals / Non-Goals

**Goals:**

- Preserve and explicitly verify configurable `AKTOOLS_BASE_URL` behavior.
- Give `createAxiosInstance` an `AxiosInstance` return type.
- Replace duplicate EF/TDX `30000` timeout literals with a shared backend
  datasource HTTP timeout constant.
- Add unit and contract tests that map directly to the selected review IDs.

**Non-Goals:**

- Do not change WebSocket heartbeat/reconnect timings; those belong to M1.1.
- Do not change Python datasource timeout settings; those belong to datasource
  P2 items.
- Do not change external datasource API paths or payload shapes.

## Decisions

1. **Use a shared TypeScript constant for this batch.**
   The review recommendation for M1.3 asks for `HTTP_TIMEOUT_MS = 30000`.
   Keeping a compile-time constant avoids expanding the batch into config
   plumbing while still removing duplicate literals from EF/TDX source setup.

2. **Keep `AKTOOLS_BASE_URL` as the EF base URL source.**
   The schema already defines `AKTOOLS_BASE_URL`, and focused Jest tests already
   exercise configured and fallback values. This batch keeps those tests as the
   CODE_REVIEW M2 proof and adds contract coverage around the timeout argument.

3. **Use `tools/test-ci-contracts.mjs` for static regression checks.**
   Type-only regressions are best caught by `pnpm run typecheck`, but the
   contract script can also fail fast if `createAxiosInstance` returns `any` or
   EF/TDX source setup reintroduces literal `30000` timeouts.

## Risks / Trade-offs

- A constant is less flexible than an env var. This is intentional for the
  small batch because the reviewed problem is duplication and weak typing; a
  later config-factory pass can decide whether datasource timeouts should become
  environment-driven.
- Static source checks can be brittle if files are reorganized. Mitigation:
  keep the contract scoped to the selected files and review IDs.

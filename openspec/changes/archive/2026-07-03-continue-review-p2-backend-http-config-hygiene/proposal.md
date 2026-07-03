## Why

The next P2 backend batch is narrow and configuration-focused. The reviewed
items point at three related risks: the East Money AKTools URL must stay
configuration-driven, the shared Axios helper should not leak `any`, and the
30s datasource HTTP timeout should not remain duplicated in each source.

## What Changes

- Select and close CODE_REVIEW M2, CODE_SMELL_REVIEW T1.2, and
  CODE_SMELL_REVIEW M1.3.
- Keep `EastMoneySource` covered by a regression test that proves it consumes
  `AKTOOLS_BASE_URL`.
- Change `UtilsService.createAxiosInstance` to return `AxiosInstance`.
- Centralize the backend datasource HTTP timeout and make both EF and TDX
  sources consume the shared value.
- Add CI contract coverage so the reviewed timeout/type regressions are caught.

## Capabilities

### New Capabilities

- `review-p2-backend-http-config-hygiene`: Tracks backend P2 HTTP configuration
  remediation for EF/TDX Axios setup and shared helper typing.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist`.
- Affected files: backend datasource services, shared utils/config constants,
  focused Jest specs, CI contract tests, OpenSpec artifacts.
- No runtime endpoint, database schema, or datasource protocol changes are
  intended.

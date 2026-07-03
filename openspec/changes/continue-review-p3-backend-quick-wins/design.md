## Context

P0/P1/P2 remediation is already archived. The first P3 batch should therefore
avoid risky redesign and focus on backend-local cleanup that is easy to prove:
dead code removal, stale comments, redundant return fields, narrow MCP typing
cleanup, and explicit evidence for items already closed or intentionally
deferred.

The selected 30 review IDs live in the `mist` backend repository. Some are
still visible in current code (`JudgeTrendVo`, `BI_INVALID_DIRECTION`,
`offsetIndex`, selected `eslint-disable` comments). Others were already covered
by archived P2 evidence (`M4`, `T10`, `T11`) or should stay deferred until a
larger architecture pass (`H1`, `M3`, `L2`, `D1.4`, `P1.1`, `T1.5`).

## Goals / Non-Goals

**Goals:**

- Close exactly the selected 30 P3 review IDs with code changes, tests, or
  explicit evidence/defer decisions.
- Use failing tests or static contracts before changing production code.
- Remove backend dead code and stale return fields without changing public API
  behavior.
- Reuse existing Jest/typecheck/contract verification paths.

**Non-Goals:**

- Do not merge datasource abstraction layers in this batch.
- Do not restructure cross-app imports, collector strategies, or DI lifecycle.
- Do not change database schema, migrations, HTTP routes, MCP tool names, or
  datasource protocols.
- Do not touch frontend, datasource, deploy, monitoring, or skills repositories.

## Decisions

1. **Use contract tests for dead-code and structural cleanup.**
   Add or extend `tools/test-ci-contracts.mjs` so it fails when the selected
   dead classes/constants/return fields and stale disable comments return. This
   keeps P3 cleanup from drifting back while avoiding broad product tests for
   code that should not exist.

2. **Use focused Jest tests for behavior-adjacent cleanup.**
   `UtilsService.addZeroToNumber` has a small boundary bug if it survives the
   cleanup. Add direct unit coverage first, then either remove the method if no
   production code uses it or fix it if retained. `ChannelService.getChannel`
   should return only the channels its callers use; add a test around the
   public channel path rather than testing private implementation details.

3. **Record defer/already-closed decisions as evidence, not code churn.**
   `M4`, `T10`, and `T11` are already closed by archived P2 test-hygiene
   evidence. `H1`, `M3`, `L2`, `D1.4`, `P1.1`, and `T1.5` remain P3 deferrals
   because doing them properly requires broader architecture decisions.

4. **Keep cleanup local and reversible.**
   Delete or simplify only code with no runtime consumers. If a cleanup touches
   a public export, add a static import check or update tests to prove no active
   consumer remains.

## Risks / Trade-offs

- **Static contracts can be brittle when files move** -> Keep checks scoped to
  selected review IDs and failure messages explicit.
- **Dead-code deletion can expose hidden imports** -> Run typecheck and focused
  Jest after each deletion group.
- **P3 deferrals can look like unfinished work** -> Evidence must map every
  selected ID to `implemented`, `already closed`, or `deferred with reason`.

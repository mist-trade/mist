## Context

This change implements the first batch from the parent
`stabilize-review-remediation` plan. It is intentionally limited to release and
CI safety so later runtime and deployment changes can rely on a working gate.

## Selected Review IDs

| Review ID | Source | Decision | Priority | Handling |
|---|---|---:|---:|---|
| C1 | CODE_REVIEW.md | 必修 | P0 | Untrack `.env.development` and `.env.production`; keep `.env.example` tracked. |
| I1 | INFRA_REVIEW.md | 必修 | P0 | Backend CI must run lint check, typecheck, and tests before publishing. |
| I2 | INFRA_REVIEW.md | 必修 | P0 | Frontend Docker publishing must depend on lint, typecheck, and tests. |
| I3 | INFRA_REVIEW.md | 必修 | P0 | Datasource, monitoring, and skills repositories need minimal CI. |
| I5 | INFRA_REVIEW.md | 必修 | P0 | Backend release must depend on validation and require environment approval. |
| I8 | INFRA_REVIEW.md | 必修 | P0 | Backend read-only lint check must be separate from auto-fix lint. |
| D9 | INFRA_REVIEW.md | 必修 | P0 | Node workflows and package metadata must align on one version. |
| 共性1 | INFRA_REVIEW.md | 必修 | P0 | CI must become a real gate for remediation work. |

## Verification Plan

| Review ID | Proof |
|---|---|
| C1 | `node tools/test-ci-contracts.mjs`; `git ls-files .env.development .env.production` returns no tracked files. |
| I1 | `node tools/test-ci-contracts.mjs`; backend workflow contains validate gate; `pnpm run lint:check`, `pnpm run typecheck`, and `pnpm run test:ci` are the workflow commands. |
| I2 | `node tools/test-ci-contracts.mjs`; frontend Docker workflow contains validate gate before Docker build. |
| I3 | `node tools/test-ci-contracts.mjs`; CI workflow files exist for datasource, monitoring, and skills. |
| I5 | `node tools/test-ci-contracts.mjs`; release job has `needs: validate` and `environment: production-release`. |
| I8 | `node tools/test-ci-contracts.mjs`; `lint:check` exists and does not include `--fix`. |
| D9 | `node tools/test-ci-contracts.mjs`; backend and frontend Node metadata/workflows use Node 24. |
| 共性1 | `node tools/test-ci-contracts.mjs` plus repo-local verification commands listed in the completion summary. |

## Decisions

- Use Node 24 because backend executable packaging and `.nvmrc` already point
  there, while release and frontend Docker workflows were the outliers.
- Keep `lint` as the local auto-fix command and add `lint:check` for CI.
- Use a static contract test for workflow files because workflow/Docker
  changes cannot be proven by a normal unit test alone.
- Keep local env files on disk for developer machines but remove them from git
  tracking.

## Non-Goals

- Fix every lint/type/test failure found by the newly declared CI gates.
- Rework Docker image security; that belongs to `harden-docker-deploy-path`.
- Add live datasource validation; that belongs to datasource runtime and
  deployment changes.


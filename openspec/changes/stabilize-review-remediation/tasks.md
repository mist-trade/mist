# Tasks: Stabilize review remediation

## 1. Establish remediation control

- [x] 1.1 Confirm `REVIEW_REMEDIATION_PLAN.md` and `REVIEW_ITEM_INVENTORY.md` are the active source ledger for remediation.
- [x] 1.2 Add a first-wave selection note listing the P0/P1 review IDs that will be implemented before broad P2/P3 cleanup.
- [x] 1.3 Define the completion evidence format as `review-id -> changed files -> test/verification command`.
- [x] 1.4 Confirm every selected item has a planned unit test or substitute verification before implementation starts.

## 2. Create first-wave child changes

- [x] 2.1 Create `harden-release-ci` for CI/release safety, Node version alignment, tracked env cleanup, and release gating.
- [x] 2.2 Create `fix-datasource-runtime-safety` for blocking SDK calls, QMT callback loop capture, dirty-symbol thread safety, and datasource protocol tests.
- [x] 2.3 Create `disable-typeorm-auto-sync` for explicit TypeORM synchronize shutdown and high-risk DB schema fixes.
- [x] 2.4 Create `harden-docker-deploy-path` for backend Dockerfile, compose command, image tag, rollback, and deployment-script verification.
- [ ] 2.5 Create `align-datasource-ws-contract` for WebSocket envelope, error, pong, snapshot, and old-route migration planning.
- [ ] 2.6 Create `fix-mcp-skills-contracts` for MCP stub handling, unknown-error normalization, skills response parsing, and shared script runner tests.
- [ ] 2.7 Create `fix-frontend-runtime-quality` for duplicate API layer removal, mock data bundle isolation, chart resize, request race protection, and large-data utilities.
- [ ] 2.8 Create `repair-monitoring-health-alerts` for Mac datasource health parsing, probe/notifier error visibility, and Prometheus metric rendering.

## 3. Enforce test-backed completion

- [ ] 3.1 For each child change, copy selected review IDs into its tasks before code edits begin.
- [ ] 3.2 For each code behavior fix, add or update targeted unit tests that cover the reviewed risk.
- [ ] 3.3 For each workflow, Docker, script, or deployment-only fix, add substitute verification such as config tests, script self-tests, compose checks, image smoke, or runner smoke.
- [ ] 3.4 Record test or verification commands in the child change completion summary.
- [ ] 3.5 Leave any item incomplete if its required verification cannot run and no substitute proof has been accepted.

## 4. Preserve production boundaries

- [ ] 4.1 Ensure deployment child changes preserve Docker-stack app deployment plus host-side WinSW datasource boundaries.
- [ ] 4.2 Ensure datasource child changes keep normalized Python product routes as the upstream contract and raw provider access debug-only.
- [ ] 4.3 Ensure Docker mirror changes distinguish Docker Hub image pulls from GitHub Actions archive download failures.
- [ ] 4.4 Ensure TDX terminal recovery remains separate from ordinary datasource update/restart work.

## 5. Validate this governance change

- [x] 5.1 Run `openspec validate stabilize-review-remediation --strict`.
- [x] 5.2 Run `openspec status --change stabilize-review-remediation` and confirm the change is apply-ready.
- [x] 5.3 Review `proposal.md`, `design.md`, `specs/review-remediation-governance/spec.md`, and `tasks.md` for placeholders or contradictions.
- [ ] 5.4 Confirm git status contains only intentional OpenSpec and review-document changes.

# Tasks: Define Mist production roadmap

## 1. Create P0 production evidence child spec

- [x] 1.1 Create or continue child change `verify-mist-production-baseline`.
- [x] 1.2 Define owner repositories: `mist`, `mist-fe`, `mist-datasource`,
      `mist-deploy`, and optionally `mist-monitoring`.
- [x] 1.3 Require pinned refs for backend image, frontend image, datasource,
      deploy scripts, and monitoring when included.
- [x] 1.4 Require deployment evidence from `Deploy Windows Mist Stack`.
- [x] 1.5 Require health-check, datasource runtime smoke, backup restore
      rehearsal, and Mac-side gateway probe evidence.
- [x] 1.6 Define archive criteria for a known-good production baseline.

## 2. Create P0 TDX realtime contract child spec

- [ ] 2.1 Create or continue child change `settle-tdx-realtime-contract`.
- [ ] 2.2 Reconcile current snapshot-only WebSocket behavior with existing
      normalized `bar` event expectations.
- [ ] 2.3 Decide whether product realtime remains snapshot-only or publishes
      normalized bar events.
- [ ] 2.4 Define required changes in `mist-datasource` and `mist` after that
      decision.
- [ ] 2.5 Define local tests and Windows live smoke evidence required for the
      chosen contract.
- [ ] 2.6 Define archive criteria for the realtime datasource contract.

## 3. Create P1 OpenSpec and branch reconciliation child spec

- [ ] 3.1 Create or continue child change
      `reconcile-openspec-and-datasource-branch`.
- [ ] 3.2 Inspect active changes `add-tdx-desktop-guard`,
      `refactor-tdx-python-datasource`, and
      `align-tdx-qmt-datasource-contracts`.
- [ ] 3.3 Update stale task states where implementation already exists.
- [ ] 3.4 Identify work that should be archived, split, or superseded by new
      child changes.
- [ ] 3.5 Decide whether `mist-datasource` should move back to `master`, track
      a new remote branch, or keep a named long-lived contract branch.
- [ ] 3.6 Define archive criteria for repository planning hygiene.

## 4. Create P1 Windows TDX guard validation child spec

- [ ] 4.1 Create or continue child change `validate-tdx-guard-on-windows`.
- [ ] 4.2 Define controlled Windows API machine scenarios for TDX strategy
      cleanup, TDX logout, runtime login, datasource restart, and failure
      screenshot capture.
- [ ] 4.3 Require evidence from AutoHotkey v2 scheduled tasks running in the
      logged-in user session.
- [ ] 4.4 Require evidence that normal datasource management remains separate
      from explicit TDX recovery.
- [ ] 4.5 Define rollback and manual-intervention rules for captcha, MFA, or
      ambiguous TDX desktop state.
- [ ] 4.6 Define archive criteria for guard validation.

## 5. Create P2 monitoring and AstrBot operations child spec

- [ ] 5.1 Create or continue child change
      `deploy-monitoring-and-astrbot-ops`.
- [ ] 5.2 Define Windows exporter deployment evidence and Mac watchdog
      deployment evidence.
- [ ] 5.3 Define required metrics, alert classifications, cooldown behavior,
      and resolved notifications.
- [ ] 5.4 Define AstrBot commands for status, diagnosis, and controlled TDX
      recovery.
- [ ] 5.5 Decide the first recovery backend for `mist恢复tdx`: runbook-only,
      GitHub Actions dispatch, or local Windows authenticated endpoint.
- [ ] 5.6 Define archive criteria for monitoring and operator bot readiness.

## 6. Create P2 frontend operator UX child spec

- [ ] 6.1 Create or continue child change `improve-frontend-operator-console`.
- [ ] 6.2 Define frontend status surfaces for datasource health, last
      collection time, empty-data reasons, and recoverable backend errors.
- [ ] 6.3 Define how the frontend continues using same-origin gateway paths
      without calling datasource directly.
- [ ] 6.4 Define tests and production build evidence, including whether fonts
      remain network-fetched or become local build assets.
- [ ] 6.5 Define archive criteria for frontend operator UX readiness.

## 7. Create P3 engineering hygiene child spec

- [ ] 7.1 Create or continue child change
      `tighten-tooling-and-build-repeatability`.
- [ ] 7.2 Define fixes for datasource ruff failures and pyright availability.
- [ ] 7.3 Define Watchman-free Jest test commands or repository config for
      sandboxed/local runs.
- [ ] 7.4 Define build repeatability expectations for frontend fonts and Python
      dependency resolution.
- [ ] 7.5 Define documentation cleanup for stale README and OpenSpec command
      references.
- [ ] 7.6 Define archive criteria for local tooling repeatability.

## 8. Maintain roadmap disposition

- [ ] 8.1 Track each child item as completed, archived, superseded, deferred,
      or dropped.
- [ ] 8.2 Update this roadmap if a child item is split into multiple changes.
- [ ] 8.3 Record blockers for any deferred child item.
- [ ] 8.4 Archive this roadmap only after every child item has a recorded
      disposition.

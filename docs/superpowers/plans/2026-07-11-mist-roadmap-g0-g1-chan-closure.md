# Mist Roadmap G0 and Chan G1 Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close G0 planning cleanup and the first G1 Chan correctness child by
archiving the completed phase preview, verifying the overlap repair end to end,
archiving that repair, and updating the production roadmap dispositions.

**Architecture:** Preserve the two-repository implementation already present in
the working trees: the NestJS algorithm owns Bi sequence integrity, while the
Next.js frontend owns zoom-safe custom overlay rendering and phase-aware review
fixtures. OpenSpec changes are archived in dependency order so the phase-preview
capability lands before the overlap repair modifies related canonical specs.

**Tech Stack:** OpenSpec CLI, pnpm, Jest, TypeScript, NestJS, Next.js, ECharts,
and the in-app browser.

## Global Constraints

- Work in `/Users/moyui/sean/mist/mist` on `fix/bi-two-phase-merge` and
  `/Users/moyui/sean/mist/mist-fe` on `feat/chan-tests-phase-b-preview`.
- Preserve all existing modified and untracked files; they are concurrent
  user-owned work already in scope for the active Chan repair.
- Do not stage, commit, push, reset, or discard changes in this plan.
- Archive `preview-chan-bi-phases` before
  `repair-chan-bi-overlap-rendering` so canonical spec updates land in dependency
  order.
- Use `pnpm test:ci` or an explicit `--watchman=false` Jest invocation for
  non-interactive tests.
- Run both repositories with Node `v24.18.0`. Preserve each existing dependency
  layout owner: use pnpm `9.15.3` for `mist` and pnpm `11.7.0` for `mist-fe`;
  do not let a different pnpm version purge either `node_modules` tree.
- Do not mark browser- or live-evidence tasks complete from unit tests alone.
- If an existing verification fails, stop the affected task and invoke
  `superpowers:systematic-debugging`; do not make an unplanned production edit.
- QMT Windows evidence and the TDX realtime contract are outside this plan and
  receive separate follow-up plans after this checkpoint.

## File Map

- `/Users/moyui/sean/mist/mist/openspec/changes/preview-chan-bi-phases/`:
  completed prerequisite to archive.
- `/Users/moyui/sean/mist/mist/openspec/changes/repair-chan-bi-overlap-rendering/`:
  active child; update tasks/evidence, then archive after verification.
- `/Users/moyui/sean/mist/mist/openspec/specs/chan-bi-phase-preview/spec.md`:
  canonical capability created by preview archive.
- `/Users/moyui/sean/mist/mist/openspec/specs/chan-bi-sequence-integrity/spec.md`:
  canonical capability created by repair archive.
- `/Users/moyui/sean/mist/mist/openspec/specs/frontend-live-kline-viewer/spec.md`:
  canonical capability modified by repair archive.
- `/Users/moyui/sean/mist/mist/openspec/changes/define-mist-production-roadmap/design.md`:
  current-state ledger and gate status.
- `/Users/moyui/sean/mist/mist/openspec/changes/define-mist-production-roadmap/tasks.md`:
  G0/G1 completion tracking.
- `/Users/moyui/sean/mist/mist/apps/mist/src/chan/services/bi.service.ts` and
  related specs/fixtures: existing backend repair to verify, not rewrite.
- `/Users/moyui/sean/mist/mist-fe/app/components/k-panel/config/chartOptions.ts`,
  its focused test, and phase-aware snapshots: existing frontend repair to
  verify, not rewrite.

---

### Task 1: Archive the completed phase-preview prerequisite

**Files:**

- Move through OpenSpec archive:
  `openspec/changes/preview-chan-bi-phases/`
- Create through OpenSpec archive:
  `openspec/specs/chan-bi-phase-preview/spec.md`
- Modify:
  `openspec/changes/define-mist-production-roadmap/design.md`
- Modify:
  `openspec/changes/define-mist-production-roadmap/tasks.md`

**Interfaces:**

- Consumes: the completed 12/12 phase-preview change and its strict validation.
- Produces: canonical `chan-bi-phase-preview` requirements and a completed G0
  prerequisite for the overlap repair.

- [ ] **Step 1: Revalidate the preview change**

  Run from `/Users/moyui/sean/mist/mist`:

  ```bash
  openspec validate preview-chan-bi-phases --strict
  ```

  Expected: `Change 'preview-chan-bi-phases' is valid` and exit code 0.

- [ ] **Step 2: Confirm no preview task remains unchecked**

  Run:

  ```bash
  rg -n '\[ \]' openspec/changes/preview-chan-bi-phases/tasks.md
  ```

  Expected: no matches and exit code 1.

- [ ] **Step 3: Archive the preview change with canonical spec updates**

  Run:

  ```bash
  openspec archive preview-chan-bi-phases -y
  ```

  Expected: archive succeeds, the active directory is removed, and
  `openspec/changes/archive/2026-07-10-preview-chan-bi-phases/` plus
  `openspec/specs/chan-bi-phase-preview/spec.md` exist.

- [ ] **Step 4: Record the G0 disposition**

  Update the roadmap so its active-state table records the preview as archived,
  and change task 0.5 to:

  ```markdown
  - [x] 0.5 Archive `preview-chan-bi-phases` after confirming its 12/12 tasks and
        verification evidence remain complete.
  ```

- [ ] **Step 5: Validate the canonical specs and roadmap**

  Run:

  ```bash
  openspec validate --specs --strict
  openspec validate define-mist-production-roadmap --strict
  openspec list --json
  ```

  Expected: all canonical specs pass, the roadmap is valid, and the preview no
  longer appears as an active change.

- [ ] **Step 6: Checkpoint without committing**

  Run:

  ```bash
  git status --short --untracked-files=all
  git diff --check
  ```

  Expected: only intentional roadmap/archive plus existing repair changes are
  shown; `git diff --check` exits 0.

### Task 2: Verify the backend Bi sequence-integrity repair

**Files:**

- Verify:
  `apps/mist/src/chan/services/bi.service.ts`
- Verify:
  `apps/mist/src/chan/services/bi.service.spec.ts`
- Verify:
  `apps/mist/src/chan/services/bi-overlap-cases.spec.ts`
- Verify:
  `apps/mist/src/chan/services/__fixtures__/real-tdx-overlap-snapshots.fixture.ts`

**Interfaces:**

- Consumes: `BiService.getBi()` returning `{ phaseA, phaseB }` and the committed
  real-TDX merged-K fixture inputs.
- Produces: verified non-overlapping valid completed Bi sequences in both phases
  while invalid diagnostics remain available.

- [ ] **Step 1: Run the focused backend regression suites**

  Run from `/Users/moyui/sean/mist/mist`:

  ```bash
  pnpm test:ci -- apps/mist/src/chan/services/bi.service.spec.ts apps/mist/src/chan/services/bi-overlap-cases.spec.ts
  ```

  Expected: both suites pass, including all six real-TDX Phase A/Phase B cases.

- [ ] **Step 2: Run the complete Chan test scope**

  Run:

  ```bash
  pnpm test:ci -- apps/mist/src/chan
  ```

  Expected: all matched Chan suites pass with zero failed tests.

- [ ] **Step 3: Run backend static verification**

  Run:

  ```bash
  pnpm typecheck
  pnpm lint:check
  pnpm build
  ```

  Expected: all three commands exit 0. If an unrelated pre-existing failure
  appears, record the exact command and output before deciding whether it belongs
  to this child or G4.

### Task 3: Verify frontend zoom behavior and regenerated fixtures

**Files:**

- Verify:
  `app/components/k-panel/config/chartOptions.ts`
- Verify:
  `app/components/k-panel/config/__tests__/chartOptions.test.ts`
- Verify:
  `app/chan-tests/**`
- Verify:
  `__fixtures__/snapshots/chan/{csi300-2024-2025,chinext-2024-2025,maotai-2024-2025,shanghai-index-2024-2025}/`

**Interfaces:**

- Consumes: phase-aware `{ phaseA, phaseB }` fixture payloads and ECharts
  `DataZoomComponentOption` configuration.
- Produces: `filterMode: "none"` for both zoom controls, preserved crossing Bi
  overlays, and fixtures generated from the corrected backend algorithm.

- [ ] **Step 1: Run focused frontend regressions**

  Run from `/Users/moyui/sean/mist/mist-fe`:

  ```bash
  pnpm test:ci -- app/components/k-panel/config/__tests__/chartOptions.test.ts app/chan-tests/__tests__/ChanTestsPage.test.tsx app/chan-tests/lib/__tests__/load-snapshot.test.ts app/chan-tests/lib/__tests__/snapshot-to-chart.test.ts app/chan-tests/lib/__tests__/shanghai-phase-fixture.test.ts
  ```

  Expected: all listed suites pass.

- [ ] **Step 2: Run the full frontend test suite**

  Run:

  ```bash
  pnpm test:ci
  ```

  Expected: all frontend suites pass with zero failures.

- [ ] **Step 3: Run frontend static and production verification**

  Run:

  ```bash
  pnpm typecheck
  pnpm lint
  pnpm build
  ```

  Expected: all commands exit 0. If production build fails only on an external
  font/network dependency, record it as partial evidence and route it to G4
  rather than hiding it.

### Task 4: Verify `/chan-tests` in the browser

**Files:**

- Read only during verification:
  `/Users/moyui/sean/mist/mist-fe/app/chan-tests/`
- Create:
  `/Users/moyui/sean/mist/mist/openspec/changes/repair-chan-bi-overlap-rendering/evidence.md`

**Interfaces:**

- Consumes: the local Next.js `/chan-tests` page and regenerated fixtures.
- Produces: browser evidence for phase selection, counts, three repaired cases,
  the CSI 300 crossing zoom interval, and absence of browser errors.

- [ ] **Step 1: Start the local frontend server**

  Run from `/Users/moyui/sean/mist/mist-fe` in a persistent terminal:

  ```bash
  pnpm dev --hostname 127.0.0.1 --port 3000
  ```

  Expected: Next.js reports the local server ready at
  `http://127.0.0.1:3000`.

- [ ] **Step 2: Use the in-app browser to verify the default review surface**

  Open `http://127.0.0.1:3000/chan-tests` and verify:

  - Phase B is initially selected.
  - Phase A and Phase B counts are visible.
  - Switching phases changes the selected overlay.
  - CSI 300, ChiNext, and Kweichow Moutai load without an error state.

  Expected: all checks pass and the browser console has no new errors.

- [ ] **Step 3: Verify the CSI 300 crossing interval**

  Select CSI 300 and zoom to include the 2025-01-13 to 2025-02-24 interval while
  excluding the long Bi midpoint from the selected range.

  Expected: the long crossing Bi remains visible within the selected window.

- [ ] **Step 4: Record exact evidence**

  Create `evidence.md` with this structure and replace each result with the
  observed command output or browser result:

  ```markdown
  # Verification evidence

  ## Backend

  - Focused Jest: PASS; copy Jest's exact `Test Suites` and `Tests` summary lines.
  - Chan Jest scope: PASS; copy Jest's exact `Test Suites` and `Tests` summary lines.
  - Typecheck: PASS
  - Lint check: PASS
  - Build: PASS

  ## Frontend

  - Focused Jest: PASS; copy Jest's exact `Test Suites` and `Tests` summary lines.
  - Full Jest: PASS; copy Jest's exact `Test Suites` and `Tests` summary lines.
  - Typecheck: PASS
  - Lint: PASS
  - Production build: PASS

  ## Browser

  - Phase B default and phase counts: PASS
  - Phase switching: PASS
  - CSI 300, ChiNext, Kweichow Moutai review: PASS
  - CSI 300 crossing zoom interval: PASS
  - Browser console errors: NONE
  - Browser console warnings: record exact warning text and whether it blocks
    the verified behavior.
  ```

### Task 5: Close and archive the overlap-repair child

**Files:**

- Modify:
  `openspec/changes/repair-chan-bi-overlap-rendering/tasks.md`
- Modify/create:
  `openspec/changes/repair-chan-bi-overlap-rendering/evidence.md`
- Move through OpenSpec archive:
  `openspec/changes/repair-chan-bi-overlap-rendering/`
- Create through OpenSpec archive:
  `openspec/specs/chan-bi-sequence-integrity/spec.md`
- Modify through OpenSpec archive:
  `openspec/specs/frontend-live-kline-viewer/spec.md`

**Interfaces:**

- Consumes: all Task 2-4 evidence.
- Produces: completed canonical sequence-integrity and zoom-crossing viewer
  requirements.

- [ ] **Step 1: Mark only the proven repair tasks complete**

  After Task 4 passes, change tasks 4.2 and 4.3 to checked. Do not check either
  task if its required browser or repository evidence is missing.

- [ ] **Step 2: Validate the completed repair change**

  Run from `/Users/moyui/sean/mist/mist`:

  ```bash
  openspec validate repair-chan-bi-overlap-rendering --strict
  openspec status --change repair-chan-bi-overlap-rendering --json
  ```

  Expected: validation passes and the task list reports 12/12 complete.

- [ ] **Step 3: Archive the repair with spec updates**

  Run:

  ```bash
  openspec archive repair-chan-bi-overlap-rendering -y
  ```

  Expected: archive succeeds, the active directory is removed,
  `chan-bi-sequence-integrity` is created, and
  `frontend-live-kline-viewer` is updated.

- [ ] **Step 4: Validate all canonical specs**

  Run:

  ```bash
  openspec validate --specs --strict
  ```

  Expected: every canonical spec passes strict validation.

### Task 6: Update the production-roadmap checkpoint

**Files:**

- Modify:
  `openspec/changes/define-mist-production-roadmap/design.md`
- Modify:
  `openspec/changes/define-mist-production-roadmap/tasks.md`

**Interfaces:**

- Consumes: archived preview and repair changes plus their evidence.
- Produces: closed G0 and completed G1 task 1.1, with BigQMT and TDX realtime as
  the next executable G1 work.

- [ ] **Step 1: Record final dispositions**

  Update the design ledger so both Chan changes are `completed` and archived.
  Change roadmap task 1.1 to checked. Keep tasks 1.2-1.7 unchecked.

- [ ] **Step 2: Revalidate the roadmap**

  Run:

  ```bash
  openspec validate define-mist-production-roadmap --strict
  openspec list --json
  ```

  Expected: the roadmap validates; neither Chan change is active; the active
  execution backlog still includes `add-bigqmt-datasource-bridge` and
  `define-mist-production-roadmap`.

- [ ] **Step 3: Run the final scope and whitespace checks**

  Run in both repositories:

  ```bash
  git status --short --untracked-files=all
  git diff --check
  ```

  Expected: all changes are intentional and no whitespace error is reported.

- [ ] **Step 4: Stop at the no-commit checkpoint**

  Report exact verification totals, browser findings, archive paths, roadmap
  status, and the remaining G1 blockers. Do not stage or commit without separate
  user direction because both repositories began with concurrent changes.

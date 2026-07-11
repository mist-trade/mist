# BigQMT Windows Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine the current full-QMT bridge-owner state, collect real native
history evidence for every required period, and record the truthful status of
QMT realtime verification without enabling an unverified path.

**Architecture:** Use the clean `mist-deploy/master` workflow as a read/command
probe on the self-hosted Windows API runner. The workflow talks only to the
already deployed QMT datasource and its single-owner HTTP polling bridge; manual
full-QMT strategy registration remains outside automation.

**Tech Stack:** GitHub Actions, `gh`, Windows PowerShell, `pwsh-preview`, QMT
datasource `:9002`, and the full-QMT built-in Python bridge.

## Global Constraints

- Do not redeploy Docker, TDX, QMT datasource, or monitoring in response to a
  missing QMT bridge owner.
- Do not automate full-QMT strategy load, registration, deletion, or editor UI
  actions; the current contract requires these to remain manual.
- Treat `/health status=ok` and bridge-owner readiness as independent states.
- Task 7.4 passes only when all required history periods return `ok=true` from
  the native bridge with non-empty field/unit evidence; a workflow conclusion of
  `success` is not sufficient by itself.
- Task 7.5 passes only when a trading-session realtime probe actually executes
  and returns a valid native result. A weekend/out-of-session skip remains
  incomplete.
- Keep QMT realtime disabled or explicitly unverified until task 7.5 passes or a
  separate deferred child change owns it.
- Do not stage, commit, push, or change deployment refs in this plan.

## File Map

- `/Users/moyui/sean/mist/mist-deploy/.github/workflows/run-windows-qmt-runtime-smoke.yml`:
  existing workflow to dispatch.
- `/Users/moyui/sean/mist/mist-deploy/scripts/run-qmt-runtime-smoke.ps1`:
  existing live smoke implementation.
- `/Users/moyui/sean/mist/mist-deploy/scripts/test-qmt-runtime-smoke.ps1`:
  local wrapper contract test.
- `/Users/moyui/sean/mist/mist/openspec/changes/add-bigqmt-datasource-bridge/tasks.md`:
  mark only evidence-backed task completion.
- `/Users/moyui/sean/mist/mist/openspec/changes/add-bigqmt-datasource-bridge/evidence/2026-07-11-windows-qmt-smoke.md`:
  create the run ledger and structured matrix result.
- `/Users/moyui/sean/mist/mist/openspec/changes/define-mist-production-roadmap/tasks.md`:
  update G1.2 or G1.3 only after their child evidence is sufficient.

---

### Task 1: Verify the local workflow contract

**Files:**

- Read only:
  `.github/workflows/run-windows-qmt-runtime-smoke.yml`
- Read only:
  `scripts/run-qmt-runtime-smoke.ps1`
- Read only:
  `scripts/test-qmt-runtime-smoke.ps1`

**Interfaces:**

- Consumes: the current `mist-deploy/master` workflow and PowerShell wrapper.
- Produces: proof that the local workflow exposes and forwards all matrix and
  bridge-command controls before any remote dispatch.

- [ ] **Step 1: Run the focused QMT wrapper test**

  Run from `/Users/moyui/sean/mist/mist-deploy`:

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
  ```

  Expected: every assertion passes and the command ends with
  `QMT runtime smoke wrapper tests passed.`

- [ ] **Step 2: Run the shared workflow-config test**

  Run:

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-workflow-config.ps1
  ```

  Expected: exit code 0.

- [ ] **Step 3: Confirm the deploy worktree remains clean**

  Run:

  ```bash
  git status --short
  ```

  Expected: no output.

### Task 2: Dispatch the full-QMT history matrix and owner gate

**Files:**

- Create:
  `openspec/changes/add-bigqmt-datasource-bridge/evidence/2026-07-11-windows-qmt-smoke.md`

**Interfaces:**

- Consumes: GitHub workflow `run-windows-qmt-runtime-smoke.yml` on `master`.
- Produces: one immutable Actions run URL with QMT health, required history
  periods, field samples, bridge owner, native command, sector, and realtime
  skip/execute evidence.

- [ ] **Step 1: Dispatch one fully instrumented run**

  Run from `/Users/moyui/sean/mist/mist-deploy`:

  ```bash
  gh workflow run run-windows-qmt-runtime-smoke.yml --ref master \
    -f datasource_root='F:\quant\MistAPI\datasource' \
    -f base_url='http://127.0.0.1:9002' \
    -f stock_code='000001.SZ' \
    -f period='1d' \
    -f count='2' \
    -f timeout_seconds='45' \
    -f include_raw_bars='false' \
    -f include_bars_matrix='true' \
    -f matrix_periods='1d,1m,3m,5m,15m,30m,1h,1w,1mon,1q,1hy,1y' \
    -f include_field_matrix='true' \
    -f include_dividend_matrix='false' \
    -f include_time_window_matrix='false' \
    -f dividend_types='none,front,back,front_ratio,back_ratio' \
    -f include_bridge_commands='true' \
    -f include_full_tick='true' \
    -f include_sector_list='true'
  ```

  Expected: GitHub accepts the dispatch on `master`.

- [ ] **Step 2: Identify and monitor the dispatched run**

  Use `gh run list --workflow run-windows-qmt-runtime-smoke.yml` to identify the
  new run by creation time and `master` SHA. Poll its status at short intervals;
  do not use a blocking wait longer than 60 seconds.

  Expected: the run reaches a terminal conclusion and exposes a stable run URL.

- [ ] **Step 3: Extract structured evidence from the run log**

  Read the complete log and record:

  - QMT `/health` status and instance;
  - bridge `ownerId`, or the exact missing-owner failure;
  - every `QMT_BARS_MATRIX` line for
    `1d/1m/3m/5m/15m/30m/1h/1w/1mon/1q/1hy/1y`;
  - each period's `ok`, `source`, fields, row count, first index, and sample;
  - official-field probes for `1d` and `1m`;
  - bridge health and `get_market_data_ex` command results;
  - sector-list command result;
  - whether `get_full_tick` executed or was skipped outside trading session.

### Task 3: Apply evidence-backed OpenSpec dispositions

**Files:**

- Modify when proven:
  `openspec/changes/add-bigqmt-datasource-bridge/tasks.md`
- Modify when proven:
  `openspec/changes/define-mist-production-roadmap/tasks.md`
- Create or update:
  `openspec/changes/add-bigqmt-datasource-bridge/evidence/2026-07-11-windows-qmt-smoke.md`

**Interfaces:**

- Consumes: the terminal Actions run and parsed evidence.
- Produces: truthful completion, blocked, or deferred status for tasks 7.4 and
  7.5 plus matching G1 roadmap state.

- [ ] **Step 1: Decide task 7.4 from period evidence**

  Check 7.4 only if all twelve required periods returned successful native
  `marketData` with field/sample evidence. Otherwise leave it unchecked and
  record the failing periods and blocker.

- [ ] **Step 2: Decide task 7.5 from realtime evidence**

  Check 7.5 only if `get_full_tick` actually ran during a supported trading
  session and returned a successful native result. If it was skipped on the
  weekend or outside session, leave it unchecked and record the exact reopening
  condition.

- [ ] **Step 3: Handle a missing bridge owner without redeploying**

  If the run reports `QMT_BRIDGE_OWNER_MISSING` or no `ownerId`, record:

  - QMT service health remains independent and may still be green;
  - the full-QMT client must manually load/register/start the current
    `mist_qmt_bridge.py` with the editor separate-process option off;
  - the workflow should be rerun after owner registration;
  - Docker, datasource, TDX, and monitoring redeploys are not the first remedy.

- [ ] **Step 4: Validate the resulting OpenSpec state**

  Run from `/Users/moyui/sean/mist/mist`:

  ```bash
  openspec validate add-bigqmt-datasource-bridge --strict
  openspec validate define-mist-production-roadmap --strict
  openspec list --json
  git diff --check
  ```

  Expected: both changes validate, active progress matches the evidence, and no
  whitespace error is reported.

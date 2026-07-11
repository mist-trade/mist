# QMT Realtime Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strict, evidence-producing full-QMT realtime snapshot smoke
without enabling a QMT product realtime path.

**Architecture:** Keep `ContextInfo.get_full_tick` behind the existing
single-owner HTTP polling bridge. Extend the Windows operator smoke with a
strict mode that validates the native symbol payload and freshness, then move
the remaining realtime evidence out of the historical BigQMT change into a
focused OpenSpec child.

**Tech Stack:** OpenSpec CLI, GitHub Actions, `gh`, Windows PowerShell 5.1,
`pwsh-preview`, QMT datasource `:9002`, and the full-QMT built-in Python 3.6
runtime.

## Global Constraints

- Do not expose `/qmt/bridge/*` as a backend or frontend product API.
- Do not implement or enable QMT WebSocket collection, continuous subscription,
  persistence, alerts, account access, or trading behavior in this change.
- Keep QMT historical collection on `:9002/v1/bars/query` unchanged.
- A bridge command completing is not sufficient: strict mode requires a fresh,
  non-empty native snapshot for `000001.SZ`.
- Optional mode may skip `get_full_tick` outside the session; strict mode must
  fail instead of reporting a successful realtime verification.
- Treat QMT `/health` and bridge-owner readiness as separate states. Do not
  redeploy Docker or datasource services merely because the owner is absent.
- Keep the existing full-QMT strategy load/register/delete workflow manual.
- Use `pwsh-preview`, not `pwsh`, for Mac-side PowerShell verification.
- Preserve PowerShell 5.1 compatibility on the Windows runner and Python 3.6
  compatibility in the built-in QMT runtime.
- Do not stage, commit, push, or change deployment refs while executing this
  plan.

## File Map

- `/Users/moyui/sean/mist/mist/openspec/changes/verify-qmt-realtime-readiness/`:
  focused child proposal, design, requirements, tasks, and live evidence.
- `/Users/moyui/sean/mist/mist-deploy/scripts/run-qmt-runtime-smoke.ps1`:
  strict-session decision, native payload validation, and structured summary.
- `/Users/moyui/sean/mist/mist-deploy/scripts/test-qmt-runtime-smoke.ps1`:
  executable unit/contract checks for strict mode.
- `/Users/moyui/sean/mist/mist-deploy/.github/workflows/run-windows-qmt-runtime-smoke.yml`:
  operator input and Windows parameter forwarding.
- `/Users/moyui/sean/mist/mist/openspec/changes/add-bigqmt-datasource-bridge/`:
  transfer task 7.5 to the child, validate, and archive the history change.
- `/Users/moyui/sean/mist/mist/openspec/changes/define-mist-production-roadmap/`:
  register the new child and preserve a separate open live-evidence item.
- `/Users/moyui/sean/mist/mist/docs/superpowers/specs/2026-07-11-qmt-realtime-readiness-design.md`:
  approved design and acceptance contract.

---

### Task 1: Create the focused OpenSpec child

**Files:**

- Create: `openspec/changes/verify-qmt-realtime-readiness/.openspec.yaml`
- Create: `openspec/changes/verify-qmt-realtime-readiness/proposal.md`
- Create: `openspec/changes/verify-qmt-realtime-readiness/design.md`
- Create: `openspec/changes/verify-qmt-realtime-readiness/tasks.md`
- Create:
  `openspec/changes/verify-qmt-realtime-readiness/specs/qmt-realtime-readiness/spec.md`

**Interfaces:**

- Consumes: the approved design document and current BigQMT task 7.5.
- Produces: an apply-ready OpenSpec change defining strict native readiness,
  product-path non-enablement, evidence, and reopening conditions.

- [ ] **Step 1: Scaffold the change through `openspec-propose`**

  Create the change named `verify-qmt-realtime-readiness`, inspect its artifact
  order with `openspec status --change verify-qmt-realtime-readiness --json`,
  and follow each artifact's generated instructions.

  Expected: proposal, design, spec, and tasks are all `done`, and the change is
  apply-ready.

- [ ] **Step 2: Encode the exact requirements**

  The new capability spec must contain these requirements and scenarios:

  ```markdown
  ### Requirement: Strict QMT realtime smoke validates a fresh native snapshot

  The readiness workflow SHALL treat QMT realtime as verified only when a
  trading-session `get_full_tick` command returns a fresh, valid native symbol
  payload through the registered full-QMT bridge owner.

  #### Scenario: Strict live probe succeeds

  - **WHEN** strict mode runs during a supported trading session
  - **AND** `000001.SZ` contains `timetag`, `lastPrice`, `open`, `high`, `low`,
    `lastClose`, `volume`, and `amount`
  - **AND** the freshness date matches the current Beijing trading date
  - **THEN** the workflow SHALL emit `QMT_REALTIME_SMOKE` with `result=passed`

  #### Scenario: Optional probe runs outside the session

  - **WHEN** optional mode runs outside the supported trading session
  - **THEN** the workflow MAY emit `result=skipped`
  - **AND** the skip MUST NOT count as realtime verification

  #### Scenario: Strict probe runs outside the session

  - **WHEN** strict mode runs outside the supported trading session
  - **THEN** the workflow SHALL fail with
    `QMT_REALTIME_OUTSIDE_TRADING_SESSION`

  #### Scenario: Native payload is stale or invalid

  - **WHEN** the symbol is absent, required fields are missing or invalid, or
    `timetag` is not from the current Beijing trading date
  - **THEN** the workflow SHALL fail the readiness gate

  ### Requirement: Native readiness does not enable product realtime

  A successful native snapshot smoke SHALL NOT expose the bridge as a product
  API or enable QMT streaming collection.

  #### Scenario: Native readiness evidence passes

  - **WHEN** a strict native `get_full_tick` smoke passes
  - **THEN** QMT backend streaming SHALL remain disabled
  - **AND** a separate approved implementation change SHALL be required before
    product realtime is enabled

  ### Requirement: Readiness evidence is reproducible

  The child change SHALL record the workflow URL, exact SHA, Beijing probe time,
  owner ID, command ID, observed field names, freshness, and sanitized sample.
  ```

- [ ] **Step 3: Define implementation tasks without claiming live success**

  `tasks.md` must separately track:

  1. OpenSpec/design completion;
  2. wrapper validation tests and implementation;
  3. workflow input tests and implementation;
  4. BigQMT/roadmap ownership transfer;
  5. local regression verification;
  6. strict trading-session Windows run;
  7. live evidence and final disposition.

  Keep the final two tasks unchecked until a real trading-session run passes.

- [ ] **Step 4: Validate the child**

  Run from `/Users/moyui/sean/mist/mist`:

  ```bash
  openspec validate verify-qmt-realtime-readiness --strict
  openspec status --change verify-qmt-realtime-readiness
  ```

  Expected: strict validation passes and all implementation-required artifacts
  are complete.

### Task 2: Add strict native tick validation with TDD

**Files:**

- Modify: `scripts/test-qmt-runtime-smoke.ps1`
- Modify: `scripts/run-qmt-runtime-smoke.ps1`

**Interfaces:**

- Consumes: bridge command result shape
  `{ commandId, ok, result: { "000001.SZ": tick } }`.
- Produces:
  `Resolve-QmtRealtimeProbeDisposition(bool,bool) -> "run"|"skip"`,
  `New-QmtRealtimeSummary(...) -> PSCustomObject`, and
  `QMT_REALTIME_SMOKE` followed by one compact JSON object.

- [ ] **Step 1: Add the failing test helpers and valid fixture**

  Add this helper to `test-qmt-runtime-smoke.ps1`:

  ```powershell
  function Assert-ThrowsContains {
      param(
          [string]$Name,
          [string]$Needle,
          [scriptblock]$Action
      )

      $thrown = $false
      $message = ""
      try {
          & $Action
      }
      catch {
          $thrown = $true
          $message = $_.Exception.Message
      }
      if (-not $thrown -or -not $message.Contains($Needle)) {
          throw "$Name failed. Expected error containing <$Needle>, got <$message>."
      }
      Write-Host "  [PASS] $Name" -ForegroundColor Green
  }
  ```

  Add a native fixture and assertions:

  ```powershell
  $validRealtimeResult = [pscustomobject]@{
      "000001.SZ" = [pscustomobject]@{
          timetag = "20260710145900"
          lastPrice = 10.53
          open = 10.44
          high = 10.58
          low = 10.42
          lastClose = 10.47
          volume = 123456
          amount = 1298765.5
      }
  }

  Assert-Equal "optional realtime probe skips outside session" "skip" `
      (Resolve-QmtRealtimeProbeDisposition -InTradingSession $false -RequireRealtimeTick $false)
  Assert-Equal "realtime probe runs in session" "run" `
      (Resolve-QmtRealtimeProbeDisposition -InTradingSession $true -RequireRealtimeTick $true)
  Assert-ThrowsContains "strict realtime probe rejects outside session" `
      "QMT_REALTIME_OUTSIDE_TRADING_SESSION" {
          Resolve-QmtRealtimeProbeDisposition -InTradingSession $false -RequireRealtimeTick $true
      }

  $realtimeSummary = New-QmtRealtimeSummary `
      -StockCode "000001.SZ" `
      -OwnerId "bigqmt-test" `
      -CommandId "command-test" `
      -NativeResult $validRealtimeResult `
      -Now ([datetime]"2026-07-10T15:00:00")
  Assert-Equal "realtime summary passes" "passed" $realtimeSummary.result
  Assert-Equal "realtime summary stock code" "000001.SZ" $realtimeSummary.stockCode
  Assert-Equal "realtime summary freshness" "2026-07-10T14:59:00.0000000" $realtimeSummary.freshness
  Assert-Equal "realtime summary last price" 10.53 $realtimeSummary.sample.lastPrice
  ```

- [ ] **Step 2: Add failing invalid-payload tests**

  Add explicit assertions for missing symbols, missing fields, negative turnover,
  non-finite prices, and stale freshness. Each must assert its stable code:

  ```powershell
  Assert-ThrowsContains "realtime summary rejects missing symbol" `
      "QMT_REALTIME_SYMBOL_MISSING" {
          New-QmtRealtimeSummary -StockCode "000001.SZ" -OwnerId "owner" `
              -CommandId "command" -NativeResult ([pscustomobject]@{}) `
              -Now ([datetime]"2026-07-10T15:00:00")
      }

  $staleRealtimeResult = [pscustomobject]@{
      "000001.SZ" = [pscustomobject]@{
          timetag = "20260709145900"
          lastPrice = 10.53
          open = 10.44
          high = 10.58
          low = 10.42
          lastClose = 10.47
          volume = 123456
          amount = 1298765.5
      }
  }
  Assert-ThrowsContains "realtime summary rejects stale tick" `
      "QMT_REALTIME_STALE" {
          New-QmtRealtimeSummary -StockCode "000001.SZ" -OwnerId "owner" `
              -CommandId "command" -NativeResult $staleRealtimeResult `
              -Now ([datetime]"2026-07-10T15:00:00")
      }
  ```

  Build equivalent fixtures for:

  - missing `amount` -> `QMT_REALTIME_FIELD_MISSING`;
  - `lastPrice=[double]::NaN` -> `QMT_REALTIME_FIELD_INVALID`;
  - `volume=-1` -> `QMT_REALTIME_FIELD_INVALID`.

- [ ] **Step 3: Run the test and verify the red state**

  Run from `/Users/moyui/sean/mist/mist-deploy`:

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
  ```

  Expected: FAIL because `Resolve-QmtRealtimeProbeDisposition` and
  `New-QmtRealtimeSummary` do not exist.

- [ ] **Step 4: Implement the strict parameter and validation helpers**

  Add `[bool]$RequireRealtimeTick = $false` beside `IncludeFullTick` in the
  wrapper parameter list. Implement these helpers before bridge execution:

  ```powershell
  function Resolve-QmtRealtimeProbeDisposition {
      param(
          [bool]$InTradingSession,
          [bool]$RequireRealtimeTick
      )

      if ($InTradingSession) {
          return "run"
      }
      if ($RequireRealtimeTick) {
          throw "QMT_REALTIME_OUTSIDE_TRADING_SESSION: strict realtime smoke requires a supported market session"
      }
      return "skip"
  }

  function Get-QmtObjectValue {
      param([object]$Object, [string]$Name)

      if ($null -eq $Object) { return $null }
      if ($Object -is [System.Collections.IDictionary]) {
          if ($Object.Contains($Name)) { return $Object[$Name] }
          return $null
      }
      $property = $Object.PSObject.Properties[$Name]
      if ($null -eq $property) { return $null }
      return $property.Value
  }

  function Get-QmtObjectNames {
      param([object]$Object)

      if ($null -eq $Object) { return @() }
      if ($Object -is [System.Collections.IDictionary]) {
          return @($Object.Keys | ForEach-Object { [string]$_ })
      }
      return @($Object.PSObject.Properties.Name)
  }

  function ConvertTo-QmtFiniteDouble {
      param([object]$Value, [string]$Field)

      try {
          $number = [Convert]::ToDouble(
              $Value,
              [Globalization.CultureInfo]::InvariantCulture
          )
      }
      catch {
          throw "QMT_REALTIME_FIELD_INVALID: $Field is not numeric"
      }
      if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) {
          throw "QMT_REALTIME_FIELD_INVALID: $Field is not finite"
      }
      return $number
  }

  function ConvertTo-QmtRealtimeTimestamp {
      param([object]$Value)

      $text = [string]$Value
      $formats = @(
          "yyyyMMddHHmmss",
          "yyyyMMdd HH:mm:ss",
          "yyyyMMdd HH:mm:ss.fff",
          "yyyy-MM-dd HH:mm:ss",
          "yyyy-MM-dd HH:mm:ss.fff",
          "yyyy-MM-ddTHH:mm:ss"
      )
      foreach ($format in $formats) {
          $parsed = [datetime]::MinValue
          if ([datetime]::TryParseExact(
              $text,
              $format,
              [Globalization.CultureInfo]::InvariantCulture,
              [Globalization.DateTimeStyles]::None,
              [ref]$parsed
          )) {
              return $parsed
          }
      }
      throw "QMT_REALTIME_FRESHNESS_INVALID: timetag=$text"
  }
  ```

  Implement `New-QmtRealtimeSummary` with the exact contract:

  ```powershell
  function New-QmtRealtimeSummary {
      param(
          [string]$StockCode,
          [string]$OwnerId,
          [string]$CommandId,
          [object]$NativeResult,
          [datetime]$Now = (Get-Date)
      )

      $tick = Get-QmtObjectValue -Object $NativeResult -Name $StockCode
      if ($null -eq $tick) {
          throw "QMT_REALTIME_SYMBOL_MISSING: $StockCode"
      }

      $requiredFields = @(
          "timetag", "lastPrice", "open", "high", "low", "lastClose",
          "volume", "amount"
      )
      foreach ($field in $requiredFields) {
          if ($null -eq (Get-QmtObjectValue -Object $tick -Name $field)) {
              throw "QMT_REALTIME_FIELD_MISSING: $field"
          }
      }

      $sample = [ordered]@{}
      foreach ($field in @("lastPrice", "open", "high", "low", "lastClose", "volume", "amount")) {
          $sample[$field] = ConvertTo-QmtFiniteDouble `
              -Value (Get-QmtObjectValue -Object $tick -Name $field) `
              -Field $field
      }
      foreach ($field in @("lastPrice", "open", "high", "low", "lastClose")) {
          if ($sample[$field] -le 0) {
              throw "QMT_REALTIME_FIELD_INVALID: $field must be positive"
          }
      }
      foreach ($field in @("volume", "amount")) {
          if ($sample[$field] -lt 0) {
              throw "QMT_REALTIME_FIELD_INVALID: $field must be non-negative"
          }
      }

      $freshness = ConvertTo-QmtRealtimeTimestamp `
          -Value (Get-QmtObjectValue -Object $tick -Name "timetag")
      if ($freshness.Date -ne $Now.Date) {
          throw "QMT_REALTIME_STALE: timetag=$($freshness.ToString('o')) now=$($Now.ToString('o'))"
      }

      return [pscustomobject][ordered]@{
          result = "passed"
          reason = "LIVE_TICK_VALID"
          beijingTime = $Now.ToString("o")
          stockCode = $StockCode
          ownerId = $OwnerId
          commandId = $CommandId
          fields = @(Get-QmtObjectNames -Object $tick)
          freshness = $freshness.ToString("o")
          sample = [pscustomobject]$sample
      }
  }

  function Write-QmtRealtimeSummary {
      param([object]$Summary)
      $json = $Summary | ConvertTo-Json -Depth 20 -Compress
      Write-Host "QMT_REALTIME_SMOKE $json"
  }
  ```

- [ ] **Step 5: Return and validate the full-tick bridge result**

  Change `Invoke-QmtBridgeCommandSmoke` to return the command ID and native
  result after logging completion:

  ```powershell
  return [pscustomobject]@{
      commandId = [string]$queued.commandId
      result = $result.result
  }
  ```

  Keep health and history calls quiet with `| Out-Null`. Store the owner ID,
  resolve the realtime disposition, and for the `run` path call
  `New-QmtRealtimeSummary`. Emit `result=skipped` for optional mode. Catch an
  invalid payload, emit `result=failed` with reason `INVALID_NATIVE_TICK`, then
  rethrow so the workflow fails.

- [ ] **Step 6: Run the focused test and verify green**

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
  ```

  Expected: all new validation cases pass and the command ends with
  `QMT runtime smoke wrapper tests passed.`

### Task 3: Plumb strict mode through GitHub Actions

**Files:**

- Modify: `scripts/test-qmt-runtime-smoke.ps1`
- Modify: `.github/workflows/run-windows-qmt-runtime-smoke.yml`

**Interfaces:**

- Consumes: workflow input `require_realtime_tick: boolean`.
- Produces: environment variable `MIST_QMT_REQUIRE_REALTIME_TICK` and wrapper
  argument `-RequireRealtimeTick $true` or `-RequireRealtimeTick $false`.

- [ ] **Step 1: Add failing workflow assertions**

  Add these assertions before the final success message:

  ```powershell
  Assert-Contains "workflow accepts strict realtime switch" "require_realtime_tick:" $workflow
  Assert-Contains "workflow maps strict realtime switch" "MIST_QMT_REQUIRE_REALTIME_TICK:" $workflow
  Assert-Contains "workflow parses strict realtime switch" '$requireRealtimeTick = $env:MIST_QMT_REQUIRE_REALTIME_TICK -eq "true"' $workflow
  Assert-Contains "workflow forwards strict realtime switch" "-RequireRealtimeTick `$requireRealtimeTick" $workflow
  ```

- [ ] **Step 2: Run the test and verify the red state**

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
  ```

  Expected: FAIL because `require_realtime_tick` is absent from the workflow.

- [ ] **Step 3: Add the workflow input and forwarding**

  Add beside `include_full_tick`:

  ```yaml
  require_realtime_tick:
    description: Fail unless get_full_tick returns a fresh valid native snapshot
    required: true
    default: false
    type: boolean
  ```

  Map, parse, and forward it:

  ```yaml
  MIST_QMT_REQUIRE_REALTIME_TICK: ${{ inputs.require_realtime_tick }}
  ```

  ```powershell
  $requireRealtimeTick = $env:MIST_QMT_REQUIRE_REALTIME_TICK -eq "true"
  ```

  ```powershell
  -RequireRealtimeTick $requireRealtimeTick `
  ```

- [ ] **Step 4: Run focused and shared workflow tests**

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
  pwsh-preview -NoLogo -NoProfile -File scripts/test-workflow-config.ps1
  ```

  Expected: both commands exit 0.

### Task 4: Transfer ownership and archive the history change

**Files:**

- Modify: `openspec/changes/add-bigqmt-datasource-bridge/tasks.md`
- Modify: `openspec/changes/add-bigqmt-datasource-bridge/proposal.md`
- Modify: `openspec/changes/add-bigqmt-datasource-bridge/design.md`
- Modify: `openspec/changes/define-mist-production-roadmap/tasks.md`
- Modify: `openspec/changes/define-mist-production-roadmap/design.md`
- Archive: `openspec/changes/add-bigqmt-datasource-bridge/`

**Interfaces:**

- Consumes: apply-ready `verify-qmt-realtime-readiness` and completed history
  evidence.
- Produces: an archived 34/34 BigQMT history change and an explicit active
  realtime child without claiming the smoke passed.

- [ ] **Step 1: Rewrite BigQMT task 7.5 as an ownership transfer**

  Use this exact task text:

  ```markdown
  - [x] 7.5 Transfer QMT realtime readiness verification to
        `verify-qmt-realtime-readiness`; keep product realtime disabled and do
        not treat the transfer as live-smoke completion.
  ```

  Update proposal/design language so the parent owns native history and the
  child owns strict realtime evidence.

- [ ] **Step 2: Make the roadmap split explicit**

  Replace G1.3 with a completed split task and add a separate open child result:

  ```markdown
  - [x] 1.3 Split QMT realtime readiness into
        `verify-qmt-realtime-readiness` while product realtime remains disabled
        and explicitly unverified.
  - [ ] 1.3a Complete the child with strict trading-session evidence, or record
        an accepted deferred disposition with production impact and reopening
        condition.
  ```

  Add the child to the roadmap ledger as active and blocked on a trading-session
  Windows run.

- [ ] **Step 3: Validate both active changes before archive**

  ```bash
  openspec validate add-bigqmt-datasource-bridge --strict
  openspec validate verify-qmt-realtime-readiness --strict
  openspec validate define-mist-production-roadmap --strict
  openspec list --json
  ```

  Expected: BigQMT is 34/34; the child is active with its live tasks open; the
  roadmap records the split without recording a realtime pass.

- [ ] **Step 4: Archive BigQMT history**

  ```bash
  openspec archive add-bigqmt-datasource-bridge -y
  ```

  Expected: canonical specs are updated, the parent moves under
  `openspec/changes/archive/`, and the CLI reports success.

- [ ] **Step 5: Revalidate canonical and active OpenSpec state**

  ```bash
  openspec validate --specs --strict
  openspec validate verify-qmt-realtime-readiness --strict
  openspec validate define-mist-production-roadmap --strict
  openspec list --json
  ```

  Expected: strict validation passes and only the roadmap plus realtime child
  remain active.

### Task 5: Run the complete local verification gate

**Files:**

- Modify: `openspec/changes/verify-qmt-realtime-readiness/tasks.md`

**Interfaces:**

- Consumes: strict wrapper/workflow implementation and archived history change.
- Produces: local regression evidence and truthful child progress before any
  live dispatch.

- [ ] **Step 1: Run PowerShell validation**

  From `/Users/moyui/sean/mist/mist-deploy`:

  ```bash
  pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
  pwsh-preview -NoLogo -NoProfile -File scripts/test-workflow-config.ps1
  git diff --check
  ```

  Expected: both test commands pass and diff check emits no output.

- [ ] **Step 2: Run OpenSpec validation**

  From `/Users/moyui/sean/mist/mist`:

  ```bash
  openspec validate --specs --strict
  openspec validate verify-qmt-realtime-readiness --strict
  openspec validate define-mist-production-roadmap --strict
  openspec list --json
  git diff --check
  ```

  Expected: every command passes. The child implementation/local-test tasks are
  checked; trading-session smoke and final evidence remain unchecked.

- [ ] **Step 3: Confirm scope boundaries in the diff**

  Verify that no QMT backend WebSocket provider, datasource product route,
  persistence path, account API, trading API, strategy UI automation, or
  deployment ref changed.

### Task 6: Run the strict trading-session smoke and close the child

**Files:**

- Create after a passing run:
  `openspec/changes/verify-qmt-realtime-readiness/evidence/2026-07-13-windows-qmt-realtime-smoke.md`
- Modify after a passing run:
  `openspec/changes/verify-qmt-realtime-readiness/tasks.md`
- Modify after a passing run:
  `openspec/changes/define-mist-production-roadmap/tasks.md`
- Modify after a passing run:
  `openspec/changes/define-mist-production-roadmap/design.md`

**Interfaces:**

- Consumes: deployed `mist-deploy/master` containing strict mode, an eligible
  Beijing trading session, healthy QMT `:9002`, and a registered bridge owner.
- Produces: immutable live evidence or a truthful blocked result. It never
  enables product realtime.

- [ ] **Step 1: Confirm the remote ref contains strict mode**

  This requires the strict workflow implementation to be available on the
  selected remote ref. Do not push under this plan; use an already published ref
  supplied through the normal repository workflow.

  Confirm the selected SHA contains `require_realtime_tick` before dispatch.

- [ ] **Step 2: Dispatch during a real China trading session**

  Run on a supported trading weekday between `09:30-11:30` or `13:00-15:00`
  Asia/Shanghai:

  ```bash
  gh workflow run run-windows-qmt-runtime-smoke.yml --ref master \
    -f datasource_root='F:\quant\MistAPI\datasource' \
    -f base_url='http://127.0.0.1:9002' \
    -f stock_code='000001.SZ' \
    -f period='1d' \
    -f count='1' \
    -f timeout_seconds='45' \
    -f include_raw_bars='false' \
    -f include_bars_matrix='false' \
    -f matrix_periods='1d' \
    -f include_field_matrix='false' \
    -f include_dividend_matrix='false' \
    -f include_time_window_matrix='false' \
    -f dividend_types='none' \
    -f include_bridge_commands='true' \
    -f include_full_tick='true' \
    -f require_realtime_tick='true' \
    -f include_sector_list='false'
  ```

  Expected: dispatch is accepted. A run outside the session must fail rather
  than count as evidence.

- [ ] **Step 3: Monitor and inspect the structured result**

  Poll in intervals shorter than 60 seconds. Resolve the newest run ID and fetch
  the complete log with a writable cache:

  ```bash
  latest_database_id=$(gh run list --workflow run-windows-qmt-runtime-smoke.yml --limit 1 --json databaseId --jq '.[0].databaseId')
  env XDG_CACHE_HOME=/tmp/gh-cache gh run view "$latest_database_id" --log
  ```

  The run passes the child gate only if `QMT_REALTIME_SMOKE` contains:

  - `result="passed"` and `reason="LIVE_TICK_VALID"`;
  - `stockCode="000001.SZ"`;
  - non-empty `ownerId` and `commandId`;
  - all required native fields;
  - a freshness date matching the run's Beijing date;
  - positive quote values and non-negative volume/amount.

- [ ] **Step 4: Record evidence only from the terminal run**

  Create the evidence file using the actual terminal run URL and SHA. Include
  the exact structured summary, local verification commands, bridge readiness,
  sanitized sample, and a statement that product realtime remains disabled.

  If owner registration, market timing, freshness, or payload validation fails,
  record the blocker instead and leave the child live tasks unchecked.

- [ ] **Step 5: Close and archive only after a passing live run**

  After a pass, check the child's live/evidence tasks, complete roadmap task
  1.3a, and run:

  ```bash
  openspec validate verify-qmt-realtime-readiness --strict
  openspec validate define-mist-production-roadmap --strict
  openspec archive verify-qmt-realtime-readiness -y
  openspec validate --specs --strict
  openspec list --json
  git diff --check
  ```

  Expected: the child is archived with evidence, the roadmap records native
  snapshot readiness, and no artifact claims that a QMT product realtime path
  was enabled.

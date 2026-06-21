# Datasource Service Supervision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows datasource services install idempotently through NSSM and stop unbounded restart loops when TDX/QMT repeatedly fail.

**Architecture:** Keep `mist-datasource/scripts/deploy_windows.ps1` as the public datasource deployment entrypoint, but move reusable PowerShell behavior into datasource-owned helpers. NSSM starts a small `service-runner.ps1` wrapper, which launches uvicorn, tracks early crashes, and exits with sentinel code `88` when retrying should stop.

**Tech Stack:** PowerShell 7 compatible scripts, NSSM, FastAPI/uvicorn launched from `.venv\Scripts\python.exe`, OpenSpec in `mist`.

---

## File Structure

- Modify `mist-datasource/scripts/deploy_windows.ps1`: keep CLI shape, source helper scripts, replace duplicated service registration and health polling with helper calls.
- Create `mist-datasource/scripts/windows-common.ps1`: console helpers, `.env` parsing, NSSM resolution, Python/uv resolution, HTTP health wait, safe process start test helper.
- Create `mist-datasource/scripts/service-common.ps1`: service definitions, ownership detection, idempotent NSSM install/update, restart policy configuration.
- Create `mist-datasource/scripts/service-runner.ps1`: NSSM runtime wrapper for `tdx` and `qmt`, crash state tracking, sentinel stop behavior.
- Create `mist-datasource/scripts/test_windows_scripts.ps1`: lightweight PowerShell tests for helper behavior and runner crash-state behavior.
- Modify `mist/deploy/windows/install-all.ps1`: stop running datasource preflight separately; call the datasource deployment entrypoint as the SDK validation owner.
- Modify `mist/deploy/windows/README-Windows.md`: document datasource service reconciliation, delayed restart, crash-loop stop, and reset guidance.
- Modify `mist/openspec/changes/package-windows-api-appliance/tasks.md`: mark implementation tasks complete only after verification.

## Task 1: Datasource Common Helpers

**Files:**
- Create: `mist-datasource/scripts/windows-common.ps1`
- Create: `mist-datasource/scripts/test_windows_scripts.ps1`

- [ ] **Step 1: Write failing helper tests**

Create `scripts/test_windows_scripts.ps1` with assertions for:

```powershell
. "$PSScriptRoot\windows-common.ps1"

Assert-Equal "env parsing trims quotes" "D:\tdx\PYPlugins\user" (Get-EnvValue "TDX_SDK_PATH=`"D:\tdx\PYPlugins\user`"" "TDX_SDK_PATH")
Assert-Equal "blank env returns empty string" "" (Get-EnvValue "APP_ENV=production" "QMT_SDK_PATH")
Assert-Equal "nssm fallback resolves packaged path" (Join-Path $ProjectDir "..\nssm\nssm.exe" | Resolve-FullPath) (Resolve-NssmExe -ProjectDir $ProjectDir -PreferPathLookup:$false)
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: FAIL because `windows-common.ps1` does not exist.

- [ ] **Step 3: Implement `windows-common.ps1`**

Implement:

```powershell
function Write-Step($msg)
function Write-Ok($msg)
function Write-Warn($msg)
function Write-Fail($msg)
function Resolve-FullPath([string]$Path)
function Get-EnvValue([string]$Content, [string]$Name)
function Resolve-NssmExe([string]$ProjectDir, [switch]$PreferPathLookup)
function Wait-HttpHealth([string]$Name, [string]$Url, [int]$Attempts, [int]$DelaySeconds, [int]$TimeoutSeconds)
function Stop-ProcessTreeBestEffort([System.Diagnostics.Process]$Process)
```

`Resolve-NssmExe` must search PATH, `..\nssm\nssm.exe`, and `nssm\nssm.exe`.

- [ ] **Step 4: Run helper tests to verify GREEN**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: PASS for helper tests.

## Task 2: Idempotent NSSM Service Common

**Files:**
- Create: `mist-datasource/scripts/service-common.ps1`
- Modify: `mist-datasource/scripts/test_windows_scripts.ps1`

- [ ] **Step 1: Add failing service definition tests**

Extend `test_windows_scripts.ps1` to load `service-common.ps1` and assert:

```powershell
$tdx = New-DatasourceServiceDefinition -Instance tdx -ProjectDir $ProjectDir -LogsDir (Join-Path $ProjectDir "logs")
Assert-Equal "tdx service name" "MistTDX" $tdx.ServiceName
Assert-Match "tdx runner args" $tdx.Parameters "service-runner.ps1"
Assert-Match "tdx runner instance" $tdx.Parameters "-Instance tdx"
Assert-Equal "tdx stdout log" (Join-Path $ProjectDir "logs\tdx-stdout.log") $tdx.Stdout
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: FAIL because `service-common.ps1` does not exist.

- [ ] **Step 3: Implement service-common.ps1**

Implement:

```powershell
function New-DatasourceServiceDefinition([ValidateSet("tdx","qmt")]$Instance, [string]$ProjectDir, [string]$LogsDir)
function Test-DatasourceServiceOwnedByProject([string]$NssmExe, [string]$ServiceName, [string]$ProjectDir)
function Set-NssmValue([string]$NssmExe, [string]$ServiceName, [string]$Name, [string]$Value)
function Ensure-DatasourceNssmService([string]$NssmExe, [hashtable]$Definition)
function Start-DatasourceNssmService([string]$NssmExe, [string]$ServiceName)
```

`Ensure-DatasourceNssmService` must install missing services, update owned services, and throw if an existing service is not owned by this datasource package.

- [ ] **Step 4: Run service helper tests**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: PASS for definition and pure helper tests.

## Task 3: Datasource Service Runner

**Files:**
- Create: `mist-datasource/scripts/service-runner.ps1`
- Modify: `mist-datasource/scripts/test_windows_scripts.ps1`

- [ ] **Step 1: Add failing crash-state tests**

Extend `test_windows_scripts.ps1` to call runner helper functions and assert:

```powershell
. "$PSScriptRoot\service-runner.ps1" -LoadOnly
$statePath = Join-Path $TestRoot "service-runner-tdx-state.json"
Add-CrashRecord -StateFile $statePath -Now ([datetime]"2026-06-22T10:00:00Z") -WindowMinutes 10
Add-CrashRecord -StateFile $statePath -Now ([datetime]"2026-06-22T10:01:00Z") -WindowMinutes 10
Assert-Equal "crash count is retained" 2 (Get-CrashCount -StateFile $statePath -Now ([datetime]"2026-06-22T10:02:00Z") -WindowMinutes 10)
Clear-CrashState -StateFile $statePath
Assert-Equal "crash state clears" 0 (Get-CrashCount -StateFile $statePath -Now ([datetime]"2026-06-22T10:03:00Z") -WindowMinutes 10)
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: FAIL because `service-runner.ps1` does not exist.

- [ ] **Step 3: Implement service-runner.ps1**

Implement parameters:

```powershell
param(
    [ValidateSet("tdx", "qmt")][string]$Instance,
    [switch]$LoadOnly,
    [int]$StableRunSeconds = 60,
    [int]$CrashWindowMinutes = 10,
    [int]$MaxCrashes = 5,
    [int]$SentinelExitCode = 88
)
```

When not `-LoadOnly`, resolve `.venv\Scripts\python.exe`, launch uvicorn for the selected instance on localhost, wait for exit, reset state after stable runs, record early failures, and exit `88` when the crash count reaches the limit.

- [ ] **Step 4: Run runner tests**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: PASS.

## Task 4: Refactor Datasource Deploy Script

**Files:**
- Modify: `mist-datasource/scripts/deploy_windows.ps1`

- [ ] **Step 1: Add failing parser and script tests**

Run: `pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content scripts/deploy_windows.ps1 -Raw)) | Out-Null; [scriptblock]::Create((Get-Content scripts/windows-common.ps1 -Raw)) | Out-Null; [scriptblock]::Create((Get-Content scripts/service-common.ps1 -Raw)) | Out-Null; [scriptblock]::Create((Get-Content scripts/service-runner.ps1 -Raw)) | Out-Null"`
Expected before refactor: parser succeeds, but service tests do not cover deployment registration.

- [ ] **Step 2: Source helper scripts**

At the top of `deploy_windows.ps1`, dot-source:

```powershell
. "$PSScriptRoot\windows-common.ps1"
. "$PSScriptRoot\service-common.ps1"
```

- [ ] **Step 3: Replace duplicated registration**

In Step 5, build service definitions:

```powershell
$tdxDefinition = New-DatasourceServiceDefinition -Instance tdx -ProjectDir $ProjectDir -LogsDir $LogsDir
Ensure-DatasourceNssmService -NssmExe $nssmExe -Definition $tdxDefinition

if ($qmtEnabled) {
    $qmtDefinition = New-DatasourceServiceDefinition -Instance qmt -ProjectDir $ProjectDir -LogsDir $LogsDir
    Ensure-DatasourceNssmService -NssmExe $nssmExe -Definition $qmtDefinition
}
```

- [ ] **Step 4: Re-run parser and helper tests**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: PASS.

## Task 5: Mist Installer and Docs

**Files:**
- Modify: `mist/deploy/windows/install-all.ps1`
- Modify: `mist/deploy/windows/README-Windows.md`
- Modify: `mist/openspec/changes/package-windows-api-appliance/tasks.md`

- [ ] **Step 1: Update installer orchestration**

Remove the separate datasource preflight step from `install-all.ps1`. The datasource block should call `deploy_windows.ps1` and let datasource own SDK validation.

- [ ] **Step 2: Update README**

Document:

```text
nssm status MistTDX
nssm restart MistTDX
Remove-Item datasource\logs\service-runner-tdx-state.json
```

Explain that crash-loop protection stops a service after repeated early exits and that the state file can be removed after fixing SDK/env/port issues.

- [ ] **Step 3: Mark OpenSpec tasks 10.1 through 10.10 complete**

Only check boxes that are implemented and verified in this branch.

## Task 6: Verification and Commits

**Files:**
- All modified files above.

- [ ] **Step 1: Run datasource parser and tests**

Run in `mist-datasource`: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1`
Expected: PASS.

- [ ] **Step 2: Run datasource Python tests without live SDK**

Run in `mist-datasource`: `uv run pytest -m "not live"`
Expected: PASS.

- [ ] **Step 3: Run Mist parser/OpenSpec checks**

Run in `mist`: `pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content deploy/windows/install-all.ps1 -Raw)) | Out-Null"`
Run in `mist`: `openspec validate package-windows-api-appliance --strict`
Expected: PASS.

- [ ] **Step 4: Commit datasource changes**

Run in `mist-datasource`:

```bash
git add scripts/deploy_windows.ps1 scripts/windows-common.ps1 scripts/service-common.ps1 scripts/service-runner.ps1 scripts/test_windows_scripts.ps1
git commit -m "feat: harden datasource nssm services"
```

- [ ] **Step 5: Commit Mist changes**

Run in `mist`:

```bash
git add deploy/windows/install-all.ps1 deploy/windows/README-Windows.md openspec/changes/package-windows-api-appliance/tasks.md docs/superpowers/plans/2026-06-22-datasource-service-supervision.md
git commit -m "docs: plan datasource service hardening"
```

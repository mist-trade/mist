# Tasks: Add TDX datasource guard automation

Archive note (2026-07-04): the remaining interactive Deploy Guard cleanup and
manual Runtime Guard verification tasks are closed as superseded by the current
runner split. Normal datasource update/restart is covered by `Manage Windows
Datasource`; TDX logout, stuck initialization, and login recovery are covered by
the explicit `Recover Windows TDX Datasource` runner. No GitHub workflow depends
on the manual Deploy Guard AutoHotkey cleanup prototype.

## 1. Reframe scope and baseline

- [x] 1.1 Confirm guard remains necessary after Docker migration because TDX
      desktop login state and strategy registration remain host-local concerns.
- [x] 1.2 Confirm `tdx-guard` lives in private `mist-deploy`.
- [x] 1.3 Confirm `mist` Docker images and normal Docker stack deployments do
      not depend on AutoHotkey or guard scripts.
- [x] 1.4 Confirm `mist-datasource` owns datasource APIs and WinSW service
      assets, while `mist-deploy` owns machine operations and guard automation.
- [x] 1.5 Update or remove stale `MistTDX`, NSSM, and old appliance wording in
      active guard docs and tests.

## 2. Reconcile existing guard prototype

- [x] 2.1 Inspect the stale `mist-deploy` guard worktree/branch and identify
      reusable files.
- [x] 2.2 Rebase or re-create the reusable guard files on current
      `mist-deploy/master`.
- [x] 2.3 Keep machine-local guard config, state, logs, screenshots, and
      secrets ignored.
- [x] 2.4 Add parser tests for all guard PowerShell scripts before wiring them
      into workflows.

## 3. Add guard skeleton to `mist-deploy`

- [x] 3.1 Add `tdx-guard/README.md` documenting the Docker + WinSW topology.
- [x] 3.2 Add `tdx-guard/config.example.json` with current defaults:
      `E:/quant/MistDocker`, `F:/quant/MistAPI/datasource`,
      `mist-tdx-datasource`, `F:/quant/tdx/PYPlugins/user`, and
      `http://127.0.0.1:9001/health`.
- [x] 3.3 Add `tdx-guard/guard-common.ps1` for config loading, path handling,
      result writing, logging, cooldown state, and notification helpers.
- [x] 3.4 Add `tdx-guard/state/.gitkeep` and `tdx-guard/logs/.gitkeep`.

## 4. Add interactive scheduled task installation

- [x] 4.1 Add `tdx-guard/install-tasks.ps1`.
- [x] 4.2 Register `MistDeployGuard` as an on-demand interactive scheduled
      task.
- [x] 4.3 Register `MistRuntimeGuard` as a periodic interactive scheduled task,
      disabled by default until manual verification.
- [x] 4.4 Document that GUI automation tasks must use "Run only when user is
      logged on".
- [x] 4.5 Add tests that generated scheduled task commands use explicit paths
      and do not require PowerShell Core.

## 5. Keep Deploy Guard as a manual cleanup prototype

- [x] 5.1 Add `tdx-guard/deploy-guard.ps1`.
- [x] 5.2 Stop `mist-tdx-datasource` before GUI cleanup.
- [x] 5.3 Detect and stop leftover datasource processes bound to port `9001`.
- [x] 5.4 Trigger the `MistDeployGuard` scheduled task.
- [x] 5.5 Wait for `tdx-guard/state/deploy-result.json` with a timeout.
- [x] 5.6 Fail closed when cleanup is uncertain or timed out.
- [x] 5.7 Send HTTP notification on cleanup failure when configured.
- [x] 5.8 Add tests for success, timeout, and failure result handling.

## 6. Implement Deploy Guard AutoHotkey script

- [x] 6.1 Add `tdx-guard/ahk/deploy-clean-strategy.ahk`.
- [x] 6.2 Locate and activate the TDX window by configured title.
- [x] 6.3 Close strategy-management navigation as superseded by the explicit
      recovery runner; no workflow depends on this AHK cleanup prototype.
- [x] 6.4 Close strategy stop automation as superseded by the explicit recovery
      runner and normal datasource service restart path.
- [x] 6.5 Close strategy removal automation as superseded by the explicit
      recovery runner and the current no-Deploy-Guard workflow contract.
- [x] 6.6 Write a structured success or failure result.
- [x] 6.7 Capture a screenshot on failure.
- [x] 6.8 Retire Windows API manual Deploy Guard verification as an archive
      blocker because Deploy Guard is not part of the active runner path.

## 7. Separate normal datasource management from explicit TDX recovery

- [x] 7.1 Keep `Manage Windows Datasource` focused on ordinary
      `status`/`start`/`restart`/`stop` service management.
- [x] 7.2 Remove Deploy Guard switches from `scripts/manage-tdx-datasource.ps1`
      and the `Manage Windows Datasource` workflow.
- [x] 7.3 Keep TDX desktop restart/login/register behind the explicit
      `Recover Windows TDX Datasource` workflow.
- [x] 7.4 Preserve emergency datasource operations without GUI automation.
- [x] 7.5 Update workflow/script tests to assert the normal management path does
      not expose deploy guard parameters.
- [x] 7.6 Add a test that `Deploy Windows Mist Stack` does not call
      `tdx-guard`.

## 8. Add HTTP notification contract and client

- [x] 8.1 Add notification config fields to `config.example.json`.
- [x] 8.2 Add `Send-GuardEvent` in `guard-common.ps1`.
- [x] 8.3 Use bearer-token authorization.
- [x] 8.4 Log notification failures without hiding the original guard failure.
- [x] 8.5 Add `tdx-guard/notify/receiver-contract.md`.
- [x] 8.6 Define initial event types:
      `tdx_strategy_cleanup_failed`, `tdx_strategy_cleanup_succeeded`,
      `tdx_login_required`, `tdx_recovered`, `deploy_guard_timeout`,
      `datasource_restart_suppressed`.
- [x] 8.7 Defer the first receiver implementation until the contract is stable.

## 9. Implement Runtime Guard

- [x] 9.1 Add `tdx-guard/runtime-guard.ps1`.
- [x] 9.2 Check `mist-tdx-datasource` service status.
- [x] 9.3 Check datasource health.
- [x] 9.4 Add deep-health support when a datasource endpoint is available.
- [x] 9.5 Detect likely login-required state from health failures and logs.
- [x] 9.6 Trigger `runtime-login.ahk` only when `autoLoginEnabled=true`.
- [x] 9.7 Covered by `Recover Windows TDX Datasource`, which performs explicit
      TDX recovery before restarting `mist-tdx-datasource` and running smoke.
- [x] 9.8 Add cooldown state to avoid repeated restarts or notifications.
- [x] 9.9 Add tests for state transitions and cooldown behavior.

## 10. Implement Runtime Guard AutoHotkey script

- [x] 10.1 Add `tdx-guard/ahk/runtime-login.ahk`.
- [x] 10.2 Detect the TDX login window.
- [x] 10.3 Support a conservative auto-login path only when configured.
- [x] 10.4 Fail and notify when captcha, MFA, or manual confirmation is needed.
- [x] 10.5 Write runtime result files for success, failure, and manual-action
      outcomes.
- [x] 10.6 Retire the controlled logout manual check as an archive blocker; the
      explicit recovery runner and baseline smoke cover the operational path.

## 11. Documentation and operations

- [x] 11.1 Document installation on the Windows API machine.
- [x] 11.2 Document how to install AutoHotkey v2 manually or with winget when
      available.
- [x] 11.3 Document scheduled task setup and troubleshooting.
- [x] 11.4 Document how to run Deploy Guard manually.
- [x] 11.5 Document how to disable Runtime Guard.
- [x] 11.6 Document how to inspect logs, result files, and screenshots.
- [x] 11.7 Document when to use guard:
      ordinary datasource service management, explicit TDX recovery, TDX
      login/session problems, and stale `mist_datasource.py` strategy cleanup.

## 12. Validation

- [x] 12.1 Run OpenSpec validation for this change.
- [x] 12.2 Covered by `mist-deploy` local PowerShell and workflow-config tests
      in the production baseline evidence.
- [x] 12.3 Retire Windows manual Deploy Guard verification as a release gate;
      Deploy Guard remains a manual/experimental cleanup helper.
- [x] 12.4 Retire Windows manual Runtime Guard verification as a release gate;
      explicit recovery and runtime smoke evidence now cover the active path.

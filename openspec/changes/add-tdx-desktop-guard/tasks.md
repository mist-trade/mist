# Tasks: Add TDX desktop guard automation

## 1. Confirm scope and repository boundary

- [x] 1.1 Confirm `tdx-guard` lives in private `mist-deploy`.
- [x] 1.2 Confirm `mist` and `mist-datasource` do not depend on AutoHotkey.
- [x] 1.3 Confirm machine-local guard config, state, logs, screenshots, and
      secrets are ignored.
- [x] 1.4 Confirm first implementation focuses on Deploy Guard before Runtime
      Guard.

## 2. Add guard skeleton to `mist-deploy`

- [x] 2.1 Add `tdx-guard/README.md`.
- [x] 2.2 Add `tdx-guard/config.example.json`.
- [x] 2.3 Add `.gitignore` entries for `tdx-guard/config.json`,
      `tdx-guard/state/*.json`, `tdx-guard/logs/*`, and
      `tdx-guard/screenshots/*`.
- [x] 2.4 Add `tdx-guard/guard-common.ps1` for config loading, path handling,
      result writing, logging, and notification helpers.
- [x] 2.5 Add PowerShell parser checks for all guard scripts.

## 3. Add scheduled task installation

- [x] 3.1 Add `tdx-guard/install-tasks.ps1`.
- [x] 3.2 Register `MistDeployGuard` as an interactive scheduled task.
- [x] 3.3 Register `MistRuntimeGuard` as a periodic interactive scheduled task,
      disabled by default in the first phase.
- [x] 3.4 Document that GUI automation tasks must use "Run only when user is
      logged on".
- [ ] 3.5 Add tests that generated scheduled task commands use explicit paths
      and do not require PowerShell Core.

## 4. Implement Deploy Guard

- [x] 4.1 Add `tdx-guard/deploy-guard.ps1`.
- [x] 4.2 Stop `MistTDX` before GUI cleanup.
- [x] 4.3 Detect and stop leftover datasource process on port `9001`.
- [x] 4.4 Trigger the `MistDeployGuard` scheduled task.
- [x] 4.5 Wait for `tdx-guard/state/deploy-result.json` with a timeout.
- [x] 4.6 Fail closed when cleanup is uncertain or timed out.
- [x] 4.7 Send HTTP notification on cleanup failure.
- [ ] 4.8 Add tests for success, timeout, and failure result handling.

## 5. Implement Deploy Guard AutoHotkey script

- [x] 5.1 Add `tdx-guard/ahk/deploy-clean-strategy.ahk`.
- [ ] 5.2 Locate and activate the TDX window by configured title.
- [ ] 5.3 Navigate to the strategy management area.
- [ ] 5.4 Stop the `mist_datasource.py` strategy if it is running.
- [ ] 5.5 Remove the `mist_datasource.py` strategy when present.
- [ ] 5.6 Write a structured success or failure result.
- [ ] 5.7 Capture a screenshot on failure.
- [ ] 5.8 Verify manually on the Windows API machine.

## 6. Integrate Deploy Guard with deployment workflow

- [ ] 6.1 Add an optional `run_tdx_deploy_guard` workflow input in
      `mist-deploy`, defaulting to enabled after manual verification.
- [ ] 6.2 Call `tdx-guard/deploy-guard.ps1` from
      `scripts/deploy-appliance.ps1` after stopping datasource services and
      before appliance installation.
- [ ] 6.3 Preserve the current ability to deploy without the guard for emergency
      fallback.
- [ ] 6.4 Update workflow tests to assert the guard input and explicit
      PowerShell parameters.
- [ ] 6.5 Run a clean deployment on the Windows API machine.

## 7. Add HTTP notification client

- [x] 7.1 Add notification config fields to `config.example.json`.
- [x] 7.2 Add `Send-GuardEvent` in `guard-common.ps1`.
- [x] 7.3 Use bearer-token authorization.
- [x] 7.4 Log notification failures without hiding the original guard failure.
- [x] 7.5 Add tests for notification payload shape.

## 8. Define notification receiver contract

- [x] 8.1 Add `tdx-guard/notify/receiver-contract.md`.
- [x] 8.2 Define endpoint, auth header, payload fields, and event types.
- [x] 8.3 Define initial event types:
      `tdx_strategy_cleanup_failed`, `tdx_strategy_cleanup_succeeded`,
      `tdx_login_required`, `tdx_recovered`, `deploy_guard_timeout`.
- [ ] 8.4 Decide whether the first receiver implementation is Python, Node, or
      an AstrBot plugin after the contract is stable.

## 9. Implement Runtime Guard

- [x] 9.1 Add `tdx-guard/runtime-guard.ps1`.
- [ ] 9.2 Check `MistTDX` service status.
- [x] 9.3 Check TDX service health.
- [x] 9.4 Add deep-health support when a datasource endpoint is available.
- [x] 9.5 Detect likely login-required state from health failures and logs.
- [ ] 9.6 Trigger `runtime-login.ahk` only when `autoLoginEnabled=true`.
- [ ] 9.7 Restart `MistTDX` after login recovery.
- [ ] 9.8 Add cooldown state to avoid repeated restart or notification spam.
- [ ] 9.9 Add tests for state transitions and cooldown behavior.

## 10. Implement Runtime Guard AutoHotkey script

- [x] 10.1 Add `tdx-guard/ahk/runtime-login.ahk`.
- [ ] 10.2 Detect the TDX login window.
- [ ] 10.3 Support a conservative auto-login path only when configured.
- [ ] 10.4 Fail and notify when captcha, MFA, or manual confirmation is needed.
- [ ] 10.5 Write runtime result files for success, failure, and manual-action
      outcomes.
- [ ] 10.6 Verify manually during a controlled TDX logout scenario.

## 11. Documentation and operations

- [ ] 11.1 Document installation on the Windows API machine.
- [ ] 11.2 Document how to install AutoHotkey v2.
- [ ] 11.3 Document scheduled task setup and troubleshooting.
- [ ] 11.4 Document how to run Deploy Guard manually.
- [ ] 11.5 Document how to disable Runtime Guard.
- [ ] 11.6 Document how to inspect logs, result files, and screenshots.

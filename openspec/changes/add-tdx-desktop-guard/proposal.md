# Change: Add TDX desktop guard automation

> Service-management update (2026-06-27): this private guard should use
> configurable service names. The current appliance TDX service is WinSW
> `mist-tdx-datasource`; legacy `MistTDX` references below describe the earlier
> NSSM package path.

## Why

The Windows API appliance now depends on a logged-in TDX desktop terminal and a
single TDX strategy identity:

```text
F:/quant/tdx/PYPlugins/user/mist_datasource.py
```

This creates two operational problems that cannot be solved cleanly inside the
Mist backend or datasource adapter:

- TDX can drop its session in the morning and require desktop login recovery.
- Re-deploying can fail when TDX still has the old `mist_datasource.py` strategy
  registered or running.

Both problems are desktop-state concerns. They should be handled by a private
Windows operations guard, not by public application repositories.

## What changes

- Add a private `tdx-guard` operations toolkit under `mist-deploy`.
- Use PowerShell for orchestration, service control, health checks, HTTP
  notifications, state files, and GitHub runner integration.
- Use AutoHotkey v2 for GUI automation against the logged-in Windows desktop.
- Use Windows Task Scheduler to run GUI automation in the interactive user
  session instead of the GitHub runner service session.
- Add a Deploy Guard path for pre-deployment strategy cleanup.
- Add a Runtime Guard path for periodic TDX login/session monitoring and
  recovery.
- Add an HTTP notification contract so the Windows API machine can POST events
  to a receiver on the bot machine over the LAN.

## Non-goals

- Moving TDX GUI automation into `mist`, `mist-datasource`, or the backend
  process.
- Making the public appliance package depend on AutoHotkey.
- Exposing the notification receiver to the public internet.
- Replacing legacy service wrapper for `MistTDX`, `MistQMT`, or `MistBackend`.
- Guaranteeing fully unattended login when TDX requires captcha, MFA, or manual
  confirmation.
- Building a general GUI automation framework for arbitrary Windows apps.

## Expected outcome

The Windows API machine gains a private operations layer:

```text
mist-deploy/tdx-guard/
    deploy-guard.ps1       # one-shot pre-deploy cleanup
    runtime-guard.ps1      # scheduled periodic runtime monitor
    install-tasks.ps1      # registers interactive scheduled tasks
    config.example.json
    ahk/
        deploy-clean-strategy.ahk
        runtime-login.ahk
    notify/
        receiver contract and optional receiver implementation
```

Deployment can stop `MistTDX`, trigger an interactive desktop cleanup task,
wait for a result file, and only then continue appliance installation.

Runtime monitoring can detect TDX session loss, optionally trigger desktop login
automation, restart `MistTDX` after recovery, and notify the operator when human
action is required.

## Impacted areas

- Private `mist-deploy` repository.
- `mist-deploy` deployment workflow and `scripts/deploy-appliance.ps1`.
- Windows Task Scheduler configuration on the API machine.
- Local machine-only guard config, state, logs, and screenshots.
- Optional HTTP notification receiver on the bot machine.

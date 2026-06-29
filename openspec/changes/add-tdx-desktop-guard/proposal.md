# Change: Add TDX datasource guard automation

## Why

The current Windows production topology is hybrid:

```text
Docker Compose on Windows
  - mysql
  - mist-backend
  - chan-api

Windows host
  - mist-tdx-datasource WinSW service
  - TDX desktop terminal
  - TDX strategy identity:
    F:/quant/tdx/PYPlugins/user/mist_datasource.py
```

Dockerizing Mist changed backend, Chan, and MySQL deployment, but it did not
remove the TDX desktop constraints. Two problems remain outside the normal
backend and datasource code boundary:

- TDX can drop its desktop login session, especially around morning startup, and
  then the datasource service can no longer initialize or serve live data.
- Updating or restarting `mist-tdx-datasource` can fail when TDX still has the
  old `mist_datasource.py` strategy registered or running.

These are Windows desktop and local operations concerns. They should be handled
by private deployment automation in `mist-deploy`, not by the public `mist`
Docker image and not by the reusable `mist-datasource` adapter code.

## What changes

- Reframe `tdx-guard` as a private TDX + datasource operations toolkit under
  `mist-deploy`.
- Keep ordinary Docker stack deployments independent from guard automation.
- Integrate Deploy Guard with datasource management flows, especially
  `Manage Windows Datasource` and `scripts/manage-tdx-datasource.ps1`.
- Use PowerShell for orchestration, WinSW service control, health checks, result
  files, notifications, and GitHub runner integration.
- Use AutoHotkey v2 only for interactive desktop actions against TDX.
- Use Windows Task Scheduler to run AutoHotkey in the logged-in user session,
  because the GitHub runner service session cannot reliably click desktop UI.
- Add Runtime Guard for periodic TDX login/session monitoring and conservative
  recovery.
- Keep notification delivery as authenticated HTTP JSON over the LAN so the
  bot machine can receive events without coupling this repo to AstrBot, NapCat,
  or QQ internals.

## Non-goals

- Running AutoHotkey from `mist`, `mist-datasource`, or the Docker containers.
- Making ordinary Docker backend deploys depend on TDX desktop automation.
- Adding public package dependencies on AutoHotkey or machine-local guard
  config.
- Exposing the notification receiver to the public internet.
- Guaranteeing unattended recovery when TDX requires captcha, MFA, or manual
  confirmation.
- Building a generic Windows GUI automation framework.

## Expected outcome

The Windows API machine gains a private operations layer:

```text
mist-deploy/tdx-guard/
    deploy-guard.ps1       # one-shot datasource pre-start/pre-update cleanup
    runtime-guard.ps1      # scheduled runtime TDX/session monitor
    install-tasks.ps1      # registers interactive scheduled tasks
    guard-common.ps1
    config.example.json
    ahk/
        deploy-clean-strategy.ahk
        runtime-login.ahk
    notify/
        receiver-contract.md
```

Normal Docker deploys continue through `Deploy Windows Mist Stack` without
touching TDX GUI state. Datasource management can optionally stop
`mist-tdx-datasource`, run Deploy Guard to clear stale TDX strategy state, then
restart or update the WinSW service.

Runtime Guard can detect TDX session loss, notify the operator, optionally run a
conservative login automation path, and restart `mist-tdx-datasource` only after
TDX appears usable again.

## Impacted areas

- Private `mist-deploy` repository.
- `mist-deploy/.github/workflows/manage-windows-datasource.yml`.
- `mist-deploy/scripts/manage-tdx-datasource.ps1`.
- Windows Task Scheduler configuration on the API machine.
- Local-only guard config, state, logs, and screenshots.
- Optional HTTP notification receiver on the bot machine.

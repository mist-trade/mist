# Design: TDX desktop guard automation

> Service-management update (2026-06-27): this private guard should use
> configurable service names. The current appliance TDX service is WinSW
> `mist-tdx-datasource`; legacy `MistTDX`/NSSM references below describe the
> earlier package path.

## Repository boundary

`tdx-guard` belongs in the private `mist-deploy` repository.

```text
mist              public application and appliance packaging
mist-datasource   datasource adapter and SDK invocation
mist-deploy       private machine deployment, runner workflows, desktop guard
```

The guard is not part of the release zip and is not part of the datasource
adapter. It is a private operations toolkit for the Windows API machine.

## Tool choices

Use this stack for the first version:

```text
PowerShell          orchestration, legacy service wrapper, health checks, result files
AutoHotkey v2       GUI automation for TDX windows, menus, and clicks
Task Scheduler      run GUI automation in the logged-in user desktop session
legacy service wrapper                keep managing Mist services
HTTP JSON           send notifications to a LAN receiver on the bot machine
```

Do not run AutoHotkey directly from the GitHub runner service. A service-mode
runner usually runs outside the interactive desktop session and cannot reliably
click TDX. The runner should trigger a scheduled task configured as:

```text
Run only when user is logged on
Run with highest privileges
Start in F:\quant\mist-deploy\tdx-guard
```

## File layout

Target layout in `mist-deploy`:

```text
tdx-guard/
    README.md
    config.example.json
    install-tasks.ps1
    runtime-guard.ps1
    deploy-guard.ps1
    guard-common.ps1

    ahk/
        deploy-clean-strategy.ahk
        runtime-login.ahk
        lib/

    notify/
        README.md
        receiver-contract.md

    state/
        .gitkeep

    logs/
        .gitkeep
```

Do not commit machine-local files:

```text
tdx-guard/config.json
tdx-guard/state/*.json
tdx-guard/logs/*
tdx-guard/screenshots/*
```

## Configuration

Commit `config.example.json`; keep `config.json` local to the Windows machine.

Example:

```json
{
  "machineName": "mist-api-windows",
  "mistDeployDir": "F:/quant/MistAPI",
  "tdxInstallHint": "F:/quant/tdx",
  "tdxWindowTitle": "通达信",
  "tdxSdkPath": "F:/quant/tdx/PYPlugins/user",
  "strategyIdentity": "F:/quant/tdx/PYPlugins/user/mist_datasource.py",
  "mistTdxServiceName": "MistTDX",
  "mistBackendHealthUrl": "http://127.0.0.1:8001/app/hello",
  "tdxHealthUrl": "http://127.0.0.1:9001/health",
  "tdxDeepHealthUrl": "http://127.0.0.1:9001/api/tdx/health/deep",
  "notifyUrl": "http://192.168.31.x:8787/events",
  "notifyToken": "",
  "autoLoginEnabled": false
}
```

If a deep-health endpoint does not exist yet, the first guard version may call
the current service health endpoint and treat SDK startup failures from the
service logs as runtime failures. A later datasource change can expose a
dedicated endpoint that performs a lightweight real TDX SDK call.

## Deploy Guard

Deploy Guard is a one-shot pre-deployment workflow.

```text
mist-deploy workflow
    |
    +-- scripts/deploy-appliance.ps1
          |
          +-- stop MistTDX
          +-- run tdx-guard/deploy-guard.ps1
          |     |
          |     +-- trigger MistDeployGuard scheduled task
          |     +-- wait for state/deploy-result.json
          |     +-- fail fast on timeout or TDX cleanup error
          |
          +-- continue appliance extraction and install
```

`deploy-guard.ps1` responsibilities:

- Stop `MistTDX` if it exists.
- Kill leftover datasource Python or uvicorn process bound to port `9001`.
- Trigger the interactive `MistDeployGuard` scheduled task.
- Wait for `state/deploy-result.json`.
- Send an HTTP notification on failure.
- Exit non-zero if cleanup did not complete.

`deploy-clean-strategy.ahk` responsibilities:

- Activate or locate the TDX terminal window.
- Navigate to the strategy management area.
- Stop and remove the `mist_datasource.py` strategy when present.
- Write a structured result file.
- Capture a screenshot on failure.

Deploy Guard should not attempt to login to TDX. If TDX is not open or not
logged in, it should fail and notify the operator. Login recovery belongs to
Runtime Guard.

## Runtime Guard

Runtime Guard is a scheduled periodic monitor, independent of GitHub Actions.

```text
Windows Task Scheduler
    MistRuntimeGuard every 1-5 minutes
        |
        +-- runtime-guard.ps1
              |
              +-- check MistTDX service
              +-- check TDX health or deep health
              +-- inspect TDX desktop/login state when health fails
              +-- optionally trigger runtime-login.ahk
              +-- restart MistTDX after confirmed recovery
              +-- notify when human action is required
```

Runtime Guard should use cooldown and state files so it does not spam
notifications or restart services continuously.

Recommended states:

```text
healthy
tdx_service_down
tdx_session_down
login_required
login_attempted
manual_action_required
recovered
```

## Notification contract

The Windows API machine sends notifications as HTTP JSON events. It does not
know about QQ, NapCat, or AstrBot internals.

```http
POST /events
Authorization: Bearer <token>
Content-Type: application/json
```

Payload:

```json
{
  "source": "mist-api-windows",
  "component": "tdx-guard",
  "scope": "runtime",
  "level": "warning",
  "type": "tdx_login_required",
  "title": "TDX login required",
  "message": "MistTDX deep health failed and TDX appears logged out.",
  "time": "2026-06-24T17:30:00+08:00",
  "details": {
    "service": "MistTDX",
    "healthUrl": "http://127.0.0.1:9001/health"
  }
}
```

Security rules:

- Listen only on LAN or localhost behind a LAN reverse proxy.
- Require a bearer token.
- Optionally allow only the Windows API machine IP.
- Never expose the receiver to the public internet.

The receiver may live on the bot machine. It can later forward events to
AstrBot, NapCat, QQ, logs, or any other notification channel.

## Error handling

Deploy Guard:

- Fail closed. If strategy cleanup is uncertain, stop deployment.
- Write `state/deploy-result.json` for every terminal outcome.
- Include screenshot/log paths in failure results.

Runtime Guard:

- Avoid infinite restart loops.
- Use cooldown before repeated login attempts or notifications.
- Prefer notification over risky GUI automation when login requires human
  verification.
- Restart `MistTDX` only after TDX appears logged in or after the operator has
  explicitly enabled auto-login.

## Testing strategy

Local script tests:

- Parse all PowerShell scripts with the PowerShell AST parser.
- Unit-test config loading, result writing, notification payloads, and timeout
  handling.
- Test `deploy-appliance.ps1` passes guard switches explicitly and does not rely
  on fragile PowerShell array splatting.

Windows manual verification:

- Register scheduled tasks.
- Run Deploy Guard with TDX open and strategy present.
- Run Deploy Guard with TDX closed and confirm failure notification.
- Run Runtime Guard with `MistTDX` healthy.
- Simulate TDX logout and confirm notification or auto-login behavior.
- Confirm no GUI automation runs from the service runner session.

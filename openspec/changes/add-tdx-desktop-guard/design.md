# Design: TDX datasource guard automation

## Current boundary

The guard belongs to private deployment automation, not to application runtime
code:

```text
mist
  Public backend source and Docker image.
  Owns backend APIs and TDX_BASE_URL consumption.

mist-datasource
  Public Python datasource adapter.
  Owns normalized datasource APIs, TDX SDK calls, and WinSW service assets.

mist-deploy
  Private Windows API machine operations.
  Owns Docker stack deployment, datasource service management, TDX desktop
  guard automation, local secrets, state, logs, and notifications.
```

This change keeps the guard in `mist-deploy`. The active production deploy path
is still Docker Compose for `mysql`, `mist-backend`, and `chan-api`, with
`mist-tdx-datasource` running on the Windows host through WinSW.

## Tool choices

Use this stack for the first production version:

```text
PowerShell        orchestration, WinSW/service control, health checks, state
AutoHotkey v2     TDX desktop automation only
Task Scheduler    run GUI automation in the logged-in user desktop session
HTTP JSON         notify a LAN receiver on the bot machine
```

Do not run AutoHotkey directly from the GitHub runner service. The runner should
trigger scheduled tasks configured as:

```text
Run only when user is logged on
Run with highest privileges
Start in <mist-deploy>\tdx-guard
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

Commit `config.example.json`; keep `config.json` local on the Windows API
machine.

Example:

```json
{
  "machineName": "mist-api-windows",
  "dockerRoot": "E:/quant/MistDocker",
  "datasourceRoot": "F:/quant/MistAPI/datasource",
  "tdxInstallHint": "F:/quant/tdx",
  "tdxWindowTitle": "通达信",
  "tdxSdkPath": "F:/quant/tdx/PYPlugins/user",
  "strategyIdentity": "F:/quant/tdx/PYPlugins/user/mist_datasource.py",
  "tdxServiceName": "mist-tdx-datasource",
  "datasourceHealthUrl": "http://127.0.0.1:9001/health",
  "datasourceDeepHealthUrl": "http://127.0.0.1:9001/api/tdx/health/deep",
  "tdxNativeHost": "127.0.0.1",
  "tdxNativePort": 17709,
  "notifyUrl": "http://192.168.31.x:8787/events",
  "notifyToken": "",
  "autoLoginEnabled": false,
  "restartCooldownSeconds": 300,
  "notificationCooldownSeconds": 900
}
```

If a deep-health endpoint does not exist yet, Runtime Guard may call
`/health`, inspect datasource logs, and probe `127.0.0.1:17709` as a weaker
signal. A later datasource change can expose a dedicated endpoint that performs
a lightweight real TDX SDK call.

## Deploy Guard

Deploy Guard is a manual/experimental strategy cleanup helper. It is not part
of ordinary Docker app deployment, and it is not wired into normal datasource
management.

```text
manual operator
    |
    +-- tdx-guard/deploy-guard.ps1
          |
          +-- stop mist-tdx-datasource if still running
          +-- stop leftover datasource process on port 9001
          +-- trigger MistDeployGuard scheduled task
          +-- wait for state/deploy-result.json
          +-- fail fast on timeout or TDX cleanup error
```

`deploy-guard.ps1` responsibilities:

- Stop `mist-tdx-datasource` if it exists.
- Kill leftover datasource Python or uvicorn processes bound to port `9001`.
- Trigger the interactive `MistDeployGuard` scheduled task.
- Wait for `tdx-guard/state/deploy-result.json`.
- Send an HTTP notification on failure.
- Exit non-zero if cleanup did not complete.

`deploy-clean-strategy.ahk` responsibilities:

- Activate or locate the TDX terminal window.
- Navigate to the strategy management area.
- Stop and remove the `mist_datasource.py` strategy when present.
- Write a structured result file.
- Capture a screenshot on failure.

Deploy Guard should not attempt to log in to TDX. If TDX is not open or not
logged in, it should fail and notify the operator. It remains available as a
calibrated prototype, but the supported operator recovery entrypoint is
`Recover Windows TDX Datasource`.

## Explicit TDX Recovery

`Recover Windows TDX Datasource` is the GitHub Actions entrypoint for phone-side
operator recovery when TDX must be restarted or the old `mist_datasource.py`
strategy state is suspected to be blocking registration.

```text
Recover Windows TDX Datasource workflow
    |
    +-- tdx-guard/restart-login-register.ps1
          |
          +-- stop existing TdxW.exe
          +-- start TDX desktop terminal
          +-- trigger MistRuntimeLogin scheduled task
          +-- wait for TDX/TQ initialization
          +-- scripts/manage-tdx-datasource.ps1 -Action restart
          +-- scripts/winsw/test-tdx-datasource.ps1 smoke check
```

This flow is intentionally separate from `Manage Windows Datasource`. Normal
service management should remain reversible and low-risk. TDX recovery is a
deliberate operator action because it kills the desktop terminal and relies on
logged-in-session GUI automation.

## Runtime Guard

Runtime Guard is a scheduled periodic monitor, independent from GitHub Actions.

```text
Windows Task Scheduler
    MistRuntimeGuard every 1-5 minutes
        |
        +-- runtime-guard.ps1
              |
              +-- check mist-tdx-datasource service status
              +-- check datasource health or deep health
              +-- inspect datasource logs for TDX initialization/login errors
              +-- inspect TDX desktop/login state when health fails
              +-- optionally trigger runtime-login.ahk
              +-- restart mist-tdx-datasource after confirmed recovery
              +-- notify when human action is required
```

Runtime Guard should use state files and cooldowns so it does not spam
notifications or restart services continuously.

Recommended states:

```text
healthy
datasource_service_down
datasource_unhealthy
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
  "message": "Datasource health failed and TDX appears logged out.",
  "time": "2026-06-29T10:30:00+08:00",
  "details": {
    "service": "mist-tdx-datasource",
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
AstrBot, NapCat, QQ, logs, or another notification channel.

## Error handling

Deploy Guard:

- Fail closed for the manual cleanup run. If strategy cleanup is uncertain,
  report failure rather than continuing silently.
- Write `state/deploy-result.json` for every terminal outcome.
- Include screenshot/log paths in failure results.
- Do not block ordinary Docker stack deployments.

Runtime Guard:

- Avoid infinite restart loops.
- Use cooldown before repeated login attempts, restarts, or notifications.
- Prefer notification over risky GUI automation when login requires human
  verification.
- Restart `mist-tdx-datasource` only after TDX appears logged in or after the
  operator explicitly enables auto-login.

## Testing strategy

Local script tests:

- Parse all PowerShell scripts with the PowerShell AST parser.
- Unit-test config loading, result writing, notification payloads, timeout
  handling, and cooldown decisions.
- Test `manage-tdx-datasource.ps1` does not invoke Deploy Guard and keeps
  ordinary service management independent from GUI automation.
- Test `Deploy Windows Mist Stack` does not call `tdx-guard`.
- Test `Manage Windows Datasource` does not expose datasource guard inputs.
- Test `Recover Windows TDX Datasource` calls `restart-login-register.ps1` and
  does not call `deploy-guard.ps1`.

Windows manual verification:

- Register scheduled tasks.
- Run Deploy Guard with TDX open and strategy present.
- Run Deploy Guard with TDX closed and confirm failure notification.
- Run datasource start/restart/stop from `Manage Windows Datasource`.
- Run `Recover Windows TDX Datasource` during a controlled TDX recovery.
- Run Runtime Guard with `mist-tdx-datasource` healthy.
- Simulate TDX logout and confirm notification or conservative auto-login.
- Confirm no GUI automation runs from the service runner session.

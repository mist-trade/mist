# Design: Windows API appliance packaging

> Superseded service-management note (2026-06-27): NSSM/`MistTDX`/`MistQMT`
> references in this historical design describe the first package iteration.
> Current deployment uses WinSW for `MistBackend` and
> `mist-tdx-datasource`; QMT service installation is skipped.

## Target topology

```text
Windows API machine
    |
    +-- MySQL
    |
    +-- TDX / miniQMT clients
    |
    +-- mist-datasource
    |     |
    |     +-- MistTDX service :9001
    |     +-- MistQMT service :9002, optional
    |
    +-- MistBackend service :8001

Mac / LLM / AstrBot machine
    |
    +-- mist-skills
          |
          +-- HTTP over LAN -> http://192.168.31.x:8001
```

The Windows machine is the API appliance. The Mac or LLM machine remains a
client.

## Release ownership

Use the `mist` repository as the first release owner because it already has
GitHub Actions and GitHub Release workflows.

`mist-datasource` remains a separate repository. The appliance workflow should
checkout `mist-datasource` during packaging and copy it into the release
artifact.

```text
mist GitHub Actions
    |
    +-- checkout moyui/mist
    +-- checkout mist-trade/mist-datasource
    +-- build Mist backend on windows-2022
    +-- assemble Windows appliance zip
    +-- upload artifact or attach to GitHub Release
```

Do not merge the repositories as part of this change.

## Artifact shape

```text
mist-api-appliance/
    install-all.ps1
    uninstall-all.ps1
    health-check.ps1
    README-Windows.md
    manifest.json

    nssm/
        nssm.exe

    backend/
        runtime/
        dist/
        node_modules/
        package.json
        .env.example
        scripts/
            install-service.ps1
            uninstall-service.ps1

    datasource/
        src/
        tdx/
        qmt/
        scripts/
            deploy_windows.ps1
            preflight-sdk.ps1
            windows-common.ps1
            service-common.ps1
            service-runner.ps1
        pyproject.toml
        uv.lock
        .env.example

    database/
        schema.sql
        import-backup.ps1
        README.md
```

The package should include application code and install scripts. It should not
include the proprietary market-data SDKs.

## External SDK rule

The release package does not own TDX or QMT SDK files.

### TDX

The expected TDX layout is:

```text
D:/tdx/PYPlugins/
    TPythClient.dll
    user/
        tqcenter.py
```

`TDX_SDK_PATH` points at:

```text
D:/tdx/PYPlugins/user
```

The preflight script must validate:

```text
TDX_SDK_PATH exists
TDX_SDK_PATH/tqcenter.py exists
parent(TDX_SDK_PATH)/TPythClient.dll exists
```

Do not copy only `tqcenter.py` into the appliance. The DLL lookup depends on
the SDK's original directory shape.

`TDX_SDK_PATH` should remain stable over time because `tq.initialize()` uses a
path under that directory as the strategy identity:

```text
TDX_SDK_PATH/mist_datasource.py
```

If the SDK path changes, the operator may need to clean stale strategy entries
inside the TDX terminal.

### QMT

The expected QMT configuration is:

```text
QMT_PATH=D:/miniQMT
QMT_SDK_PATH=D:/miniQMT/Lib
```

The preflight script must validate:

```text
QMT_PATH exists, when QMT is enabled
QMT_SDK_PATH exists, when QMT is enabled
QMT_SDK_PATH/xtquant exists, when QMT is enabled
```

## Dependency strategy

### Backend

Build the backend package on a Windows runner so Windows-specific package layout
is resolved correctly. The backend must not depend on native TA-Lib addon
compilation for the appliance build. Technical indicator calculations should use
the pure JavaScript `technicalindicators` dependency so the Windows package does
not require MSBuild, Visual Studio Build Tools, Python, or `node-gyp` for the
Mist backend install path. The service-level indicator contracts must keep their
existing method names, return field names, and `begIndex` alignment behavior so
indicator controllers and Chan Theory consumers continue to map values through
the existing `formatIndicator(...)` flow.

The backend package should include the compiled `dist`, production
`node_modules`, `package.json`, environment template, and either a bundled Node
runtime or a strict preflight check for the required Node version. The Windows
workflow should generate production `node_modules` inside the backend staging
directory from `package.json` and `pnpm-lock.yaml`; it should not copy a pruned
checkout-level pnpm `node_modules` tree because stale pnpm links can fail during
PowerShell copy or archive operations.

Do not build the final Windows runtime on macOS.

### Datasource

`mist-datasource` should commit a lockfile before it becomes part of a
repeatable appliance build.

The first appliance installer may require Python 3.12 and uv on the target
machine, matching the existing `deploy_windows.ps1` flow. A later offline
variant can include a wheelhouse or portable Python runtime.

## Datasource script boundary

Do not merge `mist-datasource` into the Mist backend repository or backend
process. The release package should still include `mist-datasource` under the
same zip artifact, and the appliance-level installer should treat it as a
packaged subsystem.

`install-all.ps1` remains the appliance orchestrator:

```text
install-all.ps1
    |
    +-- install or verify MySQL
    +-- call datasource/scripts/deploy_windows.ps1
    +-- install MistBackend service
    +-- run appliance health check
```

`mist-datasource/scripts/deploy_windows.ps1` remains the datasource public
entrypoint. It should keep the existing `-Only install|test|service` shape, but
delegate repeated details to datasource-owned helper scripts:

```text
deploy_windows.ps1
    Public CLI and step orchestration only.

windows-common.ps1
    Console output helpers, .env parsing, command resolution, and HTTP health
    polling shared by datasource scripts.

service-common.ps1
    NSSM service reconciliation for MistTDX and MistQMT.

service-runner.ps1
    Long-running NSSM application entrypoint. It launches uvicorn, records
    crash-loop state, and exits with a sentinel code when the service should
    stop instead of retrying forever.
```

The appliance installer should not run datasource SDK preflight separately and
then call `deploy_windows.ps1` in a way that repeats the same check. Datasource
preflight belongs to `mist-datasource`; the appliance should call the
datasource entrypoint and let it own SDK validation.

## Database strategy

MySQL runs on the Windows API machine.

Redis is not required in the first package because the current backend only has
Redis configuration and dependency metadata; it is not used as a runtime
service for the active API path.

The package must include one database bootstrap path:

```text
Option A: schema.sql generated from the current entities or existing database
Option B: TypeORM migrations, when migrations exist
Option C: import-backup.ps1 for a known-good MySQL dump
```

For the first version, schema or dump import is acceptable. The installer must
not silently start the backend against an empty production database.

## Service layout

Use NSSM for the first version because `mist-datasource` already uses NSSM and
it keeps all services consistent.

```text
MistTDX
    AppDirectory = appliance/datasource
    Command      = powershell.exe -NoProfile -ExecutionPolicy Bypass
                   -File scripts/service-runner.ps1 -Instance tdx

MistQMT
    AppDirectory = appliance/datasource
    Command      = powershell.exe -NoProfile -ExecutionPolicy Bypass
                   -File scripts/service-runner.ps1 -Instance qmt

MistBackend
    AppDirectory = appliance/backend
    Command      = runtime/node.exe dist/apps/mist/main.js
    Port         = 8001
```

`MistTDX` and `MistQMT` should bind to localhost by default. `MistBackend`
should bind to `0.0.0.0` so the Mac or LLM machine can call it over the LAN.

### Datasource NSSM reconciliation

Datasource service registration should be idempotent. The service step should
build a desired service definition for each enabled datasource instance and
reconcile NSSM to that definition.

For each of `MistTDX` and `MistQMT`:

```text
if service is missing:
    install service with the desired runner command
else if service appears to be a Mist datasource service:
    update AppDirectory, Application, AppParameters, log paths, start mode,
    and restart policy
else:
    fail with a clear message instead of overwriting an unrelated service
```

Existing services can be treated as Mist datasource services when their NSSM
configuration points at a datasource directory containing expected markers such
as `pyproject.toml`, `tdx/`, and `qmt/`, or when their command already points at
`tdx.main:app`, `qmt.main:app`, or `service-runner.ps1`. This allows upgrades
from the first manual NSSM layout while avoiding silent takeover of unrelated
Windows services.

### Datasource crash-loop protection

NSSM should provide a delay between restarts, while `service-runner.ps1` should
decide when repeated failures are no longer useful.

Expected behavior:

```text
service-runner.ps1 -Instance tdx
    |
    +-- read crash state from logs/service-runner-tdx-state.json
    +-- if too many recent crashes exist, exit with sentinel code 88
    +-- launch .venv/Scripts/python.exe -m uvicorn tdx.main:app
    +-- wait for process exit
    +-- reset crash state after a stable run
    +-- record crash state after an early failed run
```

Initial thresholds:

```text
Stable run threshold: 60 seconds
Crash window:         10 minutes
Max crashes/window:   5
Sentinel exit code:   88
```

NSSM should be configured so normal non-zero exits restart with delay, while
the sentinel exit code stops the service:

```text
AppThrottle      60000
AppRestartDelay  30000
AppExit Default  Restart
AppExit 88       Exit
```

The exact NSSM field names and behavior should be verified against the packaged
`nssm.exe` during implementation on Windows. If a given NSSM version does not
support one of these fields, the implementation should fail installation with a
clear message rather than silently running without crash-loop protection.

## GitHub Actions changes

Add a new workflow:

```text
.github/workflows/windows-appliance.yml
```

Suggested triggers:

```text
workflow_dispatch
push tags: v*.*.*
```

The old executable workflow should not be the production path. It can be
disabled, renamed as experimental, or left manual-only.

The workflow should publish:

```text
mist-api-appliance-win-x64.zip
manifest.json
```

The manifest should include:

```text
mist commit SHA
mist-datasource commit SHA
Node version
Python requirement
build timestamp
artifact version
```

## Installation flow

```text
1. Install or confirm MySQL on the Windows API machine.
2. Confirm TDX / miniQMT clients are installed, authorized, running, and logged in.
3. Extract the appliance zip to a stable path such as D:/MistAPI.
4. Edit backend/.env and datasource/.env.
5. Run install-all.ps1 as Administrator.
6. Run health-check.ps1.
7. From the Mac, set MIST_API_BASE_URL to http://192.168.31.x:8001.
8. Run mist-skills smoke tests.
```

## Smoke checks

Local Windows checks:

```text
GET http://127.0.0.1:9001/health
GET http://127.0.0.1:9002/health, when QMT is enabled
GET http://127.0.0.1:8001/app/hello
GET http://127.0.0.1:8001/security/v1/all
```

Remote Mac checks:

```text
GET http://192.168.31.x:8001/app/hello
python skills/data-query/scripts/list_indices.py
python skills/data-query/scripts/get_daily_kline.py ...
python skills/technical-indicators/scripts/macd.py ...
python skills/chan-theory/scripts/analyze_chan.py ...
```

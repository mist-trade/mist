# Mist Windows API Appliance

This package turns the authorized Windows market-data machine into the Mist API
machine.

## Topology

```text
Windows API machine
  - MySQL, external or package-local portable
  - TDX / miniQMT clients
  - mist-tdx-datasource on 127.0.0.1:9001
  - MistBackend on 0.0.0.0:8001

Mac / LLM machine
  - mist-skills
  - MIST_API_BASE_URL=http://<windows-lan-ip>:8001
```

Redis is not required for the first appliance release.

## External SDKs

TDX and QMT SDK files are not bundled. Keep them in their existing authorized
installation paths and set the datasource `.env` accordingly.

TDX expected layout:

```text
F:/quant/tdx/PYPlugins/TPythClient.dll
F:/quant/tdx/PYPlugins/tpythclient.py        # if provided by your TDX install
F:/quant/tdx/PYPlugins/user/tqcenter.py
TDX_SDK_PATH=F:/quant/tdx/PYPlugins/user
```

`TDX_SDK_PATH` points to the `user` directory that contains `tqcenter.py`.
`TPythClient.dll` stays one level above it.

QMT expected layout, for later manual or future service enablement:

```text
QMT_PATH=F:/quant/qmt
QMT_SDK_PATH=
```

The appliance currently does not install or start a QMT Windows service.

## Install

1. Choose either an existing external MySQL instance or the package-local
   portable MySQL path.
2. Confirm TDX / miniQMT clients are installed, authorized, running, and logged in.
3. Extract the package to a stable path, for example `D:/MistAPI`.
4. Copy or edit `backend/.env` and `datasource/.env`.
   During the TDX datasource migration, keep the backend default:

   ```text
   TDX_BASE_URL=http://127.0.0.1:9001
   ```

5. Run Administrator PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-all.ps1
```

Portable MySQL path:

```powershell
.\install-all.ps1 -InstallPortableMySQL -RunDatabaseMigrations
```

This installs or reconciles package-local MySQL, runs idempotent bundled
migrations, and preserves existing `mysql/data` on later deployments.

Portable MySQL path, importing an existing dump:

```powershell
.\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
```

Portable MySQL path, importing an explicit schema:

```powershell
.\install-all.ps1 -InstallPortableMySQL -MysqlSchemaFile D:\backups\schema.sql
```

Migrations are stored and tracked under:

```text
database/migrations
database/run-migrations.ps1
```

Portable MySQL binds only to `127.0.0.1:3307`. `MistBackend` still listens on
`0.0.0.0:8001`, so the Mac can call `http://192.168.31.x:8001`.

If MySQL was verified manually and the `mysql` CLI is not available:

```powershell
.\install-all.ps1 -SkipDatabaseCheck
```

## Health check

```powershell
.\health-check.ps1
.\health-check.ps1 -IncludeMySQL
```

From the Mac:

```bash
curl http://<windows-lan-ip>:8001/app/hello
```

Then configure:

```text
MIST_API_BASE_URL=http://<windows-lan-ip>:8001
```

## Datasource services

The TDX service remains the Python `mist-datasource` TDX adapter. It runs as the
WinSW-managed Windows service `mist-tdx-datasource` and exposes normalized
HTTP/WebSocket APIs on `127.0.0.1:9001` for the Mist backend. The backend
`TDX_BASE_URL` default remains `http://127.0.0.1:9001`.

`MistBackend` is also installed through WinSW. The appliance does not require or
bundle NSSM. During deployment, old `MistBackend`, `MistTDX`, and `MistQMT`
service registrations are stopped and deleted before the WinSW services are
installed.

Install or update the TDX WinSW service from the datasource package:

```powershell
cd datasource
.\scripts\winsw\install-tdx-datasource.ps1 -WinSWExe D:\tools\winsw\winsw.exe
.\scripts\winsw\test-tdx-datasource.ps1
```

If the legacy NSSM `MistTDX` service is still present, stop or disable it before
starting `mist-tdx-datasource`, or let the installer do that explicitly:

```powershell
.\scripts\winsw\install-tdx-datasource.ps1 -WinSWExe D:\tools\winsw\winsw.exe -DisableLegacyMistTDX
```

Uninstall only the WinSW TDX service:

```powershell
.\scripts\winsw\uninstall-tdx-datasource.ps1
```

This does not remove TDX terminal files, proprietary SDK files, or strategy
files. TDX desktop login, authorization checks, and strategy cleanup remain
outside public service automation; operators or private guards should use
`http://127.0.0.1:9001/health` to inspect `tdxHttpReachable`, `tqInitialized`,
`eventQueueDepth`, and `collectorState`.

The new TDX path does not require `DATASOURCE_DB`. NestJS/MySQL remains the owner
of durable subscription intent and K-line persistence.

WinSW logs are under:

```text
datasource/logs/mist-tdx-datasource
```

QMT is intentionally paused in the appliance service layer. Keep the miniQMT
client and paths in place if you need them later, but this package does not
register or start `MistQMT`.

Useful service commands:

```powershell
.\datasource\scripts\winsw\test-tdx-datasource.ps1
Get-Service mist-tdx-datasource
Get-Service MistBackend
Restart-Service mist-tdx-datasource
Restart-Service MistBackend
```

The datasource runner delays normal restarts and stops retrying after repeated
early crashes. This usually means the SDK path, terminal login, `.env`, or port
binding needs attention. After fixing the issue, remove the crash-loop state
file and restart the affected service:

```powershell
Restart-Service mist-tdx-datasource
Restart-Service MistBackend
```

The most useful logs are:

```text
datasource/logs/mist-tdx-datasource
backend/logs/backend-stdout.log
backend/logs/backend-stderr.log
```

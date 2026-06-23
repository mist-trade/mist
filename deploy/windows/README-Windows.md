# Mist Windows API Appliance

This package turns the authorized Windows market-data machine into the Mist API
machine.

## Topology

```text
Windows API machine
  - MySQL, external or package-local portable
  - TDX / miniQMT clients
  - MistTDX on 127.0.0.1:9001
  - MistQMT on 127.0.0.1:9002, optional
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

QMT expected layout:

```text
QMT_PATH=F:/quant/qmt
QMT_SDK_PATH=
```

Leave `QMT_SDK_PATH` empty to skip QMT service installation.

## Install

1. Choose either an existing external MySQL instance or the package-local
   portable MySQL path.
2. Confirm TDX / miniQMT clients are installed, authorized, running, and logged in.
3. Extract the package to a stable path, for example `D:/MistAPI`.
4. Copy or edit `backend/.env` and `datasource/.env`.
5. Run Administrator PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-all.ps1
```

Portable MySQL path, importing an existing dump:

```powershell
.\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
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

The appliance installs datasource services through the datasource deployment
entrypoint:

```text
datasource/scripts/deploy_windows.ps1
```

`MistTDX` and `MistQMT` are reconciled on every install. If a service already
belongs to a Mist datasource package, the installer updates its working
directory, command, logs, and restart policy. If another unrelated service uses
the same name, installation fails instead of overwriting it.

Useful NSSM commands:

```powershell
nssm status MistTDX
nssm status MistQMT
nssm restart MistTDX
nssm restart MistQMT
nssm stop MistTDX
```

The datasource runner delays normal restarts and stops retrying after repeated
early crashes. This usually means the SDK path, terminal login, `.env`, or port
binding needs attention. After fixing the issue, remove the crash-loop state
file and restart the service:

```powershell
Remove-Item datasource\logs\service-runner-tdx-state.json -ErrorAction SilentlyContinue
Remove-Item datasource\logs\service-runner-qmt-state.json -ErrorAction SilentlyContinue
nssm restart MistTDX
nssm restart MistQMT
```

The most useful logs are:

```text
datasource/logs/tdx-stdout.log
datasource/logs/tdx-stderr.log
datasource/logs/qmt-stdout.log
datasource/logs/qmt-stderr.log
```

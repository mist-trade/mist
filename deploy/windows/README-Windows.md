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
D:/tdx/PYPlugins/TPythClient.dll
D:/tdx/PYPlugins/user/tqcenter.py
TDX_SDK_PATH=D:/tdx/PYPlugins/user
```

QMT expected layout:

```text
QMT_PATH=D:/miniQMT
QMT_SDK_PATH=D:/miniQMT/Lib
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

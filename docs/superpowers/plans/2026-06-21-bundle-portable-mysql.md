# Bundle Portable MySQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional portable MySQL runtime to the Windows API appliance while preserving the existing external-MySQL install path.

**Architecture:** The GitHub Actions workflow downloads and verifies an official MySQL 8.4 LTS Windows ZIP at package time, then places the extracted runtime under `mysql/runtime/mysql-8.4.10`. Target-machine scripts own all mutable state under `mysql/`, including `data`, `logs`, `credentials.env`, and `state.json`; `install-all.ps1` calls the portable installer only when `-InstallPortableMySQL` is passed.

**Tech Stack:** GitHub Actions, PowerShell 7/Windows PowerShell-compatible scripts, MySQL 8.4.10 LTS Windows ZIP, NSSM, NestJS backend package, OpenSpec.

---

### Task 1: Package the MySQL Runtime

**Files:**

- Modify: `.github/workflows/windows-appliance.yml`
- Create: `deploy/windows/mysql/THIRD-PARTY-NOTICES.md`
- Modify: `openspec/changes/bundle-portable-mysql/tasks.md`

- [ ] **Step 1: Add MySQL package constants to the workflow**

Add these environment values near the existing workflow `env` block:

```yaml
MYSQL_VERSION: 8.4.10
MYSQL_ZIP_URL: https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.10-winx64.zip
MYSQL_ZIP_SHA256: 3b950db31c33fb59252568c012bd9ee5fac50811e778ca7c8f1a0dc91686cd6f
MYSQL_ZIP_MD5: 150f12262df6ac88d43862a0e683eb81
```

The MD5 value matches the checksum shown on the MySQL download page for the Windows ZIP. The SHA256 value is pinned from the downloaded official ZIP and is the primary workflow gate.

- [ ] **Step 2: Add a workflow step that downloads and verifies MySQL**

Insert this step before `Assemble appliance`:

```yaml
- name: Download MySQL portable runtime
  shell: pwsh
  run: |
    $ErrorActionPreference = "Stop"
    $downloadDir = Join-Path $env:RUNNER_TEMP "mysql-download"
    $runtimeRoot = Join-Path $env:RUNNER_TEMP "mysql-runtime"
    $zip = Join-Path $downloadDir "mysql-$env:MYSQL_VERSION-winx64.zip"

    if (Test-Path $downloadDir) { Remove-Item $downloadDir -Recurse -Force }
    if (Test-Path $runtimeRoot) { Remove-Item $runtimeRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $downloadDir | Out-Null
    New-Item -ItemType Directory -Path $runtimeRoot | Out-Null

    Invoke-WebRequest -Uri $env:MYSQL_ZIP_URL -OutFile $zip

    $sha256 = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sha256 -ne $env:MYSQL_ZIP_SHA256) {
      throw "MySQL ZIP SHA256 mismatch. Expected $env:MYSQL_ZIP_SHA256, got $sha256"
    }

    $md5 = (Get-FileHash -Path $zip -Algorithm MD5).Hash.ToLowerInvariant()
    if ($md5 -ne $env:MYSQL_ZIP_MD5) {
      throw "MySQL ZIP MD5 mismatch. Expected $env:MYSQL_ZIP_MD5, got $md5"
    }

    Expand-Archive -Path $zip -DestinationPath $runtimeRoot
    $expanded = Get-ChildItem $runtimeRoot -Directory | Select-Object -First 1
    if (-not $expanded) { throw "MySQL archive did not expand to a runtime directory" }

    foreach ($required in @("bin\mysqld.exe", "bin\mysql.exe", "bin\mysqldump.exe")) {
      $path = Join-Path $expanded.FullName $required
      if (-not (Test-Path $path -PathType Leaf)) {
        throw "MySQL runtime missing required file: $required"
      }
    }

    "MYSQL_RUNTIME_DIR=$($expanded.FullName)" >> $env:GITHUB_ENV
```

- [ ] **Step 3: Copy MySQL runtime and scripts into the appliance**

In `Assemble appliance`, add these directories after the existing package directories are created:

```powershell
New-Item -ItemType Directory -Path (Join-Path $pkg "mysql") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $pkg "mysql\runtime") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $pkg "mysql\data") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $pkg "mysql\logs") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $pkg "mysql\scripts") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $pkg "third-party-notices\mysql") | Out-Null
```

Then copy the runtime and scripts:

```powershell
$mysqlRuntimeTarget = Join-Path $pkg "mysql\runtime\mysql-${{ env.MYSQL_VERSION }}"
Copy-Item $env:MYSQL_RUNTIME_DIR $mysqlRuntimeTarget -Recurse
Copy-Item (Join-Path $mistDir "deploy\windows\mysql\*.ps1") (Join-Path $pkg "mysql\scripts")
Copy-Item (Join-Path $mistDir "deploy\windows\mysql\THIRD-PARTY-NOTICES.md") (Join-Path $pkg "third-party-notices\mysql")
```

- [ ] **Step 4: Extend `manifest.json`**

Add these manifest fields to the existing ordered hashtable:

```powershell
mysqlBundled = $true
mysqlVersion = "${{ env.MYSQL_VERSION }}"
mysqlSha256 = "${{ env.MYSQL_ZIP_SHA256 }}"
mysqlMd5 = "${{ env.MYSQL_ZIP_MD5 }}"
mysqlDefaultPort = 3307
mysqlServiceName = "MistMySQL"
portableMysqlDataPreservedOnUninstall = $true
mysqlLicenseNoticePath = "third-party-notices/mysql/THIRD-PARTY-NOTICES.md"
```

- [ ] **Step 5: Add the MySQL notice file**

Create `deploy/windows/mysql/THIRD-PARTY-NOTICES.md`:

```markdown
# Third-Party Notices: MySQL

The Windows API appliance may include the official MySQL Community Server
Windows ZIP runtime.

- Component: MySQL Community Server
- Version: 8.4.10 LTS
- Source: https://dev.mysql.com/downloads/mysql/
- Runtime archive: mysql-8.4.10-winx64.zip
- Official MD5: 150f12262df6ac88d43862a0e683eb81
- Pinned SHA256: 3b950db31c33fb59252568c012bd9ee5fac50811e778ca7c8f1a0dc91686cd6f

Review Oracle's MySQL Community Server license terms before distributing this
artifact outside internal deployment.
```

- [ ] **Step 6: Run workflow syntax checks**

Run:

```bash
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH node -e "const fs=require('fs'); const yaml=require('yaml'); yaml.parse(fs.readFileSync('.github/workflows/windows-appliance.yml','utf8')); console.log('yaml ok')"
```

Expected: `yaml ok`.

- [ ] **Step 7: Update OpenSpec task checkboxes for completed packaging tasks**

In `openspec/changes/bundle-portable-mysql/tasks.md`, check tasks 1.1, 1.2, 1.6, 2.1 through 2.7 after the workflow syntax check passes.

- [ ] **Step 8: Commit packaging changes**

Run:

```bash
git add .github/workflows/windows-appliance.yml deploy/windows/mysql/THIRD-PARTY-NOTICES.md openspec/changes/bundle-portable-mysql/tasks.md
git commit -m "feat: package portable mysql runtime"
```

### Task 2: Add Shared Portable MySQL PowerShell Helpers

**Files:**

- Create: `deploy/windows/mysql/mysql-common.ps1`
- Modify: `openspec/changes/bundle-portable-mysql/tasks.md`

- [ ] **Step 1: Create `mysql-common.ps1` with path and env helpers**

Create `deploy/windows/mysql/mysql-common.ps1` with these functions:

```powershell
$Script:MistPortableMysqlDefaultServiceName = "MistMySQL"
$Script:MistPortableMysqlDefaultDatabase = "mist"
$Script:MistPortableMysqlDefaultAppUser = "mist_app"

function Resolve-ApplianceRoot {
    param([string]$RootDir)
    if ($RootDir) { return (Resolve-Path $RootDir).Path }
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-PortableMysqlPaths {
    param([string]$RootDir, [string]$Version)
    $root = Resolve-ApplianceRoot -RootDir $RootDir
    $mysqlDir = Join-Path $root "mysql"
    $runtimeDir = Join-Path $mysqlDir "runtime\mysql-$Version"
    [ordered]@{
        RootDir = $root
        MysqlDir = $mysqlDir
        RuntimeDir = $runtimeDir
        BinDir = Join-Path $runtimeDir "bin"
        MysqldExe = Join-Path $runtimeDir "bin\mysqld.exe"
        MysqlExe = Join-Path $runtimeDir "bin\mysql.exe"
        MysqlDumpExe = Join-Path $runtimeDir "bin\mysqldump.exe"
        DataDir = Join-Path $mysqlDir "data"
        LogsDir = Join-Path $mysqlDir "logs"
        MyIni = Join-Path $mysqlDir "my.ini"
        CredentialsFile = Join-Path $mysqlDir "credentials.env"
        StateFile = Join-Path $mysqlDir "state.json"
    }
}

function Read-KeyValueFile {
    param([string]$Path)
    $values = @{}
    if (-not (Test-Path $Path -PathType Leaf)) { return $values }
    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*#') { continue }
        if ($line -notmatch '^\s*([^=]+?)\s*=\s*(.*)\s*$') { continue }
        $values[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
    }
    return $values
}

function Write-KeyValueFile {
    param([string]$Path, [hashtable]$Values)
    $lines = foreach ($key in ($Values.Keys | Sort-Object)) {
        "$key=$($Values[$key])"
    }
    Set-Content -Path $Path -Value $lines -Encoding UTF8
}
```

- [ ] **Step 2: Add credential and ACL helpers**

Append:

```powershell
function New-PortableMysqlPassword {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd("=")
}

function Protect-PortableMysqlSecretFile {
    param([string]$Path)
    if ($IsWindows -eq $false) { return }
    icacls $Path /inheritance:r | Out-Null
    icacls $Path /grant:r "Administrators:F" "SYSTEM:F" | Out-Null
}
```

- [ ] **Step 3: Add MySQL CLI helpers**

Append:

```powershell
function Invoke-MySqlCli {
    param(
        [string]$MysqlExe,
        [string]$HostName,
        [int]$Port,
        [string]$User,
        [string]$Password,
        [string[]]$Arguments
    )
    $args = @("-h", $HostName, "-P", "$Port", "-u", $User)
    if ($Password) { $args += "-p$Password" }
    $args += $Arguments
    & $MysqlExe @args
    if ($LASTEXITCODE -ne 0) {
        throw "mysql.exe failed with exit code $LASTEXITCODE"
    }
}

function Invoke-MySqlScalar {
    param(
        [string]$MysqlExe,
        [string]$HostName,
        [int]$Port,
        [string]$User,
        [string]$Password,
        [string]$Query
    )
    $args = @("-N", "-B", "-e", $Query)
    $output = Invoke-MySqlCli -MysqlExe $MysqlExe -HostName $HostName -Port $Port -User $User -Password $Password -Arguments $args
    return "$output".Trim()
}
```

- [ ] **Step 4: Add service ownership and port helpers**

Append:

```powershell
function Get-WindowsServicePathName {
    param([string]$ServiceName)
    if (-not $IsWindows) { return $null }
    $svc = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
    if (-not $svc) { return $null }
    return $svc.PathName
}

function Test-PortableMysqlServiceOwnedByAppliance {
    param([string]$ServiceName, [string]$MysqldExe, [string]$MyIni, [string]$StateFile)
    $pathName = Get-WindowsServicePathName -ServiceName $ServiceName
    if (-not $pathName) { return $true }
    $ownsExe = $pathName -like "*$MysqldExe*"
    $ownsIni = $pathName -like "*$MyIni*"
    if (-not ($ownsExe -and $ownsIni)) { return $false }
    if (-not (Test-Path $StateFile -PathType Leaf)) { return $false }
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    return ($state.serviceName -eq $ServiceName)
}

function Test-TcpPortAvailable {
    param([int]$Port)
    if ($IsWindows) {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return ($null -eq $listener)
    }
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(200)
        if ($connected) { $client.EndConnect($async) }
        return (-not $connected)
    } finally {
        $client.Dispose()
    }
}
```

- [ ] **Step 5: Run PowerShell parser check**

Run:

```bash
pwsh -NoLogo -NoProfile -Command '$ErrorActionPreference="Stop"; [System.Management.Automation.Language.Parser]::ParseFile("deploy/windows/mysql/mysql-common.ps1",[ref]$null,[ref]$errors) > $null; if ($errors.Count) { $errors | Format-List; exit 1 }; "parser ok"'
```

Expected: `parser ok`.

- [ ] **Step 6: Update OpenSpec task checkboxes**

Check tasks 3.9, 3.10, 3.11, and 3.12 after the parser check passes.

- [ ] **Step 7: Commit helper script**

Run:

```bash
git add deploy/windows/mysql/mysql-common.ps1 openspec/changes/bundle-portable-mysql/tasks.md
git commit -m "feat: add portable mysql helpers"
```

### Task 3: Install Portable MySQL and Wire It Into `install-all.ps1`

**Files:**

- Create: `deploy/windows/mysql/install-portable-mysql.ps1`
- Modify: `deploy/windows/install-all.ps1`
- Modify: `deploy/windows/backend.env.example`
- Modify: `openspec/changes/bundle-portable-mysql/tasks.md`

- [ ] **Step 1: Add installer parameters to `install-all.ps1`**

Change the `param` block to:

```powershell
param(
    [switch]$SkipDatabaseCheck,
    [switch]$SkipDatasourceTest,
    [switch]$InstallPortableMySQL,
    [int]$MysqlPort = 3307,
    [string]$MysqlDumpFile = "",
    [string]$MysqlSchemaFile = ""
)
```

- [ ] **Step 2: Create `install-portable-mysql.ps1`**

Create the file with this public parameter contract:

```powershell
param(
    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Version = "8.4.10",
    [string]$ServiceName = "MistMySQL",
    [int]$Port = 3307,
    [string]$Database = "mist",
    [string]$AppUser = "mist_app",
    [string]$DumpFile = "",
    [string]$SchemaFile = ""
)
```

The script starts with:

```powershell
. (Join-Path $PSScriptRoot "mysql-common.ps1")
$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version
foreach ($required in @($paths.MysqldExe, $paths.MysqlExe, $paths.MysqlDumpExe)) {
    if (-not (Test-Path $required -PathType Leaf)) { throw "Missing MySQL runtime file: $required" }
}
if (-not (Test-PortableMysqlServiceOwnedByAppliance -ServiceName $ServiceName -MysqldExe $paths.MysqldExe -MyIni $paths.MyIni -StateFile $paths.StateFile)) {
    throw "$ServiceName exists but is not owned by this appliance"
}
if (-not (Test-Path (Join-Path $paths.DataDir "auto.cnf") -PathType Leaf) -and -not (Test-TcpPortAvailable -Port $Port)) {
    throw "Port $Port is already occupied"
}
```

Then generate `mysql/my.ini` with an interpolated here-string:

```powershell
$myIni = @"
[mysqld]
basedir=$($paths.RuntimeDir)
datadir=$($paths.DataDir)
port=$Port
bind-address=127.0.0.1
log-error=$($paths.LogsDir.Replace("\", "/"))/mysql.err
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

[client]
port=$Port
host=127.0.0.1
default-character-set=utf8mb4
"@
Set-Content -Path $paths.MyIni -Value $myIni -Encoding ASCII
```

- [ ] **Step 3: Implement first-run initialization**

In `install-portable-mysql.ps1`, treat an initialized data directory as one containing `auto.cnf`. If it is missing:

```powershell
New-Item -ItemType Directory -Force -Path $paths.DataDir, $paths.LogsDir | Out-Null
& $paths.MysqldExe "--defaults-file=$($paths.MyIni)" "--initialize-insecure"
if ($LASTEXITCODE -ne 0) { throw "mysqld --initialize-insecure failed" }
```

Before initialization, enforce the supported runtime line for existing state:

```powershell
if (Test-Path $paths.StateFile -PathType Leaf) {
    $state = Get-Content $paths.StateFile -Raw | ConvertFrom-Json
    if ("$($state.runtimeVersion)" -notlike "8.4.*") {
        throw "Portable MySQL data was initialized by runtime $($state.runtimeVersion). Take a dump backup and run an explicit MySQL upgrade before using runtime $Version."
    }
}
```

Generate credentials only if `credentials.env` does not exist:

```powershell
$rootPassword = New-PortableMysqlPassword
$appPassword = New-PortableMysqlPassword
Write-KeyValueFile -Path $paths.CredentialsFile -Values @{
    MYSQL_ROOT_PASSWORD = $rootPassword
    MYSQL_APP_USER = $AppUser
    MYSQL_APP_PASSWORD = $appPassword
    MYSQL_PORT = "$Port"
}
Protect-PortableMysqlSecretFile -Path $paths.CredentialsFile
```

After that branch, always reload credentials so reruns use the existing values:

```powershell
$creds = Read-KeyValueFile -Path $paths.CredentialsFile
$rootPassword = $creds.MYSQL_ROOT_PASSWORD
$appPassword = $creds.MYSQL_APP_PASSWORD
if (-not $rootPassword -or -not $appPassword) {
    throw "Portable MySQL credentials.env is missing MYSQL_ROOT_PASSWORD or MYSQL_APP_PASSWORD"
}
```

- [ ] **Step 4: Register and start `MistMySQL`**

Use native Windows service registration:

```powershell
$binPath = "`"$($paths.MysqldExe)`" --defaults-file=`"$($paths.MyIni)`" $ServiceName"
if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    New-Service -Name $ServiceName -BinaryPathName $binPath -DisplayName $ServiceName -StartupType Automatic | Out-Null
}
Start-Service -Name $ServiceName
```

Add a readiness loop that uses an empty password only on first initialization:

```powershell
$rootPasswordForProbe = ""
if (Test-Path $paths.StateFile -PathType Leaf) { $rootPasswordForProbe = $rootPassword }
for ($i = 0; $i -lt 60; $i++) {
    try {
        Invoke-MySqlScalar -MysqlExe $paths.MysqlExe -HostName "127.0.0.1" -Port $Port -User "root" -Password $rootPasswordForProbe -Query "SELECT 1;" | Out-Null
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
```

- [ ] **Step 5: Secure root, create app user, and bootstrap database**

After first-run startup, build SQL with the generated values and set the root password. On reruns, skip the `ALTER USER` statement and execute the database/user grant SQL with the stored root password:

```powershell
$rootPasswordSql = $rootPassword.Replace("'", "''")
$appPasswordSql = $appPassword.Replace("'", "''")
$rootPasswordForSql = ""
$alterRootSql = ""
if (-not (Test-Path $paths.StateFile -PathType Leaf)) {
    $alterRootSql = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPasswordSql';"
} else {
    $rootPasswordForSql = $rootPassword
}
$bootstrapSql = @"
$alterRootSql
CREATE DATABASE IF NOT EXISTS ``$Database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$AppUser'@'localhost' IDENTIFIED BY '$appPasswordSql';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP ON ``$Database``.* TO '$AppUser'@'localhost';
FLUSH PRIVILEGES;
"@
Invoke-MySqlCli -MysqlExe $paths.MysqlExe -HostName "127.0.0.1" -Port $Port -User "root" -Password $rootPasswordForSql -Arguments @("-e", $bootstrapSql)
```

Use the root password for all later commands. Before starting `MistBackend`, check:

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='mist';
```

If the count is `0`, import `-MysqlDumpFile` or `-MysqlSchemaFile`. If neither exists, throw exactly:

```powershell
throw "Portable MySQL database '$Database' has no tables. Provide -MysqlDumpFile D:\backups\mist.sql or -MysqlSchemaFile .\database\schema.sql."
```

At the end of the script, return the application connection information:

```powershell
$runtimeSha256 = ""
$manifestPath = Join-Path $RootDir "manifest.json"
if (Test-Path $manifestPath -PathType Leaf) {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $runtimeSha256 = "$($manifest.mysqlSha256)"
}
$state = [ordered]@{
    serviceName = $ServiceName
    port = $Port
    bindAddress = "127.0.0.1"
    runtimeVersion = $Version
    runtimeSha256 = $runtimeSha256
    runtimePath = $paths.RuntimeDir
    dataDir = $paths.DataDir
    initializedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$state | ConvertTo-Json -Depth 4 | Set-Content -Path $paths.StateFile -Encoding UTF8

[pscustomobject]@{
    Host = "127.0.0.1"
    Port = $Port
    Database = $Database
    AppUser = $AppUser
    AppPassword = $appPassword
}
```

- [ ] **Step 6: Update backend `.env` only for portable install**

Add this `Set-EnvValue` helper to `install-all.ps1` next to `Get-EnvValue`:

```powershell
function Set-EnvValue($path, $name, $value) {
    $line = "$name=$value"
    if (-not (Test-Path $path -PathType Leaf)) {
        Set-Content -Path $path -Value $line -Encoding UTF8
        return
    }
    $content = Get-Content $path -Raw
    $pattern = "(?m)^\s*$([regex]::Escape($name))\s*=.*$"
    if ([regex]::IsMatch($content, $pattern)) {
        $content = [regex]::Replace($content, $pattern, $line)
    } else {
        if (-not $content.EndsWith("`n")) { $content += "`n" }
        $content += "$line`n"
    }
    Set-Content -Path $path -Value $content -Encoding UTF8
}
```

Call it after portable MySQL install succeeds:

```powershell
Set-EnvValue $backendEnv "mysql_server_host" "127.0.0.1"
Set-EnvValue $backendEnv "mysql_server_port" "$MysqlPort"
Set-EnvValue $backendEnv "mysql_server_username" "mist_app"
Set-EnvValue $backendEnv "mysql_server_password" $portable.AppPassword
Set-EnvValue $backendEnv "mysql_server_database" "mist"
```

Do not change backend `.env` when `-InstallPortableMySQL` is absent.

- [ ] **Step 7: Call portable installer before database check**

Insert this block before `Test-DatabaseInitialized -BackendEnvFile $backendEnv`:

```powershell
if ($InstallPortableMySQL) {
    Write-Step "Install portable MySQL"
    $mysqlInstaller = Join-Path $RootDir "mysql\scripts\install-portable-mysql.ps1"
    $portable = & $mysqlInstaller -RootDir $RootDir -Port $MysqlPort -DumpFile $MysqlDumpFile -SchemaFile $MysqlSchemaFile
    Set-EnvValue $backendEnv "mysql_server_host" "127.0.0.1"
    Set-EnvValue $backendEnv "mysql_server_port" "$MysqlPort"
    Set-EnvValue $backendEnv "mysql_server_username" "mist_app"
    Set-EnvValue $backendEnv "mysql_server_password" $portable.AppPassword
    Set-EnvValue $backendEnv "mysql_server_database" "mist"
}
```

- [ ] **Step 8: Let database check use bundled mysql.exe**

Change `Test-DatabaseInitialized` to prefer `mysql/runtime/mysql-8.4.10/bin/mysql.exe` when `backend/.env` points to `127.0.0.1:$MysqlPort`; otherwise keep the existing `Get-Command mysql` behavior.

- [ ] **Step 9: Update env example**

Change `deploy/windows/backend.env.example` MySQL comments to state:

```text
# External MySQL default: port 3306.
# Portable MySQL install rewrites these values to 127.0.0.1:3307 and mist_app.
```

- [ ] **Step 10: Run parser checks**

Run:

```bash
pwsh -NoLogo -NoProfile -Command '$ErrorActionPreference="Stop"; foreach ($f in "deploy/windows/install-all.ps1","deploy/windows/mysql/install-portable-mysql.ps1") { [System.Management.Automation.Language.Parser]::ParseFile($f,[ref]$null,[ref]$errors) > $null; if ($errors.Count) { Write-Host $f; $errors | Format-List; exit 1 } }; "parser ok"'
```

Expected: `parser ok`.

- [ ] **Step 11: Update OpenSpec task checkboxes**

Check tasks 1.3, 1.4, 1.5, 3.1 through 3.8, 3.13, and 4.1 through 4.6 after parser checks pass.

- [ ] **Step 12: Commit install integration**

Run:

```bash
git add deploy/windows/install-all.ps1 deploy/windows/backend.env.example deploy/windows/mysql/install-portable-mysql.ps1 openspec/changes/bundle-portable-mysql/tasks.md
git commit -m "feat: install portable mysql"
```

### Task 4: Add Backup, Restore, and Uninstall Behavior

**Files:**

- Create: `deploy/windows/mysql/backup-mysql.ps1`
- Create: `deploy/windows/mysql/restore-mysql.ps1`
- Create: `deploy/windows/mysql/uninstall-portable-mysql.ps1`
- Modify: `deploy/windows/uninstall-all.ps1`
- Modify: `openspec/changes/bundle-portable-mysql/tasks.md`

- [ ] **Step 1: Add `backup-mysql.ps1`**

Create a script with:

```powershell
param(
    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Version = "8.4.10",
    [string]$Database = "mist",
    [string]$OutputDir = ""
)
. (Join-Path $PSScriptRoot "mysql-common.ps1")
$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version
$creds = Read-KeyValueFile -Path $paths.CredentialsFile
if (-not $OutputDir) { $OutputDir = Join-Path $paths.MysqlDir "backups" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dump = Join-Path $OutputDir "$Database-$stamp.sql"
$port = 3307
if ($creds.ContainsKey("MYSQL_PORT") -and $creds.MYSQL_PORT) { $port = [int]$creds.MYSQL_PORT }
& $paths.MysqlDumpExe "-h" "127.0.0.1" "-P" "$port" "-u" $creds.MYSQL_APP_USER "-p$($creds.MYSQL_APP_PASSWORD)" $Database "--result-file=$dump"
if ($LASTEXITCODE -ne 0) { throw "mysqldump.exe failed with exit code $LASTEXITCODE" }
Write-Host "Backup written: $dump" -ForegroundColor Green
```

- [ ] **Step 2: Add `restore-mysql.ps1`**

Create a script that accepts `-DumpFile` and `-Force`. It must query table count before import:

```powershell
$count = [int](Invoke-MySqlScalar -MysqlExe $paths.MysqlExe -HostName "127.0.0.1" -Port $Port -User "root" -Password $creds.MYSQL_ROOT_PASSWORD -Query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='mist';")
if ($count -gt 0 -and -not $Force) {
    throw "Database mist already has $count tables. Rerun with -Force to restore over existing data."
}
```

Then run:

```powershell
Get-Content $DumpFile | & $paths.MysqlExe "-h" "127.0.0.1" "-P" "$Port" "-u" "root" "-p$($creds.MYSQL_ROOT_PASSWORD)" "mist"
if ($LASTEXITCODE -ne 0) { throw "restore failed with exit code $LASTEXITCODE" }
```

- [ ] **Step 3: Add `uninstall-portable-mysql.ps1`**

Create a script with:

```powershell
param(
    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Version = "8.4.10",
    [string]$ServiceName = "MistMySQL",
    [switch]$RemoveData
)
. (Join-Path $PSScriptRoot "mysql-common.ps1")
$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version
if (-not (Test-PortableMysqlServiceOwnedByAppliance -ServiceName $ServiceName -MysqldExe $paths.MysqldExe -MyIni $paths.MyIni -StateFile $paths.StateFile)) {
    throw "$ServiceName exists but is not owned by this appliance"
}
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
}
if ($RemoveData) {
    Write-Host "Removing portable MySQL data: $($paths.DataDir)" -ForegroundColor Red
    Remove-Item $paths.DataDir -Recurse -Force
} else {
    Write-Host "Preserved portable MySQL data: $($paths.DataDir)" -ForegroundColor Yellow
}
```

- [ ] **Step 4: Wire uninstall into `uninstall-all.ps1`**

Add a param block:

```powershell
param(
    [switch]$RemovePortableMySQLData
)
```

Call the portable uninstaller after backend uninstall and before datasource service removal:

```powershell
$portableMysqlUninstall = Join-Path $RootDir "mysql\scripts\uninstall-portable-mysql.ps1"
if (Test-Path $portableMysqlUninstall -PathType Leaf) {
    & $portableMysqlUninstall -RootDir $RootDir -RemoveData:$RemovePortableMySQLData
}
```

- [ ] **Step 5: Run parser checks**

Run:

```bash
pwsh -NoLogo -NoProfile -Command '$ErrorActionPreference="Stop"; foreach ($f in "deploy/windows/mysql/backup-mysql.ps1","deploy/windows/mysql/restore-mysql.ps1","deploy/windows/mysql/uninstall-portable-mysql.ps1","deploy/windows/uninstall-all.ps1") { [System.Management.Automation.Language.Parser]::ParseFile($f,[ref]$null,[ref]$errors) > $null; if ($errors.Count) { Write-Host $f; $errors | Format-List; exit 1 } }; "parser ok"'
```

Expected: `parser ok`.

- [ ] **Step 6: Update OpenSpec task checkboxes**

Check tasks 5.1 through 5.7 after parser checks pass.

- [ ] **Step 7: Commit lifecycle scripts**

Run:

```bash
git add deploy/windows/uninstall-all.ps1 deploy/windows/mysql/backup-mysql.ps1 deploy/windows/mysql/restore-mysql.ps1 deploy/windows/mysql/uninstall-portable-mysql.ps1 openspec/changes/bundle-portable-mysql/tasks.md
git commit -m "feat: add portable mysql lifecycle scripts"
```

### Task 5: Add Health Checks and Documentation

**Files:**

- Modify: `deploy/windows/health-check.ps1`
- Modify: `deploy/windows/README-Windows.md`
- Modify: `deploy/windows/database/README.md`
- Modify: `openspec/changes/bundle-portable-mysql/tasks.md`

- [ ] **Step 1: Add MySQL parameters to health check**

Change the health check `param` block to:

```powershell
param(
    [string]$BackendHost = "127.0.0.1",
    [switch]$IncludeQMT,
    [switch]$IncludeMySQL
)
```

Add helpers to read `backend/.env`, detect `127.0.0.1:3307`, and choose bundled `mysql.exe`:

```powershell
$RootDir = $PSScriptRoot
$BackendEnv = Join-Path $RootDir "backend\.env"

function Get-EnvValue($path, $name) {
    if (-not (Test-Path $path -PathType Leaf)) { return "" }
    $content = Get-Content $path -Raw
    $pattern = "(?m)^\s*$([regex]::Escape($name))\s*=\s*(.*?)\s*(?:#.*)?$"
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) { return "" }
    return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Resolve-HealthMysqlExe {
    $portable = Join-Path $RootDir "mysql\runtime\mysql-8.4.10\bin\mysql.exe"
    if (Test-Path $portable -PathType Leaf) { return $portable }
    $cmd = Get-Command mysql -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return ""
}
```

- [ ] **Step 2: Add service, TCP, and schema checks**

When `-IncludeMySQL` is passed or backend `.env` points at `127.0.0.1:3307`, check:

```powershell
$mysqlHost = Get-EnvValue $BackendEnv "mysql_server_host"
$mysqlPort = Get-EnvValue $BackendEnv "mysql_server_port"
$mysqlUser = Get-EnvValue $BackendEnv "mysql_server_username"
$mysqlPassword = Get-EnvValue $BackendEnv "mysql_server_password"
$mysqlDatabase = Get-EnvValue $BackendEnv "mysql_server_database"
$usePortableMysql = $IncludeMySQL -or ($mysqlHost -eq "127.0.0.1" -and $mysqlPort -eq "3307")
if ($usePortableMysql) {
    try {
        $service = Get-Service -Name "MistMySQL" -ErrorAction Stop
        if ($service.Status -eq "Running") {
            Write-Host "  [OK] MistMySQL service is running" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] MistMySQL service status is $($service.Status)" -ForegroundColor Red
            $ok = $false
        }
    } catch {
        Write-Host "  [FAIL] MistMySQL service not found" -ForegroundColor Red
        $ok = $false
    }

    $tcp = Test-NetConnection -ComputerName "127.0.0.1" -Port ([int]$mysqlPort) -WarningAction SilentlyContinue
    if ($tcp.TcpTestSucceeded) {
        Write-Host "  [OK] MySQL TCP 127.0.0.1:$mysqlPort" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] MySQL TCP 127.0.0.1:$mysqlPort unavailable" -ForegroundColor Red
        $ok = $false
    }

    $mysqlExe = Resolve-HealthMysqlExe
    if (-not $mysqlExe) {
        Write-Host "  [FAIL] mysql.exe not found" -ForegroundColor Red
        $ok = $false
    } else {
        $query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$mysqlDatabase';"
        $args = @("-h", $mysqlHost, "-P", $mysqlPort, "-u", $mysqlUser, "-p$mysqlPassword", "-N", "-B", "-e", $query)
        $tableCount = & $mysqlExe @args
        if ($LASTEXITCODE -ne 0 -or [int]$tableCount -le 0) {
            Write-Host "  [FAIL] MySQL database '$mysqlDatabase' is not initialized" -ForegroundColor Red
            $ok = $false
        } else {
            Write-Host "  [OK] MySQL database '$mysqlDatabase' has $tableCount tables" -ForegroundColor Green
        }
    }
}
```

- [ ] **Step 3: Update README install paths**

In `deploy/windows/README-Windows.md`, document both install paths:

```powershell
# Existing external MySQL path
.\install-all.ps1

# Portable MySQL path, importing an existing dump
.\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
```

State that portable MySQL binds to `127.0.0.1:3307`, while `MistBackend` remains reachable from the Mac at `http://192.168.31.x:8001`.

- [ ] **Step 4: Update database README**

In `deploy/windows/database/README.md`, add:

```powershell
..\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
..\mysql\scripts\backup-mysql.ps1
..\mysql\scripts\restore-mysql.ps1 -DumpFile D:\backups\mist.sql -Force
```

Mention that restore refuses to overwrite non-empty `mist` without `-Force`.

- [ ] **Step 5: Run docs and parser checks**

Run:

```bash
pwsh -NoLogo -NoProfile -Command '$ErrorActionPreference="Stop"; [System.Management.Automation.Language.Parser]::ParseFile("deploy/windows/health-check.ps1",[ref]$null,[ref]$errors) > $null; if ($errors.Count) { $errors | Format-List; exit 1 }; "parser ok"'
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm exec prettier --write deploy/windows/README-Windows.md deploy/windows/database/README.md
```

Expected: parser prints `parser ok`; prettier completes.

- [ ] **Step 6: Update OpenSpec task checkboxes**

Check tasks 6.1 through 6.5 after docs and parser checks pass.

- [ ] **Step 7: Commit health and docs**

Run:

```bash
git add deploy/windows/health-check.ps1 deploy/windows/README-Windows.md deploy/windows/database/README.md openspec/changes/bundle-portable-mysql/tasks.md
git commit -m "docs: document portable mysql appliance path"
```

### Task 6: Final Validation

**Files:**

- Modify: `openspec/changes/bundle-portable-mysql/tasks.md`
- Read: `.github/workflows/windows-appliance.yml`
- Read: `deploy/windows/**/*.ps1`

- [ ] **Step 1: Run PowerShell parser sweep**

Run:

```bash
pwsh -NoLogo -NoProfile -Command '$ErrorActionPreference="Stop"; Get-ChildItem deploy/windows -Filter *.ps1 -Recurse | ForEach-Object { $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) > $null; if ($errors.Count) { Write-Host $_.FullName -ForegroundColor Red; $errors | Format-List; exit 1 } }; "parser ok"'
```

Expected: `parser ok`.

- [ ] **Step 2: Validate YAML and OpenSpec**

Run:

```bash
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH node -e "const fs=require('fs'); const yaml=require('yaml'); yaml.parse(fs.readFileSync('.github/workflows/windows-appliance.yml','utf8')); console.log('yaml ok')"
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH openspec validate bundle-portable-mysql --strict
```

Expected: `yaml ok` and `Change 'bundle-portable-mysql' is valid`.

- [ ] **Step 3: Run backend build**

Run:

```bash
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm run build
```

Expected: Nest build completes.

- [ ] **Step 4: Mark locally verifiable tasks complete**

Check tasks 7.1 through 7.3 and 7.9 through 7.11 if local parser/YAML/OpenSpec/build verification covers them. Leave real Windows-machine verification tasks 7.4 through 7.8 unchecked until the artifact is installed on the Windows API machine.

- [ ] **Step 5: Commit validation updates**

Run:

```bash
git add openspec/changes/bundle-portable-mysql/tasks.md
git commit -m "test: validate portable mysql appliance plan"
```

- [ ] **Step 6: Report manual Windows verification still required**

State clearly that these require a Windows API machine and GitHub Actions artifact:

```text
Install with external MySQL.
Install with -InstallPortableMySQL on a clean Windows machine.
Verify MistMySQL, MistTDX, and MistBackend health checks.
Verify Mac can reach http://192.168.31.x:8001/app/hello.
Run mist-skills data, indicator, and Chan Theory smoke tests.
```

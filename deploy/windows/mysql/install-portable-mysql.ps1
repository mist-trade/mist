# Install and initialize package-local MySQL for the Mist appliance.

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

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mysql-common.ps1")

function Convert-ToMySqlPath {
    param([string]$Path)
    return $Path.Replace("\", "/")
}

function Assert-MySqlIdentifier {
    param([string]$Value, [string]$Label)
    if ($Value -notmatch '^[A-Za-z0-9_]+$') {
        throw "$Label must contain only letters, numbers, and underscores: $Value"
    }
}

function Get-ServiceIfPresent {
    param([string]$Name)
    if (-not (Test-WindowsPlatform)) { return $null }
    return Get-Service -Name $Name -ErrorAction SilentlyContinue
}

function Wait-PortableMysqlReady {
    param(
        [hashtable]$Paths,
        [int]$Port,
        [string]$RootPassword
    )

    for ($i = 0; $i -lt 60; $i++) {
        try {
            Invoke-MySqlScalar `
                -MysqlExe $Paths.MysqlExe `
                -HostName "127.0.0.1" `
                -Port $Port `
                -User "root" `
                -Password $RootPassword `
                -Query "SELECT 1;" | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    throw "MistMySQL did not become ready on 127.0.0.1:$Port"
}

function Invoke-PortableMysqlSqlFile {
    param(
        [hashtable]$Paths,
        [int]$Port,
        [string]$RootPassword,
        [string]$Database,
        [string]$SqlFile
    )

    if (-not (Test-Path $SqlFile -PathType Leaf)) {
        throw "SQL file not found: $SqlFile"
    }

    Get-Content $SqlFile | & $Paths.MysqlExe "-h" "127.0.0.1" "-P" "$Port" "-u" "root" "-p$RootPassword" $Database
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to import SQL file into $Database`: $SqlFile"
    }
}

Assert-MySqlIdentifier -Value $Database -Label "Database"
Assert-MySqlIdentifier -Value $AppUser -Label "Application user"
$DumpFile = $DumpFile.Trim()
$SchemaFile = $SchemaFile.Trim()
if ($DumpFile -and $SchemaFile) {
    throw "Use either -DumpFile or -SchemaFile, not both."
}

$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version
$bundledSchemaFile = Join-Path $paths.RootDir "database\schema.sql"

foreach ($required in @($paths.MysqldExe, $paths.MysqlExe, $paths.MysqlDumpExe)) {
    if (-not (Test-Path $required -PathType Leaf)) {
        throw "Missing MySQL runtime file: $required"
    }
}

if (-not (Test-PortableMysqlServiceOwnedByAppliance -ServiceName $ServiceName -MysqldExe $paths.MysqldExe -MyIni $paths.MyIni -StateFile $paths.StateFile)) {
    throw "$ServiceName exists but is not owned by this appliance"
}

New-Item -ItemType Directory -Force -Path $paths.MysqlDir, $paths.DataDir, $paths.LogsDir | Out-Null

$autoCnf = Join-Path $paths.DataDir "auto.cnf"
$isFirstInstall = -not (Test-Path $autoCnf -PathType Leaf)
$service = Get-ServiceIfPresent -Name $ServiceName

if (-not $service -and -not (Test-TcpPortAvailable -Port $Port)) {
    throw "Port $Port is already occupied"
}

if (-not $isFirstInstall) {
    if (-not (Test-Path $paths.StateFile -PathType Leaf)) {
        $serviceForRecovery = Get-ServiceIfPresent -Name $ServiceName
        if (-not $serviceForRecovery) {
            throw "Existing portable MySQL data is missing mysql/state.json. Take a dump backup and run an explicit migration before reusing this data directory."
        }
        Write-Host "Portable MySQL state file is missing; continuing to recover an interrupted bootstrap." -ForegroundColor Yellow
    } else {
        $state = Get-Content $paths.StateFile -Raw | ConvertFrom-Json
        if ("$($state.runtimeVersion)" -notlike "8.4.*") {
            throw "Portable MySQL data was initialized by runtime $($state.runtimeVersion). Take a dump backup and run an explicit MySQL upgrade before using runtime $Version."
        }
    }
}

$myIni = @"
[mysqld]
basedir=$(Convert-ToMySqlPath $paths.RuntimeDir)
datadir=$(Convert-ToMySqlPath $paths.DataDir)
port=$Port
bind-address=127.0.0.1
log-error=$(Convert-ToMySqlPath $paths.LogsDir)/mysql.err
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

[client]
port=$Port
host=127.0.0.1
default-character-set=utf8mb4
"@
Set-Content -Path $paths.MyIni -Value $myIni -Encoding ASCII

if ($isFirstInstall) {
    & $paths.MysqldExe "--defaults-file=$($paths.MyIni)" "--initialize-insecure"
    if ($LASTEXITCODE -ne 0) {
        throw "mysqld --initialize-insecure failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path $paths.CredentialsFile -PathType Leaf)) {
    if (-not $isFirstInstall) {
        throw "Portable MySQL credentials file is missing: $($paths.CredentialsFile)"
    }

    Write-KeyValueFile -Path $paths.CredentialsFile -Values @{
        MYSQL_ROOT_PASSWORD = (New-PortableMysqlPassword)
        MYSQL_APP_USER = $AppUser
        MYSQL_APP_PASSWORD = (New-PortableMysqlPassword)
        MYSQL_PORT = "$Port"
    }
    Protect-PortableMysqlSecretFile -Path $paths.CredentialsFile
}

$creds = Read-KeyValueFile -Path $paths.CredentialsFile
$rootPassword = $creds.MYSQL_ROOT_PASSWORD
$appPassword = $creds.MYSQL_APP_PASSWORD
if (-not $rootPassword -or -not $appPassword) {
    throw "Portable MySQL credentials.env is missing MYSQL_ROOT_PASSWORD or MYSQL_APP_PASSWORD"
}

if (-not $service) {
    & $paths.MysqldExe "--install" $ServiceName "--defaults-file=$($paths.MyIni)"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to register $ServiceName with exit code $LASTEXITCODE"
    }
}

if (Test-WindowsPlatform) {
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    if ($service.Status -ne "Running") {
        Start-Service -Name $ServiceName
    }
}

$rootPasswordForProbe = ""
if (-not $isFirstInstall) { $rootPasswordForProbe = $rootPassword }
Wait-PortableMysqlReady -Paths $paths -Port $Port -RootPassword $rootPasswordForProbe

$rootPasswordSql = $rootPassword.Replace("'", "''")
$appPasswordSql = $appPassword.Replace("'", "''")
$rootPasswordForSql = ""
$alterRootSql = ""
if ($isFirstInstall) {
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

Invoke-MySqlCli `
    -MysqlExe $paths.MysqlExe `
    -HostName "127.0.0.1" `
    -Port $Port `
    -User "root" `
    -Password $rootPasswordForSql `
    -Arguments @("-e", $bootstrapSql) | Out-Null

$tableQuery = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database';"
$tableCount = [int](Invoke-MySqlScalar `
    -MysqlExe $paths.MysqlExe `
    -HostName "127.0.0.1" `
    -Port $Port `
    -User "root" `
    -Password $rootPassword `
    -Query $tableQuery)

if ($tableCount -le 0) {
    if ($DumpFile) {
        Invoke-PortableMysqlSqlFile -Paths $paths -Port $Port -RootPassword $rootPassword -Database $Database -SqlFile $DumpFile
    } else {
        $schemaToImport = $SchemaFile
        if (-not $schemaToImport) {
            if (-not (Test-Path $bundledSchemaFile -PathType Leaf)) {
                throw "Portable MySQL database '$Database' has no tables. Package database\schema.sql is missing; provide -MysqlDumpFile D:\backups\mist.sql or -MysqlSchemaFile D:\backups\schema.sql."
            }
            Write-Host "No MysqlSchemaFile provided; using bundled database\schema.sql" -ForegroundColor Yellow
            $schemaToImport = $bundledSchemaFile
        }

        Invoke-PortableMysqlSqlFile -Paths $paths -Port $Port -RootPassword $rootPassword -Database $Database -SqlFile $schemaToImport
    }
}

$tableCount = [int](Invoke-MySqlScalar `
    -MysqlExe $paths.MysqlExe `
    -HostName "127.0.0.1" `
    -Port $Port `
    -User "root" `
    -Password $rootPassword `
    -Query $tableQuery)
if ($tableCount -le 0) {
    throw "Portable MySQL database '$Database' still has no tables after bootstrap"
}

$runtimeSha256 = ""
$manifest = Read-PortableMysqlManifest -ManifestFile $paths.ManifestFile
if ($manifest) { $runtimeSha256 = "$($manifest.mysqlSha256)" }

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

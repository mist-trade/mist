# Install the complete Mist Windows API appliance.

param(
    [switch]$SkipDatabaseCheck,
    [switch]$SkipDatasourceTest,
    [switch]$InstallPortableMySQL,
    [switch]$RunDatabaseMigrations,
    [int]$MysqlPort = 3307,
    [string]$MysqlDumpFile = "",
    [string]$MysqlSchemaFile = ""
)

$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$DatasourceDir = Join-Path $RootDir "datasource"
$DatabaseDir = Join-Path $RootDir "database"

function Write-Step($msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Fail "Please run this script from an Administrator PowerShell."
        exit 1
    }
}

function Get-EnvValue($content, $name) {
    $pattern = "(?m)^\s*$([regex]::Escape($name))\s*=\s*(.*?)\s*(?:#.*)?$"
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) { return "" }
    return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

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

function Ensure-EnvFile($dir, $label) {
    $envFile = Join-Path $dir ".env"
    $example = Join-Path $dir ".env.example"
    if (Test-Path $envFile -PathType Leaf) {
        Write-Ok "$label .env exists"
        return $true
    }
    if (Test-Path $example -PathType Leaf) {
        Copy-Item $example $envFile
        Write-Warn "Created $envFile from .env.example"
        return $false
    }
    Write-Fail "Missing $label .env and .env.example in $dir"
    exit 1
}

function Invoke-ApplianceScript {
    param(
        [string]$Label,
        [scriptblock]$Command
    )

    $global:LASTEXITCODE = 0
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$Label failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

function Invoke-InstallMysqlScalar {
    param(
        [string]$MysqlExe,
        [string]$HostName,
        [string]$Port,
        [string]$User,
        [string]$Password,
        [string]$Query
    )

    $previousPassword = [Environment]::GetEnvironmentVariable("MYSQL_PWD", "Process")
    try {
        if ($Password) {
            [Environment]::SetEnvironmentVariable("MYSQL_PWD", $Password, "Process")
        } else {
            [Environment]::SetEnvironmentVariable("MYSQL_PWD", $null, "Process")
        }

        $args = @("-h", $HostName, "-P", $Port, "-u", $User, "-N", "-B", "-e", $Query)
        $output = & $MysqlExe @args 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "mysql.exe failed with exit code $LASTEXITCODE"
        }
        return "$output".Trim()
    } finally {
        [Environment]::SetEnvironmentVariable("MYSQL_PWD", $previousPassword, "Process")
    }
}

function Invoke-DatabaseMigrations {
    param([string]$BackendEnvFile)

    $content = Get-Content $BackendEnvFile -Raw
    $hostName = Get-EnvValue $content "mysql_server_host"
    $port = Get-EnvValue $content "mysql_server_port"
    $user = Get-EnvValue $content "mysql_server_username"
    $password = Get-EnvValue $content "mysql_server_password"
    $database = Get-EnvValue $content "mysql_server_database"

    if (-not $hostName) { $hostName = "127.0.0.1" }
    if (-not $port) { $port = "3306" }
    if (-not $database) { $database = "mist" }

    if (-not $user) {
        Write-Fail "Backend .env must include mysql_server_username before running migrations."
        exit 1
    }

    $runner = Join-Path $RootDir "database\run-migrations.ps1"
    if (-not (Test-Path $runner -PathType Leaf)) {
        Write-Fail "Database migration runner not found: $runner"
        exit 1
    }

    $mysqlExe = ""
    $portableMysqlExe = Join-Path $RootDir "mysql\runtime\mysql-8.4.10\bin\mysql.exe"
    if ($hostName -eq "127.0.0.1" -and $port -eq "$MysqlPort" -and (Test-Path $portableMysqlExe -PathType Leaf)) {
        $mysqlExe = $portableMysqlExe
    }

    & $runner `
        -RootDir $RootDir `
        -HostName $hostName `
        -Port ([int]$port) `
        -Database $database `
        -User $user `
        -Password $password `
        -MysqlExe $mysqlExe
}

function Test-DatabaseInitialized {
    param([string]$BackendEnvFile)

    if ($SkipDatabaseCheck) {
        Write-Warn "Database initialization check skipped by operator"
        return
    }

    $content = Get-Content $BackendEnvFile -Raw
    $hostName = Get-EnvValue $content "mysql_server_host"
    $port = Get-EnvValue $content "mysql_server_port"
    $user = Get-EnvValue $content "mysql_server_username"
    $password = Get-EnvValue $content "mysql_server_password"
    $database = Get-EnvValue $content "mysql_server_database"

    if (-not $hostName) { $hostName = "127.0.0.1" }
    if (-not $port) { $port = "3306" }

    if (-not $user -or -not $database) {
        Write-Fail "Backend .env must include mysql_server_username and mysql_server_database."
        exit 1
    }

    $mysqlExe = ""
    $portableMysqlExe = Join-Path $RootDir "mysql\runtime\mysql-8.4.10\bin\mysql.exe"
    if ($hostName -eq "127.0.0.1" -and $port -eq "$MysqlPort" -and (Test-Path $portableMysqlExe -PathType Leaf)) {
        $mysqlExe = $portableMysqlExe
    } else {
        $mysql = Get-Command mysql -ErrorAction SilentlyContinue
        if ($mysql) { $mysqlExe = $mysql.Source }
    }

    if (-not $mysqlExe) {
        Write-Fail "mysql CLI not found. Install MySQL client or rerun with -SkipDatabaseCheck after manual verification."
        Write-Host "  See $(Join-Path $DatabaseDir "README.md")" -ForegroundColor Yellow
        exit 1
    }

    try {
        $query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$database' AND table_name <> 'schema_migrations';"
        $tableCount = Invoke-InstallMysqlScalar `
            -MysqlExe $mysqlExe `
            -HostName $hostName `
            -Port $port `
            -User $user `
            -Password $password `
            -Query $query
    } catch {
        Write-Fail "Unable to query MySQL. Check backend .env credentials or initialize database manually."
        exit 1
    }
    $tableCount = [int]$tableCount
    if ($tableCount -le 0) {
        Write-Fail "MySQL database '$database' has no tables. Import schema/dump before installing services."
        Write-Host "  See $(Join-Path $DatabaseDir "README.md")" -ForegroundColor Yellow
        exit 1
    }
    Write-Ok "MySQL database '$database' has $tableCount tables"
}

Assert-Admin

Write-Step "Check package layout"
foreach ($dir in @($BackendDir, $DatasourceDir, $DatabaseDir)) {
    if (-not (Test-Path $dir -PathType Container)) {
        Write-Fail "Missing directory: $dir"
        exit 1
    }
}
Write-Ok "Package layout looks complete"

$backendReady = Ensure-EnvFile $BackendDir "backend"
$datasourceReady = Ensure-EnvFile $DatasourceDir "datasource"
if (-not ($backendReady -and $datasourceReady)) {
    Write-Fail "Edit the generated .env files, then rerun install-all.ps1."
    exit 1
}

$backendEnv = Join-Path $BackendDir ".env"

if ($InstallPortableMySQL) {
    Write-Step "Install portable MySQL"
    $mysqlInstaller = Join-Path $RootDir "mysql\scripts\install-portable-mysql.ps1"
    if (-not (Test-Path $mysqlInstaller -PathType Leaf)) {
        Write-Fail "Portable MySQL installer not found: $mysqlInstaller"
        exit 1
    }

    $portable = & $mysqlInstaller -RootDir $RootDir -Port $MysqlPort -DumpFile $MysqlDumpFile -SchemaFile $MysqlSchemaFile -AllowEmptyDatabase:$RunDatabaseMigrations
    Set-EnvValue $backendEnv "mysql_server_host" $portable.Host
    Set-EnvValue $backendEnv "mysql_server_port" "$($portable.Port)"
    Set-EnvValue $backendEnv "mysql_server_username" $portable.AppUser
    Set-EnvValue $backendEnv "mysql_server_password" $portable.AppPassword
    Set-EnvValue $backendEnv "mysql_server_database" $portable.Database
}

if ($RunDatabaseMigrations) {
    Invoke-DatabaseMigrations -BackendEnvFile $backendEnv
}

Test-DatabaseInitialized -BackendEnvFile $backendEnv

Write-Step "Install datasource services"
$datasourceDeploy = Join-Path $DatasourceDir "scripts\deploy_windows.ps1"
$tdxWinswInstall = Join-Path $DatasourceDir "scripts\winsw\install-tdx-datasource.ps1"
$winswExe = Join-Path $RootDir "winsw\winsw.exe"
$datasourceUvExe = Join-Path $DatasourceDir "runtime\uv.exe"
if (-not (Test-Path $tdxWinswInstall -PathType Leaf)) {
    Write-Fail "TDX WinSW installer not found: $tdxWinswInstall"
    exit 1
}
if (-not (Test-Path $winswExe -PathType Leaf)) {
    Write-Fail "WinSW executable not found: $winswExe"
    exit 1
}
if ($SkipDatasourceTest) {
    Invoke-ApplianceScript "datasource install" { & $datasourceDeploy -Only install }
} else {
    Invoke-ApplianceScript "datasource install" { & $datasourceDeploy -Only install }
    Invoke-ApplianceScript "datasource live test" { & $datasourceDeploy -Only test }
}
Invoke-ApplianceScript "tdx winsw service install" {
    & $tdxWinswInstall `
        -ProjectDir $DatasourceDir `
        -WinSWExe $winswExe `
        -Executable $datasourceUvExe `
        -DisableLegacyMistTDX
}
Write-Warn "QMT service installation is skipped by appliance. Start QMT manually or add a WinSW path later."

Write-Step "Install backend service"
$backendInstaller = Join-Path $BackendDir "scripts\install-service.ps1"
Invoke-ApplianceScript "backend service install" { & $backendInstaller -WinSWExe $winswExe -Start }

Write-Step "Health check"
if ($SkipDatasourceTest) {
    Invoke-ApplianceScript "health-check.ps1" { & (Join-Path $RootDir "health-check.ps1") -BackendHost "127.0.0.1" -SkipTDX }
} else {
    Invoke-ApplianceScript "health-check.ps1" { & (Join-Path $RootDir "health-check.ps1") -BackendHost "127.0.0.1" }
}

Write-Host "`n===== Install complete =====" -ForegroundColor Green
Write-Host "Set this on the Mac / LLM machine:" -ForegroundColor Cyan
Write-Host "  MIST_API_BASE_URL=http://<windows-lan-ip>:8001" -ForegroundColor Yellow

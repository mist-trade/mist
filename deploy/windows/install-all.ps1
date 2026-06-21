# Install the complete Mist Windows API appliance.

param(
    [switch]$SkipDatabaseCheck,
    [switch]$SkipDatasourceTest
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

function Test-DatabaseInitialized {
    param([string]$BackendEnvFile)

    if ($SkipDatabaseCheck) {
        Write-Warn "Database initialization check skipped by operator"
        return
    }

    $mysql = Get-Command mysql -ErrorAction SilentlyContinue
    if (-not $mysql) {
        Write-Fail "mysql CLI not found. Install MySQL client or rerun with -SkipDatabaseCheck after manual verification."
        Write-Host "  See $(Join-Path $DatabaseDir "README.md")" -ForegroundColor Yellow
        exit 1
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

    $query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$database';"
    $args = @("-h", $hostName, "-P", $port, "-u", $user, "-N", "-B", "-e", $query)
    if ($password) { $args = @("-h", $hostName, "-P", $port, "-u", $user, "-p$password", "-N", "-B", "-e", $query) }

    $tableCount = & $mysql.Source @args 2>$null
    if ($LASTEXITCODE -ne 0) {
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
Test-DatabaseInitialized -BackendEnvFile $backendEnv

Write-Step "Datasource preflight"
$preflight = Join-Path $DatasourceDir "scripts\preflight-sdk.ps1"
& $preflight -EnvFile (Join-Path $DatasourceDir ".env")

Write-Step "Install datasource services"
$datasourceDeploy = Join-Path $DatasourceDir "scripts\deploy_windows.ps1"
if ($SkipDatasourceTest) {
    & $datasourceDeploy -Only install
    & $datasourceDeploy -Only service
} else {
    & $datasourceDeploy
}

Write-Step "Install backend service"
$backendInstaller = Join-Path $BackendDir "scripts\install-service.ps1"
& $backendInstaller -Start

Write-Step "Health check"
& (Join-Path $RootDir "health-check.ps1")

Write-Host "`n===== Install complete =====" -ForegroundColor Green
Write-Host "Set this on the Mac / LLM machine:" -ForegroundColor Cyan
Write-Host "  MIST_API_BASE_URL=http://<windows-lan-ip>:8001" -ForegroundColor Yellow

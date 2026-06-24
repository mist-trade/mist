# Health checks for the Mist Windows API appliance.

param(
    [string]$BackendHost = "127.0.0.1",
    [switch]$IncludeQMT,
    [switch]$IncludeMySQL
)

$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$BackendEnv = Join-Path $RootDir "backend\.env"
if ([string]::IsNullOrWhiteSpace($BackendHost)) {
    $BackendHost = "127.0.0.1"
}

function Get-EnvValue($path, $name) {
    if (-not (Test-Path $path -PathType Leaf)) { return "" }
    $content = Get-Content $path -Raw
    $pattern = "(?m)^\s*$([regex]::Escape($name))\s*=\s*(.*?)\s*(?:#.*)?$"
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) { return "" }
    return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Test-Http($name, $url, [switch]$Optional) {
    try {
        $resp = Invoke-WebRequest -Uri $url -TimeoutSec 8 -UseBasicParsing
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
            Write-Host "  [OK] $name -> $url" -ForegroundColor Green
            return $true
        }
        Write-Host "  [FAIL] $name returned HTTP $($resp.StatusCode)" -ForegroundColor Red
        return $false
    } catch {
        if ($Optional) {
            Write-Host "  [WARN] $name unavailable -> $url" -ForegroundColor Yellow
            return $true
        }
        Write-Host "  [FAIL] $name unavailable -> $url" -ForegroundColor Red
        Write-Host "         $_" -ForegroundColor Yellow
        return $false
    }
}

function Resolve-HealthMysqlExe {
    $portable = Join-Path $RootDir "mysql\runtime\mysql-8.4.10\bin\mysql.exe"
    if (Test-Path $portable -PathType Leaf) { return $portable }

    $cmd = Get-Command mysql -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    return ""
}

function Invoke-HealthMysqlScalar {
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

function Test-PortableMySql {
    $mysqlHost = Get-EnvValue $BackendEnv "mysql_server_host"
    $mysqlPort = Get-EnvValue $BackendEnv "mysql_server_port"
    $mysqlUser = Get-EnvValue $BackendEnv "mysql_server_username"
    $mysqlPassword = Get-EnvValue $BackendEnv "mysql_server_password"
    $mysqlDatabase = Get-EnvValue $BackendEnv "mysql_server_database"

    if (-not $mysqlHost) { $mysqlHost = "127.0.0.1" }
    if (-not $mysqlPort) { $mysqlPort = "3307" }
    if (-not $mysqlDatabase) { $mysqlDatabase = "mist" }

    $ok = $true

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
        return $false
    }

    if (-not $mysqlUser) {
        Write-Host "  [FAIL] backend .env is missing mysql_server_username" -ForegroundColor Red
        return $false
    }

    try {
        $query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$mysqlDatabase' AND table_name <> 'schema_migrations';"
        $tableCount = Invoke-HealthMysqlScalar `
            -MysqlExe $mysqlExe `
            -HostName $mysqlHost `
            -Port $mysqlPort `
            -User $mysqlUser `
            -Password $mysqlPassword `
            -Query $query
    } catch {
        Write-Host "  [FAIL] MySQL database '$mysqlDatabase' query failed" -ForegroundColor Red
        return $false
    }

    if ([int]$tableCount -le 0) {
        Write-Host "  [FAIL] MySQL database '$mysqlDatabase' is not initialized" -ForegroundColor Red
        return $false
    }

    Write-Host "  [OK] MySQL database '$mysqlDatabase' has $tableCount tables" -ForegroundColor Green
    return $ok
}

Write-Host "`n===== Mist appliance health check =====" -ForegroundColor Cyan

$ok = $true

$envMysqlHost = Get-EnvValue $BackendEnv "mysql_server_host"
$envMysqlPort = Get-EnvValue $BackendEnv "mysql_server_port"
$shouldCheckMySql = $IncludeMySQL -or ($envMysqlHost -eq "127.0.0.1" -and $envMysqlPort -eq "3307")
if ($shouldCheckMySql) {
    $ok = (Test-PortableMySql) -and $ok
}

$ok = (Test-Http "MistTDX" "http://127.0.0.1:9001/health") -and $ok

if ($IncludeQMT) {
    $ok = (Test-Http "MistQMT" "http://127.0.0.1:9002/health" -Optional) -and $ok
}

$ok = (Test-Http "MistBackend health" "http://$BackendHost:8001/app/hello") -and $ok
$ok = (Test-Http "MistBackend securities" "http://$BackendHost:8001/security/v1/all") -and $ok

if (-not $ok) {
    Write-Host "`nHealth check failed." -ForegroundColor Red
    exit 1
}

Write-Host "`nHealth check passed." -ForegroundColor Green

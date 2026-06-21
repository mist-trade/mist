# Restore a SQL dump into the appliance portable MySQL database.

param(
    [Parameter(Mandatory = $true)]
    [string]$DumpFile,

    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Version = "8.4.10",
    [string]$Database = "mist",
    [int]$Port = 3307,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mysql-common.ps1")

if ($Database -notmatch '^[A-Za-z0-9_]+$') {
    throw "Database name must contain only letters, numbers, and underscores: $Database"
}
if (-not (Test-Path $DumpFile -PathType Leaf)) {
    throw "Dump file not found: $DumpFile"
}

$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version
$creds = Read-KeyValueFile -Path $paths.CredentialsFile
if (-not $creds.MYSQL_ROOT_PASSWORD) {
    throw "Portable MySQL credentials file is missing MYSQL_ROOT_PASSWORD"
}

$countQuery = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database';"
$count = [int](Invoke-MySqlScalar `
    -MysqlExe $paths.MysqlExe `
    -HostName "127.0.0.1" `
    -Port $Port `
    -User "root" `
    -Password $creds.MYSQL_ROOT_PASSWORD `
    -Query $countQuery)

if ($count -gt 0 -and -not $Force) {
    throw "Database $Database already has $count tables. Rerun with -Force to restore over existing data."
}

if ($Force) {
    $resetSql = "DROP DATABASE IF EXISTS ``$Database``; CREATE DATABASE ``$Database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
} else {
    $resetSql = "CREATE DATABASE IF NOT EXISTS ``$Database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
}

Invoke-MySqlCli `
    -MysqlExe $paths.MysqlExe `
    -HostName "127.0.0.1" `
    -Port $Port `
    -User "root" `
    -Password $creds.MYSQL_ROOT_PASSWORD `
    -Arguments @("-e", $resetSql) | Out-Null

Get-Content $DumpFile | & $paths.MysqlExe "-h" "127.0.0.1" "-P" "$Port" "-u" "root" "-p$($creds.MYSQL_ROOT_PASSWORD)" $Database
if ($LASTEXITCODE -ne 0) {
    throw "restore failed with exit code $LASTEXITCODE"
}

$count = [int](Invoke-MySqlScalar `
    -MysqlExe $paths.MysqlExe `
    -HostName "127.0.0.1" `
    -Port $Port `
    -User "root" `
    -Password $creds.MYSQL_ROOT_PASSWORD `
    -Query $countQuery)
if ($count -le 0) {
    throw "Restore completed but database $Database still has no tables"
}

Write-Host "Restored $DumpFile into $Database." -ForegroundColor Green

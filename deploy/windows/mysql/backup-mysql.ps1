# Create a timestamped dump from the appliance portable MySQL database.

param(
    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Version = "8.4.10",
    [string]$Database = "mist",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mysql-common.ps1")

if ($Database -notmatch '^[A-Za-z0-9_]+$') {
    throw "Database name must contain only letters, numbers, and underscores: $Database"
}

$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version
$creds = Read-KeyValueFile -Path $paths.CredentialsFile

if (-not $creds.MYSQL_APP_USER -or -not $creds.MYSQL_APP_PASSWORD) {
    throw "Portable MySQL credentials file is missing MYSQL_APP_USER or MYSQL_APP_PASSWORD"
}

$port = $Script:MistPortableMysqlDefaultPort
if ($creds.ContainsKey("MYSQL_PORT") -and $creds.MYSQL_PORT) {
    $port = [int]$creds.MYSQL_PORT
}

if (-not $OutputDir) { $OutputDir = $paths.BackupsDir }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dump = Join-Path $OutputDir "$Database-$stamp.sql"

& $paths.MysqlDumpExe `
    "-h" "127.0.0.1" `
    "-P" "$port" `
    "-u" $creds.MYSQL_APP_USER `
    "-p$($creds.MYSQL_APP_PASSWORD)" `
    "--single-transaction" `
    "--quick" `
    "--result-file=$dump" `
    $Database
if ($LASTEXITCODE -ne 0) {
    throw "mysqldump.exe failed with exit code $LASTEXITCODE"
}

Write-Host "Backup written: $dump" -ForegroundColor Green

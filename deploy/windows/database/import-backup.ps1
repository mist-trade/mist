# Import a Mist MySQL dump into the local Windows MySQL service.

param(
    [Parameter(Mandatory = $true)]
    [string]$DumpFile,

    [string]$HostName = "127.0.0.1",
    [int]$Port = 3306,
    [string]$Database = "mist",
    [string]$User = "root",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpFile -PathType Leaf)) {
    Write-Host "Dump file not found: $DumpFile" -ForegroundColor Red
    exit 1
}

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
    Write-Host "mysql CLI not found. Install MySQL client and retry." -ForegroundColor Red
    exit 1
}

if ($Database -notmatch '^[A-Za-z0-9_]+$') {
    Write-Host "Database name must contain only letters, numbers, and underscores: $Database" -ForegroundColor Red
    exit 1
}

$baseArgs = @("-h", $HostName, "-P", "$Port", "-u", $User)
if ($Password) { $baseArgs = @("-h", $HostName, "-P", "$Port", "-u", $User, "-p$Password") }

& $mysql.Source @baseArgs -e "CREATE DATABASE IF NOT EXISTS $Database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create database $Database" -ForegroundColor Red
    exit 1
}

$importArgs = $baseArgs + @($Database)
Get-Content $DumpFile | & $mysql.Source @importArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to import dump into $Database" -ForegroundColor Red
    exit 1
}

Write-Host "Imported $DumpFile into $Database." -ForegroundColor Green

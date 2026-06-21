# Remove the portable MySQL service while preserving data by default.

param(
    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Version = "8.4.10",
    [string]$ServiceName = "MistMySQL",
    [switch]$RemoveData
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mysql-common.ps1")

$paths = Get-PortableMysqlPaths -RootDir $RootDir -Version $Version

if (-not (Test-PortableMysqlServiceOwnedByAppliance -ServiceName $ServiceName -MysqldExe $paths.MysqldExe -MyIni $paths.MyIni -StateFile $paths.StateFile)) {
    throw "$ServiceName exists but is not owned by this appliance"
}

if (Test-WindowsPlatform) {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        if ($service.Status -ne "Stopped") {
            Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
        }
        & sc.exe delete $ServiceName | Out-Null
    }
}

if ($RemoveData) {
    Write-Host "Removing portable MySQL data: $($paths.DataDir)" -ForegroundColor Red
    if (Test-Path $paths.DataDir) {
        Remove-Item $paths.DataDir -Recurse -Force
    }
} else {
    Write-Host "Preserved portable MySQL data: $($paths.DataDir)" -ForegroundColor Yellow
}

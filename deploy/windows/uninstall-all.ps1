# Uninstall Mist Windows API appliance services.

param(
    [switch]$RemovePortableMySQLData
)

$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$DatasourceDir = Join-Path $RootDir "datasource"

function Remove-LegacyWindowsService {
    param([string]$ServiceName)

    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne "Stopped") {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    }

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        sc.exe delete $ServiceName | Out-Host
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

$backendUninstall = Join-Path $BackendDir "scripts\uninstall-service.ps1"
if (Test-Path $backendUninstall -PathType Leaf) {
    & $backendUninstall
}

$tdxWinswUninstall = Join-Path $DatasourceDir "scripts\winsw\uninstall-tdx-datasource.ps1"
if (Test-Path $tdxWinswUninstall -PathType Leaf) {
    & $tdxWinswUninstall -ProjectDir $DatasourceDir
}

$portableMysqlUninstall = Join-Path $RootDir "mysql\scripts\uninstall-portable-mysql.ps1"
if (Test-Path $portableMysqlUninstall -PathType Leaf) {
    & $portableMysqlUninstall -RootDir $RootDir -RemoveData:$RemovePortableMySQLData
}

foreach ($service in @("MistTDX", "MistQMT")) {
    Remove-LegacyWindowsService -ServiceName $service
}

Write-Host "Appliance service removal requested." -ForegroundColor Green

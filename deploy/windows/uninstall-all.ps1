# Uninstall Mist Windows API appliance services.

$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$DatasourceDir = Join-Path $RootDir "datasource"

function Resolve-NssmExe {
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidate = Join-Path $RootDir "nssm\nssm.exe"
    if (Test-Path $candidate -PathType Leaf) { return $candidate }

    return $null
}

$backendUninstall = Join-Path $BackendDir "scripts\uninstall-service.ps1"
if (Test-Path $backendUninstall -PathType Leaf) {
    & $backendUninstall
}

$nssmExe = Resolve-NssmExe
if (-not $nssmExe) {
    Write-Host "NSSM not found; datasource services were not removed." -ForegroundColor Yellow
    exit 0
}

foreach ($service in @("MistTDX", "MistQMT")) {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $nssmExe stop $service
    & $nssmExe remove $service confirm
    $ErrorActionPreference = $prevEAP
}

Write-Host "Appliance service removal requested." -ForegroundColor Green

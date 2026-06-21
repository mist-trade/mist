# Uninstall the MistBackend Windows service.

param(
    [string]$ServiceName = "MistBackend",
    [string]$BackendDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
    $BackendDir = $PSScriptRoot | Split-Path -Parent
}
$BackendDir = [System.IO.Path]::GetFullPath($BackendDir)
$RootDir = Split-Path $BackendDir -Parent

function Resolve-NssmExe {
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidate = Join-Path $RootDir "nssm\nssm.exe"
    if (Test-Path $candidate -PathType Leaf) { return $candidate }

    return $null
}

$nssmExe = Resolve-NssmExe
if (-not $nssmExe) {
    Write-Host "NSSM not found. Cannot remove $ServiceName." -ForegroundColor Red
    exit 1
}

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $nssmExe stop $ServiceName
& $nssmExe remove $ServiceName confirm
$ErrorActionPreference = $prevEAP

Write-Host "$ServiceName removal requested." -ForegroundColor Green

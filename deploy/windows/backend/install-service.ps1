# Install MistBackend as a Windows service through NSSM.

param(
    [string]$ServiceName = "MistBackend",
    [string]$BackendDir = "",
    [switch]$Start
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
    $BackendDir = $PSScriptRoot | Split-Path -Parent
}
$BackendDir = [System.IO.Path]::GetFullPath($BackendDir)
$RootDir = Split-Path $BackendDir -Parent
$LogsDir = Join-Path $BackendDir "logs"

function Write-Step($msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Resolve-NssmExe {
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidate = Join-Path $RootDir "nssm\nssm.exe"
    if (Test-Path $candidate -PathType Leaf) { return $candidate }

    return $null
}

function Resolve-NodeExe {
    $bundled = Join-Path $BackendDir "runtime\node.exe"
    if (Test-Path $bundled -PathType Leaf) { return $bundled }

    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    return $null
}

Write-Step "Install $ServiceName"

$envFile = Join-Path $BackendDir ".env"
if (-not (Test-Path $envFile -PathType Leaf)) {
    Write-Fail "Missing backend .env: $envFile"
    exit 1
}
Write-Ok "Found backend .env"

$nodeExe = Resolve-NodeExe
if (-not $nodeExe) {
    Write-Fail "node.exe not found. Expected backend/runtime/node.exe or node on PATH."
    exit 1
}
Write-Ok "Node: $nodeExe"

$mainJs = Join-Path $BackendDir "dist\apps\mist\main.js"
if (-not (Test-Path $mainJs -PathType Leaf)) {
    Write-Fail "Missing backend entrypoint: $mainJs"
    exit 1
}
Write-Ok "Entrypoint: $mainJs"

$nssmExe = Resolve-NssmExe
if (-not $nssmExe) {
    Write-Fail "NSSM not found. Expected nssm/nssm.exe in appliance root or nssm on PATH."
    exit 1
}
Write-Ok "NSSM: $nssmExe"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$existing = & $nssmExe status $ServiceName 2>&1
$ErrorActionPreference = $prevEAP

if ($existing -match "SERVICE_RUNNING|SERVICE_STOPPED") {
    Write-Host "  $ServiceName already exists (status: $existing), updating configuration" -ForegroundColor Yellow
} else {
    & $nssmExe install $ServiceName $nodeExe "dist\apps\mist\main.js"
}

& $nssmExe set $ServiceName AppDirectory $BackendDir
& $nssmExe set $ServiceName DisplayName "Mist Backend"
& $nssmExe set $ServiceName Description "Mist stock analysis API backend (port 8001)"
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppStdout (Join-Path $LogsDir "backend-stdout.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $LogsDir "backend-stderr.log")
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateBytes 10485760

Write-Ok "$ServiceName service configured"

if ($Start) {
    & $nssmExe start $ServiceName
    Write-Ok "$ServiceName start requested"
}

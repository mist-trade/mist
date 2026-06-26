[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ServiceName = "MistBackend",
    [string]$BackendDir = "",
    [string]$ServiceDir = "",
    [string]$WinSWExe = "",
    [switch]$Start
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
    $BackendDir = $PSScriptRoot | Split-Path -Parent
}
$BackendDir = [System.IO.Path]::GetFullPath($BackendDir)
$RootDir = Split-Path $BackendDir -Parent
$LogsDir = Join-Path $BackendDir "logs"
$ScriptDir = $PSScriptRoot

if (-not $ServiceDir) {
    $ServiceDir = Join-Path $BackendDir "services\$ServiceName"
}
$ServiceDir = [System.IO.Path]::GetFullPath($ServiceDir)
$ServiceExe = Join-Path $ServiceDir "$ServiceName.exe"
$ServiceXml = Join-Path $ServiceDir "$ServiceName.xml"
$TemplateFile = Join-Path $ScriptDir "mist-backend.xml"

function Write-Step($msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function ConvertTo-XmlEscapedValue {
    param([object]$Value)

    return [System.Security.SecurityElement]::Escape([string]$Value)
}

function Resolve-FullPath {
    param([string]$Path)

    if (-not $Path) { return "" }
    return [System.IO.Path]::GetFullPath($Path)
}

function Resolve-WinSWExe {
    if ($WinSWExe) {
        $resolved = Resolve-FullPath $WinSWExe
        if (Test-Path $resolved -PathType Leaf) { return $resolved }
    }

    foreach ($name in @("winsw", "WinSW", "winsw-x64", "WinSW-x64")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }

    foreach ($candidate in @(
        (Join-Path $RootDir "winsw\winsw.exe"),
        (Join-Path $RootDir "winsw\WinSW.exe"),
        (Join-Path $BackendDir "winsw\winsw.exe"),
        (Join-Path $BackendDir "runtime\winsw.exe")
    )) {
        if (Test-Path $candidate -PathType Leaf) {
            return (Resolve-FullPath $candidate)
        }
    }

    return $null
}

function Resolve-NodeExe {
    $bundled = Join-Path $BackendDir "runtime\node.exe"
    if (Test-Path $bundled -PathType Leaf) { return $bundled }

    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    return $null
}

function Invoke-WinSWCommand {
    param(
        [string]$Exe,
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $Exe @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if (($exitCode -ne 0) -and (-not $AllowFailure)) {
        throw "WinSW $($Arguments -join ' ') failed with exit code $exitCode. $output"
    }

    return @{
        ExitCode = $exitCode
        Output = "$output".Trim()
    }
}

function Set-TemplateValues {
    param(
        [string]$Template,
        [hashtable]$Values
    )

    $result = $Template
    foreach ($key in $Values.Keys) {
        $result = $result.Replace($key, [string]$Values[$key])
    }
    return $result
}

function Get-WindowsServiceController {
    param([string]$Name)

    if ([System.Environment]::OSVersion.Platform -ne "Win32NT") {
        return $null
    }

    return Get-Service -Name $Name -ErrorAction SilentlyContinue
}

function Remove-ExistingWindowsService {
    param([string]$Name)

    $existing = Get-WindowsServiceController -Name $Name
    if (-not $existing) {
        Write-Ok "$Name service is not currently registered"
        return
    }

    Write-Step "Remove existing $Name before WinSW install"
    if ($existing.Status -ne "Stopped") {
        Stop-Service -Name $Name -Force -ErrorAction Stop
        $existing.WaitForStatus(
            [System.ServiceProcess.ServiceControllerStatus]::Stopped,
            [TimeSpan]::FromSeconds(30)
        )
        Write-Ok "$Name stopped"
    }

    if ($PSCmdlet.ShouldProcess($Name, "Delete existing Windows service")) {
        sc.exe delete $ServiceName | Out-Host
        Write-Ok "$Name delete requested"
    }
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

if (-not (Test-Path $TemplateFile -PathType Leaf)) {
    Write-Fail "Missing WinSW XML template: $TemplateFile"
    exit 1
}

$ResolvedWinSWExe = Resolve-WinSWExe
if (-not $ResolvedWinSWExe) {
    Write-Fail "WinSW executable not found. Expected winsw/winsw.exe in appliance root or WinSW on PATH."
    exit 1
}
Write-Ok "WinSW: $ResolvedWinSWExe"

Remove-ExistingWindowsService -Name $ServiceName

Write-Step "Prepare WinSW service files"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}
New-Item -ItemType Directory -Force -Path $ServiceDir | Out-Null
Copy-Item -Path $ResolvedWinSWExe -Destination $ServiceExe -Force

$Template = Get-Content $TemplateFile -Raw
$RenderedXml = Set-TemplateValues `
    -Template $Template `
    -Values @{
        "{{SERVICE_NAME}}" = ConvertTo-XmlEscapedValue $ServiceName
        "{{BACKEND_DIR}}" = ConvertTo-XmlEscapedValue $BackendDir
        "{{NODE_EXE}}" = ConvertTo-XmlEscapedValue $nodeExe
        "{{BACKEND_ARGUMENTS}}" = ConvertTo-XmlEscapedValue "dist\apps\mist\main.js"
        "{{LOG_DIR}}" = ConvertTo-XmlEscapedValue $LogsDir
    }
$RenderedXml | Set-Content -Path $ServiceXml -Encoding UTF8

Write-Step "Install $ServiceName through WinSW"
Invoke-WinSWCommand -Exe $ServiceExe -Arguments @("install") | Out-Null
Write-Ok "$ServiceName service installed"

if ($Start) {
    Write-Step "Start $ServiceName"
    $StartResult = Invoke-WinSWCommand -Exe $ServiceExe -Arguments @("start") -AllowFailure
    if ($StartResult.ExitCode -eq 0) {
        Write-Ok "$ServiceName start requested"
    }
    elseif ($StartResult.Output -match "already|running|SERVICE_RUNNING") {
        Write-Warn "$ServiceName is already running"
    }
    else {
        throw "Unable to start $ServiceName. $($StartResult.Output)"
    }
}

Write-Ok "WinSW service files: $ServiceDir"

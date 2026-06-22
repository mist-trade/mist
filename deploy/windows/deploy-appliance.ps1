# Deploy a built Mist Windows API appliance zip on the Windows API machine.

param(
    [string]$ZipPath = "",
    [string]$DeployDir = "D:\MistAPI",
    [string]$BackupRoot = "D:\MistAPI-backups",
    [switch]$InstallPortableMySQL,
    [switch]$SkipDatasourceTest,
    [switch]$SkipInstall,
    [switch]$SkipHealthCheck,
    [switch]$LoadOnly
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) { Write-Host "`n===== $Message =====" -ForegroundColor Cyan }
function Write-Ok($Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "  [WARN] $Message" -ForegroundColor Yellow }
function Write-Fail($Message) { Write-Host "  [FAIL] $Message" -ForegroundColor Red }

function Get-ApplianceStateItems {
    return @(
        @{ RelativePath = "backend\.env"; IsDirectory = $false },
        @{ RelativePath = "datasource\.env"; IsDirectory = $false },
        @{ RelativePath = "mysql\data"; IsDirectory = $true },
        @{ RelativePath = "mysql\credentials.env"; IsDirectory = $false }
    )
}

function Get-ApplianceLogPaths {
    param([string]$DeployDir)

    return @(
        (Join-Path $DeployDir "datasource\logs\tdx-stdout.log"),
        (Join-Path $DeployDir "datasource\logs\tdx-stderr.log"),
        (Join-Path $DeployDir "datasource\logs\qmt-stdout.log"),
        (Join-Path $DeployDir "datasource\logs\qmt-stderr.log"),
        (Join-Path $DeployDir "backend\logs\backend-stdout.log"),
        (Join-Path $DeployDir "backend\logs\backend-stderr.log"),
        (Join-Path $DeployDir "mysql\logs\mysql.err")
    )
}

function Assert-Administrator {
    if (-not ([System.Environment]::OSVersion.Platform -eq "Win32NT")) {
        return
    }

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "Run this deployment from an Administrator PowerShell or an administrator GitHub runner service."
    }
}

function Stop-ApplianceServices {
    $serviceNames = @("MistBackend", "MistTDX", "MistQMT", "MistMySQL")
    foreach ($name in $serviceNames) {
        $service = Get-Service -Name $name -ErrorAction SilentlyContinue
        if (-not $service) { continue }

        if ($service.Status -eq "Stopped") {
            Write-Ok "$name already stopped"
            continue
        }

        Write-Host "  Stopping $name..."
        Stop-Service -Name $name -Force -ErrorAction Stop
        $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(45))
        Write-Ok "$name stopped"
    }
}

function Copy-StateItem {
    param(
        [string]$SourceRoot,
        [string]$TargetRoot,
        [hashtable]$Item
    )

    $source = Join-Path $SourceRoot $Item.RelativePath
    if (-not (Test-Path $source)) {
        return
    }

    $target = Join-Path $TargetRoot $Item.RelativePath
    $targetParent = Split-Path -Parent $target
    if ($targetParent) {
        New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    }

    if (Test-Path $target) {
        Remove-Item $target -Recurse -Force
    }
    Copy-Item $source $target -Recurse -Force
    Write-Ok "Preserved $($Item.RelativePath)"
}

function Backup-ApplianceState {
    param(
        [string]$DeployDir,
        [string]$BackupRoot
    )

    if (-not (Test-Path $DeployDir -PathType Container)) {
        Write-Warn "No existing deployment found at $DeployDir"
        return $null
    }

    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $BackupRoot "backup-$stamp"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    foreach ($item in Get-ApplianceStateItems) {
        Copy-StateItem -SourceRoot $DeployDir -TargetRoot $backupDir -Item $item
    }

    Write-Ok "Backup directory: $backupDir"
    return $backupDir
}

function Restore-ApplianceState {
    param(
        [string]$BackupDir,
        [string]$DeployDir
    )

    if (-not $BackupDir) {
        Write-Warn "No previous state backup to restore"
        return
    }
    if (-not (Test-Path $BackupDir -PathType Container)) {
        throw "Backup directory does not exist: $BackupDir"
    }

    foreach ($item in Get-ApplianceStateItems) {
        Copy-StateItem -SourceRoot $BackupDir -TargetRoot $DeployDir -Item $item
    }
}

function Expand-ApplianceZip {
    param(
        [string]$ZipPath,
        [string]$DeployDir
    )

    if (-not (Test-Path $ZipPath -PathType Leaf)) {
        throw "Appliance zip not found: $ZipPath"
    }

    if (Test-Path $DeployDir) {
        Remove-Item $DeployDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $DeployDir | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $DeployDir -Force

    $installer = Join-Path $DeployDir "install-all.ps1"
    if (-not (Test-Path $installer -PathType Leaf)) {
        throw "Expanded appliance is missing install-all.ps1. Check artifact shape: $ZipPath"
    }

    Write-Ok "Expanded appliance to $DeployDir"
}

function Assert-DeploymentInputs {
    param([string]$DeployDir)

    $required = @(
        "install-all.ps1",
        "health-check.ps1",
        "backend\.env",
        "datasource\.env",
        "nssm\nssm.exe"
    )

    foreach ($relative in $required) {
        $path = Join-Path $DeployDir $relative
        if (-not (Test-Path $path -PathType Leaf)) {
            throw "Required deployment file missing: $path"
        }
    }
}

function Invoke-NativeCommand {
    param(
        [string]$Label,
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Show-ApplianceLogs {
    param(
        [string]$DeployDir,
        [int]$Tail = 120
    )

    Write-Host "`n===== Recent appliance logs =====" -ForegroundColor Yellow
    foreach ($path in Get-ApplianceLogPaths -DeployDir $DeployDir) {
        if (-not (Test-Path $path -PathType Leaf)) { continue }
        Write-Host "`n--- $path ---" -ForegroundColor Yellow
        Get-Content $path -Tail $Tail -ErrorAction SilentlyContinue
    }
}

if ($LoadOnly) {
    return
}

try {
    Assert-Administrator

    if (-not $ZipPath) {
        throw "ZipPath is required. Pass -ZipPath path\to\mist-api-appliance-win-x64.zip."
    }

    $ZipPath = [System.IO.Path]::GetFullPath($ZipPath)
    $DeployDir = [System.IO.Path]::GetFullPath($DeployDir)
    $BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)

    Write-Step "Deploy Mist Windows API appliance"
    Write-Host "  Zip:       $ZipPath"
    Write-Host "  DeployDir: $DeployDir"
    Write-Host "  Backup:    $BackupRoot"

    Write-Step "Stop services and backup state"
    Stop-ApplianceServices
    $backupDir = Backup-ApplianceState -DeployDir $DeployDir -BackupRoot $BackupRoot

    Write-Step "Extract appliance"
    Expand-ApplianceZip -ZipPath $ZipPath -DeployDir $DeployDir

    Write-Step "Restore state"
    Restore-ApplianceState -BackupDir $backupDir -DeployDir $DeployDir
    Assert-DeploymentInputs -DeployDir $DeployDir

    if (-not $SkipInstall) {
        Write-Step "Install appliance"
        Push-Location $DeployDir
        try {
            Set-ExecutionPolicy -Scope Process Bypass -Force
            $installArgs = @()
            if ($InstallPortableMySQL) { $installArgs += "-InstallPortableMySQL" }
            if ($SkipDatasourceTest) { $installArgs += "-SkipDatasourceTest" }
            Invoke-NativeCommand "install-all.ps1" { & ".\install-all.ps1" @installArgs }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warn "Skipping install step"
    }

    if (-not $SkipHealthCheck) {
        Write-Step "Health check"
        Push-Location $DeployDir
        try {
            $healthArgs = @()
            if ($InstallPortableMySQL) { $healthArgs += "-IncludeMySQL" }
            Invoke-NativeCommand "health-check.ps1" { & ".\health-check.ps1" @healthArgs }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warn "Skipping health check"
    }

    Write-Step "Deployment complete"
    Write-Ok "Mist appliance deployed to $DeployDir"
} catch {
    Write-Fail "$_"
    Show-ApplianceLogs -DeployDir $DeployDir
    exit 1
}

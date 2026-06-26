[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ServiceName = "MistBackend",
    [string]$BackendDir = "",
    [string]$ServiceDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
    $BackendDir = $PSScriptRoot | Split-Path -Parent
}
$BackendDir = [System.IO.Path]::GetFullPath($BackendDir)

if (-not $ServiceDir) {
    $ServiceDir = Join-Path $BackendDir "services\$ServiceName"
}
$ServiceDir = [System.IO.Path]::GetFullPath($ServiceDir)
$ServiceExe = Join-Path $ServiceDir "$ServiceName.exe"

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

if (Test-Path $ServiceExe -PathType Leaf) {
    if ($PSCmdlet.ShouldProcess($ServiceName, "Stop WinSW service")) {
        Invoke-WinSWCommand -Exe $ServiceExe -Arguments @("stop") -AllowFailure | Out-Null
    }
    if ($PSCmdlet.ShouldProcess($ServiceName, "Uninstall WinSW service")) {
        Invoke-WinSWCommand -Exe $ServiceExe -Arguments @("uninstall") -AllowFailure | Out-Null
    }
}

if ($PSCmdlet.ShouldProcess($ServiceName, "Delete Windows service registration")) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        sc.exe delete $ServiceName | Out-Host
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

Write-Host "$ServiceName removal requested." -ForegroundColor Green

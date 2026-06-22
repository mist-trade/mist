param(
    [string]$ScriptPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $ScriptPath) {
    $ScriptPath = Join-Path $PSScriptRoot "deploy-appliance.ps1"
}

function Assert-Equal {
    param(
        [string]$Name,
        $Expected,
        $Actual
    )

    if ($Expected -ne $Actual) {
        throw "$Name failed. Expected <$Expected>, got <$Actual>."
    }
    Write-Host "  [PASS] $Name" -ForegroundColor Green
}

. $ScriptPath -LoadOnly

$items = Get-ApplianceStateItems
Assert-Equal "state item count" 4 @($items).Count
Assert-Equal "first state item source" "backend\.env" $items[0].RelativePath
Assert-Equal "mysql data item is directory" $true $items[2].IsDirectory

$deployRoot = Join-Path ([System.IO.Path]::GetTempPath()) "MistAPI"
$logPaths = Get-ApplianceLogPaths -DeployDir $deployRoot
Assert-Equal "log path count" 7 @($logPaths).Count
Assert-Equal "first log path" (Join-Path $deployRoot "datasource\logs\tdx-stdout.log") $logPaths[0]

Write-Host "`nDeploy appliance script tests passed." -ForegroundColor Green

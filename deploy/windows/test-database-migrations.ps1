param(
    [string]$RootDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $RootDir) {
    $RootDir = $PSScriptRoot
}

function Assert-Contains {
    param(
        [string]$Name,
        [string]$Needle,
        [string]$Haystack
    )

    if (-not $Haystack.Contains($Needle)) {
        throw "$Name failed. Missing <$Needle>."
    }
    Write-Host "  [PASS] $Name" -ForegroundColor Green
}

function Assert-NotContains {
    param(
        [string]$Name,
        [string]$Needle,
        [string]$Haystack
    )

    if ($Haystack.Contains($Needle)) {
        throw "$Name failed. Unexpected <$Needle>."
    }
    Write-Host "  [PASS] $Name" -ForegroundColor Green
}

$runner = Join-Path $RootDir "database\run-migrations.ps1"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("mist-migration-test-" + [guid]::NewGuid().ToString("N"))
$migrationDir = Join-Path $tempRoot "migrations"
$fakeMysql = Join-Path $tempRoot "fake-mysql.ps1"
$fakeMysqlLog = Join-Path $tempRoot "fake-mysql.log"

New-Item -ItemType Directory -Force -Path $migrationDir | Out-Null
Set-Content -Path (Join-Path $migrationDir "001_test.sql") -Value "CREATE TABLE IF NOT EXISTS test_table (id int);" -Encoding ASCII

$fakeMysqlScript = @'
param(
    [Parameter(ValueFromPipeline = $true)]
    [object]$InputObject,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$MysqlArgs
)

begin {
    Add-Content -Path $env:FAKE_MYSQL_LOG -Value ("ARGS=" + ($MysqlArgs -join " "))
    Add-Content -Path $env:FAKE_MYSQL_LOG -Value ("MYSQL_PWD=" + $env:MYSQL_PWD)
}

process {
}

end {
    if ($MysqlArgs -contains "-N") {
        Write-Output "1"
    }
    exit 0
}
'@
Set-Content -Path $fakeMysql -Value $fakeMysqlScript -Encoding UTF8

try {
    $env:FAKE_MYSQL_LOG = $fakeMysqlLog
    & $runner `
        -RootDir $RootDir `
        -MigrationDir $migrationDir `
        -HostName "127.0.0.1" `
        -Port 3307 `
        -Database "mist" `
        -User "mist_app" `
        -Password "secret-password" `
        -MysqlExe $fakeMysql

    $log = Get-Content $fakeMysqlLog -Raw
    Assert-Contains "migration runner passes password through process environment" "MYSQL_PWD=secret-password" $log
    Assert-NotContains "migration runner keeps password out of mysql command arguments" "-psecret-password" $log
} finally {
    Remove-Item Env:\FAKE_MYSQL_LOG -ErrorAction SilentlyContinue
    Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`nDatabase migration runner tests passed." -ForegroundColor Green

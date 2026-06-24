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

function Assert-FileExists {
    param(
        [string]$Name,
        [string]$Path
    )

    if (-not (Test-Path $Path -PathType Leaf)) {
        throw "$Name failed. Missing file <$Path>."
    }
    Write-Host "  [PASS] $Name" -ForegroundColor Green
}

function Assert-FileNotExists {
    param(
        [string]$Name,
        [string]$Path
    )

    if (Test-Path $Path -PathType Leaf) {
        throw "$Name failed. Unexpected file <$Path>."
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

$schemaPath = Join-Path $RootDir "database\schema.sql"
$migrationsReadmePath = Join-Path $RootDir "database\migrations\README.md"
$installerPath = Join-Path $RootDir "mysql\install-portable-mysql.ps1"
$commonPath = Join-Path $RootDir "mysql\mysql-common.ps1"

Assert-FileNotExists "bundled empty schema is not shipped" $schemaPath
Assert-FileExists "database migrations placeholder exists" $migrationsReadmePath
Assert-FileExists "portable mysql installer exists" $installerPath
Assert-FileExists "portable mysql common helpers exist" $commonPath

$migrationsReadme = Get-Content $migrationsReadmePath -Raw
$installer = Get-Content $installerPath -Raw
$common = Get-Content $commonPath -Raw

Assert-Contains "migrations placeholder explains future step" "Future database migrations live here." $migrationsReadme
Assert-NotContains "installer does not auto import bundled schema" "using bundled database\schema.sql" $installer
Assert-Contains "installer error reserves migration step" "Run database migrations or provide -MysqlDumpFile" $installer
Assert-Contains "installer records runtime before migration gate" "Record runtime state before the business-table gate" $installer
Assert-Contains "installer rejects both mysql bootstrap files" "Use either -DumpFile or -SchemaFile, not both." $installer
Assert-Contains "installer ownership error includes service command" "Existing service command" $installer
Assert-Contains "installer ownership error includes expected mysqld path" "Expected mysqld path" $installer
Assert-Contains "installer recovers interrupted bootstrap" "recover an interrupted bootstrap" $installer
Assert-Contains "service ownership accepts matching interrupted bootstrap" "state.json is written after bootstrap completes" $common

Write-Host "`nDatabase bootstrap tests passed." -ForegroundColor Green

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

$schemaPath = Join-Path $RootDir "database\schema.sql"
$installerPath = Join-Path $RootDir "mysql\install-portable-mysql.ps1"
$commonPath = Join-Path $RootDir "mysql\mysql-common.ps1"

Assert-FileExists "bundled database schema exists" $schemaPath
Assert-FileExists "portable mysql installer exists" $installerPath
Assert-FileExists "portable mysql common helpers exist" $commonPath

$schema = Get-Content $schemaPath -Raw
$installer = Get-Content $installerPath -Raw
$common = Get-Content $commonPath -Raw

foreach ($table in @(
    "securities",
    "security_source_configs",
    "k",
    "k_extensions_ef",
    "k_extensions_tdx",
    "k_extensions_mqmt"
)) {
    Assert-Contains "schema creates $table" "CREATE TABLE IF NOT EXISTS ``$table``" $schema
}

Assert-Contains "schema links k to securities" "CONSTRAINT ``fk_k_security``" $schema
Assert-Contains "schema links source config to securities" "CONSTRAINT ``fk_security_source_configs_security``" $schema
Assert-Contains "schema links ef extension to k" "CONSTRAINT ``fk_k_extensions_ef_k``" $schema
Assert-Contains "schema links tdx extension to k" "CONSTRAINT ``fk_k_extensions_tdx_k``" $schema
Assert-Contains "schema links mqmt extension to k" "CONSTRAINT ``fk_k_extensions_mqmt_k``" $schema

Assert-Contains "installer knows bundled schema path" "database\schema.sql" $installer
Assert-Contains "installer announces bundled schema fallback" "No MysqlSchemaFile provided; using bundled database\schema.sql" $installer
Assert-Contains "installer error mentions bundled schema" "Package database\schema.sql is missing" $installer
Assert-Contains "installer rejects both mysql bootstrap files" "Use either -DumpFile or -SchemaFile, not both." $installer
Assert-Contains "installer recovers interrupted bootstrap" "recover an interrupted bootstrap" $installer
Assert-Contains "service ownership accepts matching interrupted bootstrap" "state.json is written after bootstrap completes" $common

Write-Host "`nDatabase bootstrap tests passed." -ForegroundColor Green

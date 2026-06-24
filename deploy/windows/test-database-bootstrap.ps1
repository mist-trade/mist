param(
    [string]$RootDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $RootDir) {
    $RootDir = $PSScriptRoot
}
$RepoRoot = Split-Path (Split-Path $RootDir -Parent) -Parent

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
$migrationRunnerPath = Join-Path $RootDir "database\run-migrations.ps1"
$initialMigrationPath = Join-Path $RootDir "database\migrations\001_init_core_tables.sql"
$installAllPath = Join-Path $RootDir "install-all.ps1"
$healthCheckPath = Join-Path $RootDir "health-check.ps1"
$backendInstallerPath = Join-Path $RootDir "backend\install-service.ps1"
$installerPath = Join-Path $RootDir "mysql\install-portable-mysql.ps1"
$commonPath = Join-Path $RootDir "mysql\mysql-common.ps1"
$workflowPath = Join-Path $RepoRoot ".github\workflows\windows-appliance.yml"

Assert-FileNotExists "bundled empty schema is not shipped" $schemaPath
Assert-FileExists "database migrations placeholder exists" $migrationsReadmePath
Assert-FileExists "database migration runner exists" $migrationRunnerPath
Assert-FileExists "initial core table migration exists" $initialMigrationPath
Assert-FileExists "install-all script exists" $installAllPath
Assert-FileExists "health-check script exists" $healthCheckPath
Assert-FileExists "backend service installer exists" $backendInstallerPath
Assert-FileExists "portable mysql installer exists" $installerPath
Assert-FileExists "portable mysql common helpers exist" $commonPath
Assert-FileExists "windows appliance workflow exists" $workflowPath

$migrationsReadme = Get-Content $migrationsReadmePath -Raw
$migrationRunner = Get-Content $migrationRunnerPath -Raw
$initialMigration = Get-Content $initialMigrationPath -Raw
$installAll = Get-Content $installAllPath -Raw
$healthCheck = Get-Content $healthCheckPath -Raw
$backendInstaller = Get-Content $backendInstallerPath -Raw
$installer = Get-Content $installerPath -Raw
$common = Get-Content $commonPath -Raw
$workflow = Get-Content $workflowPath -Raw

Assert-Contains "migrations readme documents explicit runner" ".\run-migrations.ps1" $migrationsReadme
Assert-Contains "migration runner creates version table" "CREATE TABLE IF NOT EXISTS ``schema_migrations``" $migrationRunner
Assert-Contains "migration runner skips already applied versions" "Already applied" $migrationRunner
Assert-Contains "migration runner records applied versions" "INSERT INTO ``schema_migrations``" $migrationRunner
Assert-Contains "initial migration creates securities" "CREATE TABLE IF NOT EXISTS ``securities``" $initialMigration
Assert-Contains "initial migration creates security source configs" "CREATE TABLE IF NOT EXISTS ``security_source_configs``" $initialMigration
Assert-Contains "initial migration creates k" "CREATE TABLE IF NOT EXISTS ``k``" $initialMigration
Assert-Contains "initial migration creates ef extension" "CREATE TABLE IF NOT EXISTS ``k_extensions_ef``" $initialMigration
Assert-Contains "initial migration creates tdx extension" "CREATE TABLE IF NOT EXISTS ``k_extensions_tdx``" $initialMigration
Assert-Contains "initial migration creates mqmt extension" "CREATE TABLE IF NOT EXISTS ``k_extensions_mqmt``" $initialMigration
Assert-NotContains "initial migration never drops tables" "DROP TABLE" $initialMigration.ToUpperInvariant()
Assert-Contains "install-all exposes migration switch" '[switch]$RunDatabaseMigrations' $installAll
Assert-Contains "install-all invokes migration runner" "database\run-migrations.ps1" $installAll
Assert-Contains "install-all lets portable mysql return empty db for migrations" "-AllowEmptyDatabase:`$RunDatabaseMigrations" $installAll
Assert-Contains "install-all stops on datasource script failures" "Invoke-ApplianceScript" $installAll
Assert-Contains "install-all passes backend host explicitly to health check" '-BackendHost "127.0.0.1"' $installAll
Assert-Contains "install-all uses scoped mysql password for database check" "Invoke-InstallMysqlScalar" $installAll
Assert-NotContains "install-all keeps database check password out of command line" '-p$password' $installAll
Assert-Contains "install-all table check ignores migration metadata" "table_name <> 'schema_migrations'" $installAll
Assert-Contains "health check defaults empty backend host to localhost" '[string]::IsNullOrWhiteSpace($BackendHost)' $healthCheck
Assert-Contains "health check uses scoped mysql password for database check" "Invoke-HealthMysqlScalar" $healthCheck
Assert-NotContains "health check keeps database check password out of command line" '-p$mysqlPassword' $healthCheck
Assert-Contains "health check table check ignores migration metadata" "table_name <> 'schema_migrations'" $healthCheck
Assert-Contains "backend installer stops existing service before reinstall" "stop `$ServiceName" $backendInstaller
Assert-Contains "backend installer deletes existing service before reinstall" "remove `$ServiceName confirm" $backendInstaller
Assert-Contains "backend installer overwrites existing service application" "set `$ServiceName Application `$nodeExe" $backendInstaller
Assert-Contains "backend installer overwrites existing service parameters" "set `$ServiceName AppParameters" $backendInstaller
Assert-Contains "installer supports empty database for external migration runner" '[switch]$AllowEmptyDatabase' $installer
Assert-Contains "installer honors empty database migration handoff" "AllowEmptyDatabase" $installer
Assert-Contains "installer grants references for migration foreign keys" "CREATE, ALTER, INDEX, DROP, REFERENCES" $installer
Assert-Contains "installer table check ignores migration metadata" "table_name <> 'schema_migrations'" $installer
Assert-NotContains "installer does not auto import bundled schema" "using bundled database\schema.sql" $installer
Assert-Contains "installer error reserves migration step" "Run database migrations or provide -MysqlDumpFile" $installer
Assert-Contains "installer records runtime before migration gate" "Record runtime state before the business-table gate" $installer
Assert-Contains "installer rejects both mysql bootstrap files" "Use either -DumpFile or -SchemaFile, not both." $installer
Assert-Contains "installer ownership error includes service command" "Existing service command" $installer
Assert-Contains "installer ownership error includes expected mysqld path" "Expected mysqld path" $installer
Assert-Contains "installer recovers interrupted bootstrap" "recover an interrupted bootstrap" $installer
Assert-Contains "service ownership accepts matching interrupted bootstrap" "state.json is written after bootstrap completes" $common
Assert-Contains "workflow creates datasource runtime directory" 'datasource\runtime' $workflow
Assert-Contains "workflow resolves uv executable" 'Get-Command uv' $workflow
Assert-Contains "workflow packages datasource uv runtime" 'runtime\uv.exe' $workflow

Write-Host "`nDatabase bootstrap tests passed." -ForegroundColor Green

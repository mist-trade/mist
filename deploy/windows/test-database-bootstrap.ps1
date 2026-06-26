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
$backendServiceXmlPath = Join-Path $RootDir "backend\mist-backend.xml"
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
Assert-FileExists "backend WinSW XML template exists" $backendServiceXmlPath
Assert-FileExists "portable mysql installer exists" $installerPath
Assert-FileExists "portable mysql common helpers exist" $commonPath
Assert-FileExists "windows appliance workflow exists" $workflowPath

$migrationsReadme = Get-Content $migrationsReadmePath -Raw
$migrationRunner = Get-Content $migrationRunnerPath -Raw
$initialMigration = Get-Content $initialMigrationPath -Raw
$installAll = Get-Content $installAllPath -Raw
$healthCheck = Get-Content $healthCheckPath -Raw
$backendInstaller = Get-Content $backendInstallerPath -Raw
$backendServiceXml = Get-Content $backendServiceXmlPath -Raw
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
Assert-Contains "install-all installs TDX through WinSW" "scripts\winsw\install-tdx-datasource.ps1" $installAll
Assert-Contains "install-all disables legacy MistTDX through WinSW installer" "-DisableLegacyMistTDX" $installAll
Assert-Contains "install-all documents skipped QMT service" "QMT service installation is skipped by appliance" $installAll
Assert-NotContains "install-all no longer installs QMT through NSSM" "-ServiceInstance qmt" $installAll
Assert-Contains "install-all passes backend host explicitly to health check" '-BackendHost "127.0.0.1"' $installAll
Assert-Contains "install-all uses scoped mysql password for database check" "Invoke-InstallMysqlScalar" $installAll
Assert-NotContains "install-all keeps database check password out of command line" '-p$password' $installAll
Assert-Contains "install-all table check ignores migration metadata" "table_name <> 'schema_migrations'" $installAll
Assert-Contains "health check defaults empty backend host to localhost" '[string]::IsNullOrWhiteSpace($BackendHost)' $healthCheck
Assert-Contains "health check uses scoped mysql password for database check" "Invoke-HealthMysqlScalar" $healthCheck
Assert-NotContains "health check keeps database check password out of command line" '-p$mysqlPassword' $healthCheck
Assert-Contains "health check table check ignores migration metadata" "table_name <> 'schema_migrations'" $healthCheck
Assert-Contains "health check names TDX WinSW service" "mist-tdx-datasource" $healthCheck
Assert-Contains "health check verifies TDX collector state" "collectorState" $healthCheck
Assert-Contains "health check verifies TDX queue depth" "eventQueueDepth" $healthCheck
Assert-Contains "backend installer uses WinSW" "WinSW" $backendInstaller
Assert-Contains "backend installer copies WinSW executable" "Copy-Item -Path `$ResolvedWinSWExe -Destination `$ServiceExe -Force" $backendInstaller
Assert-Contains "backend installer renders WinSW XML" "mist-backend.xml" $backendInstaller
Assert-Contains "backend installer removes legacy MistBackend service" "sc.exe delete `$ServiceName" $backendInstaller
Assert-NotContains "backend installer no longer uses NSSM" "NSSM" $backendInstaller
Assert-Contains "backend installer accepts started-successfully output" "started successfully" $backendInstaller
Assert-Contains "backend installer clears native exit code after success" '$global:LASTEXITCODE = 0' $backendInstaller
Assert-Contains "backend WinSW XML has service id placeholder" "{{SERVICE_NAME}}" $backendServiceXml
Assert-Contains "backend WinSW XML runs bundled node" "{{NODE_EXE}}" $backendServiceXml
Assert-Contains "backend WinSW XML runs Mist entrypoint" "{{BACKEND_ARGUMENTS}}" $backendServiceXml
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
Assert-Contains "workflow exposes datasource ref input" 'datasource_ref:' $workflow
Assert-Contains "workflow defaults datasource ref to master" "DATASOURCE_REF: `${{ github.event.inputs.datasource_ref || 'master' }}" $workflow
Assert-Contains "workflow checks out requested datasource ref" "ref: `${{ env.DATASOURCE_REF }}" $workflow
Assert-Contains "workflow records datasource ref in manifest" "datasourceRef = `$env:DATASOURCE_REF" $workflow
Assert-Contains "workflow pins WinSW version" "WINSW_VERSION: v2.12.0" $workflow
Assert-Contains "workflow pins WinSW SHA256" "WINSW_X64_SHA256: 05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da" $workflow
Assert-Contains "workflow downloads WinSW from GitHub release" 'https://github.com/winsw/winsw/releases/download/$env:WINSW_VERSION/WinSW-x64.exe' $workflow
Assert-Contains "workflow verifies WinSW hash" "WinSW SHA256 mismatch" $workflow
Assert-Contains "workflow creates WinSW directory" 'winsw' $workflow
Assert-NotContains "workflow does not create NSSM directory" 'nssm' $workflow
Assert-Contains "workflow resolves uv executable" 'Get-Command uv' $workflow
Assert-Contains "workflow packages datasource uv runtime" 'runtime\uv.exe' $workflow
Assert-Contains "workflow downloads WinSW for appliance package" "Download WinSW" $workflow
Assert-Contains "workflow packages WinSW executable" 'winsw\winsw.exe' $workflow
Assert-NotContains "workflow no longer installs NSSM" "Install NSSM" $workflow
Assert-NotContains "workflow no longer packages NSSM executable" 'nssm\nssm.exe' $workflow
Assert-NotContains "workflow no longer installs WinSW through Chocolatey" "choco install winsw" $workflow

Write-Host "`nDatabase bootstrap tests passed." -ForegroundColor Green

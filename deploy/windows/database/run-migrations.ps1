# Run idempotent database migrations for the Mist Windows API appliance.

param(
    [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$MigrationDir = (Join-Path $PSScriptRoot "migrations"),
    [string]$HostName = "127.0.0.1",
    [int]$Port = 3306,
    [string]$Database = "mist",
    [string]$User = "root",
    [string]$Password = "",
    [string]$MysqlExe = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) { Write-Host "`n===== $Message =====" -ForegroundColor Cyan }
function Write-Ok($Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "  [WARN] $Message" -ForegroundColor Yellow }

function Assert-MySqlIdentifier {
    param([string]$Value, [string]$Label)

    if ($Value -notmatch '^[A-Za-z0-9_]+$') {
        throw "$Label must contain only letters, numbers, and underscores: $Value"
    }
}

function Escape-MySqlString {
    param([string]$Value)

    return $Value.Replace("\", "\\").Replace("'", "''")
}

function Resolve-MigrationMysqlExe {
    param([string]$RootDir, [string]$MysqlExe)

    if ($MysqlExe) {
        if (-not (Test-Path $MysqlExe -PathType Leaf)) {
            throw "mysql.exe not found: $MysqlExe"
        }
        return (Resolve-Path $MysqlExe).Path
    }

    $portable = Join-Path $RootDir "mysql\runtime\mysql-8.4.10\bin\mysql.exe"
    if (Test-Path $portable -PathType Leaf) {
        return $portable
    }

    $cmd = Get-Command mysql -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    throw "mysql CLI not found. Install MySQL client or use the packaged portable MySQL runtime."
}

function New-MysqlBaseArgs {
    param(
        [string]$HostName,
        [int]$Port,
        [string]$User,
        [string]$Password,
        [string]$Database
    )

    $args = @("-h", $HostName, "-P", "$Port", "-u", $User, "--default-character-set=utf8mb4")
    if ($Password) { $args += "-p$Password" }
    if ($Database) { $args += @("-D", $Database) }
    return $args
}

function Invoke-MigrationMysqlCli {
    param(
        [string]$MysqlExe,
        [string[]]$Arguments
    )

    & $MysqlExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "mysql.exe failed with exit code $LASTEXITCODE"
    }
}

function Invoke-MigrationMysqlScalar {
    param(
        [string]$MysqlExe,
        [string[]]$BaseArgs,
        [string]$Query
    )

    $args = @($BaseArgs) + @("-N", "-B", "-e", $Query)
    $output = & $MysqlExe @args 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "mysql.exe failed with exit code $LASTEXITCODE"
    }
    return "$output".Trim()
}

function Invoke-MigrationSqlFile {
    param(
        [string]$MysqlExe,
        [string[]]$BaseArgs,
        [string]$SqlFile
    )

    Get-Content $SqlFile | & $MysqlExe @BaseArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to apply migration: $SqlFile"
    }
}

Assert-MySqlIdentifier -Value $Database -Label "Database"

if (-not (Test-Path $MigrationDir -PathType Container)) {
    throw "Migration directory not found: $MigrationDir"
}

$mysql = Resolve-MigrationMysqlExe -RootDir $RootDir -MysqlExe $MysqlExe
$baseArgs = New-MysqlBaseArgs `
    -HostName $HostName `
    -Port $Port `
    -User $User `
    -Password $Password `
    -Database $Database

Write-Step "Run database migrations"
Write-Host "  Host:      $HostName`:$Port"
Write-Host "  Database:  $Database"
Write-Host "  Directory: $MigrationDir"

$versionTableSql = @'
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` varchar(190) NOT NULL,
  `applied_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
'@

Invoke-MigrationMysqlCli -MysqlExe $mysql -Arguments (@($baseArgs) + @("-e", $versionTableSql))

$migrations = @(Get-ChildItem -Path $MigrationDir -Filter "*.sql" -File | Sort-Object Name)
if ($migrations.Count -eq 0) {
    Write-Warn "No migration files found"
    return
}

foreach ($migration in $migrations) {
    $version = $migration.Name
    $escapedVersion = Escape-MySqlString $version
    $appliedQuery = 'SELECT COUNT(*) FROM `schema_migrations` WHERE `version`=' + "'$escapedVersion';"
    $applied = [int](Invoke-MigrationMysqlScalar -MysqlExe $mysql -BaseArgs $baseArgs -Query $appliedQuery)

    if ($applied -gt 0) {
        Write-Ok "Already applied $version"
        continue
    }

    Invoke-MigrationSqlFile -MysqlExe $mysql -BaseArgs $baseArgs -SqlFile $migration.FullName

    $insertQuery = 'INSERT INTO `schema_migrations` (`version`) VALUES (' + "'$escapedVersion');"
    Invoke-MigrationMysqlCli -MysqlExe $mysql -Arguments (@($baseArgs) + @("-e", $insertQuery))
    Write-Ok "Applied $version"
}

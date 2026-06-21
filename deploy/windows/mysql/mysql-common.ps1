# Shared helpers for the Mist portable MySQL appliance scripts.

$Script:MistPortableMysqlDefaultServiceName = "MistMySQL"
$Script:MistPortableMysqlDefaultDatabase = "mist"
$Script:MistPortableMysqlDefaultAppUser = "mist_app"
$Script:MistPortableMysqlDefaultVersion = "8.4.10"
$Script:MistPortableMysqlDefaultPort = 3307

function Test-WindowsPlatform {
    return ([System.Environment]::OSVersion.Platform -eq "Win32NT")
}

function Resolve-ApplianceRoot {
    param([string]$RootDir)

    if ($RootDir) { return (Resolve-Path $RootDir).Path }
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-PortableMysqlPaths {
    param(
        [string]$RootDir,
        [string]$Version = $Script:MistPortableMysqlDefaultVersion
    )

    $root = Resolve-ApplianceRoot -RootDir $RootDir
    $mysqlDir = Join-Path $root "mysql"
    $runtimeDir = Join-Path $mysqlDir "runtime\mysql-$Version"

    @{
        RootDir = $root
        MysqlDir = $mysqlDir
        RuntimeDir = $runtimeDir
        BinDir = Join-Path $runtimeDir "bin"
        MysqldExe = Join-Path $runtimeDir "bin\mysqld.exe"
        MysqlExe = Join-Path $runtimeDir "bin\mysql.exe"
        MysqlDumpExe = Join-Path $runtimeDir "bin\mysqldump.exe"
        DataDir = Join-Path $mysqlDir "data"
        LogsDir = Join-Path $mysqlDir "logs"
        BackupsDir = Join-Path $mysqlDir "backups"
        MyIni = Join-Path $mysqlDir "my.ini"
        CredentialsFile = Join-Path $mysqlDir "credentials.env"
        StateFile = Join-Path $mysqlDir "state.json"
        ManifestFile = Join-Path $root "manifest.json"
    }
}

function Read-KeyValueFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path -PathType Leaf)) { return $values }

    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*#') { continue }
        if ($line -notmatch '^\s*([^=]+?)\s*=\s*(.*)\s*$') { continue }
        $values[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
    }

    return $values
}

function Write-KeyValueFile {
    param(
        [string]$Path,
        [hashtable]$Values
    )

    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

    $lines = foreach ($key in ($Values.Keys | Sort-Object)) {
        "$key=$($Values[$key])"
    }
    Set-Content -Path $Path -Value $lines -Encoding UTF8
}

function New-PortableMysqlPassword {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd("=")
}

function Protect-PortableMysqlSecretFile {
    param([string]$Path)

    if (-not (Test-WindowsPlatform)) { return }
    if (-not (Test-Path $Path -PathType Leaf)) { return }

    & icacls $Path /inheritance:r | Out-Null
    & icacls $Path /grant:r "Administrators:F" "SYSTEM:F" | Out-Null
}

function Invoke-MySqlCli {
    param(
        [string]$MysqlExe,
        [string]$HostName,
        [int]$Port,
        [string]$User,
        [string]$Password,
        [string[]]$Arguments
    )

    if (-not (Test-Path $MysqlExe -PathType Leaf)) {
        throw "mysql.exe not found: $MysqlExe"
    }

    $args = @("-h", $HostName, "-P", "$Port", "-u", $User)
    if ($Password) { $args += "-p$Password" }
    if ($Arguments) { $args += $Arguments }

    & $MysqlExe @args
    if ($LASTEXITCODE -ne 0) {
        throw "mysql.exe failed with exit code $LASTEXITCODE"
    }
}

function Invoke-MySqlScalar {
    param(
        [string]$MysqlExe,
        [string]$HostName,
        [int]$Port,
        [string]$User,
        [string]$Password,
        [string]$Query
    )

    $output = Invoke-MySqlCli `
        -MysqlExe $MysqlExe `
        -HostName $HostName `
        -Port $Port `
        -User $User `
        -Password $Password `
        -Arguments @("-N", "-B", "-e", $Query)

    return "$output".Trim()
}

function Get-WindowsServicePathName {
    param([string]$ServiceName)

    if (-not (Test-WindowsPlatform)) { return $null }

    $svc = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
    if (-not $svc) { return $null }
    return $svc.PathName
}

function Test-PortableMysqlServiceOwnedByAppliance {
    param(
        [string]$ServiceName,
        [string]$MysqldExe,
        [string]$MyIni,
        [string]$StateFile
    )

    $pathName = Get-WindowsServicePathName -ServiceName $ServiceName
    if (-not $pathName) { return $true }

    $normalizedPathName = $pathName.ToLowerInvariant()
    $normalizedMysqld = $MysqldExe.ToLowerInvariant()
    $normalizedMyIni = $MyIni.ToLowerInvariant()

    if (-not $normalizedPathName.Contains($normalizedMysqld)) { return $false }
    if (-not $normalizedPathName.Contains($normalizedMyIni)) { return $false }
    if (-not (Test-Path $StateFile -PathType Leaf)) { return $false }

    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    return ($state.serviceName -eq $ServiceName)
}

function Test-TcpPortAvailable {
    param([int]$Port)

    if (Test-WindowsPlatform) {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return ($null -eq $listener)
    }

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(200)
        if ($connected) { $client.EndConnect($async) }
        return (-not $connected)
    } finally {
        $client.Dispose()
    }
}

function Read-PortableMysqlManifest {
    param([string]$ManifestFile)

    if (-not (Test-Path $ManifestFile -PathType Leaf)) { return $null }
    return Get-Content $ManifestFile -Raw | ConvertFrom-Json
}

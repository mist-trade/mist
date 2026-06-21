# Health checks for the Mist Windows API appliance.

param(
    [string]$BackendHost = "127.0.0.1",
    [switch]$IncludeQMT
)

$ErrorActionPreference = "Stop"

function Test-Http($name, $url, [switch]$Optional) {
    try {
        $resp = Invoke-WebRequest -Uri $url -TimeoutSec 8 -UseBasicParsing
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
            Write-Host "  [OK] $name -> $url" -ForegroundColor Green
            return $true
        }
        Write-Host "  [FAIL] $name returned HTTP $($resp.StatusCode)" -ForegroundColor Red
        return $false
    } catch {
        if ($Optional) {
            Write-Host "  [WARN] $name unavailable -> $url" -ForegroundColor Yellow
            return $true
        }
        Write-Host "  [FAIL] $name unavailable -> $url" -ForegroundColor Red
        Write-Host "         $_" -ForegroundColor Yellow
        return $false
    }
}

Write-Host "`n===== Mist appliance health check =====" -ForegroundColor Cyan

$ok = $true
$ok = (Test-Http "MistTDX" "http://127.0.0.1:9001/health") -and $ok

if ($IncludeQMT) {
    $ok = (Test-Http "MistQMT" "http://127.0.0.1:9002/health" -Optional) -and $ok
}

$ok = (Test-Http "MistBackend health" "http://$BackendHost:8001/app/hello") -and $ok
$ok = (Test-Http "MistBackend securities" "http://$BackendHost:8001/security/v1/all") -and $ok

if (-not $ok) {
    Write-Host "`nHealth check failed." -ForegroundColor Red
    exit 1
}

Write-Host "`nHealth check passed." -ForegroundColor Green

param(
  [int]$Port = 3000,
  [switch]$SkipCacheClean,
  [switch]$UseTurbopack
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $repoRoot "frontend"
$nextCachePath = Join-Path $frontendPath ".next"

$portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($portInUse) {
  Write-Host "Port $Port is already in use. Stop the existing process first or choose another port." -ForegroundColor Yellow
  $portInUse | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize
  exit 1
}

if (-not $SkipCacheClean -and (Test-Path $nextCachePath)) {
  Write-Host "Cleaning frontend/.next cache..." -ForegroundColor Cyan
  Remove-Item -LiteralPath $nextCachePath -Recurse -Force
}

$scriptName = if ($UseTurbopack) { "dev:turbopack" } else { "dev" }
Write-Host "Starting frontend with npm script '$scriptName' on port $Port..." -ForegroundColor Green

$npmArgs = "run $scriptName -w @ocr/frontend -- --port $Port"
Push-Location $repoRoot
try {
  cmd /c "npm $npmArgs"
}
finally {
  Pop-Location
}

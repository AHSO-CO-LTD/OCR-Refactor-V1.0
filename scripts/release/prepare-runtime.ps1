$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$runtimeRoot = Join-Path $repoRoot "release-runtime"
$manifestPath = Join-Path $runtimeRoot "runtime-manifest.json"

function Assert-ChildPath {
  param(
    [string]$Parent,
    [string]$Child
  )

  $parentPath = [System.IO.Path]::GetFullPath($Parent)
  $childPath = [System.IO.Path]::GetFullPath($Child)

  if (-not $childPath.StartsWith($parentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe path outside repo: $childPath"
  }
}

Assert-ChildPath -Parent $repoRoot -Child $runtimeRoot

if (Test-Path $runtimeRoot) {
  Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

Push-Location $repoRoot
try {
  npm.cmd run build -w @ocr/backend
  npm.cmd run build -w @ocr/frontend
  npm.cmd run build -w @ocr/electron
} finally {
  Pop-Location
}

Copy-Item -LiteralPath (Join-Path $repoRoot "package.json") -Destination $runtimeRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "package-lock.json") -Destination $runtimeRoot

$backendRuntime = Join-Path $runtimeRoot "backend"
New-Item -ItemType Directory -Force -Path $backendRuntime | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot "backend\dist") -Destination $backendRuntime -Recurse
Copy-Item -LiteralPath (Join-Path $repoRoot "backend\prisma") -Destination $backendRuntime -Recurse
Copy-Item -LiteralPath (Join-Path $repoRoot "backend\package.json") -Destination $backendRuntime
Copy-Item -LiteralPath (Join-Path $repoRoot "backend\native") -Destination $backendRuntime -Recurse

$frontendStandalone = Join-Path $repoRoot "frontend\.next\standalone"
if (Test-Path $frontendStandalone) {
  Copy-Item -LiteralPath $frontendStandalone -Destination (Join-Path $runtimeRoot "frontend-standalone") -Recurse
}

$frontendStatic = Join-Path $repoRoot "frontend\.next\static"
$frontendStandaloneStatic = Join-Path $runtimeRoot "frontend-standalone\frontend\.next\static"
if (Test-Path $frontendStatic) {
  New-Item -ItemType Directory -Force -Path (Split-Path $frontendStandaloneStatic -Parent) | Out-Null
  Copy-Item -LiteralPath $frontendStatic -Destination $frontendStandaloneStatic -Recurse
}

$frontendPublic = Join-Path $repoRoot "frontend\public"
$frontendStandalonePublic = Join-Path $runtimeRoot "frontend-standalone\frontend\public"
if (Test-Path $frontendPublic) {
  New-Item -ItemType Directory -Force -Path (Split-Path $frontendStandalonePublic -Parent) | Out-Null
  Copy-Item -LiteralPath $frontendPublic -Destination $frontendStandalonePublic -Recurse
}

$toolRuntime = Join-Path $runtimeRoot "tool"
Copy-Item -LiteralPath (Join-Path $repoRoot "tool") -Destination $toolRuntime -Recurse

$vendorRoot = Join-Path $runtimeRoot "vendor"
New-Item -ItemType Directory -Force -Path $vendorRoot | Out-Null
Set-Content -LiteralPath (Join-Path $vendorRoot "README.md") -Encoding UTF8 -Value @"
# Vendor installers

Place offline production installers here before building the final setup:

- postgresql-windows-x64.exe
- node-windows-x64.msi, if Node.js/npm is not installed
- vc_redist.x64.exe, if the OCR runtime needs it on the target machine
- python-windows-x64.exe, if Python 3.11 is not installed

The NSIS bootstrap script checks this folder after installation.
"@

Get-ChildItem -LiteralPath $runtimeRoot -Recurse -Directory -Force |
  Where-Object { $_.Name -in @("node_modules", ".venv", "__pycache__", ".pytest_cache", ".git", "logs") } |
  Sort-Object FullName -Descending |
  Remove-Item -Recurse -Force

Get-ChildItem -LiteralPath $runtimeRoot -Recurse -Force |
  Where-Object { $_.Name -in @(".git", ".gitignore") } |
  Remove-Item -Force -Recurse

Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File -Force |
  Where-Object { $_.Name -in @(".env", ".env.local") -or $_.Name -like ".env.*" } |
  Remove-Item -Force

$manifest = [ordered]@{
  product = "AHSO OCR Metal Core Washing"
  preparedAt = (Get-Date).ToUniversalTime().ToString("o")
  backend = "backend/dist/main.js"
  frontend = "frontend-standalone"
  tool = "tool/main.py"
  envPath = "C:\ProgramData\AHSO OCR\.env"
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Runtime staged at $runtimeRoot"

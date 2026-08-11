param(
  [string]$ToolBundlePath = $env:DEVICE_TOOL_BUNDLE_PATH,
  [string]$ToolReleaseRepository = $env:DEVICE_TOOL_RELEASE_REPOSITORY,
  [string]$ToolReleaseTag = $env:DEVICE_TOOL_RELEASE_TAG,
  [string]$ToolReleaseAsset = $env:DEVICE_TOOL_RELEASE_ASSET,
  [string]$ToolReleaseSha256 = $env:DEVICE_TOOL_RELEASE_SHA256
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$runtimeRoot = Join-Path $repoRoot "release-runtime"
$manifestPath = Join-Path $runtimeRoot "runtime-manifest.json"

function Get-FileSha256 {
  param([string]$Path)

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DirectorySha256 {
  param(
    [string]$Path,
    [string[]]$ExcludePathPrefixes = @()
  )

  $root = (Resolve-Path -LiteralPath $Path).Path.TrimEnd("\\")
  $entries = Get-ChildItem -LiteralPath $root -Recurse -File -Force |
    Where-Object {
      $relativePath = $_.FullName.Substring($root.Length).TrimStart("\\")
      -not ($ExcludePathPrefixes | Where-Object {
        $relativePath.StartsWith($_, [System.StringComparison]::OrdinalIgnoreCase)
      })
    } |
    Sort-Object FullName |
    ForEach-Object {
      $relativePath = $_.FullName.Substring($root.Length).TrimStart("\\")
      "{0}:{1}" -f $relativePath.Replace("\\", "/"), (Get-FileSha256 -Path $_.FullName)
    }

  $combined = [string]::Join("`n", @($entries))
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($combined)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ($hasher.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
  } finally {
    $hasher.Dispose()
  }
}

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

$dongleHelperRuntime = Join-Path $backendRuntime "native\dongle-checker.exe"
& (Join-Path $repoRoot "scripts\release\build-dongle-helper.ps1") -OutputPath $dongleHelperRuntime
if (-not (Test-Path $dongleHelperRuntime)) {
  throw "Dongle helper was not staged at $dongleHelperRuntime"
}

$frontendStandalone = Join-Path $repoRoot "frontend\.next\standalone"
if (Test-Path $frontendStandalone) {
  $frontendStandaloneRuntime = Join-Path $runtimeRoot "frontend-standalone"
  Copy-Item -LiteralPath $frontendStandalone -Destination $frontendStandaloneRuntime -Recurse
  Copy-Item -LiteralPath (Join-Path $repoRoot "frontend\package.json") -Destination $frontendStandaloneRuntime
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
$toolStageParameters = @{
  Destination = $toolRuntime
}
if (-not [string]::IsNullOrWhiteSpace($ToolBundlePath)) {
  $toolStageParameters.ToolBundlePath = $ToolBundlePath
}
if (-not [string]::IsNullOrWhiteSpace($ToolReleaseRepository)) {
  $toolStageParameters.ToolReleaseRepository = $ToolReleaseRepository
}
if (-not [string]::IsNullOrWhiteSpace($ToolReleaseTag)) {
  $toolStageParameters.ToolReleaseTag = $ToolReleaseTag
}
if (-not [string]::IsNullOrWhiteSpace($ToolReleaseAsset)) {
  $toolStageParameters.ToolReleaseAsset = $ToolReleaseAsset
}
if (-not [string]::IsNullOrWhiteSpace($ToolReleaseSha256)) {
  $toolStageParameters.ToolReleaseSha256 = $ToolReleaseSha256
}
& (Join-Path $PSScriptRoot "stage-private-tool.ps1") @toolStageParameters

$vendorRoot = Join-Path $runtimeRoot "vendor"
New-Item -ItemType Directory -Force -Path $vendorRoot | Out-Null
Set-Content -LiteralPath (Join-Path $vendorRoot "README.md") -Encoding UTF8 -Value @"
# Vendor installers

Place offline production installers here before building the final setup:

- postgresql-windows-x64.exe
- node-windows-x64.msi, if Node.js/npm is not installed
- vc_redist.x64.exe, if the OCR runtime needs it on the target machine
- Python 3.11 is embedded in the encrypted Tool release and does not need a separate installer

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
  toolPython = "tool/python-embed/python.exe"
  toolRuntime = [ordered]@{
    codeSha256 = Get-DirectorySha256 -Path $toolRuntime -ExcludePathPrefixes @("python-embed\\", ".venv\\", "__pycache__\\", "logs\\", ".tool-release.json")
    pythonSha256 = Get-DirectorySha256 -Path (Join-Path $toolRuntime "python-embed") -ExcludePathPrefixes @("Lib\\site-packages\\", "Scripts\\")
    requirementsSha256 = Get-FileSha256 -Path (Join-Path $toolRuntime "requirements.txt")
  }
  toolRelease = (Get-Content -LiteralPath (Join-Path $toolRuntime ".tool-release.json") -Raw | ConvertFrom-Json)
  envPath = "C:\ProgramData\AHSO OCR\.env"
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Runtime staged at $runtimeRoot"

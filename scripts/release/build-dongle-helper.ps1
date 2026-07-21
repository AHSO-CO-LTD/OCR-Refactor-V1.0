param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$sourceDir = Join-Path $repoRoot "backend\native-src\dongle-checker"

if (-not (Test-Path $sourceDir)) {
  throw "Dongle helper source was not found at $sourceDir"
}

$go = Get-Command "go.exe" -ErrorAction SilentlyContinue
if (-not $go) {
  $go = Get-Command "go" -ErrorAction SilentlyContinue
}
if (-not $go) {
  throw "Go is required to build dongle-checker.exe for production releases."
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"

Push-Location $sourceDir
try {
  & $go.Source build -trimpath -ldflags "-s -w" -o $OutputPath .
  if ($LASTEXITCODE -ne 0) {
    throw "go build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

if (-not (Test-Path $OutputPath)) {
  throw "Dongle helper build finished without creating $OutputPath"
}

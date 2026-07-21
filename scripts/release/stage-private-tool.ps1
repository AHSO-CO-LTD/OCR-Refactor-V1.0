[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [string]$ConfigPath = "",
  [string]$ToolBundlePath = $env:DEVICE_TOOL_BUNDLE_PATH,
  [string]$ToolReleaseRepository = $env:DEVICE_TOOL_RELEASE_REPOSITORY,
  [string]$ToolReleaseTag = $env:DEVICE_TOOL_RELEASE_TAG,
  [string]$ToolReleaseAsset = $env:DEVICE_TOOL_RELEASE_ASSET,
  [string]$ToolReleaseSha256 = $env:DEVICE_TOOL_RELEASE_SHA256
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $PSScriptRoot "private-tool-release.json"
}

function Resolve-ReleaseValue {
  param(
    [string]$ExplicitValue,
    [string]$ConfigValue,
    [string]$Label
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
    return $ExplicitValue.Trim()
  }

  if (-not [string]::IsNullOrWhiteSpace($ConfigValue)) {
    return $ConfigValue.Trim()
  }

  throw "Private Tool release $Label is not configured."
}

function Resolve-ToolPackageRoot {
  param([string]$Root)

  if (Test-Path -LiteralPath (Join-Path $Root "main.py")) {
    return (Resolve-Path -LiteralPath $Root).Path
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $Root -Recurse -File -Filter "main.py" |
      Where-Object {
        Test-Path -LiteralPath (Join-Path $_.Directory.FullName "python-embed\python.exe")
      } |
      ForEach-Object { $_.Directory.FullName } |
      Sort-Object -Unique
  )

  if ($candidates.Count -ne 1) {
    throw "Expected exactly one encrypted Tool package in $Root, found $($candidates.Count)."
  }

  return $candidates[0]
}

function Assert-EncryptedToolPackage {
  param([string]$Root)

  $requiredFiles = @(
    "main.py",
    "config.json",
    "requirements.txt",
    "setup.bat",
    "python-embed\python.exe"
  )

  foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $relativePath))) {
      throw "Encrypted Tool package is missing $relativePath."
    }
  }

  foreach ($moduleName in @("api", "core", "drivers")) {
    $compiledModules = @(
      Get-ChildItem -LiteralPath $Root -File -Filter "$moduleName.cp*.pyd"
    )
    if ($compiledModules.Count -eq 0) {
      throw "Encrypted Tool package is missing compiled module $moduleName.cp*.pyd."
    }

    $plainModule = Join-Path $Root "$moduleName.py"
    if (Test-Path -LiteralPath $plainModule) {
      throw "Protected Tool source was found: $plainModule"
    }

    $sourceDirectory = Join-Path $Root $moduleName
    if (Test-Path -LiteralPath $sourceDirectory) {
      $plainSources = @(
        Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File -Filter "*.py"
      )
      if ($plainSources.Count -gt 0) {
        throw "Protected Tool source was found: $($plainSources[0].FullName)"
      }
    }
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Private Tool release config was not found at $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$repository = Resolve-ReleaseValue -ExplicitValue $ToolReleaseRepository -ConfigValue $config.repository -Label "repository"
$tag = Resolve-ReleaseValue -ExplicitValue $ToolReleaseTag -ConfigValue $config.tag -Label "tag"
$asset = Resolve-ReleaseValue -ExplicitValue $ToolReleaseAsset -ConfigValue $config.asset -Label "asset"
$expectedSha256 = Resolve-ReleaseValue -ExplicitValue $ToolReleaseSha256 -ConfigValue $config.sha256 -Label "SHA-256"
$expectedSha256 = $expectedSha256.ToLowerInvariant()

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ahso-ocr-private-tool-" + [guid]::NewGuid().ToString("N"))
$stagingDestination = "{0}.staging-{1}" -f ([System.IO.Path]::GetFullPath($Destination)), [guid]::NewGuid().ToString("N")
$sourceRoot = $null
$archiveSha256 = $null
$sourceLabel = "private-release"

try {
  if (-not [string]::IsNullOrWhiteSpace($ToolBundlePath)) {
    $resolvedBundle = (Resolve-Path -LiteralPath $ToolBundlePath).Path
    if (Test-Path -LiteralPath $resolvedBundle -PathType Container) {
      $sourceRoot = Resolve-ToolPackageRoot -Root $resolvedBundle
      $sourceLabel = "local-directory"
    } else {
      New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
      $archiveSha256 = (Get-FileHash -LiteralPath $resolvedBundle -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($archiveSha256 -ne $expectedSha256) {
        throw "Private Tool archive SHA-256 mismatch. Expected $expectedSha256, received $archiveSha256."
      }
      $extractRoot = Join-Path $temporaryRoot "extracted"
      Expand-Archive -LiteralPath $resolvedBundle -DestinationPath $extractRoot -Force
      $sourceRoot = Resolve-ToolPackageRoot -Root $extractRoot
      $sourceLabel = "local-archive"
    }
  } else {
    $gh = Get-Command "gh.exe" -ErrorAction SilentlyContinue
    if (-not $gh) {
      $gh = Get-Command "gh" -ErrorAction SilentlyContinue
    }
    if (-not $gh) {
      throw "GitHub CLI (gh) is required to download the private Tool release."
    }

    if ($env:GITHUB_ACTIONS -eq "true" -and [string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
      throw "GitHub Actions secret TOOL_RELEASE_TOKEN is missing. Expose it as GH_TOKEN for the Prepare runtime step."
    }

    $downloadRoot = Join-Path $temporaryRoot "download"
    New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
    Write-Host "Downloading encrypted Tool $repository@$tag ($asset)..."
    & $gh.Source release download $tag --repo $repository --pattern $asset --dir $downloadRoot --clobber
    if ($LASTEXITCODE -ne 0) {
      throw "Could not download private Tool release $repository@$tag. Check gh authentication or TOOL_RELEASE_TOKEN."
    }

    $archivePath = Join-Path $downloadRoot $asset
    if (-not (Test-Path -LiteralPath $archivePath)) {
      throw "Private Tool release asset was not downloaded: $archivePath"
    }

    $archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveSha256 -ne $expectedSha256) {
      throw "Private Tool release SHA-256 mismatch. Expected $expectedSha256, received $archiveSha256."
    }

    $extractRoot = Join-Path $temporaryRoot "extracted"
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
    $sourceRoot = Resolve-ToolPackageRoot -Root $extractRoot
  }

  Assert-EncryptedToolPackage -Root $sourceRoot

  New-Item -ItemType Directory -Force -Path $stagingDestination | Out-Null
  Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stagingDestination -Recurse -Force
  }
  Assert-EncryptedToolPackage -Root $stagingDestination

  [ordered]@{
    repository = $repository
    tag = $tag
    asset = $asset
    expectedSha256 = $expectedSha256
    archiveSha256 = $archiveSha256
    source = $sourceLabel
    stagedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stagingDestination ".tool-release.json") -Encoding UTF8

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  Move-Item -LiteralPath $stagingDestination -Destination $Destination
  Write-Host "Encrypted Tool staged at $Destination"
} finally {
  if (Test-Path -LiteralPath $stagingDestination) {
    Remove-Item -LiteralPath $stagingDestination -Recurse -Force
  }
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

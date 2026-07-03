param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$toolDir = Join-Path $RepoRoot "tool"
$requirementsPath = Join-Path $toolDir "requirements.txt"
$venvPath = Join-Path $toolDir ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

function Write-Step {
  param([string]$Message)
  Write-Host "[tool-python] $Message"
}

function Test-Python311 {
  param(
    [string]$Command,
    [string[]]$Args = @()
  )

  try {
    & $Command @Args -c "import sys, venv; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)" 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Test-ToolDependencies {
  param([string]$PythonPath)

  try {
    & $PythonPath -c "import importlib.util as u; mods=['fastapi','uvicorn','cv2','pypylon','ultralytics']; missing=[m for m in mods if u.find_spec(m) is None]; raise SystemExit(1 if missing else 0)" 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-LauncherPythonPaths {
  try {
    $output = & py -0p 2>&1
  } catch {
    return @()
  }

  return ($output | ForEach-Object { $_.ToString() }) |
    ForEach-Object { [regex]::Match($_, "([A-Za-z]:\\.*?python\.exe)") } |
    Where-Object { $_.Success } |
    ForEach-Object { $_.Groups[1].Value } |
    Where-Object { Test-Path $_ }
}

function Find-Python311 {
  $candidates = @()

  if ($env:DEVICE_TOOL_PYTHON) {
    $candidates += @{ command = $env:DEVICE_TOOL_PYTHON; args = @() }
  }

  $launcherPaths = Get-LauncherPythonPaths |
    Where-Object { $_ -match "(Python311|cpython-3\.11|\\3\.11\\)" }

  foreach ($launcherPath in $launcherPaths) {
    $candidates += @{ command = $launcherPath; args = @() }
  }

  $pyCommand = Get-Command "py.exe" -ErrorAction SilentlyContinue
  if ($pyCommand) {
    $candidates += @{ command = $pyCommand.Source; args = @("-3.11") }
  }

  $pythonCommand = Get-Command "python.exe" -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    $candidates += @{ command = $pythonCommand.Source; args = @() }
  }

  foreach ($candidate in $candidates) {
    if (Test-Python311 -Command $candidate.command -Args $candidate.args) {
      return $candidate
    }
  }

  return $null
}

function Remove-ToolVenv {
  $resolvedTool = (Resolve-Path $toolDir).Path.TrimEnd("\")
  $resolvedVenv = (Resolve-Path $venvPath).Path

  if (-not $resolvedVenv.StartsWith("$resolvedTool\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected venv path: $resolvedVenv"
  }

  Remove-Item -LiteralPath $resolvedVenv -Recurse -Force
}

function Invoke-Checked {
  param(
    [string]$Command,
    [string[]]$Arguments,
    [string]$ErrorMessage
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }
}

if (-not (Test-Path $toolDir)) {
  throw "Tool directory was not found: $toolDir"
}

if (-not (Test-Path $requirementsPath)) {
  throw "Tool requirements file was not found: $requirementsPath"
}

if ((Test-Path $venvPython) -and -not (Test-Python311 -Command $venvPython)) {
  Write-Step "Existing tool venv is not Python 3.11. Recreating it."
  Remove-ToolVenv
}

if (-not (Test-Path $venvPython)) {
  $python = Find-Python311
  if (-not $python) {
    throw "Python 3.11 was not found. Install Python 3.11 or set DEVICE_TOOL_PYTHON to a Python 3.11 executable."
  }

  Write-Step "Creating tool venv with $($python.command) $($python.args -join ' ')"
  $venvArgs = @($python.args) + @("-m", "venv", $venvPath)
  Invoke-Checked -Command $python.command -Arguments $venvArgs -ErrorMessage "Could not create tool Python venv."
}

if (-not (Test-Python311 -Command $venvPython)) {
  throw "Tool venv exists, but it is not Python 3.11: $venvPython"
}

if (-not (Test-ToolDependencies -PythonPath $venvPython)) {
  Write-Step "Installing tool Python requirements. This can take a while on the first run."
  Invoke-Checked -Command $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -ErrorMessage "Could not upgrade pip in tool venv."
  Invoke-Checked -Command $venvPython -Arguments @("-m", "pip", "install", "-r", $requirementsPath) -ErrorMessage "Could not install tool Python requirements."
}

Write-Step "Tool Python runtime is ready: $venvPython"

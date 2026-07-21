param(
  [string]$ProgramDataRoot = "",
  [switch]$KeepDatabase,
  [switch]$KeepFrameworks
)

$ErrorActionPreference = "Stop"

$programDataBase = if ($env:PROGRAMDATA) { $env:PROGRAMDATA } else { "C:\ProgramData" }
if (-not $ProgramDataRoot) {
  $ProgramDataRoot = Join-Path $programDataBase "AHSO OCR"
}

$uninstallLogPath = Join-Path $ProgramDataRoot "uninstall.log"
$runtimeOwnershipPath = Join-Path $ProgramDataRoot "runtime-ownership.json"

function Write-UninstallLog {
  param([string]$Message)

  New-Item -ItemType Directory -Force -Path $ProgramDataRoot | Out-Null
  $timestamp = (Get-Date).ToUniversalTime().ToString("o")
  Add-Content -LiteralPath $uninstallLogPath -Encoding UTF8 -Value "[$timestamp] $Message"
}

function Read-RuntimeOwnership {
  if (-not (Test-Path $runtimeOwnershipPath)) {
    return [pscustomobject]@{
      nodeInstalledBySetup = $false
      pythonInstalledBySetup = $false
      postgresqlInstalledBySetup = $false
    }
  }

  try {
    return Get-Content -LiteralPath $runtimeOwnershipPath -Raw | ConvertFrom-Json
  } catch {
    Write-UninstallLog "Could not read runtime ownership file: $($_.Exception.Message)"
    return [pscustomobject]@{
      nodeInstalledBySetup = $false
      pythonInstalledBySetup = $false
      postgresqlInstalledBySetup = $false
    }
  }
}

function Get-UninstallEntries {
  $roots = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  foreach ($root in $roots) {
    Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -and ($_.UninstallString -or $_.QuietUninstallString) }
  }
}

function Invoke-UninstallEntry {
  param(
    [Parameter(Mandatory = $true)]
    $Entry,
    [string]$ExtraArguments = ""
  )

  $displayName = [string]$Entry.DisplayName
  $command = if ($Entry.QuietUninstallString) {
    [string]$Entry.QuietUninstallString
  } else {
    [string]$Entry.UninstallString
  }

  Write-UninstallLog "Uninstalling runtime component: $displayName"

  $productCodeMatch = [regex]::Match($command, "\{[0-9A-Fa-f-]{36}\}")
  if ($command -match "msiexec" -and $productCodeMatch.Success) {
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @(
      "/x",
      $productCodeMatch.Value,
      "/qn",
      "/norestart"
    ) -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) {
      throw "Could not uninstall $displayName. Exit code: $($process.ExitCode)"
    }
    return
  }

  $fullCommand = $command
  if ($ExtraArguments) {
    $fullCommand = "$fullCommand $ExtraArguments"
  } elseif (-not $Entry.QuietUninstallString) {
    $fullCommand = "$fullCommand /quiet /norestart"
  }

  $process = Start-Process -FilePath "cmd.exe" -ArgumentList @(
    "/c",
    $fullCommand
  ) -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Could not uninstall $displayName. Exit code: $($process.ExitCode)"
  }
}

function Uninstall-RegistryApplication {
  param(
    [string]$NamePattern,
    [string]$ExtraArguments = ""
  )

  $entries = @(Get-UninstallEntries | Where-Object {
      [string]$_.DisplayName -match $NamePattern
    })

  if ($entries.Count -eq 0) {
    Write-UninstallLog "No uninstall entry matched pattern: $NamePattern"
    return
  }

  foreach ($entry in $entries) {
    Invoke-UninstallEntry -Entry $entry -ExtraArguments $ExtraArguments
  }
}

function Uninstall-PostgreSql {
  $uninstallers = @()
  $postgresRoot = "C:\Program Files\PostgreSQL"
  if (Test-Path $postgresRoot) {
    $uninstallers = @(Get-ChildItem -LiteralPath $postgresRoot -Filter "uninstall-postgresql.exe" -Recurse -ErrorAction SilentlyContinue)
  }

  if ($uninstallers.Count -gt 0) {
    foreach ($uninstaller in $uninstallers) {
      Write-UninstallLog "Uninstalling PostgreSQL through $($uninstaller.FullName)"
      $process = Start-Process -FilePath $uninstaller.FullName -ArgumentList @(
        "--mode",
        "unattended"
      ) -Wait -PassThru -WindowStyle Hidden
      if ($process.ExitCode -ne 0) {
        throw "PostgreSQL uninstaller failed with code $($process.ExitCode)"
      }
    }
    return
  }

  Uninstall-RegistryApplication -NamePattern "^PostgreSQL" -ExtraArguments "--mode unattended"
}

function Remove-DatabaseAndConfig {
  $scriptPath = Join-Path $PSScriptRoot "uninstall-database.ps1"
  if (-not (Test-Path $scriptPath)) {
    throw "uninstall-database.ps1 was not found beside uninstall-runtime.ps1"
  }

  & $scriptPath -ProgramDataRoot $ProgramDataRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Database uninstall failed. See $uninstallLogPath for details."
  }
}

try {
  Write-UninstallLog "Starting uninstall. keepDatabase=$KeepDatabase keepFrameworks=$KeepFrameworks"
  $ownership = Read-RuntimeOwnership

  if (-not $KeepDatabase) {
    Remove-DatabaseAndConfig
  } else {
    Write-UninstallLog "Keeping local database and runtime config."
  }

  if (-not $KeepFrameworks) {
    if ($ownership.nodeInstalledBySetup) {
      Uninstall-RegistryApplication -NamePattern "^Node\.js"
    } else {
      Write-UninstallLog "Skipping Node.js removal because setup did not mark it as installed by AHSO OCR."
    }

    if ($ownership.pythonInstalledBySetup) {
      Uninstall-RegistryApplication -NamePattern "^Python 3\.11"
    } else {
      Write-UninstallLog "Skipping Python removal because setup did not mark it as installed by AHSO OCR."
    }

    if ($ownership.postgresqlInstalledBySetup -and -not $KeepDatabase) {
      Uninstall-PostgreSql
    } elseif ($ownership.postgresqlInstalledBySetup -and $KeepDatabase) {
      Write-UninstallLog "Keeping PostgreSQL because the local database is being kept."
    } else {
      Write-UninstallLog "Skipping PostgreSQL removal because setup did not mark it as installed by AHSO OCR."
    }
  } else {
    Write-UninstallLog "Keeping runtime frameworks."
  }

  if (-not $KeepDatabase) {
    Remove-Item -LiteralPath $ProgramDataRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  exit 0
} catch {
  Write-UninstallLog "Runtime uninstall failed: $($_.Exception.Message)"
  exit 1
}

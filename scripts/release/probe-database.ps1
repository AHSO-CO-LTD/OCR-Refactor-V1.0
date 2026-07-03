param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath,
  [Parameter(Mandatory = $true)]
  [string]$StatusPath
)

$ErrorActionPreference = "Stop"

function Read-IniSection {
  param(
    [string]$Path,
    [string]$Section
  )

  $result = @{}
  if (-not (Test-Path $Path)) {
    return $result
  }

  $currentSection = ""
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith(";") -or $trimmed.StartsWith("#")) {
      continue
    }

    if ($trimmed.StartsWith("[") -and $trimmed.EndsWith("]")) {
      $currentSection = $trimmed.Substring(1, $trimmed.Length - 2)
      continue
    }

    if ($currentSection -ne $Section) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 0) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1)
    $result[$key] = $value
  }

  return $result
}

function Write-ProbeStatus {
  param(
    [string]$State,
    [string]$Message
  )

  $safeMessage = ($Message -replace "[\r\n]+", " ").Trim()
  if (-not $safeMessage) {
    $safeMessage = "No probe detail was returned."
  }

  $content = @(
    "[probe]",
    "state=$State",
    "message=$safeMessage"
  )
  Set-Content -LiteralPath $StatusPath -Encoding ASCII -Value $content
}

function Find-Psql {
  $postgresRoot = "C:\Program Files\PostgreSQL"
  if (Test-Path $postgresRoot) {
    $candidates = Get-ChildItem -LiteralPath $postgresRoot -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName
    $binCandidate = $candidates |
      Where-Object { $_.FullName -match "\\bin\\psql\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($binCandidate) {
      return $binCandidate.FullName
    }

    $fallbackCandidate = $candidates | Select-Object -First 1
    if ($fallbackCandidate) {
      return $fallbackCandidate.FullName
    }
  }

  $command = Get-Command "psql.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  return $null
}

function Escape-SqlLiteral {
  param([string]$Value)

  return $Value.Replace("'", "''")
}

try {
  $config = Read-IniSection -Path $ConfigPath -Section "database"
  $dbHost = if ($config.host) { $config.host } else { "127.0.0.1" }
  $port = if ($config.port) { $config.port } else { "5432" }
  $name = if ($config.name) { $config.name } else { "ocr_metal_core_washing" }
  $adminUser = if ($config.adminUser) { $config.adminUser } else { "postgres" }
  $adminPassword = if ($config.adminPassword) { $config.adminPassword } else { "" }

  $psql = Find-Psql
  if (-not $psql) {
    Write-ProbeStatus -State "unknown" -Message "psql.exe was not found."
    exit 2
  }

  $previousPassword = $env:PGPASSWORD
  $previousTimeout = $env:PGCONNECT_TIMEOUT
  try {
    $env:PGPASSWORD = $adminPassword
    $env:PGCONNECT_TIMEOUT = "5"
    $databaseName = Escape-SqlLiteral -Value $name
    $sql = "SELECT CASE WHEN EXISTS (SELECT FROM pg_database WHERE datname = '$databaseName') THEN 'exists' ELSE 'missing' END;"
    $output = & $psql -w -h $dbHost -p $port -U $adminUser -d "postgres" -v "ON_ERROR_STOP=1" -tA -c $sql 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    if ($null -eq $previousPassword) {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
      $env:PGPASSWORD = $previousPassword
    }
    if ($null -eq $previousTimeout) {
      Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
    } else {
      $env:PGCONNECT_TIMEOUT = $previousTimeout
    }
  }

  if ($exitCode -ne 0) {
    $message = (($output | ForEach-Object { $_.ToString() }) -join " ").Trim()
    Write-ProbeStatus -State "unknown" -Message $message
    exit 2
  }

  $state = (($output | ForEach-Object { $_.ToString() }) -join "").Trim()
  if ($state -eq "exists") {
    Write-ProbeStatus -State "exists" -Message "Database already exists."
    exit 10
  }

  if ($state -eq "missing") {
    Write-ProbeStatus -State "missing" -Message "Database does not exist."
    exit 11
  }

  Write-ProbeStatus -State "unknown" -Message "Unexpected psql output: $state"
  exit 2
} catch {
  Write-ProbeStatus -State "unknown" -Message $_.Exception.Message
  exit 2
}

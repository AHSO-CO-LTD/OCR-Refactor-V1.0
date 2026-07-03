param(
  [string]$ProgramDataRoot = ""
)

$ErrorActionPreference = "Stop"

$programDataBase = if ($env:PROGRAMDATA) { $env:PROGRAMDATA } else { "C:\ProgramData" }
if (-not $ProgramDataRoot) {
  $ProgramDataRoot = Join-Path $programDataBase "AHSO OCR"
}

$envPath = Join-Path $ProgramDataRoot ".env"
$uninstallLogPath = Join-Path $ProgramDataRoot "uninstall.log"

function Write-UninstallLog {
  param([string]$Message)

  New-Item -ItemType Directory -Force -Path $ProgramDataRoot | Out-Null
  $timestamp = (Get-Date).ToUniversalTime().ToString("o")
  Add-Content -LiteralPath $uninstallLogPath -Encoding UTF8 -Value "[$timestamp] $Message"
}

function Read-EnvFile {
  param([string]$Path)

  $result = @{}
  if (-not (Test-Path $Path)) {
    return $result
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 0) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $result[$key] = $value
  }

  return $result
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

function Assert-ResettableDatabase {
  param([string]$Name)

  $normalized = $Name.ToLowerInvariant()
  if (@("postgres", "template0", "template1") -contains $normalized) {
    throw "Refusing to delete system database '$Name'."
  }

  if ($Name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
    throw "Database '$Name' has an unsupported name for automatic deletion."
  }
}

try {
  $envValues = Read-EnvFile -Path $envPath
  $databaseUrl = $envValues["DATABASE_URL"]
  if (-not $databaseUrl) {
    Write-UninstallLog "No DATABASE_URL was found at $envPath. Nothing to delete."
    exit 0
  }

  $uri = [System.Uri]$databaseUrl
  $userInfo = $uri.UserInfo.Split(":", 2)
  $dbUser = if ($userInfo.Length -gt 0) { [System.Uri]::UnescapeDataString($userInfo[0]) } else { "" }
  $dbPassword = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
  $dbName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
  $dbHost = $uri.Host
  $dbPort = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }

  if (-not $dbUser -or -not $dbName) {
    throw "DATABASE_URL is missing database user or database name."
  }

  Assert-ResettableDatabase -Name $dbName

  $psql = Find-Psql
  if (-not $psql) {
    throw "psql.exe was not found."
  }

  $previousPassword = $env:PGPASSWORD
  $previousTimeout = $env:PGCONNECT_TIMEOUT
  try {
    $env:PGPASSWORD = $dbPassword
    $env:PGCONNECT_TIMEOUT = "5"
    $safeDbName = Escape-SqlLiteral -Value $dbName

    Write-UninstallLog "Dropping database $dbName on ${dbHost}:$dbPort as $dbUser."
    & $psql -w -h $dbHost -p $dbPort -U $dbUser -d "postgres" -v "ON_ERROR_STOP=1" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$safeDbName' AND pid <> pg_backend_pid();" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Could not terminate existing database connections."
    }

    & $psql -w -h $dbHost -p $dbPort -U $dbUser -d "postgres" -v "ON_ERROR_STOP=1" -c "DROP DATABASE IF EXISTS $dbName;" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Could not drop database '$dbName'."
    }
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

  Remove-Item -LiteralPath $envPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $ProgramDataRoot "support-dev-credential.json") -Force -ErrorAction SilentlyContinue
  Write-UninstallLog "Database $dbName was deleted."
  exit 0
} catch {
  Write-UninstallLog "Database uninstall failed: $($_.Exception.Message)"
  exit 1
}

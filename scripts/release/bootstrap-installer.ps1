param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,
  [string]$DbConfigPath = ""
)

$ErrorActionPreference = "Stop"

$programDataBase = if ($env:PROGRAMDATA) { $env:PROGRAMDATA } else { "C:\ProgramData" }
$programDataRoot = Join-Path $programDataBase "AHSO OCR"
$statusPath = Join-Path $programDataRoot "bootstrap-status.json"
$envPath = Join-Path $programDataRoot ".env"
$credentialPath = Join-Path $programDataRoot "support-dev-credential.json"
$bootstrapLogPath = Join-Path $programDataRoot "bootstrap.log"
$runtimeRoot = Join-Path $InstallDir "resources\runtime"
$vendorRoot = Join-Path $runtimeRoot "vendor"

function New-Secret {
  param([int]$Bytes = 32)

  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return ([Convert]::ToBase64String($buffer).TrimEnd("=") -replace "\+", "-" -replace "/", "_")
}

function Write-BootstrapLog {
  param([string]$Message)

  New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null
  $timestamp = (Get-Date).ToUniversalTime().ToString("o")
  Add-Content -LiteralPath $bootstrapLogPath -Encoding UTF8 -Value "[$timestamp] $Message"
}

function Write-Status {
  param(
    [string]$State,
    [string]$Message,
    [hashtable]$Details = @{}
  )

  New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null
  [ordered]@{
    state = $State
    message = $Message
    details = $Details
    writtenAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}

function Protect-ProgramDataFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  try {
    icacls.exe $Path /inheritance:r /grant:r "Administrators:F" "SYSTEM:F" | Out-Null
  } catch {
    Write-Status -State "warning" -Message "Could not lock file ACL." -Details @{ path = $Path; error = $_.Exception.Message }
  }
}

function Find-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  return $null
}

function Read-IniSection {
  param(
    [string]$Path,
    [string]$Section
  )

  $result = @{}
  if (-not $Path -or -not (Test-Path $Path)) {
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

function Read-DatabaseUrlConfig {
  param([string]$DatabaseUrl)

  if (-not $DatabaseUrl) {
    return @{}
  }

  try {
    $uri = [System.Uri]$DatabaseUrl
    $userInfo = $uri.UserInfo.Split(":", 2)
    $databaseName = $uri.AbsolutePath.TrimStart("/")
    return @{
      host = $uri.Host
      port = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }
      name = [System.Uri]::UnescapeDataString($databaseName)
      user = if ($userInfo.Length -gt 0) { [System.Uri]::UnescapeDataString($userInfo[0]) } else { "" }
      password = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
    }
  } catch {
    Write-BootstrapLog "Could not parse existing DATABASE_URL: $($_.Exception.Message)"
    return @{}
  }
}

function Get-ValueOrDefault {
  param(
    [hashtable]$Values,
    [string]$Key,
    [string]$DefaultValue
  )

  if ($Values.ContainsKey($Key) -and $Values[$Key] -ne "") {
    return $Values[$Key]
  }

  return $DefaultValue
}

function Get-DatabaseConfig {
  $envValues = Read-EnvFile -Path $envPath
  $existingDb = Read-DatabaseUrlConfig -DatabaseUrl $envValues["DATABASE_URL"]
  $installerDb = Read-IniSection -Path $DbConfigPath -Section "database"

  $dbHost = Get-ValueOrDefault -Values $existingDb -Key "host" -DefaultValue "127.0.0.1"
  $port = Get-ValueOrDefault -Values $existingDb -Key "port" -DefaultValue "5432"
  $name = Get-ValueOrDefault -Values $existingDb -Key "name" -DefaultValue "ocr_metal_core_washing"
  $user = Get-ValueOrDefault -Values $existingDb -Key "user" -DefaultValue "ahso_ocr"
  $password = Get-ValueOrDefault -Values $existingDb -Key "password" -DefaultValue ""

  $dbHost = Get-ValueOrDefault -Values $installerDb -Key "host" -DefaultValue $dbHost
  $port = Get-ValueOrDefault -Values $installerDb -Key "port" -DefaultValue $port
  $name = Get-ValueOrDefault -Values $installerDb -Key "name" -DefaultValue $name
  $user = Get-ValueOrDefault -Values $installerDb -Key "user" -DefaultValue $user
  $password = Get-ValueOrDefault -Values $installerDb -Key "password" -DefaultValue $password

  return @{
    host = $dbHost
    port = $port
    name = $name
    user = $user
    password = $password
    adminUser = Get-ValueOrDefault -Values $installerDb -Key "adminUser" -DefaultValue "postgres"
    adminPassword = Get-ValueOrDefault -Values $installerDb -Key "adminPassword" -DefaultValue $env:OCR_POSTGRES_SUPERPASSWORD
  }
}

function Escape-SqlLiteral {
  param([string]$Value)

  return $Value.Replace("'", "''")
}

function Assert-PostgresIdentifier {
  param(
    [string]$Name,
    [string]$Label
  )

  if (-not $Name -or ($Name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$")) {
    throw "$Label must start with a letter or underscore and contain only letters, numbers, and underscores."
  }
}

function Find-Psql {
  $fromPath = Find-CommandPath "psql.exe"
  if ($fromPath) {
    return $fromPath
  }

  $postgresRoot = "C:\Program Files\PostgreSQL"
  if (Test-Path $postgresRoot) {
    $candidate = Get-ChildItem -LiteralPath $postgresRoot -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  return $null
}

function Install-PostgreSqlIfBundled {
  param(
    [string]$SuperPassword,
    [string]$Port
  )

  $psql = Find-Psql
  if ($psql) {
    return $psql
  }

  $installerPath = Join-Path $vendorRoot "postgresql-windows-x64.exe"
  if (-not (Test-Path $installerPath)) {
    throw "PostgreSQL is not installed and bundled installer was not found at $installerPath"
  }

  $arguments = @(
    "--mode", "unattended",
    "--unattendedmodeui", "none",
    "--superpassword", $SuperPassword,
    "--servicename", "postgresql-x64-ahso",
    "--serverport", $Port
  )

  $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "PostgreSQL installer failed with code $($process.ExitCode)"
  }

  $psql = Find-Psql
  if (-not $psql) {
    throw "PostgreSQL installer completed but psql.exe was not found"
  }

  return $psql
}

function Invoke-Psql {
  param(
    [string]$PsqlPath,
    [string]$Sql,
    [string]$HostName = "127.0.0.1",
    [string]$Port = "5432",
    [string]$Database = "postgres",
    [string]$User = "postgres",
    [string]$Password = "",
    [switch]$Scalar
  )

  $previousPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $Password
    $arguments = @("-h", $HostName, "-p", $Port, "-U", $User, "-d", $Database, "-v", "ON_ERROR_STOP=1")
    if ($Scalar) {
      $arguments += @("-tA")
    }
    $arguments += @("-c", $Sql)

    $output = & $PsqlPath @arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      $joinedOutput = ($output | ForEach-Object { $_.ToString() }) -join "`n"
      Write-BootstrapLog "psql failed with code $exitCode. SQL: $Sql. Output: $joinedOutput"
      throw "psql failed while running database setup. See $bootstrapLogPath for details."
    }

    return ($output | ForEach-Object { $_.ToString() })
  } finally {
    if ($null -eq $previousPassword) {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
      $env:PGPASSWORD = $previousPassword
    }
  }
}

function Test-AppDatabaseConnection {
  param(
    [string]$PsqlPath,
    [hashtable]$Config
  )

  try {
    $result = Invoke-Psql `
      -PsqlPath $PsqlPath `
      -HostName $Config.host `
      -Port $Config.port `
      -Database $Config.name `
      -User $Config.user `
      -Password $Config.password `
      -Sql "SELECT 1;" `
      -Scalar

    return (($result -join "").Trim() -eq "1")
  } catch {
    Write-BootstrapLog "App database connection is not ready yet: $($_.Exception.Message)"
    return $false
  }
}

function Ensure-DatabaseWithAdmin {
  param(
    [string]$PsqlPath,
    [hashtable]$Config
  )

  if (-not $Config.adminPassword) {
    throw "Database connection failed. Enter the existing app DB password, or provide PostgreSQL admin password so setup can create/update the database."
  }

  $roleName = Escape-SqlLiteral -Value $Config.user
  $databaseName = Escape-SqlLiteral -Value $Config.name
  $databasePassword = Escape-SqlLiteral -Value $Config.password

  $roleExists = Invoke-Psql `
    -PsqlPath $PsqlPath `
    -HostName $Config.host `
    -Port $Config.port `
    -Database "postgres" `
    -User $Config.adminUser `
    -Password $Config.adminPassword `
    -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$roleName';" `
    -Scalar

  if (($roleExists -join "").Trim() -eq "1") {
    Invoke-Psql `
      -PsqlPath $PsqlPath `
      -HostName $Config.host `
      -Port $Config.port `
      -Database "postgres" `
      -User $Config.adminUser `
      -Password $Config.adminPassword `
      -Sql "ALTER ROLE $($Config.user) WITH LOGIN PASSWORD '$databasePassword';" | Out-Null
  } else {
    Invoke-Psql `
      -PsqlPath $PsqlPath `
      -HostName $Config.host `
      -Port $Config.port `
      -Database "postgres" `
      -User $Config.adminUser `
      -Password $Config.adminPassword `
      -Sql "CREATE ROLE $($Config.user) LOGIN PASSWORD '$databasePassword';" | Out-Null
  }

  $databaseExists = Invoke-Psql `
    -PsqlPath $PsqlPath `
    -HostName $Config.host `
    -Port $Config.port `
    -Database "postgres" `
    -User $Config.adminUser `
    -Password $Config.adminPassword `
    -Sql "SELECT 1 FROM pg_database WHERE datname = '$databaseName';" `
    -Scalar

  if (($databaseExists -join "").Trim() -eq "1") {
    Invoke-Psql `
      -PsqlPath $PsqlPath `
      -HostName $Config.host `
      -Port $Config.port `
      -Database "postgres" `
      -User $Config.adminUser `
      -Password $Config.adminPassword `
      -Sql "ALTER DATABASE $($Config.name) OWNER TO $($Config.user);" | Out-Null
  } else {
    Invoke-Psql `
      -PsqlPath $PsqlPath `
      -HostName $Config.host `
      -Port $Config.port `
      -Database "postgres" `
      -User $Config.adminUser `
      -Password $Config.adminPassword `
      -Sql "CREATE DATABASE $($Config.name) OWNER $($Config.user);" | Out-Null
  }

  if (-not (Test-AppDatabaseConnection -PsqlPath $PsqlPath -Config $Config)) {
    throw "Database was created or updated, but the app user still cannot connect."
  }
}

function Install-NodeIfBundled {
  $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($npm) {
    return
  }

  $installerPath = Join-Path $vendorRoot "node-windows-x64.msi"
  if (-not (Test-Path $installerPath)) {
    throw "Node.js/npm is required during setup and bundled installer was not found at $installerPath"
  }

  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $installerPath, "/qn", "/norestart") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Node.js installer failed with code $($process.ExitCode)"
  }

  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if (-not $npm) {
    throw "Node.js installer completed but npm.cmd was not found"
  }
}

function Install-NodeDependencies {
  param(
    [string]$Path,
    [switch]$ProductionOnly
  )

  Install-NodeIfBundled

  Push-Location $Path
  $previousWorkspace = $env:npm_config_workspace
  $previousWorkspaces = $env:npm_config_workspaces
  try {
    Remove-Item Env:npm_config_workspace -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_workspaces -ErrorAction SilentlyContinue

    $arguments = @("install", "--package-lock=false", "--workspaces=false")
    if ($ProductionOnly) {
      $arguments += "--omit=dev"
    }

    & npm.cmd @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed in $Path"
    }
  } finally {
    if ($null -ne $previousWorkspace) {
      $env:npm_config_workspace = $previousWorkspace
    }
    if ($null -ne $previousWorkspaces) {
      $env:npm_config_workspaces = $previousWorkspaces
    }
    Pop-Location
  }
}

function Find-Python {
  $venvPython = Join-Path $runtimeRoot "tool\.venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    return @{ command = $venvPython; args = @() }
  }

  $py = Get-Command "py.exe" -ErrorAction SilentlyContinue
  if ($py) {
    return @{ command = $py.Source; args = @("-3.11") }
  }

  $python = Get-Command "python.exe" -ErrorAction SilentlyContinue
  if ($python) {
    return @{ command = $python.Source; args = @() }
  }

  return $null
}

function Install-PythonIfBundled {
  $python = Find-Python
  if ($python) {
    return $python
  }

  $installerPath = Join-Path $vendorRoot "python-windows-x64.exe"
  if (-not (Test-Path $installerPath)) {
    throw "Python 3.11 is not installed and bundled installer was not found at $installerPath"
  }

  $process = Start-Process -FilePath $installerPath -ArgumentList @("/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_pip=1") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Python installer failed with code $($process.ExitCode)"
  }

  $python = Find-Python
  if (-not $python) {
    throw "Python installer completed but Python was not found"
  }

  return $python
}

function Install-ToolPythonDependencies {
  $toolPath = Join-Path $runtimeRoot "tool"
  $requirementsPath = Join-Path $toolPath "requirements.txt"
  if (-not (Test-Path $requirementsPath)) {
    throw "Tool requirements.txt was not found"
  }

  $python = Install-PythonIfBundled
  $venvPath = Join-Path $toolPath ".venv"
  $venvPython = Join-Path $venvPath "Scripts\python.exe"

  if (-not (Test-Path $venvPython)) {
    $pythonCommand = $python.command
    $pythonArgs = @($python.args) + @("-m", "venv", $venvPath)
    & $pythonCommand @pythonArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create Tool Python venv"
    }
  }

  & $venvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    throw "Could not upgrade pip in Tool venv"
  }

  & $venvPython -m pip install -r $requirementsPath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not install Tool Python requirements"
  }
}

try {
  New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null

  $dbConfig = Get-DatabaseConfig
  Assert-PostgresIdentifier -Name $dbConfig.name -Label "Database name"
  Assert-PostgresIdentifier -Name $dbConfig.user -Label "Database user"

  $dbName = $dbConfig.name
  $dbUser = $dbConfig.user
  $dbPassword = $dbConfig.password
  $jwtSecret = New-Secret 48
  $postgresSuperPassword = if ($dbConfig.adminPassword) { $dbConfig.adminPassword } else { New-Secret 24 }
  $supportPassword = New-Secret 24

  if (-not $dbPassword) {
    if ($dbConfig.adminPassword) {
      $dbPassword = New-Secret 24
      $dbConfig.password = $dbPassword
    } else {
      throw "Database password is required unless PostgreSQL admin password is provided."
    }
  }

  $psql = Install-PostgreSqlIfBundled -SuperPassword $postgresSuperPassword -Port $dbConfig.port
  if (Test-AppDatabaseConnection -PsqlPath $psql -Config $dbConfig) {
    Write-BootstrapLog "Using existing database $dbName on $($dbConfig.host):$($dbConfig.port)."
  } else {
    Ensure-DatabaseWithAdmin -PsqlPath $psql -Config $dbConfig
    Write-BootstrapLog "Database $dbName was created or updated on $($dbConfig.host):$($dbConfig.port)."
  }

  $databasePasswordUrl = [System.Uri]::EscapeDataString($dbPassword)
  $databaseUrl = "postgresql://${dbUser}:${databasePasswordUrl}@$($dbConfig.host):$($dbConfig.port)/${dbName}"
  Set-Content -LiteralPath $envPath -Encoding UTF8 -Value @"
NODE_ENV=production
BACKEND_PORT=3979
FRONTEND_PORT=3969
DEVICE_TOOL_PORT=8000
FRONTEND_ORIGIN=http://localhost:3969,http://127.0.0.1:3969
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3979/api
DATABASE_URL=$databaseUrl
JWT_SECRET=$jwtSecret
DEVICE_TOOL_BASE_URL=http://127.0.0.1:8000
DEVICE_TOOL_API_PREFIX=/tool/v1
DONGLE_MOCK_MODE=false
DONGLE_DLL_PATH=$runtimeRoot\backend\native\System8.dll
DONGLE_PYTHON_COMMAND=py -3.11
DONGLE_RETRY_COUNT=3
DONGLE_RETRY_INTERVAL_MS=1000
DONGLE_CHECK_TIMEOUT_MS=7000
"@
  Protect-ProgramDataFile -Path $envPath

  [ordered]@{
    username = "dev"
    password = $supportPassword
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    note = "Developer support account. Keep this file restricted to service administrators."
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $credentialPath -Encoding UTF8
  Protect-ProgramDataFile -Path $credentialPath

  Install-NodeDependencies -Path (Join-Path $runtimeRoot "backend")
  Install-NodeDependencies -Path (Join-Path $runtimeRoot "frontend-standalone") -ProductionOnly
  Install-ToolPythonDependencies

  $env:DATABASE_URL = $databaseUrl
  $env:JWT_SECRET = $jwtSecret
  $env:OCR_SEED_MODE = "production"
  $env:DEV_SUPPORT_PASSWORD = $supportPassword

  Push-Location (Join-Path $runtimeRoot "backend")
  try {
    npm.cmd exec -- prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
      throw "Prisma migrate deploy failed"
    }

    npm.cmd run prisma:seed
    if ($LASTEXITCODE -ne 0) {
      throw "Production seed failed"
    }
  } finally {
    Pop-Location
  }

  Write-Status -State "ready" -Message "Local database and runtime env were bootstrapped." -Details @{
    envPath = $envPath
    credentialPath = $credentialPath
    database = $dbName
    databaseUser = $dbUser
    databaseHost = $dbConfig.host
    databasePort = $dbConfig.port
  }
} catch {
  Write-BootstrapLog "Bootstrap failed: $($_.Exception.Message)"
  Write-Status -State "failed" -Message $_.Exception.Message -Details @{
    installDir = $InstallDir
    runtimeRoot = $runtimeRoot
    vendorRoot = $vendorRoot
  }
  exit 1
}

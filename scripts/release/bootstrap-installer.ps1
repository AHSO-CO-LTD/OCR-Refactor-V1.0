param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,
  [string]$DbConfigPath = "",
  [switch]$UpdateExisting
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
  param(
    [string]$Path,
    [switch]$AllowAuthenticatedRead
  )

  if (-not (Test-Path $Path)) {
    return
  }

  try {
    $grants = @("*S-1-5-32-544:F", "*S-1-5-18:F")
    if ($AllowAuthenticatedRead) {
      $grants += "*S-1-5-11:R"
    }

    icacls.exe $Path /inheritance:r /grant:r @grants | Out-Null
  } catch {
    Write-Status -State "warning" -Message "Could not lock file ACL." -Details @{ path = $Path; error = $_.Exception.Message }
  }
}

function Remove-StalePlaintextDongleHelper {
  $staleHelperPath = Join-Path $runtimeRoot "backend\scripts\check-dongle.py"
  if (-not (Test-Path $staleHelperPath)) {
    return
  }

  Remove-Item -LiteralPath $staleHelperPath -Force
  Write-BootstrapLog "Removed stale plaintext dongle helper from previous install."

  $staleScriptsDir = Split-Path -Parent $staleHelperPath
  if (
    (Test-Path $staleScriptsDir) -and
    -not (Get-ChildItem -LiteralPath $staleScriptsDir -Force -ErrorAction SilentlyContinue)
  ) {
    Remove-Item -LiteralPath $staleScriptsDir -Force
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

function Get-BooleanConfig {
  param(
    [hashtable]$Values,
    [string]$Key
  )

  if (-not $Values.ContainsKey($Key)) {
    return $false
  }

  $rawValue = [string]$Values[$Key]
  $normalized = $rawValue.Trim().ToLowerInvariant()
  return @("1", "true", "yes", "recreate", "reset") -contains $normalized
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
    resetExisting = Get-BooleanConfig -Values $installerDb -Key "resetExisting"
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

function Assert-ResettableDatabase {
  param([string]$Name)

  $normalized = $Name.ToLowerInvariant()
  if (@("postgres", "template0", "template1") -contains $normalized) {
    throw "Database '$Name' is a system database and cannot be deleted by setup."
  }
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

  $fromPath = Find-CommandPath "psql.exe"
  if ($fromPath) {
    return $fromPath
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
  $previousTimeout = $env:PGCONNECT_TIMEOUT
  try {
    $env:PGPASSWORD = $Password
    $env:PGCONNECT_TIMEOUT = "5"
    $arguments = @("-w", "-h", $HostName, "-p", $Port, "-U", $User, "-d", $Database, "-v", "ON_ERROR_STOP=1")
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
    if ($null -eq $previousTimeout) {
      Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
    } else {
      $env:PGCONNECT_TIMEOUT = $previousTimeout
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

function Test-DatabaseExistsWithAdmin {
  param(
    [string]$PsqlPath,
    [hashtable]$Config
  )

  if (-not $Config.adminUser) {
    return $null
  }

  try {
    $databaseName = Escape-SqlLiteral -Value $Config.name
    $result = Invoke-Psql `
      -PsqlPath $PsqlPath `
      -HostName $Config.host `
      -Port $Config.port `
      -Database "postgres" `
      -User $Config.adminUser `
      -Password $Config.adminPassword `
      -Sql "SELECT CASE WHEN EXISTS (SELECT FROM pg_database WHERE datname = '$databaseName') THEN 'exists' ELSE 'missing' END;" `
      -Scalar

    $state = (($result -join "").Trim())
    if ($state -eq "exists") {
      return $true
    }
    if ($state -eq "missing") {
      return $false
    }

    Write-BootstrapLog "Database existence probe returned unexpected output: $state"
    return $null
  } catch {
    Write-BootstrapLog "Could not probe database existence with admin credentials: $($_.Exception.Message)"
    return $null
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

function Reset-DatabaseWithAdmin {
  param(
    [string]$PsqlPath,
    [hashtable]$Config
  )

  if (-not $Config.adminPassword) {
    throw "PostgreSQL admin password is required to delete and recreate database '$($Config.name)'."
  }

  Assert-ResettableDatabase -Name $Config.name

  Remove-DatabaseWithAdmin -PsqlPath $PsqlPath -Config $Config
  Ensure-DatabaseWithAdmin -PsqlPath $PsqlPath -Config $Config
}

function Remove-DatabaseWithAdmin {
  param(
    [string]$PsqlPath,
    [hashtable]$Config
  )

  if (-not $Config.adminPassword) {
    throw "PostgreSQL admin password is required to delete database '$($Config.name)'."
  }

  Assert-ResettableDatabase -Name $Config.name

  $databaseName = Escape-SqlLiteral -Value $Config.name
  Invoke-Psql `
    -PsqlPath $PsqlPath `
    -HostName $Config.host `
    -Port $Config.port `
    -Database "postgres" `
    -User $Config.adminUser `
    -Password $Config.adminPassword `
    -Sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$databaseName' AND pid <> pg_backend_pid();" | Out-Null

  Invoke-Psql `
    -PsqlPath $PsqlPath `
    -HostName $Config.host `
    -Port $Config.port `
    -Database "postgres" `
    -User $Config.adminUser `
    -Password $Config.adminPassword `
    -Sql "DROP DATABASE IF EXISTS $($Config.name);" | Out-Null
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

  $packageJsonPath = Join-Path $Path "package.json"
  if (-not (Test-Path $packageJsonPath)) {
    throw "Cannot install Node dependencies because package.json was not found in $Path"
  }

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
  if ((Test-Path $venvPython) -and (Test-PythonCommand -Command $venvPython -Args @())) {
    return @{ command = $venvPython; args = @() }
  }

  $configuredPython = $env:DEVICE_TOOL_PYTHON
  if ($configuredPython -and (Test-PythonCommand -Command $configuredPython -Args @())) {
    return @{ command = $configuredPython; args = @() }
  }

  $launcherPaths = Get-WindowsPythonLauncherPaths
  $preferredLauncherPython = $launcherPaths |
    Where-Object { $_ -match "3\.11|Python311|cpython-3\.11" } |
    Select-Object -First 1
  if ($preferredLauncherPython -and (Test-PythonCommand -Command $preferredLauncherPython -Args @())) {
    return @{ command = $preferredLauncherPython; args = @() }
  }

  $py = Get-Command "py.exe" -ErrorAction SilentlyContinue
  if ($py -and (Test-PythonCommand -Command $py.Source -Args @("-3.11"))) {
    return @{ command = $py.Source; args = @("-3.11") }
  }

  $python = Get-Command "python.exe" -ErrorAction SilentlyContinue
  if ($python -and (Test-PythonCommand -Command $python.Source -Args @())) {
    return @{ command = $python.Source; args = @() }
  }

  return $null
}

function Test-PythonCommand {
  param(
    [string]$Command,
    [array]$Args = @()
  )

  try {
    & $Command @Args -c "import sys, venv; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)" | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Test-EmbeddedToolPython {
  param([string]$Command)

  try {
    & $Command -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)" | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-WindowsPythonLauncherPaths {
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

function Invoke-BootstrapCommand {
  param(
    [string]$Command,
    [array]$Arguments,
    [string]$ErrorMessage
  )

  Write-BootstrapLog "Running: $Command $($Arguments -join ' ')"
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Native commands often write warnings to stderr even when they exit with 0.
    # Capture that output without letting PowerShell turn it into a bootstrap failure.
    $ErrorActionPreference = "Continue"
    $output = & $Command @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($output) {
    $joinedOutput = ($output | ForEach-Object { $_.ToString() }) -join "`n"
    Write-BootstrapLog $joinedOutput
  }

  if ($exitCode -ne 0) {
    throw "$ErrorMessage. See $bootstrapLogPath for details."
  }
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
    throw "Python installer completed but Python 3.11 was not found"
  }

  return $python
}

function Install-ToolPythonDependencies {
  $toolPath = Join-Path $runtimeRoot "tool"
  $requirementsPath = Join-Path $toolPath "requirements.txt"
  if (-not (Test-Path $requirementsPath)) {
    throw "Tool requirements.txt was not found"
  }

  $embeddedPython = Join-Path $toolPath "python-embed\python.exe"
  if (Test-Path -LiteralPath $embeddedPython) {
    if (-not (Test-EmbeddedToolPython -Command $embeddedPython)) {
      throw "The encrypted Tool embedded runtime is not Python 3.11"
    }

    Push-Location $toolPath
    try {
      Invoke-BootstrapCommand -Command $embeddedPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -ErrorMessage "Could not upgrade pip in embedded Tool Python"
      Invoke-BootstrapCommand -Command $embeddedPython -Arguments @("-m", "pip", "install", "-r", $requirementsPath) -ErrorMessage "Could not install embedded Tool Python requirements"
      Invoke-BootstrapCommand -Command $embeddedPython -Arguments @("-c", "import fastapi, uvicorn; from api.app import app") -ErrorMessage "Encrypted Tool runtime verification failed"
    } finally {
      Pop-Location
    }
    return
  }

  $python = Install-PythonIfBundled
  $venvPath = Join-Path $toolPath ".venv"
  $venvPython = Join-Path $venvPath "Scripts\python.exe"

  if ((Test-Path $venvPython) -and -not (Test-PythonCommand -Command $venvPython -Args @())) {
    Write-BootstrapLog "Existing Tool Python venv is not Python 3.11. Recreating $venvPath"
    Remove-Item -LiteralPath $venvPath -Recurse -Force
  }

  if (-not (Test-Path $venvPython)) {
    $pythonCommand = $python.command
    $pythonArgs = @($python.args) + @("-m", "venv", $venvPath)
    Invoke-BootstrapCommand -Command $pythonCommand -Arguments $pythonArgs -ErrorMessage "Could not create Tool Python venv"
  }

  if (-not (Test-PythonCommand -Command $venvPython -Args @())) {
    throw "Tool Python venv was created, but it is not Python 3.11"
  }

  Invoke-BootstrapCommand -Command $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -ErrorMessage "Could not upgrade pip in Tool venv"

  Invoke-BootstrapCommand -Command $venvPython -Arguments @("-m", "pip", "install", "-r", $requirementsPath) -ErrorMessage "Could not install Tool Python requirements"
}

$rollbackDatabaseOnFailure = $false
$dbConfig = $null
$psql = $null

try {
  New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null
  Remove-StalePlaintextDongleHelper

  if ($UpdateExisting) {
    if (-not (Test-Path -LiteralPath $envPath)) {
      throw "Existing runtime .env was not found; automated update cannot safely rebuild dependencies."
    }

    Install-NodeDependencies -Path (Join-Path $runtimeRoot "backend") -ProductionOnly
    Install-NodeDependencies -Path (Join-Path $runtimeRoot "frontend-standalone") -ProductionOnly
    Install-ToolPythonDependencies

    $existingEnv = Read-EnvFile -Path $envPath
    foreach ($entry in $existingEnv.GetEnumerator()) {
      Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
    }

    Push-Location (Join-Path $runtimeRoot "backend")
    try {
      Invoke-BootstrapCommand -Command "npm.cmd" -Arguments @("exec", "--offline", "--", "prisma", "generate") -ErrorMessage "Prisma client generation failed"
      Invoke-BootstrapCommand -Command "npm.cmd" -Arguments @("exec", "--offline", "--", "prisma", "migrate", "deploy") -ErrorMessage "Prisma migrate deploy failed"
    } finally {
      Pop-Location
    }

    Write-Status -State "ready" -Message "Updated runtime dependencies were rebuilt." -Details @{
      envPath = $envPath
      runtimeRoot = $runtimeRoot
    }
    exit 0
  }

  $dbConfig = Get-DatabaseConfig
  Assert-PostgresIdentifier -Name $dbConfig.name -Label "Database name"
  Assert-PostgresIdentifier -Name $dbConfig.user -Label "Database user"

  $dbName = $dbConfig.name
  $dbUser = $dbConfig.user
  $dbPassword = $dbConfig.password
  $jwtSecret = New-Secret 48
  $postgresSuperPassword = if ($dbConfig.adminPassword) { $dbConfig.adminPassword } else { New-Secret 24 }
  $supportPassword = New-Secret 24

  $psql = Install-PostgreSqlIfBundled -SuperPassword $postgresSuperPassword -Port $dbConfig.port
  $dbExists = Test-DatabaseExistsWithAdmin -PsqlPath $psql -Config $dbConfig

  if ($true -eq $dbExists) {
    if ($dbConfig.resetExisting) {
      if (-not $dbPassword) {
        $dbPassword = New-Secret 24
        $dbConfig.password = $dbPassword
      }

      $rollbackDatabaseOnFailure = $true
      Reset-DatabaseWithAdmin -PsqlPath $psql -Config $dbConfig
      Write-BootstrapLog "Database $dbName was deleted and recreated on $($dbConfig.host):$($dbConfig.port)."
    } else {
      if (-not $dbPassword) {
        throw "Database '$dbName' already exists. Choose another database name or allow setup to delete and recreate it."
      }

      if (-not (Test-AppDatabaseConnection -PsqlPath $psql -Config $dbConfig)) {
        throw "Database '$dbName' already exists, but app DB user '$dbUser' could not connect. Choose another database name or delete and recreate the existing database."
      }

      Write-BootstrapLog "Using existing database $dbName on $($dbConfig.host):$($dbConfig.port)."
    }
  } elseif ($false -eq $dbExists) {
    if (-not $dbConfig.adminPassword) {
      throw "Database '$dbName' does not exist. Enter PostgreSQL admin password so setup can create it."
    }

    if (-not $dbPassword) {
      $dbPassword = New-Secret 24
      $dbConfig.password = $dbPassword
    }

    $rollbackDatabaseOnFailure = $true
    Ensure-DatabaseWithAdmin -PsqlPath $psql -Config $dbConfig
    Write-BootstrapLog "Database $dbName was created on $($dbConfig.host):$($dbConfig.port)."
  } else {
    if ($dbPassword -and (Test-AppDatabaseConnection -PsqlPath $psql -Config $dbConfig)) {
      Write-BootstrapLog "Database probe was inconclusive, but app DB connection works. Reusing $dbName."
    } else {
      if (-not $dbConfig.adminPassword) {
        throw "Could not scan database '$dbName'. Enter PostgreSQL admin password so setup can check and create it if needed."
      }

      if (-not $dbPassword) {
        $dbPassword = New-Secret 24
        $dbConfig.password = $dbPassword
      }

      $rollbackDatabaseOnFailure = $true
      Ensure-DatabaseWithAdmin -PsqlPath $psql -Config $dbConfig
      Write-BootstrapLog "Database $dbName was created or updated after inconclusive probe."
    }
  }

  $databasePasswordUrl = [System.Uri]::EscapeDataString($dbPassword)
  $databaseUrl = "postgresql://${dbUser}:${databasePasswordUrl}@$($dbConfig.host):$($dbConfig.port)/${dbName}"
  $embeddedToolPython = Join-Path $runtimeRoot "tool\python-embed\python.exe"
  $toolRuntimePython = if (Test-Path -LiteralPath $embeddedToolPython) {
    $embeddedToolPython
  } else {
    Join-Path $runtimeRoot "tool\.venv\Scripts\python.exe"
  }
  Set-Content -LiteralPath $envPath -Encoding UTF8 -Value @"
NODE_ENV=production
BACKEND_PORT=3979
FRONTEND_PORT=3969
DEVICE_TOOL_PORT=8668
FRONTEND_ORIGIN=http://localhost:3969,http://127.0.0.1:3969
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3979/api
DATABASE_URL=$databaseUrl
JWT_SECRET=$jwtSecret
DEVICE_TOOL_BASE_URL=http://127.0.0.1:8668
DEVICE_TOOL_API_PREFIX=/tool/v1
DEVICE_TOOL_PYTHON=$toolRuntimePython
DONGLE_MOCK_MODE=false
DONGLE_DLL_PATH=$runtimeRoot\backend\native\System8.dll
DONGLE_HELPER_PATH=$runtimeRoot\backend\native\dongle-checker.exe
DONGLE_PYTHON_COMMAND=$toolRuntimePython
DONGLE_RETRY_COUNT=3
DONGLE_RETRY_INTERVAL_MS=1000
DONGLE_CHECK_TIMEOUT_MS=7000
"@
  Protect-ProgramDataFile -Path $envPath -AllowAuthenticatedRead

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
    Invoke-BootstrapCommand -Command "npm.cmd" -Arguments @("exec", "--", "prisma", "generate") -ErrorMessage "Prisma client generation failed"
    Invoke-BootstrapCommand -Command "npm.cmd" -Arguments @("exec", "--", "prisma", "migrate", "deploy") -ErrorMessage "Prisma migrate deploy failed"
    Invoke-BootstrapCommand -Command "node.exe" -Arguments @("dist/prisma/seed.js") -ErrorMessage "Production seed failed"
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
  if ($rollbackDatabaseOnFailure -and $psql -and $dbConfig) {
    try {
      Remove-DatabaseWithAdmin -PsqlPath $psql -Config $dbConfig
      Write-BootstrapLog "Rolled back database $($dbConfig.name) after bootstrap failure."
    } catch {
      Write-BootstrapLog "Could not roll back database after bootstrap failure: $($_.Exception.Message)"
    }
  }
  if (-not $UpdateExisting) {
    Remove-Item -LiteralPath $envPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue
  }
  Write-Status -State "failed" -Message $_.Exception.Message -Details @{
    installDir = $InstallDir
    runtimeRoot = $runtimeRoot
    vendorRoot = $vendorRoot
  }
  exit 1
}

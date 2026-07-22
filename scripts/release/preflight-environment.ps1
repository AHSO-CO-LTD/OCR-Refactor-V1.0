param(
  [Parameter(Mandatory = $true)]
  [string]$StatusPath,
  [string]$ManifestPath = "",
  [string]$CacheDir = "",
  [ValidateSet("scan", "install")]
  [string]$Mode = "install"
)

$ErrorActionPreference = "Stop"

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  # Older Windows PowerShell hosts may not expose every TLS flag. Downloads can still continue with system defaults.
}

$programDataBase = if ($env:PROGRAMDATA) { $env:PROGRAMDATA } else { "C:\ProgramData" }
$programDataRoot = Join-Path $programDataBase "AHSO OCR"
$preflightLogPath = Join-Path $programDataRoot "preflight-environment.log"
$runtimeOwnershipPath = Join-Path $programDataRoot "runtime-ownership.json"
$setupInstalledPostgresPassword = "0123456789"

if (-not $CacheDir) {
  $CacheDir = Join-Path $env:TEMP "AHSO-OCR-Setup-Downloads"
}

function New-Secret {
  param([int]$Bytes = 24)

  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }

  return ([Convert]::ToBase64String($buffer).TrimEnd("=") -replace "\+", "-" -replace "/", "_")
}

function Write-PreflightLog {
  param([string]$Message)

  try {
    New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null
    $timestamp = (Get-Date).ToUniversalTime().ToString("o")
    Add-Content -LiteralPath $preflightLogPath -Encoding UTF8 -Value "[$timestamp] $Message"
  } catch {
    # Logging must never block setup. The status file still carries the user-facing result.
  }
}

function Escape-IniValue {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  return ($Value -replace "`r", " " -replace "`n", " ").Trim()
}

function Write-Status {
  param(
    [string]$State,
    [string]$Message,
    [hashtable]$Details = @{}
  )

  $parent = Split-Path -Parent $StatusPath
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("[environment]")
  $lines.Add("state=$(Escape-IniValue $State)")
  $lines.Add("message=$(Escape-IniValue $Message)")
  foreach ($key in ($Details.Keys | Sort-Object)) {
    $lines.Add("$key=$(Escape-IniValue ([string]$Details[$key]))")
  }

  Set-Content -LiteralPath $StatusPath -Encoding ASCII -Value $lines
}

function Get-DefaultManifest {
  return [pscustomobject]@{
    connectivityChecks = @(
      "https://www.microsoft.com/",
      "http://www.msftconnecttest.com/connecttest.txt",
      "https://www.google.com/generate_204",
      "https://nodejs.org/"
    )
    node = [pscustomobject]@{
      minimumMajor = 22
      url = "https://nodejs.org/dist/v22.17.1/node-v22.17.1-x64.msi"
      fileName = "node-v22.17.1-x64.msi"
      sha256 = ""
    }
    python = [pscustomobject]@{
      requiredMajor = 3
      requiredMinor = 11
      url = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
      fileName = "python-3.11.9-amd64.exe"
      sha256 = ""
    }
    postgresql = [pscustomobject]@{
      minimumMajor = 14
      defaultPort = 5432
      serviceName = "postgresql-x64-ahso"
      url = "https://get.enterprisedb.com/postgresql/postgresql-16.9-1-windows-x64.exe"
      fileName = "postgresql-16.9-1-windows-x64.exe"
      sha256 = ""
    }
  }
}

function Read-Manifest {
  if ($ManifestPath -and (Test-Path $ManifestPath)) {
    return Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  }

  return Get-DefaultManifest
}

function Get-ManifestArray {
  param(
    [pscustomobject]$Manifest,
    [string]$Name
  )

  $property = $Manifest.PSObject.Properties[$Name]
  if ($property -and $null -ne $property.Value) {
    return @($property.Value)
  }

  return @()
}

function Read-RuntimeOwnership {
  if (-not (Test-Path $runtimeOwnershipPath)) {
    return [ordered]@{
      nodeInstalledBySetup = $false
      pythonInstalledBySetup = $false
      postgresqlInstalledBySetup = $false
      updatedAt = $null
    }
  }

  try {
    $ownership = Get-Content -LiteralPath $runtimeOwnershipPath -Raw | ConvertFrom-Json
    return [ordered]@{
      nodeInstalledBySetup = [bool]$ownership.nodeInstalledBySetup
      pythonInstalledBySetup = [bool]$ownership.pythonInstalledBySetup
      postgresqlInstalledBySetup = [bool]$ownership.postgresqlInstalledBySetup
      updatedAt = $ownership.updatedAt
    }
  } catch {
    Write-PreflightLog "Could not read existing runtime ownership file: $($_.Exception.Message)"
    return [ordered]@{
      nodeInstalledBySetup = $false
      pythonInstalledBySetup = $false
      postgresqlInstalledBySetup = $false
      updatedAt = $null
    }
  }
}

function Write-RuntimeOwnership {
  param(
    [string]$NodeStatus,
    [string]$PythonStatus,
    [string]$PostgresqlStatus
  )

  $ownership = Read-RuntimeOwnership
  $ownership.nodeInstalledBySetup = [bool](
    $ownership.nodeInstalledBySetup -or $NodeStatus.StartsWith("installed")
  )
  $ownership.pythonInstalledBySetup = [bool](
    $ownership.pythonInstalledBySetup -or $PythonStatus.StartsWith("installed")
  )
  $ownership.postgresqlInstalledBySetup = [bool](
    $ownership.postgresqlInstalledBySetup -or $PostgresqlStatus.StartsWith("installed")
  )
  $ownership.updatedAt = (Get-Date).ToUniversalTime().ToString("o")

  $ownership | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $runtimeOwnershipPath -Encoding UTF8
}

function Test-InternetReady {
  param([array]$Urls)

  $checks = @($Urls | Where-Object { $_ })
  if ($checks.Count -eq 0) {
    throw "Setup requires internet access, but no connectivity check endpoint is configured."
  }

  $failures = New-Object System.Collections.Generic.List[string]
  foreach ($url in $checks) {
    try {
      Write-PreflightLog "Checking connectivity endpoint: $url"
      Invoke-WebRequest -Uri $url -UseBasicParsing -Method Get -TimeoutSec 20 -MaximumRedirection 5 | Out-Null
      Write-PreflightLog "Connectivity check succeeded through: $url"
      return $true
    } catch {
      $failure = "$url => $($_.Exception.Message)"
      $failures.Add($failure) | Out-Null
      Write-PreflightLog "Connectivity check failed: $failure"
    }
  }

  throw "Setup requires internet access, but no connectivity check endpoint is reachable. $($failures -join ' | ')"
}

function Invoke-Download {
  param(
    [string]$Url,
    [string]$FileName,
    [string]$Sha256 = ""
  )

  New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
  $outputPath = Join-Path $CacheDir $FileName

  if (-not (Test-Path $outputPath)) {
    Write-PreflightLog "Downloading $Url to $outputPath"
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -OutFile $outputPath -TimeoutSec 900
    } catch {
      throw "Cannot download $FileName from $Url. Check internet, proxy, or firewall settings. $($_.Exception.Message)"
    }
  }

  if ($Sha256) {
    $actualHash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $Sha256.ToLowerInvariant()) {
      Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
      throw "Downloaded installer hash mismatch for $FileName"
    }
  }

  return $outputPath
}

function Get-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  return $null
}

function Get-NodeVersion {
  $node = Get-CommandPath "node.exe"
  $npm = Get-CommandPath "npm.cmd"

  if (-not $node -or -not $npm) {
    return $null
  }

  try {
    $raw = (& $node --version 2>$null).Trim()
    if ($raw -match "^v?(\d+)\.(\d+)\.(\d+)") {
      return [pscustomobject]@{
        major = [int]$Matches[1]
        minor = [int]$Matches[2]
        patch = [int]$Matches[3]
        raw = $raw
        node = $node
        npm = $npm
      }
    }
  } catch {
    return $null
  }

  return $null
}

function Install-NodeIfNeeded {
  param([pscustomobject]$NodeConfig)

  $version = Get-NodeVersion
  $minimumMajor = [int]$NodeConfig.minimumMajor
  if ($version -and $version.major -ge $minimumMajor) {
    return "ready ($($version.raw))"
  }

  $installerPath = Invoke-Download -Url $NodeConfig.url -FileName $NodeConfig.fileName -Sha256 $NodeConfig.sha256
  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $installerPath, "/qn", "/norestart") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Node.js installer failed with code $($process.ExitCode)"
  }

  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $version = Get-NodeVersion
  if (-not $version -or $version.major -lt $minimumMajor) {
    throw "Node.js was installed, but Node.js >= $minimumMajor is still not available"
  }

  return "installed ($($version.raw))"
}

function Test-PythonCommand {
  param(
    [string]$Command,
    [array]$Args,
    [int]$RequiredMajor,
    [int]$RequiredMinor
  )

  try {
    & $Command @Args -c "import sys, venv; raise SystemExit(0 if sys.version_info[:2] == ($RequiredMajor, $RequiredMinor) else 1)" 2>$null | Out-Null
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

function Find-Python {
  param(
    [int]$RequiredMajor,
    [int]$RequiredMinor
  )

  $launcherPaths = Get-WindowsPythonLauncherPaths
  $preferredLauncherPython = $launcherPaths |
    Where-Object { $_ -match "$RequiredMajor\.$RequiredMinor|Python$RequiredMajor$RequiredMinor|cpython-$RequiredMajor\.$RequiredMinor" } |
    Select-Object -First 1
  if ($preferredLauncherPython -and (Test-PythonCommand -Command $preferredLauncherPython -Args @() -RequiredMajor $RequiredMajor -RequiredMinor $RequiredMinor)) {
    return @{ command = $preferredLauncherPython; args = @(); label = $preferredLauncherPython }
  }

  $py = Get-CommandPath "py.exe"
  if ($py -and (Test-PythonCommand -Command $py -Args @("-$RequiredMajor.$RequiredMinor") -RequiredMajor $RequiredMajor -RequiredMinor $RequiredMinor)) {
    return @{ command = $py; args = @("-$RequiredMajor.$RequiredMinor"); label = "py -$RequiredMajor.$RequiredMinor" }
  }

  $python = Get-CommandPath "python.exe"
  if ($python -and (Test-PythonCommand -Command $python -Args @() -RequiredMajor $RequiredMajor -RequiredMinor $RequiredMinor)) {
    return @{ command = $python; args = @(); label = $python }
  }

  return $null
}

function Install-PythonIfNeeded {
  param([pscustomobject]$PythonConfig)

  if ($PythonConfig.required -eq $false) {
    return "bundled with encrypted Device Tool"
  }

  $requiredMajor = [int]$PythonConfig.requiredMajor
  $requiredMinor = [int]$PythonConfig.requiredMinor
  $python = Find-Python -RequiredMajor $requiredMajor -RequiredMinor $requiredMinor
  if ($python) {
    return "ready ($($python.label))"
  }

  $installerPath = Invoke-Download -Url $PythonConfig.url -FileName $PythonConfig.fileName -Sha256 $PythonConfig.sha256
  $process = Start-Process -FilePath $installerPath -ArgumentList @("/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_pip=1") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Python installer failed with code $($process.ExitCode)"
  }

  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $python = Find-Python -RequiredMajor $requiredMajor -RequiredMinor $requiredMinor
  if (-not $python) {
    throw "Python $requiredMajor.$requiredMinor was installed, but it is still not available"
  }

  return "installed ($($python.label))"
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

  return Get-CommandPath "psql.exe"
}

function Get-PostgreSqlVersion {
  $psql = Find-Psql
  if (-not $psql) {
    return $null
  }

  try {
    $raw = (& $psql --version 2>$null).Trim()
    if ($raw -match "(\d+)\.(\d+)") {
      return [pscustomobject]@{
        major = [int]$Matches[1]
        minor = [int]$Matches[2]
        raw = $raw
        psql = $psql
      }
    }
    if ($raw -match "(\d+)") {
      return [pscustomobject]@{
        major = [int]$Matches[1]
        minor = 0
        raw = $raw
        psql = $psql
      }
    }
  } catch {
    return $null
  }

  return $null
}

function Get-NodeRequirementStatus {
  param([pscustomobject]$NodeConfig)

  $minimumMajor = [int]$NodeConfig.minimumMajor
  $version = Get-NodeVersion
  if ($version -and $version.major -ge $minimumMajor) {
    return [pscustomobject]@{
      ready = $true
      status = "ready ($($version.raw))"
      missingLabel = ""
    }
  }

  $label = "Node.js >= $minimumMajor with npm"
  if ($version) {
    $label = "$label (found $($version.raw))"
  }

  return [pscustomobject]@{
    ready = $false
    status = "missing ($label)"
    missingLabel = $label
  }
}

function Get-PythonRequirementStatus {
  param([pscustomobject]$PythonConfig)

  if ($PythonConfig.required -eq $false) {
    return [pscustomobject]@{
      ready = $true
      status = "bundled with encrypted Device Tool"
      missingLabel = ""
    }
  }

  $requiredMajor = [int]$PythonConfig.requiredMajor
  $requiredMinor = [int]$PythonConfig.requiredMinor
  $python = Find-Python -RequiredMajor $requiredMajor -RequiredMinor $requiredMinor
  if ($python) {
    return [pscustomobject]@{
      ready = $true
      status = "ready ($($python.label))"
      missingLabel = ""
    }
  }

  $label = "Python $requiredMajor.$requiredMinor"
  return [pscustomobject]@{
    ready = $false
    status = "missing ($label)"
    missingLabel = $label
  }
}

function Get-PostgreSqlRequirementStatus {
  param([pscustomobject]$PostgresConfig)

  $minimumMajor = [int]$PostgresConfig.minimumMajor
  $version = Get-PostgreSqlVersion
  if ($version -and $version.major -ge $minimumMajor) {
    return [pscustomobject]@{
      ready = $true
      status = "ready ($($version.raw))"
      missingLabel = ""
    }
  }

  $label = "PostgreSQL >= $minimumMajor with psql.exe"
  if ($version) {
    $label = "$label (found $($version.raw))"
  }

  return [pscustomobject]@{
    ready = $false
    status = "missing ($label)"
    missingLabel = $label
  }
}

function Get-RuntimeRequirementScan {
  param([pscustomobject]$Manifest)

  $node = Get-NodeRequirementStatus -NodeConfig $Manifest.node
  $python = Get-PythonRequirementStatus -PythonConfig $Manifest.python
  $postgresql = Get-PostgreSqlRequirementStatus -PostgresConfig $Manifest.postgresql

  $missing = New-Object System.Collections.Generic.List[string]
  if (-not $node.ready) {
    $missing.Add($node.missingLabel) | Out-Null
  }
  if (-not $python.ready) {
    $missing.Add($python.missingLabel) | Out-Null
  }
  if (-not $postgresql.ready) {
    $missing.Add($postgresql.missingLabel) | Out-Null
  }

  $missingList = ""
  if ($missing.Count -gt 0) {
    $missingList = $missing -join "; "
  }

  return [pscustomobject]@{
    ready = ($missing.Count -eq 0)
    missingCount = $missing.Count
    missingList = $missingList
    node = $node.status
    python = $python.status
    postgresql = $postgresql.status
    summary = "Node.js: $($node.status) | Python: $($python.status) | PostgreSQL: $($postgresql.status)"
  }
}

function Write-RuntimeScanStatus {
  param(
    [pscustomobject]$Scan,
    [string]$PostgresAdminPassword = ""
  )

  if ($Scan.ready) {
    Write-Status -State "ready" -Message "All required runtime frameworks are ready. Click Next to continue setup." -Details @{
      summary = $Scan.summary
      node = $Scan.node
      python = $Scan.python
      postgresql = $Scan.postgresql
      missingCount = "0"
      missingList = ""
      postgresAdminPassword = $PostgresAdminPassword
    }
    return
  }

  Write-Status -State "missing" -Message "Missing required runtime frameworks. Install them manually and click Check again, or click Next to let setup install them automatically." -Details @{
    summary = $Scan.summary
    node = $Scan.node
    python = $Scan.python
    postgresql = $Scan.postgresql
    missingCount = [string]$Scan.missingCount
    missingList = $Scan.missingList
    postgresAdminPassword = ""
  }
}

function Install-PostgreSqlIfNeeded {
  param([pscustomobject]$PostgresConfig)

  $version = Get-PostgreSqlVersion
  $minimumMajor = [int]$PostgresConfig.minimumMajor
  if ($version -and $version.major -ge $minimumMajor) {
    return @{
      status = "ready ($($version.raw))"
      adminPassword = ""
    }
  }

  $postgresSuperPassword = $setupInstalledPostgresPassword
  $installerPath = Invoke-Download -Url $PostgresConfig.url -FileName $PostgresConfig.fileName -Sha256 $PostgresConfig.sha256
  $arguments = @(
    "--mode", "unattended",
    "--unattendedmodeui", "none",
    "--superpassword", $postgresSuperPassword,
    "--servicename", $PostgresConfig.serviceName,
    "--serverport", [string]$PostgresConfig.defaultPort
  )

  $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "PostgreSQL installer failed with code $($process.ExitCode)"
  }

  $version = Get-PostgreSqlVersion
  if (-not $version -or $version.major -lt $minimumMajor) {
    throw "PostgreSQL was installed, but psql.exe >= $minimumMajor is still not available"
  }

  return @{
    status = "installed ($($version.raw))"
    adminPassword = $postgresSuperPassword
  }
}

try {
  New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null
  Write-PreflightLog "Starting online environment preflight in $Mode mode."

  $manifest = Read-Manifest
  $initialScan = Get-RuntimeRequirementScan -Manifest $manifest
  Write-PreflightLog "Environment scan result: $($initialScan.summary)"

  if ($Mode -eq "scan") {
    Write-RuntimeScanStatus -Scan $initialScan
    exit 0
  }

  if (-not $initialScan.ready) {
    $connectivityChecks = Get-ManifestArray -Manifest $manifest -Name "connectivityChecks"
    if ($connectivityChecks.Count -eq 0) {
      $connectivityChecks = Get-ManifestArray -Manifest $manifest -Name "internetChecks"
    }
    Test-InternetReady -Urls $connectivityChecks | Out-Null
  }

  $nodeStatus = Install-NodeIfNeeded -NodeConfig $manifest.node
  $pythonStatus = Install-PythonIfNeeded -PythonConfig $manifest.python
  $postgresResult = Install-PostgreSqlIfNeeded -PostgresConfig $manifest.postgresql
  Write-RuntimeOwnership -NodeStatus $nodeStatus -PythonStatus $pythonStatus -PostgresqlStatus $postgresResult.status

  $finalScan = Get-RuntimeRequirementScan -Manifest $manifest
  if (-not $finalScan.ready) {
    Write-RuntimeScanStatus -Scan $finalScan
    throw "Environment setup finished, but required runtime frameworks are still missing: $($finalScan.missingList)"
  }

  Write-PreflightLog "Environment install result: $($finalScan.summary)"
  Write-RuntimeScanStatus -Scan $finalScan -PostgresAdminPassword $postgresResult.adminPassword
  exit 0
} catch {
  $message = $_.Exception.Message
  Write-PreflightLog "Preflight failed: $message"
  Write-Status -State "failed" -Message $message -Details @{
    summary = "Environment setup failed."
    logPath = $preflightLogPath
  }

  if ($message -like "*internet access*") {
    exit 20
  }

  exit 1
}

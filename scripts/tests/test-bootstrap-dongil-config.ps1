$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "..\release\bootstrap-dongil-config.ps1")

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Actual,
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Expected,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($Actual -ne $Expected) {
    throw "$Label expected '$Expected', received '$Actual'."
  }
}

$freshInstall = Resolve-DongilBootstrapConfig -EnvValues $null
Assert-Equal -Actual $freshInstall.serverUrl -Expected "" -Label "Fresh server URL"
Assert-Equal -Actual $freshInstall.machineTypeCode -Expected "WASHING_MACHINE" -Label "Fresh machine type"

$existingInstall = Resolve-DongilBootstrapConfig -EnvValues @{
  DONGIL_SERVER_URL = "http://192.168.1.10:3979"
  DONGIL_MACHINE_TYPE_CODE = "WASHING_MACHINE"
}
Assert-Equal -Actual $existingInstall.serverUrl -Expected "http://192.168.1.10:3979" -Label "Preserved server URL"
Assert-Equal -Actual $existingInstall.machineTypeCode -Expected "WASHING_MACHINE" -Label "Preserved machine type"

Write-Host "Dongil bootstrap config tests passed."

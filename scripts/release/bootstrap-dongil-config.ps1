function Resolve-DongilBootstrapConfig {
  param(
    [AllowNull()]
    [hashtable]$EnvValues
  )

  if ($null -eq $EnvValues) {
    $EnvValues = @{}
  }

  return @{
    serverUrl = if ($EnvValues.ContainsKey("DONGIL_SERVER_URL")) {
      [string]$EnvValues["DONGIL_SERVER_URL"]
    } else {
      ""
    }
    machineTypeCode = if ($EnvValues.ContainsKey("DONGIL_MACHINE_TYPE_CODE")) {
      [string]$EnvValues["DONGIL_MACHINE_TYPE_CODE"]
    } else {
      "WASHING_MACHINE"
    }
  }
}

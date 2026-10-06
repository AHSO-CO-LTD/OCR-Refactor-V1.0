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
    machineTypeCode = "WASHING_MACHINE"
  }
}

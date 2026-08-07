!macro AhsoCreateReadOnlyScrollBox X Y W H OUTVAR
  nsDialogs::CreateControl EDIT 0x54000000|0x00010000|0x00200000|0x0004|0x0040|0x0800 0x00000200 ${X} ${Y} ${W} ${H} ""
  Pop ${OUTVAR}
!macroend

!ifndef BUILD_UNINSTALLER
!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh

Var DbHost
Var DbPort
Var DbName
Var DbUser
Var DbPassword
Var DbAdminUser
Var DbAdminPassword
Var DbResetExisting
Var DbHostInput
Var DbPortInput
Var DbNameInput
Var DbUserInput
Var DbPasswordInput
Var DbAdminUserInput
Var DbAdminPasswordInput
Var DbRenameInput
Var DbExistsRenameRadio
Var DbExistsReuseRadio
Var DbExistsRecreateRadio
Var DbExistingAction
Var DbConfigPath
Var DbProbeStatusPath
Var DbScanState
Var DbScanMessage
Var EnvPreflightStatusPath
Var EnvPreflightState
Var EnvPreflightMessage
Var EnvPreflightSummary
Var EnvPreflightNode
Var EnvPreflightPython
Var EnvPreflightPostgresql
Var EnvPreflightPostgresAdminPassword
Var EnvPreflightMode
Var EnvPreflightMissingCount
Var EnvPreflightMissingList
Var EnvPreflightTitleLabel
Var EnvPreflightBodyLabel
Var EnvPreflightStatusBox
Var EnvPreflightActionLabel
Var EnvPreflightRecheckButton

!macro customPageAfterChangeDir
  Page custom EnvPreflightIntroPageCreate EnvPreflightIntroPageLeave
  Page custom EnvPreflightReadyPageCreate EnvPreflightReadyPageLeave
  Page custom DbTargetPageCreate DbTargetPageLeave
  Page custom DbAdminProbePageCreate DbAdminProbePageLeave
  Page custom DbExistingChoicePageCreate DbExistingChoicePageLeave
  Page custom DbRenamePageCreate DbRenamePageLeave
  Page custom DbAdminProbePageCreate DbAdminProbePageLeave
  Page custom DbReuseCredentialPageCreate DbReuseCredentialPageLeave
  Page custom DbCreateCredentialPageCreate DbCreateCredentialPageLeave
  Page custom DbReplaceCredentialPageCreate DbReplaceCredentialPageLeave
!macroend

Function EnsureEnvironmentPreflightFiles
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=preflight-environment.ps1 "${PROJECT_DIR}\..\scripts\release\preflight-environment.ps1"
  File /oname=online-runtime-manifest.json "${PROJECT_DIR}\..\scripts\release\online-runtime-manifest.json"
FunctionEnd

Function RunEnvironmentPreflight
  InitPluginsDir
  Call EnsureEnvironmentPreflightFiles
  ${If} $EnvPreflightMode == ""
    StrCpy $EnvPreflightMode "install"
  ${EndIf}
  StrCpy $EnvPreflightStatusPath "$PLUGINSDIR\environment-preflight.ini"
  Delete "$EnvPreflightStatusPath"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\preflight-environment.ps1" -StatusPath "$EnvPreflightStatusPath" -ManifestPath "$PLUGINSDIR\online-runtime-manifest.json" -Mode "$EnvPreflightMode"' $0
  ReadINIStr $EnvPreflightState "$EnvPreflightStatusPath" "environment" "state"
  ReadINIStr $EnvPreflightMessage "$EnvPreflightStatusPath" "environment" "message"
  ReadINIStr $EnvPreflightSummary "$EnvPreflightStatusPath" "environment" "summary"
  ReadINIStr $EnvPreflightNode "$EnvPreflightStatusPath" "environment" "node"
  ReadINIStr $EnvPreflightPython "$EnvPreflightStatusPath" "environment" "python"
  ReadINIStr $EnvPreflightPostgresql "$EnvPreflightStatusPath" "environment" "postgresql"
  ReadINIStr $EnvPreflightPostgresAdminPassword "$EnvPreflightStatusPath" "environment" "postgresAdminPassword"
  ReadINIStr $EnvPreflightMissingCount "$EnvPreflightStatusPath" "environment" "missingCount"
  ReadINIStr $EnvPreflightMissingList "$EnvPreflightStatusPath" "environment" "missingList"

  ${If} $EnvPreflightMessage == ""
    StrCpy $EnvPreflightMessage "Environment preflight returned code $0. No detail was returned."
  ${EndIf}

  ${If} $0 == 20
    MessageBox MB_ICONEXCLAMATION|MB_OK "Setup requires an internet connection to download missing runtime components.$\r$\n$\r$\nConnect this PC to the internet, then run setup again."
    Quit
  ${EndIf}

  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "Environment setup failed.$\r$\n$\r$\n$EnvPreflightMessage$\r$\n$\r$\nOpen C:\ProgramData\AHSO OCR\preflight-environment.log for details."
    Abort
  ${EndIf}

  ${If} $EnvPreflightPostgresAdminPassword != ""
    StrCpy $DbAdminPassword "$EnvPreflightPostgresAdminPassword"
  ${EndIf}
FunctionEnd

Function EnvPreflightIntroPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 24u "Step 1: check required runtime frameworks."
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 32u 300u 62u $0
  ${NSD_SetText} $0 "Setup will scan this PC for Node.js, npm, and PostgreSQL first. Python 3.11 is already bundled with the encrypted Device Tool. If anything else is missing, you can install it manually and check again, or click Next to let setup download and install it automatically."

  ${NSD_CreateLabel} 0u 104u 300u 32u "Click Next to scan the environment before the actual OCR database setup starts."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function EnvPreflightIntroPageLeave
  StrCpy $EnvPreflightMode "scan"
  Call RunEnvironmentPreflight
FunctionEnd

Function EnvPreflightReadyPageCreate
  ${If} $EnvPreflightState == ""
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 22u ""
  Pop $EnvPreflightTitleLabel

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 24u 300u 32u $EnvPreflightBodyLabel

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 62u 300u 38u $EnvPreflightStatusBox

  ${NSD_CreateLabel} 0u 110u 196u 28u ""
  Pop $EnvPreflightActionLabel

  ${NSD_CreateButton} 210u 112u 80u 16u "Check again"
  Pop $EnvPreflightRecheckButton
  ${NSD_OnClick} $EnvPreflightRecheckButton EnvPreflightRecheckClicked

  Call RefreshEnvironmentPreflightReview

  nsDialogs::Show
FunctionEnd

Function EnvPreflightReadyPageLeave
  ${If} $EnvPreflightState == "ready"
    Return
  ${EndIf}

  ${If} $EnvPreflightState == "missing"
    StrCpy $EnvPreflightMode "install"
    Call RunEnvironmentPreflight
    Call RefreshEnvironmentPreflightReview
    ${If} $EnvPreflightState == "ready"
      Abort
    ${EndIf}
  ${EndIf}

  MessageBox MB_ICONEXCLAMATION|MB_OK "Environment setup did not finish successfully.$\r$\n$\r$\n$EnvPreflightMessage"
  Abort
FunctionEnd

Function RefreshEnvironmentPreflightReview
  ${NSD_SetText} $EnvPreflightStatusBox "Node.js: $EnvPreflightNode$\r$\nPython: $EnvPreflightPython$\r$\nPostgreSQL: $EnvPreflightPostgresql"

  ${If} $EnvPreflightState == "ready"
    ${NSD_SetText} $EnvPreflightTitleLabel "All required frameworks are ready."
    ${NSD_SetText} $EnvPreflightBodyLabel "This PC already has all required runtime frameworks for AHSO OCR. Click Next to continue to the actual OCR database setup."
    ${NSD_SetText} $EnvPreflightActionLabel "You can check again if you changed the environment."
    Return
  ${EndIf}

  ${If} $EnvPreflightState == "missing"
    ${NSD_SetText} $EnvPreflightTitleLabel "Missing runtime frameworks found."
    ${NSD_SetText} $EnvPreflightBodyLabel "Missing: $EnvPreflightMissingList$\r$\nInstall them manually and click Check again, or click Next to let setup download and install them automatically."
    ${NSD_SetText} $EnvPreflightActionLabel "Manual install done? Click Check again before continuing."
    Return
  ${EndIf}

  ${NSD_SetText} $EnvPreflightTitleLabel "Environment check needs attention."
  ${NSD_SetText} $EnvPreflightBodyLabel "$EnvPreflightMessage"
  ${NSD_SetText} $EnvPreflightActionLabel "Check the setup log, then try again."
FunctionEnd

Function EnvPreflightRecheckClicked
  StrCpy $EnvPreflightMode "scan"
  Call RunEnvironmentPreflight
  Call RefreshEnvironmentPreflightReview
FunctionEnd

Function InitDatabaseDefaults
  ${If} $DbHost == ""
    StrCpy $DbHost "127.0.0.1"
  ${EndIf}
  ${If} $DbPort == ""
    StrCpy $DbPort "5432"
  ${EndIf}
  ${If} $DbName == ""
    StrCpy $DbName "ocr_metal_core_washing"
  ${EndIf}
  ${If} $DbUser == ""
    StrCpy $DbUser "ahso_ocr"
  ${EndIf}
  ${If} $DbAdminUser == ""
    StrCpy $DbAdminUser "postgres"
  ${EndIf}
FunctionEnd

Function EnsureProbeScript
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=probe-database.ps1 "${PROJECT_DIR}\..\scripts\release\probe-database.ps1"
FunctionEnd

Function WriteDbConfig
  InitPluginsDir
  StrCpy $DbConfigPath "$PLUGINSDIR\db-config.ini"
  WriteINIStr "$DbConfigPath" "database" "host" "$DbHost"
  WriteINIStr "$DbConfigPath" "database" "port" "$DbPort"
  WriteINIStr "$DbConfigPath" "database" "name" "$DbName"
  WriteINIStr "$DbConfigPath" "database" "user" "$DbUser"
  WriteINIStr "$DbConfigPath" "database" "password" "$DbPassword"
  WriteINIStr "$DbConfigPath" "database" "adminUser" "$DbAdminUser"
  WriteINIStr "$DbConfigPath" "database" "adminPassword" "$DbAdminPassword"
  WriteINIStr "$DbConfigPath" "database" "resetExisting" "$DbResetExisting"
FunctionEnd

Function ProbeDatabase
  Call WriteDbConfig
  Call EnsureProbeScript
  StrCpy $DbProbeStatusPath "$PLUGINSDIR\db-probe-status.ini"
  Delete "$DbProbeStatusPath"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\probe-database.ps1" -ConfigPath "$DbConfigPath" -StatusPath "$DbProbeStatusPath"' $0
  ReadINIStr $DbScanState "$DbProbeStatusPath" "probe" "state"
  ReadINIStr $DbScanMessage "$DbProbeStatusPath" "probe" "message"
  ${If} $0 == 10
    StrCpy $DbScanState "exists"
  ${ElseIf} $0 == 11
    StrCpy $DbScanState "missing"
  ${ElseIf} $DbScanState == ""
    StrCpy $DbScanState "unknown"
  ${EndIf}
  ${If} $DbScanMessage == ""
    StrCpy $DbScanMessage "Probe exit code: $0. No detail was returned."
  ${EndIf}
FunctionEnd

Function DbTargetPageCreate
  Call InitDatabaseDefaults
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 20u "Step 2: enter the PostgreSQL target. Setup will scan this database before asking for passwords."
  Pop $0

  ${NSD_CreateLabel} 0u 28u 90u 12u "Host"
  Pop $0
  ${NSD_CreateText} 95u 26u 80u 12u "$DbHost"
  Pop $DbHostInput
  ${NSD_CreateLabel} 185u 28u 30u 12u "Port"
  Pop $0
  ${NSD_CreateText} 220u 26u 55u 12u "$DbPort"
  Pop $DbPortInput

  ${NSD_CreateLabel} 0u 50u 90u 12u "Database name"
  Pop $0
  ${NSD_CreateText} 95u 48u 180u 12u "$DbName"
  Pop $DbNameInput

  ${NSD_CreateLabel} 0u 72u 90u 12u "App DB user"
  Pop $0
  ${NSD_CreateText} 95u 70u 180u 12u "$DbUser"
  Pop $DbUserInput

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 98u 300u 32u $0
  ${NSD_SetText} $0 "If this database exists, setup will let you choose another database name or delete and recreate it."

  nsDialogs::Show
FunctionEnd

Function DbTargetPageLeave
  ${NSD_GetText} $DbHostInput $DbHost
  ${NSD_GetText} $DbPortInput $DbPort
  ${NSD_GetText} $DbNameInput $DbName
  ${NSD_GetText} $DbUserInput $DbUser

  ${If} $DbHost == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "Database host is required."
    Abort
  ${EndIf}
  ${If} $DbPort == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "Database port is required."
    Abort
  ${EndIf}
  ${If} $DbName == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "Database name is required."
    Abort
  ${EndIf}
  ${If} $DbUser == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "App DB user is required."
    Abort
  ${EndIf}

  StrCpy $DbAdminPassword ""
  StrCpy $DbPassword ""
  StrCpy $DbResetExisting "false"
  StrCpy $DbExistingAction ""
  Call ProbeDatabase
FunctionEnd

Function DbAdminProbePageCreate
  ${If} $DbScanState != "unknown"
    Abort
  ${EndIf}

  Call InitDatabaseDefaults
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 0u 300u 28u $0
  ${NSD_SetText} $0 "Setup could not scan the database without PostgreSQL admin access. Enter admin credentials to check whether the DB exists."

  ${NSD_CreateLabel} 0u 34u 90u 12u "Admin user"
  Pop $0
  ${NSD_CreateText} 95u 32u 180u 12u "$DbAdminUser"
  Pop $DbAdminUserInput

  ${NSD_CreateLabel} 0u 56u 90u 12u "Admin password"
  Pop $0
  ${NSD_CreatePassword} 95u 54u 180u 12u "$DbAdminPassword"
  Pop $DbAdminPasswordInput

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 82u 300u 46u $0
  ${NSD_SetText} $0 "Last scan result:$\r$\n$DbScanMessage"

  nsDialogs::Show
FunctionEnd

Function DbAdminProbePageLeave
  ${NSD_GetText} $DbAdminUserInput $DbAdminUser
  ${NSD_GetText} $DbAdminPasswordInput $DbAdminPassword

  ${If} $DbAdminUser == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin user is required to scan the database."
    Abort
  ${EndIf}

  Call ProbeDatabase
  ${If} $DbScanState == "unknown"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Could not scan the database.$\r$\n$\r$\n$DbScanMessage"
    Abort
  ${EndIf}
  ${If} $DbExistingAction == "rename"
  ${AndIf} $DbScanState == "exists"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Database '$DbName' already exists. Click Back and enter another database name."
    Abort
  ${EndIf}
FunctionEnd

Function DbExistingChoicePageCreate
  ${If} $DbScanState != "exists"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 18u "Database '$DbName' already exists."
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 24u 300u 30u $0
  ${NSD_SetText} $0 "Choose one option. Setup will open a separate configuration page for that choice."

  ${NSD_CreateRadioButton} 0u 64u 300u 14u "1. Use a new database name"
  Pop $DbExistsRenameRadio

  ${NSD_CreateRadioButton} 0u 88u 300u 14u "2. Reuse '$DbName' and keep its existing data"
  Pop $DbExistsReuseRadio

  ${NSD_CreateRadioButton} 0u 112u 300u 14u "3. Replace '$DbName' with a new clean database"
  Pop $DbExistsRecreateRadio

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 138u 300u 30u $0
  ${NSD_SetText} $0 "Warning: option 3 permanently deletes the current database. Options 1 and 2 preserve it."

  ${If} $DbExistingAction == "reuse"
    ${NSD_Check} $DbExistsReuseRadio
  ${ElseIf} $DbExistingAction == "replace"
    ${NSD_Check} $DbExistsRecreateRadio
  ${Else}
    ${NSD_Check} $DbExistsRenameRadio
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function DbExistingChoicePageLeave
  ${NSD_GetState} $DbExistsReuseRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DbExistingAction "reuse"
    StrCpy $DbResetExisting "false"
    Return
  ${EndIf}

  ${NSD_GetState} $DbExistsRecreateRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DbExistingAction "replace"
    StrCpy $DbResetExisting "true"
    Return
  ${EndIf}

  StrCpy $DbExistingAction "rename"
  StrCpy $DbResetExisting "false"
FunctionEnd

Function DbRenamePageCreate
  ${If} $DbExistingAction != "rename"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 18u "Use a new database name"
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 26u 300u 34u $0
  ${NSD_SetText} $0 "The existing database will not be changed. Enter a different name for the new OCR database."

  ${NSD_CreateLabel} 0u 74u 90u 12u "New DB name"
  Pop $0
  ${NSD_CreateText} 95u 72u 180u 12u "$DbName_new"
  Pop $DbRenameInput

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 102u 300u 34u $0
  ${NSD_SetText} $0 "Click Next to verify the new name. PostgreSQL admin credentials will be requested on the following page."

  nsDialogs::Show
FunctionEnd

Function DbRenamePageLeave
  ${NSD_GetText} $DbRenameInput $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "New database name is required."
    Abort
  ${EndIf}
  ${If} $0 == $DbName
    MessageBox MB_ICONEXCLAMATION|MB_OK "New database name must be different from the existing database."
    Abort
  ${EndIf}

  StrCpy $DbName "$0"
  StrCpy $DbAdminPassword ""
  StrCpy $DbPassword ""
  Call ProbeDatabase
  ${If} $DbScanState == "exists"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Database '$DbName' already exists. Enter another database name."
    Abort
  ${EndIf}
FunctionEnd

Function DbReuseCredentialPageCreate
  ${If} $DbExistingAction != "reuse"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 18u "Reuse existing database and preserve data"
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 26u 300u 38u $0
  ${NSD_SetText} $0 "Setup will connect to '$DbName' as '$DbUser', run compatible migrations, and keep existing records."

  ${NSD_CreateLabel} 0u 78u 90u 12u "App DB password"
  Pop $0
  ${NSD_CreatePassword} 95u 76u 180u 12u "$DbPassword"
  Pop $DbPasswordInput

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 106u 300u 34u $0
  ${NSD_SetText} $0 "Enter the current password for app DB user '$DbUser'. This option does not delete the database."

  nsDialogs::Show
FunctionEnd

Function DbReuseCredentialPageLeave
  ${NSD_GetText} $DbPasswordInput $DbPassword
  ${If} $DbPassword == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "The current app DB password is required to reuse this database."
    Abort
  ${EndIf}
  StrCpy $DbResetExisting "false"
FunctionEnd

Function DbCreateCredentialPageCreate
  ${If} $DbScanState != "missing"
    Abort
  ${EndIf}
  ${If} $DbExistingAction == "reuse"
  ${OrIf} $DbExistingAction == "replace"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 18u "Create new database '$DbName'"
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 22u 300u 26u $0
  ${NSD_SetText} $0 "Enter PostgreSQL admin credentials so setup can create the database and app user."

  ${NSD_CreateLabel} 0u 58u 90u 12u "Admin user"
  Pop $0
  ${NSD_CreateText} 95u 56u 180u 12u "$DbAdminUser"
  Pop $DbAdminUserInput

  ${NSD_CreateLabel} 0u 80u 90u 12u "Admin password"
  Pop $0
  ${NSD_CreatePassword} 95u 78u 180u 12u "$DbAdminPassword"
  Pop $DbAdminPasswordInput

  ${NSD_CreateLabel} 0u 102u 90u 12u "App DB password"
  Pop $0
  ${NSD_CreatePassword} 95u 100u 180u 12u "$DbPassword"
  Pop $DbPasswordInput

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 124u 300u 24u $0
  ${NSD_SetText} $0 "App DB password is optional. Leave it empty to generate a secure password automatically."

  nsDialogs::Show
FunctionEnd

Function DbCreateCredentialPageLeave
  ${NSD_GetText} $DbAdminUserInput $DbAdminUser
  ${NSD_GetText} $DbAdminPasswordInput $DbAdminPassword
  ${NSD_GetText} $DbPasswordInput $DbPassword

  ${If} $DbAdminUser == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin user is required to create the database."
    Abort
  ${EndIf}
  ${If} $DbAdminPassword == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin password is required to create the database."
    Abort
  ${EndIf}
  StrCpy $DbResetExisting "false"
FunctionEnd

Function DbReplaceCredentialPageCreate
  ${If} $DbExistingAction != "replace"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 18u "Replace existing database '$DbName'"
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 22u 300u 28u $0
  ${NSD_SetText} $0 "Warning: setup will permanently delete the existing database and create a clean replacement."

  ${NSD_CreateLabel} 0u 60u 90u 12u "Admin user"
  Pop $0
  ${NSD_CreateText} 95u 58u 180u 12u "$DbAdminUser"
  Pop $DbAdminUserInput

  ${NSD_CreateLabel} 0u 82u 90u 12u "Admin password"
  Pop $0
  ${NSD_CreatePassword} 95u 80u 180u 12u "$DbAdminPassword"
  Pop $DbAdminPasswordInput

  ${NSD_CreateLabel} 0u 104u 90u 12u "App DB password"
  Pop $0
  ${NSD_CreatePassword} 95u 102u 180u 12u "$DbPassword"
  Pop $DbPasswordInput

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 126u 300u 24u $0
  ${NSD_SetText} $0 "App DB password is optional. Leave it empty to generate a secure password automatically."

  nsDialogs::Show
FunctionEnd

Function DbReplaceCredentialPageLeave
  ${NSD_GetText} $DbAdminUserInput $DbAdminUser
  ${NSD_GetText} $DbAdminPasswordInput $DbAdminPassword
  ${NSD_GetText} $DbPasswordInput $DbPassword

  ${If} $DbAdminUser == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin user is required to replace the database."
    Abort
  ${EndIf}
  ${If} $DbAdminPassword == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin password is required to replace the database."
    Abort
  ${EndIf}
  StrCpy $DbResetExisting "true"
FunctionEnd

!macro customInstall
  ReadEnvStr $0 "PROGRAMDATA"
  ${If} $0 == ""
    StrCpy $0 "C:\ProgramData"
  ${EndIf}
  CreateDirectory "$0\AHSO OCR\updates\installers"
  CopyFiles /SILENT "$EXEPATH" "$0\AHSO OCR\updates\installers\$EXEFILE"

  ${If} ${Silent}
    DetailPrint "Automated update: rebuilding local runtime dependencies."
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\bootstrap-installer.ps1" -InstallDir "$INSTDIR" -UpdateExisting' $0
    IntCmp $0 0 bootstrap_done 0 0
      Abort "AHSO OCR automated update runtime bootstrap failed."
  ${EndIf}

  DetailPrint "Bootstrapping local OCR runtime..."
  Call WriteDbConfig
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\bootstrap-installer.ps1" -InstallDir "$INSTDIR" -DbConfigPath "$DbConfigPath"' $0
  IntCmp $0 0 bootstrap_done 0 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "AHSO OCR files were copied, but setup is not complete because local runtime bootstrap returned code $0. Open C:\ProgramData\AHSO OCR\bootstrap-status.json and bootstrap.log for details."
    Delete "$newDesktopLink"
    Delete "$newStartMenuLink"
    DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"
    !ifdef INSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY_2}"
    !endif
    SetOutPath "$TEMP"
    RMDir /r "$INSTDIR"
    Abort "AHSO OCR runtime bootstrap failed."
  bootstrap_done:
!macroend
!else
!include nsDialogs.nsh
!include LogicLib.nsh

Var UninstallKeepDatabase
Var UninstallKeepFrameworks
Var UninstallKeepDatabaseCheckbox
Var UninstallKeepFrameworksCheckbox

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.UninstallOptionsPageCreate un.UninstallOptionsPageLeave
!macroend

Function un.UninstallOptionsPageCreate
  StrCpy $UninstallKeepDatabase "false"
  StrCpy $UninstallKeepFrameworks "false"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 24u "Choose uninstall options before removing AHSO OCR."
  Pop $0

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 30u 300u 48u $0
  ${NSD_SetText} $0 "Default clean uninstall removes the app, local OCR database/config, and runtime frameworks installed by this setup. Frameworks that already existed before setup are not removed automatically."

  ${NSD_CreateCheckbox} 0u 90u 300u 14u "Keep local PostgreSQL database and runtime config"
  Pop $UninstallKeepDatabaseCheckbox

  ${NSD_CreateCheckbox} 0u 114u 300u 14u "Keep runtime frameworks installed by setup"
  Pop $UninstallKeepFrameworksCheckbox

  !insertmacro AhsoCreateReadOnlyScrollBox 0u 140u 300u 28u $0
  ${NSD_SetText} $0 "You can select both checkboxes to remove only the AHSO OCR application files and shortcuts."

  nsDialogs::Show
FunctionEnd

Function un.UninstallOptionsPageLeave
  ${NSD_GetState} $UninstallKeepDatabaseCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UninstallKeepDatabase "true"
  ${EndIf}

  ${NSD_GetState} $UninstallKeepFrameworksCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UninstallKeepFrameworks "true"
  ${EndIf}
FunctionEnd

!macro customUnInstall
  ${If} ${isUpdated}
    DetailPrint "Application update: keeping database, runtime config, and frameworks."
    Goto uninstall_runtime_done
  ${EndIf}

  ${If} ${Silent}
    StrCpy $UninstallKeepDatabase "false"
    StrCpy $UninstallKeepFrameworks "false"
    Goto uninstall_options_done
  ${EndIf}

  uninstall_options_done:
    DetailPrint "Running selected AHSO OCR uninstall cleanup..."
    StrCpy $0 ""
    ${If} $UninstallKeepDatabase == "true"
      StrCpy $0 "$0 -KeepDatabase"
    ${EndIf}
    ${If} $UninstallKeepFrameworks == "true"
      StrCpy $0 "$0 -KeepFrameworks"
    ${EndIf}

    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\uninstall-runtime.ps1"$0' $1
    IntCmp $1 0 uninstall_runtime_done 0 0
      MessageBox MB_ICONEXCLAMATION|MB_OK "The app will be removed, but selected uninstall cleanup failed. Open C:\ProgramData\AHSO OCR\uninstall.log for details."

  uninstall_runtime_done:
!macroend
!endif

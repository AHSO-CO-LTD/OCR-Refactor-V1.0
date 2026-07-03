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
Var DbExistsRecreateRadio
Var DbConfigPath
Var DbProbeStatusPath
Var DbScanState
Var DbScanMessage

!macro customPageAfterChangeDir
  Page custom DbTargetPageCreate DbTargetPageLeave
  Page custom DbAdminProbePageCreate DbAdminProbePageLeave
  Page custom DbCredentialPageCreate DbCredentialPageLeave
!macroend

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

  ${NSD_CreateLabel} 0u 0u 300u 20u "Step 1: enter the PostgreSQL target. Setup will scan this database before asking for passwords."
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

  ${NSD_CreateLabel} 0u 98u 300u 28u "If this database exists, setup will let you choose another database name or delete and recreate it."
  Pop $0

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

  ${NSD_CreateLabel} 0u 0u 300u 26u "Setup could not scan the database without PostgreSQL admin access. Enter admin credentials to check whether the DB exists."
  Pop $0

  ${NSD_CreateLabel} 0u 34u 90u 12u "Admin user"
  Pop $0
  ${NSD_CreateText} 95u 32u 180u 12u "$DbAdminUser"
  Pop $DbAdminUserInput

  ${NSD_CreateLabel} 0u 56u 90u 12u "Admin password"
  Pop $0
  ${NSD_CreatePassword} 95u 54u 180u 12u "$DbAdminPassword"
  Pop $DbAdminPasswordInput

  ${NSD_CreateLabel} 0u 82u 300u 34u "Last scan result: $DbScanMessage"
  Pop $0

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
FunctionEnd

Function DbCredentialPageCreate
  ${If} $DbScanState == "unknown"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Database scan did not complete. Setup cannot continue."
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $DbScanState == "exists"
    ${NSD_CreateLabel} 0u 0u 300u 24u "Database '$DbName' already exists. Choose how setup should continue."
    Pop $0

    ${NSD_CreateRadioButton} 0u 30u 300u 12u "Use a different database name"
    Pop $DbExistsRenameRadio
    ${NSD_Check} $DbExistsRenameRadio

    ${NSD_CreateLabel} 14u 51u 90u 12u "New DB name"
    Pop $0
    ${NSD_CreateText} 105u 49u 170u 12u "$DbName_new"
    Pop $DbRenameInput

    ${NSD_CreateRadioButton} 0u 76u 300u 12u "Delete existing '$DbName' and create a clean database"
    Pop $DbExistsRecreateRadio

    ${NSD_CreateLabel} 14u 96u 280u 20u "This permanently removes the selected database before migrations run."
    Pop $0

    ${NSD_CreateLabel} 0u 124u 90u 12u "Admin user"
    Pop $0
    ${NSD_CreateText} 95u 122u 180u 12u "$DbAdminUser"
    Pop $DbAdminUserInput

    ${NSD_CreateLabel} 0u 146u 90u 12u "Admin password"
    Pop $0
    ${NSD_CreatePassword} 95u 144u 180u 12u "$DbAdminPassword"
    Pop $DbAdminPasswordInput

    ${NSD_CreateLabel} 0u 168u 90u 12u "App DB password"
    Pop $0
    ${NSD_CreatePassword} 95u 166u 180u 12u "$DbPassword"
    Pop $DbPasswordInput

    ${NSD_CreateLabel} 0u 190u 300u 18u "Leave app DB password empty to let setup generate one automatically."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0u 0u 300u 28u "Database '$DbName' does not exist. Setup will create it with PostgreSQL admin access."
    Pop $0

    ${NSD_CreateLabel} 0u 38u 90u 12u "Admin user"
    Pop $0
    ${NSD_CreateText} 95u 36u 180u 12u "$DbAdminUser"
    Pop $DbAdminUserInput

    ${NSD_CreateLabel} 0u 60u 90u 12u "Admin password"
    Pop $0
    ${NSD_CreatePassword} 95u 58u 180u 12u "$DbAdminPassword"
    Pop $DbAdminPasswordInput

    ${NSD_CreateLabel} 0u 84u 90u 12u "App DB password"
    Pop $0
    ${NSD_CreatePassword} 95u 82u 180u 12u "$DbPassword"
    Pop $DbPasswordInput

    ${NSD_CreateLabel} 0u 108u 300u 26u "Leave app DB password empty to let setup generate one automatically."
    Pop $0
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function DbCredentialPageLeave
  ${If} $DbScanState == "exists"
    ${NSD_GetText} $DbAdminUserInput $DbAdminUser
    ${NSD_GetText} $DbAdminPasswordInput $DbAdminPassword
    ${NSD_GetText} $DbPasswordInput $DbPassword

    ${If} $DbAdminUser == ""
      MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin user is required."
      Abort
    ${EndIf}
    ${If} $DbAdminPassword == ""
      MessageBox MB_ICONEXCLAMATION|MB_OK "PostgreSQL admin password is required."
      Abort
    ${EndIf}

    ${NSD_GetState} $DbExistsRecreateRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $DbResetExisting "true"
    ${Else}
      StrCpy $DbResetExisting "false"
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
      Call ProbeDatabase
      ${If} $DbScanState == "exists"
        MessageBox MB_ICONEXCLAMATION|MB_OK "Database '$DbName' already exists. Enter another database name or choose the delete-and-recreate option."
        Abort
      ${EndIf}
      ${If} $DbScanState == "unknown"
        MessageBox MB_ICONEXCLAMATION|MB_OK "Could not scan the new database name.$\r$\n$\r$\n$DbScanMessage"
        Abort
      ${EndIf}
    ${EndIf}
  ${Else}
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
  ${EndIf}
FunctionEnd

!macro customInstall
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
!include LogicLib.nsh

!macro customUnInstall
  ${If} ${Silent}
    DetailPrint "Keeping local PostgreSQL database during silent uninstall."
    Goto uninstall_database_done
  ${EndIf}

  MessageBox MB_ICONQUESTION|MB_YESNOCANCEL "Do you want to keep the local PostgreSQL database?$\r$\n$\r$\nYes = keep database and runtime config.$\r$\nNo = delete database and local runtime credentials.$\r$\nCancel = stop uninstall." IDYES keep_database IDNO delete_database
  Abort "Uninstall cancelled."

  keep_database:
    DetailPrint "Keeping local PostgreSQL database."
    Goto uninstall_database_done

  delete_database:
    DetailPrint "Deleting local PostgreSQL database..."
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\uninstall-database.ps1"' $0
    IntCmp $0 0 uninstall_database_done 0 0
      MessageBox MB_ICONEXCLAMATION|MB_OK "The app will be removed, but setup could not delete the local PostgreSQL database. Open C:\ProgramData\AHSO OCR\uninstall.log for details."

  uninstall_database_done:
!macroend
!endif

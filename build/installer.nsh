!ifndef BUILD_UNINSTALLER
!include nsDialogs.nsh
!include LogicLib.nsh

Var DbHost
Var DbPort
Var DbName
Var DbUser
Var DbPassword
Var DbAdminUser
Var DbAdminPassword
Var DbHostInput
Var DbPortInput
Var DbNameInput
Var DbUserInput
Var DbPasswordInput
Var DbAdminUserInput
Var DbAdminPasswordInput
Var DbConfigPath

!macro customPageAfterChangeDir
  Page custom DbConfigPageCreate DbConfigPageLeave
!macroend

Function DbConfigPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

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

  ${NSD_CreateLabel} 0u 0u 300u 14u "If this database already exists and the app password works, setup will reuse it."
  Pop $0

  ${NSD_CreateLabel} 0u 20u 90u 12u "Host"
  Pop $0
  ${NSD_CreateText} 95u 18u 80u 12u "$DbHost"
  Pop $DbHostInput
  ${NSD_CreateLabel} 185u 20u 30u 12u "Port"
  Pop $0
  ${NSD_CreateText} 220u 18u 55u 12u "$DbPort"
  Pop $DbPortInput

  ${NSD_CreateLabel} 0u 40u 90u 12u "Database name"
  Pop $0
  ${NSD_CreateText} 95u 38u 180u 12u "$DbName"
  Pop $DbNameInput

  ${NSD_CreateLabel} 0u 60u 90u 12u "App DB user"
  Pop $0
  ${NSD_CreateText} 95u 58u 180u 12u "$DbUser"
  Pop $DbUserInput

  ${NSD_CreateLabel} 0u 80u 90u 12u "App DB password"
  Pop $0
  ${NSD_CreatePassword} 95u 78u 180u 12u "$DbPassword"
  Pop $DbPasswordInput

  ${NSD_CreateLabel} 0u 100u 90u 12u "Admin user"
  Pop $0
  ${NSD_CreateText} 95u 98u 180u 12u "$DbAdminUser"
  Pop $DbAdminUserInput

  ${NSD_CreateLabel} 0u 120u 90u 12u "Admin password"
  Pop $0
  ${NSD_CreatePassword} 95u 118u 180u 12u "$DbAdminPassword"
  Pop $DbAdminPasswordInput

  ${NSD_CreateLabel} 0u 138u 300u 22u "Admin password is only needed when setup must create/update the DB user or database."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function DbConfigPageLeave
  ${NSD_GetText} $DbHostInput $DbHost
  ${NSD_GetText} $DbPortInput $DbPort
  ${NSD_GetText} $DbNameInput $DbName
  ${NSD_GetText} $DbUserInput $DbUser
  ${NSD_GetText} $DbPasswordInput $DbPassword
  ${NSD_GetText} $DbAdminUserInput $DbAdminUser
  ${NSD_GetText} $DbAdminPasswordInput $DbAdminPassword

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
FunctionEnd

!macro customInstall
  DetailPrint "Bootstrapping local OCR runtime..."
  InitPluginsDir
  StrCpy $DbConfigPath "$PLUGINSDIR\db-config.ini"
  WriteINIStr "$DbConfigPath" "database" "host" "$DbHost"
  WriteINIStr "$DbConfigPath" "database" "port" "$DbPort"
  WriteINIStr "$DbConfigPath" "database" "name" "$DbName"
  WriteINIStr "$DbConfigPath" "database" "user" "$DbUser"
  WriteINIStr "$DbConfigPath" "database" "password" "$DbPassword"
  WriteINIStr "$DbConfigPath" "database" "adminUser" "$DbAdminUser"
  WriteINIStr "$DbConfigPath" "database" "adminPassword" "$DbAdminPassword"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\bootstrap-installer.ps1" -InstallDir "$INSTDIR" -DbConfigPath "$DbConfigPath"' $0
  IntCmp $0 0 bootstrap_done 0 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "AHSO OCR was installed, but local runtime bootstrap returned code $0. Open C:\ProgramData\AHSO OCR\bootstrap-status.json and bootstrap.log for details."
  bootstrap_done:
!macroend
!endif

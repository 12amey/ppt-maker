; UI-only regression harness. No files, registry entries, or dependencies installed.
Unicode True
RequestExecutionLevel user
Name "Presenton Installer UI Test"
!ifndef TEST_OUTPUT
  !define TEST_OUTPUT "hardware-check-ui.exe"
!endif
OutFile "${TEST_OUTPUT}"
InstallDir "$LOCALAPPDATA\Presenton Installer UI Test"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!insertmacro GetRoot
!ifndef MIN_RAM_MB
  !define MIN_RAM_MB 8000
!endif
!ifndef MIN_DISK_GB
  !define MIN_DISK_GB 20
!endif

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
Page custom HardwareCheckPage HardwareCheckLeave
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!include "..\hardware-check.nsh"

Section "UI test (no installation)"
  DetailPrint "Installer page regression test completed. No application was installed."
SectionEnd

; Shared by the production installer and the UI regression harness.
; Keep these checks in-process: WMI/PowerShell can hang before nsDialogs::Show.
!ifndef PRESENTON_HARDWARE_CHECK_INCLUDED
!define PRESENTON_HARDWARE_CHECK_INCLUDED

Var HWCheckDlg
Var HWCheckResult
Var HWCheckPassed

Function HardwareCheckPage
  !insertmacro MUI_HEADER_TEXT "System requirements" "Review your system before installing Presenton AI."
  nsDialogs::Create 1018
  Pop $HWCheckDlg
  ${If} $HWCheckDlg == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "System requirements check complete."
  Pop $1
  ${NSD_CreateLabel} 0 20u 100% 120u ""
  Pop $HWCheckResult

  StrCpy $HWCheckPassed "true"
  StrCpy $0 ""
  ${IfNot} ${AtLeastWin10}
    StrCpy $0 "$0Windows: Windows 10 or later required.$\r$\n$\r$\n"
    StrCpy $HWCheckPassed "false"
  ${Else}
    StrCpy $0 "$0Windows: Windows 10/11 detected.$\r$\n$\r$\n"
  ${EndIf}
  ${IfNot} ${RunningX64}
    StrCpy $0 "$0System: 64-bit Windows required.$\r$\n$\r$\n"
    StrCpy $HWCheckPassed "false"
  ${Else}
    StrCpy $0 "$0System: 64-bit Windows detected.$\r$\n$\r$\n"
  ${EndIf}

  ; The API takes ONE pointer to an unsigned 64-bit value (installed RAM in KB).
  ; Do not call GlobalMemoryStatusEx with separate fields instead of a struct.
  StrCpy $2 0
  StrCpy $3 0
  System::Call 'kernel32::GetPhysicallyInstalledSystemMemory(*l .r3) i.r2'
  ${If} $2 != 0
    System::Int64Op $3 / 1024
    Pop $4
    ${If} $4 < ${MIN_RAM_MB}
      StrCpy $0 "$0RAM: $4 MB installed (${MIN_RAM_MB} MB recommended).$\r$\n$\r$\n"
      StrCpy $HWCheckPassed "false"
    ${Else}
      StrCpy $0 "$0RAM: $4 MB installed - OK.$\r$\n$\r$\n"
    ${EndIf}
  ${Else}
    ; An unavailable hardware query must not prevent installation.
    StrCpy $0 "$0RAM: Could not detect automatically (${MIN_RAM_MB} MB recommended).$\r$\n$\r$\n"
  ${EndIf}

  ; Use the destination selected on the preceding directory page, not always C:.
  ${GetRoot} "$INSTDIR" $5
  StrCpy $7 0
  StrCpy $8 0
  System::Call 'kernel32::GetDiskFreeSpaceExW(w "$5\", *l .r8, p 0, p 0) i.r7'
  ${If} $7 != 0
    System::Int64Op $8 / 1073741824
    Pop $9
    ${If} $9 < ${MIN_DISK_GB}
      StrCpy $0 "$0Disk ($5): $9 GB free (${MIN_DISK_GB} GB recommended)."
      StrCpy $HWCheckPassed "false"
    ${Else}
      StrCpy $0 "$0Disk ($5): $9 GB free - OK."
    ${EndIf}
  ${Else}
    StrCpy $0 "$0Disk ($5): Could not detect free space (${MIN_DISK_GB} GB recommended)."
  ${EndIf}

  ${NSD_SetText} $HWCheckResult "$0"
  nsDialogs::Show
FunctionEnd

Function HardwareCheckLeave
  ${If} $HWCheckPassed == "false"
    MessageBox MB_ICONEXCLAMATION|MB_OKCANCEL \
      "Your system does not meet the recommended requirements.$\r$\nYou may continue, but local AI features may not work correctly.$\r$\n$\r$\nContinue anyway?" \
      IDOK done
    Abort
  ${EndIf}
  done:
FunctionEnd

!endif

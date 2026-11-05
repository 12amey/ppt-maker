; ─────────────────────────────────────────────────────────────────────────────
; Presenton AI PowerPoint – NSIS Installer
; Builds a single .exe that installs the full application including:
;   - Presenton Electron app
;   - Ollama (local LLM)
;   - ComfyUI (image + video generation via Python embedded)
;   - VC++ Redistributables
; ─────────────────────────────────────────────────────────────────────────────

Unicode True
!ifndef SETUP_COMPRESSION
  !define SETUP_COMPRESSION lzma
!endif
SetCompressor /SOLID ${SETUP_COMPRESSION}

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!insertmacro GetRoot

; ── Metadata ──────────────────────────────────────────────────────────────────
!define APP_NAME        "Presenton AI"
!define APP_VERSION     "1.0.0"
!define APP_PUBLISHER   "Your Company Name"
!define APP_URL         "https://your-domain.com"
!define APP_EXE         "Presenton.exe"
!define APP_GUID        "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"  ; Generate a unique GUID!
!define INSTALL_DIR     "$PROGRAMFILES64\${APP_NAME}"
!define UNINSTALL_KEY   "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"

; Minimum requirements
!define MIN_RAM_MB      8000    ; 8 GB RAM
!define MIN_DISK_GB     20      ; 20 GB free disk space
!define MIN_VRAM_MB     4000    ; 4 GB VRAM (informational only, not blocking)

; Ollama installer download
!define OLLAMA_INSTALLER_URL "https://ollama.com/download/OllamaSetup.exe"

; ── Output ────────────────────────────────────────────────────────────────────
Name "${APP_NAME}"
!ifndef SETUP_OUTPUT
  !define SETUP_OUTPUT "dist\Presenton-${APP_VERSION}-Setup.exe"
!endif
OutFile "${SETUP_OUTPUT}"
InstallDir "${INSTALL_DIR}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel admin
ShowInstDetails show
ShowUnInstDetails show

; ── MUI Pages ─────────────────────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_ICON "..\electron\build\icon.ico"
!define MUI_UNICON "..\electron\build\icon.ico"
; Custom branding bitmaps (optional):
; !define MUI_WELCOMEFINISHPAGE_BITMAP "assets\installer-side.bmp"
; !define MUI_HEADERIMAGE
; !define MUI_HEADERIMAGE_BITMAP "assets\installer-header.bmp"
; !define MUI_HEADERIMAGE_RIGHT

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
Page custom HardwareCheckPage HardwareCheckLeave
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Hardware Check Page ───────────────────────────────────────────────────────
!include "hardware-check.nsh"

; ── Sections ──────────────────────────────────────────────────────────────────

Section "Presenton AI App" SecMain
  SectionIn RO  ; Required

  SetOutPath "$INSTDIR"
  File /r "..\electron\dist\win-unpacked\*"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Write registry
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "URLInfoAbout" "${APP_URL}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1

  ; Start menu shortcut
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
SectionEnd

Section "Ollama (Local AI)" SecOllama
  DetailPrint "Installing Ollama..."
  SetOutPath "$TEMP"

  ; Download Ollama installer via PowerShell (avoids missing inetc.dll plugin)
  DetailPrint "Downloading Ollama installer..."
  nsExec::ExecToLog 'powershell -NonInteractive -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile(\"${OLLAMA_INSTALLER_URL}\", \"$TEMP\OllamaSetup.exe\") } catch { curl.exe -fL -o \"$TEMP\OllamaSetup.exe\" \"${OLLAMA_INSTALLER_URL}\" }"'
  Pop $0

  ${If} ${FileExists} "$TEMP\OllamaSetup.exe"
    DetailPrint "Running Ollama installer..."
    ExecWait '"$TEMP\OllamaSetup.exe" /silent' $1
    ${If} $1 != 0
      MessageBox MB_ICONEXCLAMATION "Ollama installation completed with code $1. You can also install it manually from https://ollama.com"
    ${Else}
      DetailPrint "Ollama installed successfully."
    ${EndIf}
    Delete "$TEMP\OllamaSetup.exe"
  ${Else}
    MessageBox MB_ICONEXCLAMATION "Ollama download skipped or failed. You can install it manually from https://ollama.com"
  ${EndIf}
SectionEnd

Section "ComfyUI (AI Image & Video)" SecComfyUI
  DetailPrint "ComfyUI will be downloaded and installed automatically on first launch."
  ; ComfyUI is managed by the Electron app itself – no separate installer needed.
  ; This section just shows users what will happen.
SectionEnd

; ── Component Descriptions ────────────────────────────────────────────────────

LangString DESC_SecMain ${LANG_ENGLISH} "The main Presenton AI PowerPoint application (required)."
LangString DESC_SecOllama ${LANG_ENGLISH} "Ollama: Free local AI for chat-based presentation creation. Required for offline AI features."
LangString DESC_SecComfyUI ${LANG_ENGLISH} "ComfyUI: Free local AI image and video generation. Downloads automatically on first use (~8 GB)."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_SecMain)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecOllama} $(DESC_SecOllama)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecComfyUI} $(DESC_SecComfyUI)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ── Uninstaller ───────────────────────────────────────────────────────────────

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\${APP_PUBLISHER}\${APP_NAME}"
SectionEnd

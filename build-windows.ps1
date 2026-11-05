#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Presenton AI - Full Windows Build Script
    Builds the Electron app, FastAPI backend, and NSIS installer.

.DESCRIPTION
    Run this script from the repository root on a Windows machine with:
      - Node.js 20+
      - Python 3.11+ (uv)
      - NSIS 3.x (makensis in PATH)
      - Visual Studio Build Tools (for native modules)

.EXAMPLE
    .\build-windows.ps1
    .\build-windows.ps1 -SkipNSIS
    .\build-windows.ps1 -Clean
#>

param(
    [switch]$Clean,
    [switch]$SkipNSIS,
    [switch]$SkipFastAPI,
    [switch]$SkipNextJS
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Warn($msg) {
    Write-Host "  [WARN] $msg" -ForegroundColor Yellow
}

function Fail($msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
    exit 1
}

# --- 0. Clean -----------------------------------------------------------------
if ($Clean) {
    Step "Cleaning previous build artifacts"
    @("electron\dist", "electron\app_dist", "electron\resources\fastapi",
      "electron\resources\nextjs", "installer\dist") | ForEach-Object {
        $p = Join-Path $Root $_
        if (Test-Path $p) {
            Remove-Item -Recurse -Force $p
            Ok "Removed $p"
        }
    }
}

# --- 1. Check prerequisites ---------------------------------------------------
Step "Checking prerequisites"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js not found. Install from https://nodejs.org" }
Ok "Node.js $(node --version)"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Fail "Python not found." }
Ok "Python $(python --version)"

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Warn "uv not found - installing via pip..."
    pip install uv
}
Ok "uv available"

if (-not $SkipNSIS) {
    if (-not (Get-Command makensis -ErrorAction SilentlyContinue)) {
        $commonNsisPaths = @(
            "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
            "${env:ProgramFiles}\NSIS\makensis.exe"
        )
        foreach ($p in $commonNsisPaths) {
            if (Test-Path $p) {
                $env:PATH += ";$(Split-Path $p)"
                break
            }
        }
    }
    if (-not (Get-Command makensis -ErrorAction SilentlyContinue)) {
        Warn "NSIS (makensis) not found in PATH."
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Host "  -> Attempting to install NSIS via winget..." -ForegroundColor Cyan
            try {
                winget install --id NSIS.NSIS -e --silent --accept-source-agreements --accept-package-agreements
                $nsisDefault = "${env:ProgramFiles(x86)}\NSIS"
                if (Test-Path $nsisDefault) {
                    $env:PATH += ";$nsisDefault"
                }
            } catch {
                Warn "Could not auto-install NSIS via winget."
            }
        }
    }
    if (Get-Command makensis -ErrorAction SilentlyContinue) {
        Ok "NSIS (makensis) available"
    } else {
        Warn "NSIS (makensis) not found - installer build will be skipped."
        $SkipNSIS = $true
    }
}

# --- 2. Install dependencies ---------------------------------------------
Step "Checking Node.js dependencies"
Push-Location (Join-Path $Root ".")
if (-not (Test-Path "node_modules")) {
    npm install --ignore-scripts --no-fund --no-audit
}
Pop-Location

Push-Location (Join-Path $Root "electron")
if (-not (Test-Path "node_modules")) {
    npm install --ignore-scripts --no-fund --no-audit
}
Pop-Location

Push-Location (Join-Path $Root "servers\nextjs")
if (-not (Test-Path "node_modules")) {
    npm install --ignore-scripts --no-fund --no-audit
}
Pop-Location
Ok "Node dependencies verified"

# --- 3. Build FastAPI (PyInstaller) -------------------------------------------
if (-not $SkipFastAPI) {
    Step "Building FastAPI server (PyInstaller)"
    Push-Location (Join-Path $Root "electron")
    npm run build:fastapi
    if ($LASTEXITCODE -ne 0) { Fail "FastAPI build failed" }
    Pop-Location
    Ok "FastAPI built -> electron/resources/fastapi"
}

# --- 4. Build Next.js ---------------------------------------------------------
if (-not $SkipNextJS) {
    Step "Building Next.js frontend"
    Push-Location (Join-Path $Root "electron")
    npm run build:nextjs
    if ($LASTEXITCODE -ne 0) { Fail "Next.js build failed" }
    Pop-Location
    Ok "Next.js built -> electron/resources/nextjs"
}

# --- 5. Copy ComfyUI workflows ------------------------------------------------
Step "Copying ComfyUI workflows"
$workflowsSrc = Join-Path $Root "comfyui-workflows"
$workflowsDst = Join-Path $Root "electron\resources\comfyui-workflows"
if (Test-Path $workflowsSrc) {
    New-Item -ItemType Directory -Force -Path $workflowsDst | Out-Null
    Copy-Item -Recurse -Force "$workflowsSrc\*" $workflowsDst
    Ok "Workflows copied"
}

# --- 6. Build Electron app ----------------------------------------------------
Step "Building Electron application"
Push-Location (Join-Path $Root "electron")
npm run build:electron
if ($LASTEXITCODE -ne 0) { Fail "Electron build failed" }
Pop-Location
Ok "Electron built -> electron/dist"

# --- 7. Build NSIS installer --------------------------------------------------
if (-not $SkipNSIS) {
    Step "Building NSIS installer"
    $installerDir = Join-Path $Root "installer"
    New-Item -ItemType Directory -Force -Path (Join-Path $installerDir "dist") | Out-Null

    Push-Location $installerDir
    $makensisExe = (Get-Command makensis -ErrorAction SilentlyContinue)?.Source
    if (-not $makensisExe) {
        if (Test-Path "${env:ProgramFiles(x86)}\NSIS\makensis.exe") {
            $makensisExe = "${env:ProgramFiles(x86)}\NSIS\makensis.exe"
        } elseif (Test-Path "${env:ProgramFiles}\NSIS\makensis.exe") {
            $makensisExe = "${env:ProgramFiles}\NSIS\makensis.exe"
        } else {
            $makensisExe = "makensis"
        }
    }
    & $makensisExe installer.nsi
    if ($LASTEXITCODE -ne 0) { Fail "NSIS build failed" }
    Pop-Location

    $exe = Get-ChildItem (Join-Path $installerDir "dist\*.exe") | Select-Object -First 1
    if ($exe) {
        Ok "Installer created: $($exe.FullName)"
        Write-Host ""
        Write-Host "  [DELIVERABLE] $($exe.FullName)" -ForegroundColor Magenta
    }
}

# --- Done ---------------------------------------------------------------------
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Build complete!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Set up your License Server: cd license-server; bash setup.sh"
Write-Host "  2. Copy public key to electron/app/utils/license-manager.ts"
Write-Host "  3. Distribute installer/dist/Presenton-Setup.exe to customers"
Write-Host "  4. Use admin-dashboard/index.html to manage licenses"
Write-Host ""

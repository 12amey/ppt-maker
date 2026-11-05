$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Starting Presenton AI Presentation Generator...   " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Start Creative Hub (Backend & Frontend) if not already running
$frontendListening = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if (-not $frontendListening) {
    Write-Host "[1/3] Starting Backend & Frontend services..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot 'start-creative-hub.ps1')
    Start-Sleep -Seconds 5
} else {
    Write-Host "[1/3] Backend & Frontend are already running." -ForegroundColor Green
}

# 2. Check ComfyUI (Port 8188) for AI Images & Videos
$comfyListening = Get-NetTCPConnection -State Listen -LocalPort 8188 -ErrorAction SilentlyContinue
if (-not $comfyListening) {
    $comfyPython = Join-Path $PSScriptRoot 'tools/ComfyUI/.venv/Scripts/python.exe'
    $comfyMain = Join-Path $PSScriptRoot 'tools/ComfyUI/main.py'
    if ((Test-Path -LiteralPath $comfyPython) -and (Test-Path -LiteralPath $comfyMain)) {
        Write-Host "[2/3] Starting ComfyUI for image & video generation..." -ForegroundColor Yellow
        Start-Process -FilePath $comfyPython -ArgumentList @("`"$comfyMain`"", "--listen", "127.0.0.1", "--port", "8188", "--lowvram") -WindowStyle Hidden
    }
} else {
    Write-Host "[2/3] ComfyUI (AI Images/Video) is already running." -ForegroundColor Green
}

# 3. Start Cloudflare Tunnel
$logDir = Join-Path $PSScriptRoot '.cache'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$cfLog = Join-Path $logDir 'cloudflared-share.log'

# Check if cloudflared is running
$cfProc = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
if (-not $cfProc) {
    Write-Host "[3/3] Launching Cloudflare Online Sharing Tunnel..." -ForegroundColor Yellow
    $cfExe = Join-Path $PSScriptRoot 'cloudflared.exe'
    Start-Process -FilePath $cfExe -ArgumentList @("tunnel", "--url", "http://127.0.0.1:3000") -RedirectStandardError $cfLog -WindowStyle Hidden
} else {
    Write-Host "[3/3] Cloudflare Tunnel is already active." -ForegroundColor Green
}

# 4. Extract public URL from log
Write-Host "Connecting tunnel..." -ForegroundColor Yellow
$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    if (Test-Path -LiteralPath $cfLog) {
        $content = Get-Content -LiteralPath $cfLog -Tail 25 -ErrorAction SilentlyContinue
        $match = $content | Select-String -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com'
        if ($match) {
            $publicUrl = $match.Matches[0].Value
            break
        }
    }
    Start-Sleep -Seconds 1
}

Write-Host ""
if ($publicUrl) {
    Set-Clipboard -Value $publicUrl -ErrorAction SilentlyContinue
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host " PRESENTON IS LIVE ONLINE!" -ForegroundColor Green
    Write-Host " Share this link with your friend:" -ForegroundColor White
    Write-Host " $publicUrl" -ForegroundColor Cyan
    Write-Host " (The link has been COPIED to your clipboard!)" -ForegroundColor Yellow
    Write-Host "====================================================" -ForegroundColor Green
} else {
    Write-Host "Tunnel is running, but URL took longer than expected to appear." -ForegroundColor Yellow
    Write-Host "Check $cfLog or re-run this script in a few seconds." -ForegroundColor Gray
}
Write-Host "Press any key or close this window when done."

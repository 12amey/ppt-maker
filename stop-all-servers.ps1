$ErrorActionPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Stopping Presenton services..." -ForegroundColor Yellow

# 1. Stop Creative Hub
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'stop-creative-hub.ps1')) {
    & (Join-Path $PSScriptRoot 'stop-creative-hub.ps1')
}

# 2. Stop cloudflared
$cfProcesses = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($cfProcesses) {
    $cfProcesses | Stop-Process -Force
    Write-Host "Cloudflare tunnel stopped." -ForegroundColor Green
}

# 3. Stop ComfyUI python process if running
$allPy = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue
foreach ($p in $allPy) {
    if ($p.CommandLine -and $p.CommandLine.Contains("ComfyUI")) {
        Stop-Process -Id $p.ProcessId -Force
        Write-Host "ComfyUI process stopped." -ForegroundColor Green
    }
}

Write-Host "All Presenton servers and tunnels have been stopped." -ForegroundColor Green

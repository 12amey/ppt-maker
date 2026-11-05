param([int]$FrontendPort = 3000)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (Get-NetTCPConnection -State Listen -LocalPort $FrontendPort -ErrorAction SilentlyContinue) {
    Write-Host "A server is already using port $FrontendPort. Choose a free frontend port, for example .\start-creative-hub.ps1 -FrontendPort 3100."
    exit 0
}
$taskLogDir = Join-Path $PSScriptRoot '.cache/creative-hub'
New-Item -ItemType Directory -Force -Path $taskLogDir | Out-Null
# Preserve the existing database before migrations on the first source launch.
$databasePath = Join-Path $PSScriptRoot 'app_data/fastapi.db'
$backupPath = Join-Path $taskLogDir 'fastapi-before-creative-hub.db'
if ((Test-Path -LiteralPath $databasePath) -and !(Test-Path -LiteralPath $backupPath)) { Copy-Item -LiteralPath $databasePath -Destination $backupPath }
$nodePath = (Get-Command node).Source
$taskScript = Join-Path $PSScriptRoot 'scripts/start-creative-hub.mjs'
$env:PRESENTON_FRONTEND_PORT = [string]$FrontendPort
$taskProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$taskScript`"") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogDir 'launcher.log') -RedirectStandardError (Join-Path $taskLogDir 'launcher-error.log') -PassThru
Write-Host "PPT Maker starting (PID $($taskProcess.Id)). Open http://localhost:$FrontendPort/ppt-maker"
Write-Host "Logs: $taskLogDir"

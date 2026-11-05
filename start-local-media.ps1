$ErrorActionPreference = 'Stop'
$taskComfyDir = Join-Path $PSScriptRoot 'tools/ComfyUI'
$taskMediaPython = Join-Path $taskComfyDir '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $taskMediaPython)) { throw 'Run .\setup-local-media.ps1 first.' }
if (Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue) { Write-Host 'ComfyUI is already listening at http://127.0.0.1:8188'; exit 0 }
$taskLogDir = Join-Path $PSScriptRoot '.cache/creative-hub'
New-Item -ItemType Directory -Force -Path $taskLogDir | Out-Null
$taskMain = Join-Path $taskComfyDir 'main.py'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$taskComfyProcess = Start-Process -FilePath $taskMediaPython -ArgumentList @("`"$taskMain`"", '--listen', '127.0.0.1', '--port', '8188', '--lowvram', '--preview-method', 'none', '--use-pytorch-cross-attention') -WorkingDirectory $taskComfyDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogDir 'comfyui.log') -RedirectStandardError (Join-Path $taskLogDir 'comfyui-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $taskLogDir 'comfyui.pid') -Value $taskComfyProcess.Id
Write-Host "ComfyUI starting at http://127.0.0.1:8188 (PID $($taskComfyProcess.Id)). Logs: $taskLogDir"

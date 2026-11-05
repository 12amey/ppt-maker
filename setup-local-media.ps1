param([switch]$SkipModels)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskComfyDir = Join-Path $PSScriptRoot 'tools/ComfyUI'
function Invoke-SetupCommand([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Setup command failed: $Program (exit $LASTEXITCODE)" }
}
if (!(Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/' }
if (!(Test-Path -LiteralPath $taskComfyDir)) {
    Invoke-SetupCommand 'git' @('clone', '--depth', '1', 'https://github.com/Comfy-Org/ComfyUI.git', $taskComfyDir)
}
$taskMediaPython = Join-Path $taskComfyDir '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $taskMediaPython)) {
    Invoke-SetupCommand 'uv' @('venv', '--python', '3.12', (Join-Path $taskComfyDir '.venv'))
}
Invoke-SetupCommand 'uv' @('pip', 'install', '--python', $taskMediaPython, 'torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cu130')
Invoke-SetupCommand 'uv' @('pip', 'install', '--python', $taskMediaPython, '-r', (Join-Path $taskComfyDir 'requirements.txt'), 'imageio-ffmpeg', 'huggingface-hub')
foreach ($taskRepo in @('ComfyUI-AnimateDiff-Evolved', 'ComfyUI-VideoHelperSuite')) {
    $taskNodeDir = Join-Path $taskComfyDir "custom_nodes/$taskRepo"
    if (!(Test-Path -LiteralPath $taskNodeDir)) { Invoke-SetupCommand 'git' @('clone', '--depth', '1', "https://github.com/Kosinkadink/$taskRepo.git", $taskNodeDir) }
    $taskRequirements = Join-Path $taskNodeDir 'requirements.txt'
    if (Test-Path -LiteralPath $taskRequirements) { Invoke-SetupCommand 'uv' @('pip', 'install', '--python', $taskMediaPython, '-r', $taskRequirements) }
}
if (!$SkipModels) {
    $env:HF_HUB_DISABLE_TELEMETRY = '1'
    $env:HF_HUB_DISABLE_XET = '1'
    Invoke-SetupCommand $taskMediaPython @((Join-Path $PSScriptRoot 'scripts/download-media-models.py'), '--root', $taskComfyDir)
}
Invoke-SetupCommand $taskMediaPython @('-c', 'import torch; print("PyTorch", torch.__version__, "CUDA available:", torch.cuda.is_available()); assert torch.cuda.is_available(), "CUDA is not available; check your NVIDIA driver"')
Write-Host 'Local media setup complete. Run .\start-local-media.ps1, then refresh the Image / Video page.'

$ErrorActionPreference = 'Stop'
$taskPidFile = Join-Path $PSScriptRoot '.cache/creative-hub/processes.json'
if (Test-Path -LiteralPath $taskPidFile) {
    $taskProcesses = Get-Content -LiteralPath $taskPidFile -Raw | ConvertFrom-Json
    foreach ($taskProcessId in @($taskProcesses.children) + @($taskProcesses.launcher)) {
        $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskProcessId" -ErrorAction SilentlyContinue
        if ($taskProcess -and $taskProcess.Name -in @('node.exe', 'python.exe') -and $taskProcess.CommandLine -and $taskProcess.CommandLine.Contains($PSScriptRoot)) { Stop-Process -Id $taskProcessId }
    }
    Write-Host 'Creative Hub source servers stopped.'
}

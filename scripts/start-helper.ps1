param([ValidateRange(0, 120)][int]$RetrySeconds = 60)
$ErrorActionPreference = 'Stop'
# Installed beside helper.cjs, independent of the source checkout and login cwd.
$taskHelper = $PSScriptRoot
$taskNode = Join-Path $taskHelper 'bin\node.exe'
$taskCli = Join-Path $taskHelper 'helper.cjs'
$taskErrorPath = Join-Path $taskHelper 'startup-error.txt'
try {
    $taskDeadline = [DateTime]::UtcNow.AddSeconds($RetrySeconds)
    while (-not ((Test-Path -LiteralPath $taskNode -PathType Leaf) -and (Test-Path -LiteralPath $taskCli -PathType Leaf))) {
        if ([DateTime]::UtcNow -ge $taskDeadline) { throw 'Missing helper files.' }
        Start-Sleep -Milliseconds 1000
    }
    Start-Process -FilePath $taskNode -ArgumentList @(('"' + $taskCli + '"'), '--watch') -WorkingDirectory $taskHelper -WindowStyle Hidden
    if (Test-Path -LiteralPath $taskErrorPath) { Remove-Item -LiteralPath $taskErrorPath }
} catch {
    # Fixed diagnostic only: never log credentials or exception payloads.
    [IO.File]::WriteAllText($taskErrorPath, 'The helper could not launch. Rerun install-helper.ps1 to repair its local files and startup shortcut.', [Text.UTF8Encoding]::new($false))
    exit 1
}

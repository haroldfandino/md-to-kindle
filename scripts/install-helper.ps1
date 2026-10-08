param([string]$NodePath = '', [switch]$SkipStartup, [switch]$SkipStart)
$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskRoot = Join-Path $env:LOCALAPPDATA 'md-to-kindle'
$taskHelper = Join-Path $taskRoot 'helper'
$taskManifestPath = Join-Path $taskProject 'dist\md-to-kindle\manifest.json'
if (-not (Test-Path -LiteralPath $taskManifestPath) -or -not (Test-Path -LiteralPath (Join-Path $taskProject 'helper.cjs'))) { throw 'Run npm run release first.' }
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$taskNode = (Resolve-Path -LiteralPath $NodePath).Path
$taskMajor = [int]((& $taskNode --version).TrimStart('v').Split('.')[0])
if ($taskMajor -lt 22) { throw 'The helper requires Node.js 22 or newer.' }
$taskOldNode = Join-Path $taskHelper 'bin\node.exe'
$taskOldCli = Join-Path $taskHelper 'helper.cjs'
if ((Test-Path -LiteralPath $taskOldNode) -and (Test-Path -LiteralPath $taskOldCli)) {
    & $taskOldNode $taskOldCli --stop
    # An interrupted shutdown/reboot can leave a lock with no live owner.
    $taskLockPath = Join-Path $taskRoot 'helper.lock'
    if (Test-Path -LiteralPath $taskLockPath) {
        $taskLock = Get-Content -LiteralPath $taskLockPath -Raw | ConvertFrom-Json
        $taskLockPid = 0
        if ([int]::TryParse([string]$taskLock.pid, [ref]$taskLockPid) -and $taskLockPid -gt 0 -and -not (Get-Process -Id $taskLockPid -ErrorAction SilentlyContinue)) {
            Remove-Item -LiteralPath $taskLockPath
        }
    }
    for ($taskWait = 0; $taskWait -lt 20 -and (Test-Path -LiteralPath (Join-Path $taskRoot 'helper.lock')); $taskWait++) { Start-Sleep -Milliseconds 500 }
    if (Test-Path -LiteralPath (Join-Path $taskRoot 'helper.lock')) { throw 'The previous helper has not stopped. Retry after it exits.' }
}
New-Item -ItemType Directory -Path (Join-Path $taskHelper 'bin'),(Join-Path $taskHelper 'plugin') -Force | Out-Null
Copy-Item -LiteralPath $taskNode -Destination $taskOldNode -Force
$taskNodeLicense = Join-Path (Split-Path -Parent $taskNode) 'LICENSE'
if (Test-Path -LiteralPath $taskNodeLicense) { Copy-Item -LiteralPath $taskNodeLicense -Destination (Join-Path $taskHelper 'bin\NODE_LICENSE') -Force }
Copy-Item -LiteralPath (Join-Path $taskProject 'helper.cjs') -Destination $taskOldCli -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start-helper.ps1') -Destination (Join-Path $taskHelper 'start-helper.ps1') -Force
foreach ($taskFile in @('main.js','manifest.json','styles.css','LICENSE','THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $taskProject "dist\md-to-kindle\$taskFile") -Destination (Join-Path $taskHelper "plugin\$taskFile") -Force
}
$taskConfigPath = Join-Path $taskRoot 'helper-config.json'
if (-not (Test-Path -LiteralPath $taskConfigPath)) {
    [IO.File]::WriteAllText($taskConfigPath, "{`"enabled`":true,`"excludedVaults`":[],`"configFolders`":{}}`n", [Text.UTF8Encoding]::new($false))
}
if (-not $SkipStartup) {
    & (Join-Path $PSScriptRoot 'register-helper-startup.ps1') -HelperDirectory $taskHelper
}
if (-not $SkipStart) {
    & (Join-Path $taskHelper 'start-helper.ps1')
}
Write-Output "Installed the all-vault helper at $taskHelper. It starts silently at Windows sign-in unless -SkipStartup was used."
Write-Output 'In your already configured vault, use Share this setup on this computer. New vaults must allow community plugins; already-open vaults may need one reload.'

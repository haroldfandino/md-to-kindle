param(
    [string]$HelperDirectory = (Join-Path $env:LOCALAPPDATA 'md-to-kindle\helper'),
    [string]$StartupDirectory = ([Environment]::GetFolderPath('Startup'))
)
$ErrorActionPreference = 'Stop'
$taskHelper = (Resolve-Path -LiteralPath $HelperDirectory).Path
$taskStartup = (Resolve-Path -LiteralPath $StartupDirectory).Path
foreach ($taskFile in @('bin\node.exe', 'helper.cjs', 'start-helper.ps1')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskHelper $taskFile) -PathType Leaf)) { throw 'The helper installation is incomplete. Rerun install-helper.ps1.' }
}
$taskPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut((Join-Path $taskStartup 'md-to-kindle-helper.lnk'))
$taskShortcut.TargetPath = $taskPowerShell
$taskShortcut.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $taskHelper 'start-helper.ps1') + '"'
$taskShortcut.WorkingDirectory = $taskHelper
$taskShortcut.Description = 'Keep md-to-kindle available across Obsidian vaults'
$taskShortcut.WindowStyle = 7
$taskShortcut.Save()
# Remove only our old launcher, after the replacement has been saved.
$taskLegacy = Join-Path $taskStartup 'md-to-kindle-helper.vbs'
if (Test-Path -LiteralPath $taskLegacy) { Remove-Item -LiteralPath $taskLegacy }
Write-Output 'Registered the hidden md-to-kindle helper for Windows sign-in.'

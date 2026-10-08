param([string]$AppFolder = '')
$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
if (-not $AppFolder) { $AppFolder = Join-Path $taskProject 'dist\standalone\win-unpacked' }
$taskSource = (Resolve-Path -LiteralPath $AppFolder).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskSource 'md-to-kindle.exe'))) { throw 'Choose the extracted standalone folder containing md-to-kindle.exe.' }
if (Get-Process -Name 'md-to-kindle' -ErrorAction SilentlyContinue) { throw 'Close the standalone sender before installing an update.' }
$taskDestination = Join-Path $env:LOCALAPPDATA 'Programs\md-to-kindle'
New-Item -ItemType Directory -Path $taskDestination -Force | Out-Null
if ($taskSource -ne $taskDestination) { Get-ChildItem -LiteralPath $taskSource -Force | Copy-Item -Destination $taskDestination -Recurse -Force }
$taskExe = Join-Path $taskDestination 'md-to-kindle.exe'
& (Join-Path $PSScriptRoot 'remove-legacy-desktop.ps1')
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'md-to-kindle.lnk'
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut($taskStartMenu)
$taskShortcut.TargetPath = $taskExe
$taskShortcut.WorkingDirectory = $taskDestination
$taskShortcut.Save()
$taskDesktopShortcut = $taskShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'md-to-kindle.lnk'))
$taskDesktopShortcut.TargetPath = $taskExe
$taskDesktopShortcut.WorkingDirectory = $taskDestination
$taskDesktopShortcut.Save()
Write-Output "Installed standalone sender at $taskDestination. Open md-to-kindle from Start or the desktop, then choose files or a folder."
Write-Output 'The existing md-to-kindle shared profile is reused. File-opening defaults are preserved.'

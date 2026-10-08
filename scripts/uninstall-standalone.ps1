$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'remove-legacy-desktop.ps1')
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'md-to-kindle.lnk'
if (Test-Path -LiteralPath $taskStartMenu) { Remove-Item -LiteralPath $taskStartMenu }
$taskDesktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'md-to-kindle.lnk'
if (Test-Path -LiteralPath $taskDesktop) { Remove-Item -LiteralPath $taskDesktop }
Write-Output 'Removed app shortcuts and legacy desktop actions. App files and the shared email profile were preserved.'

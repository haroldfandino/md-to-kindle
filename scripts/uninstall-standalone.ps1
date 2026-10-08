$ErrorActionPreference = 'Stop'
foreach ($taskExtension in @('.md','.markdown')) {
    $taskVerb = "HKCU:\Software\Classes\SystemFileAssociations\$taskExtension\shell\md-to-kindle"
    if (Test-Path -LiteralPath $taskVerb) { Remove-Item -LiteralPath $taskVerb -Recurse }
}
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'md-to-kindle.lnk'
if (Test-Path -LiteralPath $taskStartMenu) { Remove-Item -LiteralPath $taskStartMenu }
Write-Output 'Removed the Explorer menu and Start-menu shortcut. App files and the shared email profile were preserved.'

$ErrorActionPreference = 'Stop'
$taskRelativeKeys = @('*\shell\md-to-kindle','SystemFileAssociations\.md\shell\md-to-kindle','SystemFileAssociations\.markdown\shell\md-to-kindle')
$taskStatePath = Join-Path $env:LOCALAPPDATA 'Programs\md-to-kindle\explorer-registration.json'
if (Test-Path -LiteralPath $taskStatePath) {
    $taskState = Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json
    $taskRelativeKeys += @($taskState.keys | Where-Object { $_ -is [string] -and $_ -match '^[A-Za-z0-9_.*{}\\-]+\\shell\\md-to-kindle$' -and -not ($_.Split('\') -contains '..') })
}
foreach ($taskRelativeKey in ($taskRelativeKeys | Select-Object -Unique)) {
    $taskVerb = 'Registry::HKEY_CURRENT_USER\Software\Classes\' + $taskRelativeKey
    if (Test-Path -LiteralPath $taskVerb) { Remove-Item -LiteralPath $taskVerb -Recurse }
}
if (Test-Path -LiteralPath $taskStatePath) { Remove-Item -LiteralPath $taskStatePath }
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'md-to-kindle.lnk'
if (Test-Path -LiteralPath $taskStartMenu) { Remove-Item -LiteralPath $taskStartMenu }
Write-Output 'Removed the Explorer menu and Start-menu shortcut. App files and the shared email profile were preserved.'

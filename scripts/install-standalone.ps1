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
foreach ($taskExtension in @('.md','.markdown')) {
    $taskVerb = "HKCU:\Software\Classes\SystemFileAssociations\$taskExtension\shell\md-to-kindle"
    New-Item -Path "$taskVerb\command" -Force | Out-Null
    Set-Item -LiteralPath $taskVerb -Value 'Send to Kindle'
    New-ItemProperty -LiteralPath $taskVerb -Name Icon -Value ('"' + $taskExe + '"') -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $taskVerb -Name MultiSelectModel -Value 'Single' -PropertyType String -Force | Out-Null
    Set-Item -LiteralPath "$taskVerb\command" -Value ('"' + $taskExe + '" --file "%1"')
}
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'md-to-kindle.lnk'
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut($taskStartMenu)
$taskShortcut.TargetPath = $taskExe
$taskShortcut.WorkingDirectory = $taskDestination
$taskShortcut.Save()
Write-Output "Installed standalone sender at $taskDestination. Right-click an MD file > Show more options > Send to Kindle."
Write-Output 'The existing md-to-kindle shared profile is reused. File-opening defaults are preserved.'

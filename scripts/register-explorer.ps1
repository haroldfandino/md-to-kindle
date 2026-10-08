param(
    [string]$AppPath = '',
    [string]$RegistryRoot = 'Registry::HKEY_CURRENT_USER\Software\Classes',
    [string]$StateFile = '',
    [switch]$NoNotify
)
$ErrorActionPreference = 'Stop'
if (-not $AppPath) { $AppPath = Join-Path $env:LOCALAPPDATA 'Programs\md-to-kindle\md-to-kindle.exe' }
$taskExe = (Resolve-Path -LiteralPath $AppPath).Path
if (-not (Test-Path -LiteralPath $taskExe -PathType Leaf)) { throw 'The standalone sender executable was not found.' }
if (-not $StateFile) { $StateFile = Join-Path (Split-Path -Parent $taskExe) 'explorer-registration.json' }
$taskRelativeKeys = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
[void]$taskRelativeKeys.Add('*\shell\md-to-kindle')
if (Test-Path -LiteralPath $StateFile) {
    $taskPrevious = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    foreach ($taskPreviousKey in $taskPrevious.keys) {
        if ($taskPreviousKey -is [string] -and $taskPreviousKey -match '^[A-Za-z0-9_.*{}\\-]+\\shell\\md-to-kindle$' -and -not ($taskPreviousKey.Split('\') -contains '..')) {
            [void]$taskRelativeKeys.Add($taskPreviousKey)
        }
    }
}
foreach ($taskExtension in @('.md','.markdown')) {
    [void]$taskRelativeKeys.Add("SystemFileAssociations\$taskExtension\shell\md-to-kindle")
    $taskChoice = Get-ItemProperty -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$taskExtension\UserChoice" -ErrorAction SilentlyContinue
    $taskTypeKey = Get-Item -LiteralPath "Registry::HKEY_CLASSES_ROOT\$taskExtension" -ErrorAction SilentlyContinue
    $taskProgIds = @($taskChoice.ProgId)
    if ($taskTypeKey) { $taskProgIds += $taskTypeKey.GetValue('') }
    foreach ($taskProgId in $taskProgIds) {
        if ($taskProgId -and $taskProgId -match '^[A-Za-z0-9_.{}\\-]+$' -and -not ($taskProgId.Split('\') -contains '..')) {
            [void]$taskRelativeKeys.Add("$taskProgId\shell\md-to-kindle")
        }
    }
}
$taskFilter = 'System.FileExtension:=".md" OR System.FileExtension:=".markdown"'
foreach ($taskRelativeKey in $taskRelativeKeys) {
    $taskVerb = $RegistryRoot.TrimEnd('\') + '\' + $taskRelativeKey
    New-Item -Path "$taskVerb\command" -Force | Out-Null
    Set-Item -LiteralPath $taskVerb -Value 'Send to Kindle'
    New-ItemProperty -LiteralPath $taskVerb -Name MUIVerb -Value 'Send to Kindle' -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $taskVerb -Name Icon -Value ('"' + $taskExe + '"') -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $taskVerb -Name MultiSelectModel -Value 'Single' -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $taskVerb -Name AppliesTo -Value $taskFilter -PropertyType String -Force | Out-Null
    Set-Item -LiteralPath "$taskVerb\command" -Value ('"' + $taskExe + '" --file "%1"')
}
# Keep only owned leaf registrations for uninstall; never remove a handler,
# extension key, UserChoice, or another application's open command.
$taskState = [PSCustomObject]@{ version = 1; keys = @($taskRelativeKeys) }
[IO.File]::WriteAllText($StateFile, (($taskState | ConvertTo-Json -Depth 3).Replace("`r`n","`n") + "`n"), [Text.UTF8Encoding]::new($false))
if (-not $NoNotify) {
    if (-not ('MdToKindleShellNotify' -as [type])) {
        Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class MdToKindleShellNotify { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint events, uint flags, IntPtr item1, IntPtr item2); }'
    }
    [MdToKindleShellNotify]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
}
Write-Output 'Registered Send to Kindle for Markdown files and refreshed Explorer associations. Close the current menu and right-click again.'

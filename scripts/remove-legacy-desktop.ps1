param(
    [string]$RegistryRoot = 'Registry::HKEY_CURRENT_USER\Software\Classes',
    [string]$StateFile = (Join-Path $env:LOCALAPPDATA 'Programs\md-to-kindle\explorer-registration.json'),
    [string]$StartupDirectory = ([Environment]::GetFolderPath('Startup')),
    [string]$HelperRoot = (Join-Path $env:LOCALAPPDATA 'md-to-kindle'),
    [switch]$RemoveHelperStartup,
    [switch]$NoNotify
)
$ErrorActionPreference = 'Stop'
$taskClasses = $RegistryRoot.TrimEnd('\')
$taskKeys = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($taskRelative in @('*\shell\md-to-kindle','SystemFileAssociations\.md\shell\md-to-kindle','SystemFileAssociations\.markdown\shell\md-to-kindle')) { [void]$taskKeys.Add($taskRelative) }
if (Test-Path -LiteralPath $StateFile) {
    $taskState = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    foreach ($taskRelative in $taskState.keys) {
        if ($taskRelative -is [string] -and $taskRelative -match '^[A-Za-z0-9_.*{}\\-]+\\shell\\md-to-kindle$' -and -not ($taskRelative.Split('\') -contains '..')) { [void]$taskKeys.Add($taskRelative) }
    }
}
# Old versions registered active Markdown handlers, which may since have changed.
if (Test-Path -LiteralPath $taskClasses) {
    foreach ($taskHandler in (Get-ChildItem -LiteralPath $taskClasses)) {
        [void]$taskKeys.Add($taskHandler.PSChildName + '\shell\md-to-kindle')
    }
    $taskApplications = $taskClasses + '\Applications'
    if (Test-Path -LiteralPath $taskApplications) {
        foreach ($taskHandler in (Get-ChildItem -LiteralPath $taskApplications)) { [void]$taskKeys.Add('Applications\' + $taskHandler.PSChildName + '\shell\md-to-kindle') }
    }
}
foreach ($taskRelative in $taskKeys) {
    $taskVerb = $taskClasses + '\' + $taskRelative
    if (-not $taskVerb.StartsWith($taskClasses + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $taskVerb.EndsWith('\shell\md-to-kindle', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid legacy registration path.' }
    if (Test-Path -LiteralPath $taskVerb) { Remove-Item -LiteralPath $taskVerb -Recurse }
}
if (Test-Path -LiteralPath $StateFile) { Remove-Item -LiteralPath $StateFile }
if ($RemoveHelperStartup) {
    $taskRoot = $HelperRoot
    $taskNode = Join-Path $taskRoot 'helper\bin\node.exe'
    $taskCli = Join-Path $taskRoot 'helper\helper.cjs'
    if ((Test-Path -LiteralPath $taskNode) -and (Test-Path -LiteralPath $taskCli)) { & $taskNode $taskCli --stop }
    foreach ($taskName in @('md-to-kindle-helper.lnk','md-to-kindle-helper.vbs','md-to-kindle.lnk','md-to-kindle.vbs')) {
        $taskStartupFile = Join-Path $StartupDirectory $taskName
        if (Test-Path -LiteralPath $taskStartupFile) { Remove-Item -LiteralPath $taskStartupFile }
    }
}
if (-not $NoNotify) {
    if (-not ('MdToKindleCleanupNotify' -as [type])) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class MdToKindleCleanupNotify { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint events, uint flags, IntPtr item1, IntPtr item2); }' }
    [MdToKindleCleanupNotify]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
}
Write-Output 'Removed old md-to-kindle Explorer actions. Email settings and Obsidian plugins were preserved.'

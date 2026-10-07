param(
    [Parameter(Mandatory = $true)][string]$VaultPath,
    [string]$ConfigDir = '.obsidian',
    [switch]$UseLocalRecipient
)
$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskVault = (Resolve-Path -LiteralPath $VaultPath).Path
if (-not (Test-Path -LiteralPath $taskVault -PathType Container)) { throw 'VaultPath must be an existing vault directory.' }
if ([IO.Path]::IsPathRooted($ConfigDir) -or $ConfigDir -match '(^|[\\/])\.\.([\\/]|$)') { throw 'ConfigDir must be a relative directory inside the vault.' }
$taskConfig = [IO.Path]::GetFullPath((Join-Path $taskVault $ConfigDir))
if (-not $taskConfig.StartsWith($taskVault.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'The configuration directory must stay inside the vault.' }
$taskDestination = Join-Path $taskConfig 'plugins\kindle-courier'
New-Item -ItemType Directory -Path $taskDestination -Force | Out-Null
foreach ($taskFile in @('main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    $taskSource = Join-Path $taskProject "dist\kindle-courier\$taskFile"
    if (-not (Test-Path -LiteralPath $taskSource)) { throw 'Build the release first with npm run release.' }
    Copy-Item -LiteralPath $taskSource -Destination (Join-Path $taskDestination $taskFile) -Force
}
if ($UseLocalRecipient) {
    $taskPreset = Join-Path $taskProject '.local\data.json'
    if (-not (Test-Path -LiteralPath $taskPreset)) { throw 'No local recipient preset is available.' }
    $taskDataPath = Join-Path $taskDestination 'data.json'
    $taskRecipient = (Get-Content -LiteralPath $taskPreset -Raw | ConvertFrom-Json).kindleEmail
    if (Test-Path -LiteralPath $taskDataPath) {
        $taskData = Get-Content -LiteralPath $taskDataPath -Raw | ConvertFrom-Json
        $taskData | Add-Member -NotePropertyName kindleEmail -NotePropertyValue $taskRecipient -Force
    } else { $taskData = Get-Content -LiteralPath $taskPreset -Raw | ConvertFrom-Json }
    $taskData | ConvertTo-Json | Set-Content -LiteralPath $taskDataPath -Encoding utf8
}
Write-Output "Installed Kindle Courier at $taskDestination. Enable it in Obsidian Settings > Community plugins and configure your SMTP account."

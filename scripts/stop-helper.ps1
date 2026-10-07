param([switch]$DisableStartup)
$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path $env:LOCALAPPDATA 'md-to-kindle'
$taskNode = Join-Path $taskRoot 'helper\bin\node.exe'
$taskCli = Join-Path $taskRoot 'helper\helper.cjs'
if ((Test-Path -LiteralPath $taskNode) -and (Test-Path -LiteralPath $taskCli)) { & $taskNode $taskCli --stop }
if ($DisableStartup) {
    $taskStartupPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'md-to-kindle-helper.vbs'
    if (Test-Path -LiteralPath $taskStartupPath) { Remove-Item -LiteralPath $taskStartupPath }
}
Write-Output 'The helper stop was requested. Its shared profile and installed vault plugins are preserved.'

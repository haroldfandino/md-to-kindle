import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';

test('legacy cleanup removes only owned verbs and startup entries, preserving editor defaults, profiles and other apps', { skip: platform() !== 'win32' }, async () => {
  await mkdir('artifacts/cleanup-tests', { recursive: true });
  const directory = await mkdtemp(resolve('artifacts/cleanup-tests/run-'));
  const root = `Registry::HKEY_CURRENT_USER\\Software\\md-to-kindle-cleanup-tests\\${randomUUID()}`;
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const code = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try {
    $root=${quote(root)}; $directory=${quote(directory)};
    New-Item -Path ($root+'\\Applications\\FormerEditor.exe\\shell\\md-to-kindle\\command') -Force | Out-Null;
    New-Item -Path ($root+'\\TestEditor\\shell\\open\\command') -Force | Out-Null;
    Set-Item -LiteralPath ($root+'\\TestEditor\\shell\\open\\command') -Value 'keep-default-editor';
    New-Item -Path ($root+'\\TestEditor\\shell\\md-to-kindle\\command') -Force | Out-Null;
    New-Item -Path ($root+'\\TestEditor\\shell\\other-app\\command') -Force | Out-Null;
    New-Item -ItemType Directory -Path ($directory+'\\Startup'),($directory+'\\Profile') | Out-Null;
    Set-Content -LiteralPath ($directory+'\\Profile\\profile.json') -Value 'protected-fixture';
    foreach ($name in @('md-to-kindle-helper.vbs','md-to-kindle-helper.lnk','other-app.lnk')) { Set-Content -LiteralPath ($directory+'\\Startup\\'+$name) -Value 'fixture' };
    [pscustomobject]@{keys=@('..\\outside\\shell\\md-to-kindle')} | ConvertTo-Json | Set-Content -LiteralPath ($directory+'\\registration.json');
    & ${quote(resolve('scripts/remove-legacy-desktop.ps1'))} -RegistryRoot $root -StateFile ($directory+'\\registration.json') -StartupDirectory ($directory+'\\Startup') -HelperRoot ($directory+'\\Profile') -RemoveHelperStartup -NoNotify;
    & ${quote(resolve('scripts/remove-legacy-desktop.ps1'))} -RegistryRoot $root -StateFile ($directory+'\\registration.json') -StartupDirectory ($directory+'\\Startup') -HelperRoot ($directory+'\\Profile') -RemoveHelperStartup -NoNotify;
    if (Test-Path -LiteralPath ($root+'\\TestEditor\\shell\\md-to-kindle')) { throw 'Owned verb remains' };
    if (Test-Path -LiteralPath ($root+'\\Applications\\FormerEditor.exe\\shell\\md-to-kindle')) { throw 'Former handler verb remains' };
    if ((Get-Item -LiteralPath ($root+'\\TestEditor\\shell\\open\\command')).GetValue('') -ne 'keep-default-editor') { throw 'Default editor changed' };
    if (-not (Test-Path -LiteralPath ($root+'\\TestEditor\\shell\\other-app'))) { throw 'Other app removed' };
    if (Test-Path -LiteralPath ($directory+'\\Startup\\md-to-kindle-helper.lnk')) { throw 'Startup remains' };
    if (-not (Test-Path -LiteralPath ($directory+'\\Startup\\other-app.lnk'))) { throw 'Other startup removed' };
    if ((Get-Content -LiteralPath ($directory+'\\Profile\\profile.json')).Trim() -ne 'protected-fixture') { throw 'Profile changed' };
  } finally { if (Test-Path -LiteralPath ${quote(root)}) { Remove-Item -LiteralPath ${quote(root)} -Recurse } }`;
  const result = await new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
    const child = spawn(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true });
    let output = ''; child.stdout.on('data', chunk => { output += String(chunk); }); child.stderr.on('data', chunk => { output += String(chunk); });
    child.on('error', reject); child.on('close', code => resolveResult({ code, output }));
  });
  assert.equal(result.code, 0, result.output);
});

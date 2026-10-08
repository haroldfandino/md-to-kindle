import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';

test('Explorer registration is filtered, idempotent and refreshable under active file handlers', { skip: platform() !== 'win32' }, async () => {
  await mkdir('artifacts/explorer-tests', { recursive: true });
  const directory = await mkdtemp(resolve('artifacts/explorer-tests/run-'));
  const root = `Registry::HKEY_CURRENT_USER\\Software\\md-to-kindle-registration-tests\\${randomUUID()}`;
  const state = join(directory, 'registration.json');
  const script = resolve('scripts/register-explorer.ps1');
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const code = `$ErrorActionPreference='Stop'; try {
    & ${quote(script)} -AppPath ${quote(process.execPath)} -RegistryRoot ${quote(root)} -StateFile ${quote(state)} -NoNotify;
    & ${quote(script)} -AppPath ${quote(process.execPath)} -RegistryRoot ${quote(root)} -StateFile ${quote(state)} -NoNotify;
    $record=Get-Content -LiteralPath ${quote(state)} -Raw | ConvertFrom-Json;
    if (@($record.keys | Select-Object -Unique).Count -ne @($record.keys).Count) { throw 'Duplicate registrations' };
    foreach ($relative in $record.keys) {
      $path=${quote(root)}+'\\'+$relative;
      $properties=Get-ItemProperty -LiteralPath $path;
      if ($properties.MUIVerb -ne 'Send to Kindle') { throw 'Missing label' };
      if ($properties.AppliesTo -ne 'System.FileExtension:=".md" OR System.FileExtension:=".markdown"') { throw 'Missing Markdown filter' };
      if ($properties.MultiSelectModel -ne 'Single') { throw 'Incorrect selection policy' };
      if ((Get-Item -LiteralPath ($path+'\\command')).GetValue('') -ne ('"'+${quote(process.execPath)}+'" --file "%1"')) { throw 'Incorrect quoted command' };
    };
    if (-not ($record.keys -contains '*\\shell\\md-to-kindle')) { throw 'Missing handler-independent registration' };
    Write-Output 'Isolated Explorer registration checks passed.';
  } finally { if (Test-Path -LiteralPath ${quote(root)}) { Remove-Item -LiteralPath ${quote(root)} -Recurse } }`;
  const result = await new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
    const child = spawn(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.on('error', reject);
    child.on('close', code => resolveResult({ code, output }));
  });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /checks passed/);
});

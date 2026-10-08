import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, writeFile, readFile, rename, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { build } from 'esbuild';

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
async function powershell(code: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ${code}`, 'utf16le').toString('base64')],
      { env, windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.on('error', reject);
    child.on('close', code => resolveResult({ code, output }));
  });
}
async function until(check: () => Promise<boolean>, timeout = 12_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error('Startup helper did not reach its expected state.');
}

test('Windows startup migrates the old script and launches from quoted local paths after files become available', { skip: platform() !== 'win32', timeout: 30_000 }, async () => {
  await mkdir('artifacts/helper-startup-tests', { recursive: true });
  const sandbox = await mkdtemp(resolve('artifacts/helper-startup-tests/login with spaces-'));
  const local = join(sandbox, 'Local');
  const roaming = join(sandbox, 'Roaming');
  const root = join(local, 'md-to-kindle');
  const helper = join(root, 'helper');
  const startup = join(sandbox, 'Startup');
  const cli = join(helper, 'helper.cjs');
  const env = { ...process.env, LOCALAPPDATA: local, APPDATA: roaming };
  await mkdir(join(helper, 'bin'), { recursive: true });
  await mkdir(join(helper, 'plugin'), { recursive: true });
  await mkdir(join(roaming, 'obsidian'), { recursive: true });
  await mkdir(startup);
  await copyFile(process.execPath, join(helper, 'bin', 'node.exe'));
  await copyFile(resolve('scripts/start-helper.ps1'), join(helper, 'start-helper.ps1'));
  await build({ entryPoints: ['src/helper-cli.ts'], outfile: cli, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  for (const name of ['main.js', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await writeFile(join(helper, 'plugin', name), 'test fixture');
  await writeFile(join(helper, 'plugin', 'manifest.json'), '{"id":"md-to-kindle","isDesktopOnly":true,"version":"0.3.0"}');
  await writeFile(join(roaming, 'obsidian', 'obsidian.json'), '{"vaults":{}}');
  await writeFile(join(root, 'helper-config.json'), '{"enabled":true}');
  const profile = 'protected-profile-fixture';
  await writeFile(join(root, 'profile.json'), profile);
  await writeFile(join(startup, 'md-to-kindle-helper.vbs'), 'obsolete launcher');
  await writeFile(join(startup, 'other-app.vbs'), 'unrelated startup entry');
  const shortcut = join(startup, 'md-to-kindle-helper.lnk');
  const registration = `& ${quote(resolve('scripts/register-helper-startup.ps1'))} -HelperDirectory ${quote(helper)} -StartupDirectory ${quote(startup)}`;
  const registered = await powershell(`${registration}; ${registration}`, env);
  assert.equal(registered.code, 0, registered.output);
  await assert.rejects(access(join(startup, 'md-to-kindle-helper.vbs')));
  assert.equal(await readFile(join(startup, 'other-app.vbs'), 'utf8'), 'unrelated startup entry');

  // Simulate runtime files being temporarily unavailable at sign-in.
  const waiting = join(helper, 'helper.waiting.cjs');
  await rename(cli, waiting);
  try {
    const launched = await powershell(`
      $shell=New-Object -ComObject WScript.Shell;
      $link=$shell.CreateShortcut(${quote(shortcut)});
      if ($link.WorkingDirectory -ne ${quote(helper)}) { throw 'Incorrect working directory' };
      if ($link.Arguments -notmatch '-WindowStyle Hidden') { throw 'Startup must be hidden' };
      Set-Location -LiteralPath ${quote(sandbox)};
      Start-Process -FilePath $link.TargetPath -ArgumentList $link.Arguments -WorkingDirectory $link.WorkingDirectory -WindowStyle Hidden;
    `, env);
    assert.equal(launched.code, 0, launched.output);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1200));
    await rename(waiting, cli);
    await until(async () => JSON.parse(await readFile(join(root, 'status.json'), 'utf8')).running === true);
    assert.equal(await readFile(join(root, 'profile.json'), 'utf8'), profile);
    await assert.rejects(access(join(helper, 'startup-error.txt')));
  } finally {
    await rename(waiting, cli).catch(() => {});
    const stopped = await powershell(`& ${quote(join(helper, 'bin', 'node.exe'))} ${quote(cli)} --stop`, env);
    assert.equal(stopped.code, 0, stopped.output);
    await until(async () => JSON.parse(await readFile(join(root, 'status.json'), 'utf8')).running === false);
  }

  await rename(cli, waiting);
  const failed = await powershell(`& ${quote(join(helper, 'start-helper.ps1'))} -RetrySeconds 0`, env);
  assert.equal(failed.code, 1);
  assert.match(await readFile(join(helper, 'startup-error.txt'), 'utf8'), /Rerun install-helper.ps1/);
  assert.equal(await readFile(join(root, 'profile.json'), 'utf8'), profile);
  await rename(waiting, cli);

  // Reinstallation after an interrupted shutdown must not wait on a dead PID.
  const finished = await powershell("Write-Output ('FINISHED_PID='+$PID)", env);
  assert.equal(finished.code, 0, finished.output);
  const finishedPid = Number(finished.output.match(/FINISHED_PID=(\d+)/)?.[1]);
  assert.ok(Number.isInteger(finishedPid) && finishedPid > 0, finished.output);
  await writeFile(join(root, 'helper.lock'), JSON.stringify({ pid: finishedPid, token: 'stale-token' }));
  const source = join(sandbox, 'Source checkout');
  await mkdir(join(source, 'scripts'), { recursive: true });
  await mkdir(join(source, 'dist', 'md-to-kindle'), { recursive: true });
  for (const name of ['install-helper.ps1', 'start-helper.ps1']) await copyFile(resolve('scripts', name), join(source, 'scripts', name));
  await copyFile(cli, join(source, 'helper.cjs'));
  for (const name of ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(helper, 'plugin', name), join(source, 'dist', 'md-to-kindle', name));
  const repaired = await powershell(`& ${quote(join(source, 'scripts', 'install-helper.ps1'))} -NodePath ${quote(process.execPath)} -SkipStartup -SkipStart`, env);
  assert.equal(repaired.code, 0, repaired.output);
  await assert.rejects(access(join(root, 'helper.lock')));
  assert.equal(await readFile(join(root, 'profile.json'), 'utf8'), profile);
});

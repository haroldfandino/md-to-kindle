import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { build } from 'esbuild';

async function until(check: () => Promise<boolean>, timeout = 12_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The helper did not reach the expected state in time.');
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
}

test('background process discovers a future vault, rejects duplicate instances, survives registry errors and stops', { skip: platform() !== 'win32' }, async () => {
  await mkdir('artifacts/helper-process-tests', { recursive: true });
  const sandbox = await mkdtemp(resolve('artifacts/helper-process-tests/run-'));
  const local = join(sandbox, 'Local');
  const appdata = join(sandbox, 'Roaming');
  const root = join(local, 'md-to-kindle');
  const registry = join(appdata, 'obsidian', 'obsidian.json');
  const executable = join(sandbox, 'helper.cjs');
  await mkdir(join(root, 'helper', 'plugin'), { recursive: true });
  await mkdir(join(appdata, 'obsidian'), { recursive: true });
  await writeFile(join(root, 'helper-config.json'), '{"enabled":true,"excludedVaults":[],"configFolders":{}}');
  await writeFile(join(root, 'profile.json'), 'encrypted-profile-placeholder');
  for (const name of ['main.js', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await writeFile(join(root, 'helper', 'plugin', name), 'test fixture');
  await writeFile(join(root, 'helper', 'plugin', 'manifest.json'), '{"id":"md-to-kindle","isDesktopOnly":true,"version":"0.2.0"}');
  await writeFile(registry, '{"vaults":{}}');
  await build({ entryPoints: ['src/helper-cli.ts'], outfile: executable, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const env = { ...process.env, LOCALAPPDATA: local, APPDATA: appdata };
  const child = spawn(process.execPath, [executable, '--watch'], { env, windowsHide: true, stdio: 'ignore' });
  const completed = exited(child);
  try {
    await until(async () => JSON.parse(await readFile(join(root, 'status.json'), 'utf8')).running === true);
    const duplicate = spawn(process.execPath, [executable, '--watch'], { env, windowsHide: true, stdio: 'ignore' });
    assert.equal(await exited(duplicate), 1);
    const vault = join(sandbox, 'FutureVault');
    await mkdir(join(vault, '.obsidian'), { recursive: true });
    await writeFile(join(vault, '.obsidian', 'community-plugins.json'), '[]');
    await writeFile(registry, JSON.stringify({ vaults: { future: { path: vault } } }));
    await until(async () => JSON.parse(await readFile(join(vault, '.obsidian', 'plugins', 'md-to-kindle', 'data.json'), 'utf8')).profileMode === 'shared');
    await writeFile(registry, '{incomplete');
    await until(async () => Boolean(JSON.parse(await readFile(join(root, 'status.json'), 'utf8')).message));
    await writeFile(registry, JSON.stringify({ vaults: { future: { path: vault } } }));
    await until(async () => JSON.parse(await readFile(join(root, 'status.json'), 'utf8')).results?.[0]?.status === 'installed-and-enabled');
    const stop = spawn(process.execPath, [executable, '--stop'], { env, windowsHide: true, stdio: 'ignore' });
    assert.equal(await exited(stop), 0);
    await until(async () => JSON.parse(await readFile(join(root, 'status.json'), 'utf8')).running === false);
    assert.equal(await completed, 0);
  } finally { if (child.exitCode === null) child.kill(); }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const archiveName = `${manifest.id}-${manifest.version}.zip`;
const archiveBytes = await readFile(`dist/${archiveName}`);
const archive = await JSZip.loadAsync(archiveBytes);
const files = Object.keys(archive.files).filter(path => !archive.files[path].dir).sort();
assert.deepEqual(files, ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'main.js', 'manifest.json', 'styles.css'].map(name => `${manifest.id}/${name}`).sort());
let localEmail;
try { localEmail = JSON.parse(await readFile('.local/data.json', 'utf8')).kindleEmail; } catch { /* Public checkouts have no local preset. */ }
for (const path of files) {
  const content = await archive.file(path).async('nodebuffer');
  assert.deepEqual(content, await readFile(`dist/${path}`));
  if (localEmail) assert.equal(content.includes(Buffer.from(localEmail)), false, `Private recipient leaked into ${path}`);
}
const checksums = await readFile('dist/SHA256SUMS.txt', 'utf8');
assert.ok(checksums.includes(`${createHash('sha256').update(archiveBytes).digest('hex')}  ${archiveName}`));
const builtManifest = JSON.parse(await archive.file(`${manifest.id}/manifest.json`).async('string'));
assert.equal(builtManifest.id, 'md-to-kindle');
assert.equal(builtManifest.minAppVersion, '1.11.4');
assert.equal(builtManifest.isDesktopOnly, true);
console.log('Release allowlist, private-recipient exclusion, manifest and archive checksum checks passed.');

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== packageInfo.version) throw new Error('Package and manifest versions must match.');
const output = `dist/${manifest.id}`;
await mkdir(output, { recursive: true });
const zip = new JSZip();
const checksums = [];
// Explicit allowlist prevents local settings, vault content and passwords from
// entering release archives. main.js has blank recipient defaults.
for (const filename of ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  const bytes = await readFile(filename);
  await copyFile(filename, `${output}/${filename}`);
  zip.file(`${manifest.id}/${filename}`, bytes);
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${filename}`);
}
const filename = `dist/${manifest.id}-${manifest.version}.zip`;
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(filename, bytes);
await writeFile('dist/SHA256SUMS.txt', `${checksums.join('\n')}\n${createHash('sha256').update(bytes).digest('hex')}  ${manifest.id}-${manifest.version}.zip\n`);
console.log(`Release prepared: ${filename}`);

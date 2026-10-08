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
const helper = new JSZip();
helper.file('md-to-kindle-helper/helper.cjs', await readFile('helper.cjs'));
for (const name of ['install-helper.ps1', 'stop-helper.ps1', 'start-helper.ps1', 'register-helper-startup.ps1']) helper.file(`md-to-kindle-helper/scripts/${name}`, await readFile(`scripts/${name}`));
for (const name of ['README.md', 'LICENSE', 'docs/AUTOMATIC_SETUP.md']) helper.file(`md-to-kindle-helper/${name}`, await readFile(name));
for (const name of ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) helper.file(`md-to-kindle-helper/dist/md-to-kindle/${name}`, await readFile(name));
const helperName = `md-to-kindle-helper-${manifest.version}.zip`;
const helperBytes = await helper.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(`dist/${helperName}`, helperBytes);
checksums.push(`${createHash('sha256').update(helperBytes).digest('hex')}  ${helperName}`);
await writeFile('dist/SHA256SUMS.txt', `${checksums.join('\n')}\n${createHash('sha256').update(bytes).digest('hex')}  ${manifest.id}-${manifest.version}.zip\n`);
console.log(`Release prepared: ${filename}`);

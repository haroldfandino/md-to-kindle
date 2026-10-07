import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const metadata = JSON.parse(await readFile('artifacts/bundle-meta.json', 'utf8'));
const roots = new Set();
for (const input of Object.keys(metadata.inputs).filter(path => path.includes('node_modules/'))) {
  let directory = dirname(resolve(input));
  while (directory.includes('node_modules')) {
    try {
      const info = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (info.name && info.version) { roots.add(directory); break; }
    } catch { /* ESM subdirectories can contain a package.json without a name. */ }
    directory = dirname(directory);
  }
}
let output = '# Bundled dependency notices\n\nThese packages are included in the production bundle. Obsidian is supplied by the host and is not bundled.\n';
for (const root of [...roots].sort()) {
  const info = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  output += `\n## ${info.name} ${info.version}\n\nLicense: ${typeof info.license === 'string' ? info.license : JSON.stringify(info.license)}\n`;
  const files = (await readdir(root, { withFileTypes: true })).filter(file => file.isFile() && /^(?:licen[sc]e|copying)(?:[.-]|$)/i.test(file.name));
  if (!files.length) {
    const readme = (await readdir(root)).find(filename => /^readme(?:\.|$)/i.test(filename));
    const text = readme ? await readFile(join(root, readme), 'utf8') : '';
    const section = text.match(/(?:^|\n)#{1,6}\s+Licen[sc]e\s*\r?\n([\s\S]*)/i)?.[1];
    if (!section || !section.includes('Permission is hereby granted')) throw new Error(`Missing bundled license text for ${info.name}`);
    output += `\n### License section from ${readme}\n\n\`\`\`text\n${section.trim()}\n\`\`\`\n`;
  }
  for (const file of files) output += `\n### ${file.name}\n\n\`\`\`text\n${(await readFile(join(root, file.name), 'utf8')).trim()}\n\`\`\`\n`;
}
await writeFile('THIRD_PARTY_NOTICES.md', output.replace(/[ \t]+$/gm, ''));
console.log(`Collected license notices for ${roots.size} bundled packages.`);

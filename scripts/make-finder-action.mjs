import { mkdir, writeFile } from 'node:fs/promises';

function xml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function plist(value) {
  if (Array.isArray(value)) return `<array>${value.map(plist).join('')}</array>`;
  if (typeof value === 'object') return `<dict>${Object.entries(value).map(([key, entry]) => `<key>${xml(key)}</key>${plist(entry)}`).join('')}</dict>`;
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number') return `<integer>${value}</integer>`;
  return `<string>${xml(value)}</string>`;
}
function document(value) { return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plist(value)}</plist>\n`; }
const shell = `if [[ "$#" -ne 1 ]]; then
  /usr/bin/osascript -e 'display alert "Send to Kindle" message "Select one Markdown file."'
  exit 1
fi
task_file="$1"
case "\${task_file:l}" in
  *.md|*.markdown) /usr/bin/open -a "$HOME/Applications/md-to-kindle.app" "$task_file" ;;
  *) /usr/bin/osascript -e 'display alert "Send to Kindle" message "Choose a .md or .markdown file."'; exit 1 ;;
esac`;
const root = 'standalone/Send to Kindle.workflow/Contents';
await mkdir(root, { recursive: true });
await writeFile(`${root}/Info.plist`, document({
  CFBundleIdentifier: 'com.haroldfandino.md-to-kindle.finder', CFBundleName: 'Send to Kindle',
  NSServices: [{ NSMenuItem: { default: 'Send to Kindle' }, NSMessage: 'runWorkflow',
    NSSendFileTypes: ['net.daringfireball.markdown', 'public.plain-text'],
    NSRequiredContext: { NSApplicationIdentifier: 'com.apple.finder' } }],
}));
await writeFile(`${root}/document.wflow`, document({
  AMApplicationBuild: '521', AMApplicationVersion: '2.10', AMDocumentVersion: '2',
  actions: [{ action: {
    AMAccepts: { Container: 'List', Types: ['com.apple.cocoa.path'] },
    AMProvides: { Container: 'List', Types: ['com.apple.cocoa.string'] },
    AMActionVersion: '2.0.3', AMApplication: ['Automator'],
    ActionBundlePath: '/System/Library/Automator/Run Shell Script.action', ActionName: 'Run Shell Script',
    ActionParameters: { COMMAND_STRING: shell, CheckedForUserDefaultShell: true, inputMethod: 1, shell: '/bin/zsh', source: '' },
    BundleIdentifier: 'com.apple.RunShellScript', CFBundleVersion: '2.0.3', ClassName: 'RunShellScriptAction',
    InputUUID: '0379DE42-4397-4F30-A3E7-D64C8FD125A6', OutputUUID: 'E70E3E56-7942-4149-A772-BB38D634E9DB',
    UUID: 'BB46FD97-C1F6-459F-9722-F9D42EDBCE4D', IsViewVisible: true,
  }, isViewVisible: true }], connectors: [],
  workflowMetaData: {
    application: 'Finder', applicationBundleID: 'com.apple.finder',
    inputTypeIdentifier: 'com.apple.Automator.fileSystemObject', outputTypeIdentifier: 'com.apple.Automator.nothing',
    serviceApplicationBundleID: 'com.apple.finder', serviceApplicationPath: '/System/Library/CoreServices/Finder.app',
    serviceInputTypeIdentifier: 'com.apple.Automator.fileSystemObject', serviceOutputTypeIdentifier: 'com.apple.Automator.nothing',
    serviceProcessesInput: 0, workflowTypeIdentifier: 'com.apple.Automator.servicesMenu',
  },
}));
console.log('Finder Quick Action generated.');

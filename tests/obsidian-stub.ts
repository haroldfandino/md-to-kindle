// A deliberately small API double for exercising plugin lifecycle and dialogs.
// It is used only by tests and is never included in the distributable.
export const notices: string[] = [];
export const Platform = { isWin: true };
export interface TestApp {
  vault: { getFiles(): TFile[]; read(file: TFile): Promise<string>; readBinary(file: TFile): Promise<ArrayBuffer> };
  workspace: { getActiveViewOfType(type: unknown): MarkdownView | null; on(event: string, callback: (...args: unknown[]) => void): unknown };
  metadataCache: { getFirstLinkpathDest(path: string, source: string): TFile | null };
  secretStorage: { getSecret(name: string): string | null };
}
export class Notice { constructor(message: string) { notices.push(message); } }
export class TFile {
  constructor(public path: string, public stat = { size: 10 }) {}
  get name() { return this.path.split('/').pop()!; }
  get extension() { return this.name.split('.').pop()!; }
  get basename() { return this.name.slice(0, -(this.extension.length + 1)); }
}
export class MarkdownView {
  constructor(public file: TFile | null, public editor: { getValue(): string }) {}
}
export class Plugin {
  commands: { id: string; name: string; checkCallback?: (checking: boolean) => boolean; callback?: () => void }[] = [];
  tabs: unknown[] = [];
  events: unknown[] = [];
  persisted: unknown;
  constructor(public app: TestApp) {}
  async loadData() { return this.persisted; }
  async saveData(data: unknown) { this.persisted = data; }
  addSettingTab(tab: unknown) { this.tabs.push(tab); }
  addCommand(command: typeof this.commands[number]) { this.commands.push(command); }
  registerEvent(event: unknown) { this.events.push(event); }
}
export class Modal {
  modalEl = document.createElement('div');
  contentEl = document.createElement('div');
  constructor(public app: TestApp) { this.modalEl.appendChild(this.contentEl); }
  open() { document.body.appendChild(this.modalEl); this.onOpen(); }
  close() { this.onClose(); this.modalEl.remove(); }
  onOpen() {}
  onClose() {}
}
export class PluginSettingTab {
  containerEl = document.createElement('div');
  constructor(public app: TestApp, public plugin: unknown) {}
}
export class SuggestModal<T> extends Modal {
  setPlaceholder(_value: string) { return this; }
}
export class ButtonComponent {
  buttonEl = document.createElement('button');
  constructor(container: HTMLElement) { container.appendChild(this.buttonEl); }
  setButtonText(value: string) { this.buttonEl.textContent = value; return this; }
  setDisabled(value: boolean) { this.buttonEl.disabled = value; return this; }
  setCta() { this.buttonEl.classList.add('mod-cta'); return this; }
  onClick(callback: () => unknown) { this.buttonEl.addEventListener('click', callback); return this; }
}
export class TextComponent {
  inputEl = document.createElement('input');
  constructor(container: HTMLElement) { container.appendChild(this.inputEl); }
  setPlaceholder(value: string) { this.inputEl.placeholder = value; return this; }
  setValue(value: string) { this.inputEl.value = value; return this; }
  setDisabled(value: boolean) { this.inputEl.disabled = value; return this; }
  onChange(callback: (value: string) => unknown) { this.inputEl.addEventListener('input', () => callback(this.inputEl.value)); return this; }
}
export class DropdownComponent {
  selectEl = document.createElement('select');
  constructor(container: HTMLElement) { container.appendChild(this.selectEl); }
  addOption(value: string, label: string) { const option = document.createElement('option'); option.value = value; option.textContent = label; this.selectEl.appendChild(option); return this; }
  setValue(value: string) { this.selectEl.value = value; return this; }
  onChange(callback: (value: string) => unknown) { this.selectEl.addEventListener('change', () => callback(this.selectEl.value)); return this; }
}
export class SecretComponent {
  constructor(_app: TestApp, container: HTMLElement) { container.setAttribute('data-secret-component', 'true'); }
  setValue(_value: string) { return this; }
  onChange(_callback: (value: string) => unknown) { return this; }
}
export class Setting {
  element = document.createElement('div');
  constructor(container: HTMLElement) { container.appendChild(this.element); }
  setName(value: string) { const label = document.createElement('span'); label.textContent = value; this.element.appendChild(label); return this; }
  setDesc(value: string) { const description = document.createElement('p'); description.textContent = value; this.element.appendChild(description); return this; }
  setHeading() { return this; }
  addText(callback: (component: TextComponent) => unknown) { callback(new TextComponent(this.element)); return this; }
  addButton(callback: (component: ButtonComponent) => unknown) { callback(new ButtonComponent(this.element)); return this; }
  addDropdown(callback: (component: DropdownComponent) => unknown) { callback(new DropdownComponent(this.element)); return this; }
  addComponent(callback: (container: HTMLElement) => unknown) { callback(this.element); return this; }
}

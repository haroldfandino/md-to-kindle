import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';

export type HtmlNode = DefaultTreeAdapterMap['node'];
export type HtmlElement = DefaultTreeAdapterMap['element'];

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export function isElement(node: HtmlNode): node is HtmlElement { return 'tagName' in node; }

export function elements(node: HtmlNode): HtmlElement[] {
  return [...(isElement(node) ? [node] : []), ...('childNodes' in node ? node.childNodes.flatMap(elements) : [])];
}

export function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : '';
}

export function setAttribute(element: HtmlElement, name: string, value: string): void {
  const attribute = element.attrs.find(attribute => attribute.name === name);
  if (attribute) attribute.value = value;
  else element.attrs.push({ name, value });
}

export function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find(attribute => attribute.name === name)?.value;
}

function xhtml(node: HtmlNode): string {
  if (node.nodeName === '#text') return escape((node as DefaultTreeAdapterMap['textNode']).value);
  if (!isElement(node)) return 'childNodes' in node ? node.childNodes.map(xhtml).join('') : '';
  const attrs = node.attrs.map(attr => ` ${attr.name}="${escape(attr.value)}"`).join('');
  if (['img', 'br', 'hr'].includes(node.tagName)) return `<${node.tagName}${attrs} />`;
  return `<${node.tagName}${attrs}>${node.childNodes.map(xhtml).join('')}</${node.tagName}>`;
}

export { parseFragment, serialize, xhtml };

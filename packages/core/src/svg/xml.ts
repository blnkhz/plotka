/**
 * Small non-validating XML parser, enough for SVG files from vector tools.
 * Handles elements, attributes, text, CDATA, comments, processing instructions and
 * DOCTYPE with internal entity declarations (old Illustrator exports use these).
 */

export type XmlElement = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
};
export type XmlText = { text: string };
export type XmlNode = XmlElement | XmlText;

export const isElement = (n: XmlNode): n is XmlElement => 'name' in n;

export type XmlDocument = { root: XmlElement; comments: string[] };

export class XmlParseError extends Error {}

const BUILTIN_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function parseXml(src: string): XmlDocument {
  const entities: Record<string, string> = { ...BUILTIN_ENTITIES };
  const comments: string[] = [];
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let i = 0;
  const n = src.length;

  const decode = (s: string): string =>
    s.indexOf('&') === -1
      ? s
      : s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.-]*);/g, (m, ent: string) => {
          if (ent[0] === '#') {
            const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
          }
          return entities[ent] ?? m;
        });

  const appendChild = (node: XmlNode) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      if (stack.length) appendChild({ text: decode(src.slice(i)) });
      break;
    }
    if (lt > i && stack.length) {
      const text = src.slice(i, lt);
      if (text.trim()) appendChild({ text: decode(text) });
    }
    i = lt;

    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) throw new XmlParseError('Unterminated comment');
      comments.push(src.slice(i + 4, end));
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end === -1) throw new XmlParseError('Unterminated CDATA');
      appendChild({ text: src.slice(i + 9, end) });
      i = end + 3;
    } else if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end === -1) throw new XmlParseError('Unterminated processing instruction');
      i = end + 2;
    } else if (src.startsWith('<!DOCTYPE', i) || src.startsWith('<!doctype', i)) {
      i = parseDoctype(src, i, entities);
    } else if (src[i + 1] === '/') {
      const end = src.indexOf('>', i);
      if (end === -1) throw new XmlParseError('Unterminated closing tag');
      const name = src.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new XmlParseError(`Mismatched closing tag </${name}>`);
      }
      i = end + 1;
    } else {
      // Start tag
      let j = i + 1;
      while (j < n && !/[\s/>]/.test(src[j]!)) j++;
      const name = src.slice(i + 1, j);
      if (!name) throw new XmlParseError(`Invalid tag at ${i}`);
      const attrs: Record<string, string> = {};
      let selfClosing = false;
      for (;;) {
        while (j < n && /\s/.test(src[j]!)) j++;
        if (j >= n) throw new XmlParseError(`Unterminated tag <${name}>`);
        if (src[j] === '>') {
          j++;
          break;
        }
        if (src[j] === '/' && src[j + 1] === '>') {
          selfClosing = true;
          j += 2;
          break;
        }
        let k = j;
        while (k < n && !/[\s=/>]/.test(src[k]!)) k++;
        const attrName = src.slice(j, k);
        while (k < n && /\s/.test(src[k]!)) k++;
        if (src[k] !== '=') {
          // Attribute without value (not valid XML, but be lenient).
          attrs[attrName] = '';
          j = k;
          continue;
        }
        k++;
        while (k < n && /\s/.test(src[k]!)) k++;
        const quote = src[k];
        if (quote !== '"' && quote !== "'")
          throw new XmlParseError(`Unquoted attribute ${attrName}`);
        const close = src.indexOf(quote, k + 1);
        if (close === -1) throw new XmlParseError(`Unterminated attribute ${attrName}`);
        attrs[attrName] = decode(src.slice(k + 1, close));
        j = close + 1;
      }
      const el: XmlElement = { name, attrs, children: [] };
      if (stack.length) appendChild(el);
      else if (!root) root = el;
      if (!selfClosing) stack.push(el);
      i = j;
    }
  }
  if (!root) throw new XmlParseError('No root element');
  if (stack.length) throw new XmlParseError(`Unclosed tag <${stack[stack.length - 1]!.name}>`);
  return { root, comments };
}

function parseDoctype(src: string, start: number, entities: Record<string, string>): number {
  let i = start + 9;
  let depth = 0;
  const bracket = src.indexOf('[', i);
  const close = src.indexOf('>', i);
  if (bracket !== -1 && bracket < close) {
    const end = src.indexOf(']', bracket);
    const subset = src.slice(bracket + 1, end);
    const re = /<!ENTITY\s+([^\s%]+)\s+(["'])([\s\S]*?)\2\s*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(subset))) entities[m[1]!] = m[3]!;
    i = end + 1;
  }
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') depth--;
    else if (src[i] === '>' && depth <= 0) return i + 1;
  }
  throw new XmlParseError('Unterminated DOCTYPE');
}

/** Concatenated text content of an element. */
export function textContent(el: XmlElement): string {
  return el.children.map((c) => (isElement(c) ? textContent(c) : c.text)).join('');
}

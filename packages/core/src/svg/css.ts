/**
 * Minimal CSS support for SVG `<style>` blocks (Illustrator and some Figma exports use
 * class rules). Supports simple selectors: `tag`, `.class`, `#id`, compounds like `path.a.b`,
 * and comma groups. Rules with combinators or pseudo-classes are ignored.
 */

export type Declarations = Record<string, string>;

type SimpleSelector = { tag?: string; id?: string; classes: string[]; specificity: number };

export type CssRule = { selector: SimpleSelector; decls: Declarations; order: number };

export function parseDeclarations(text: string): Declarations {
  const out: Declarations = {};
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (key && value) out[key] = value;
  }
  return out;
}

export function parseStylesheet(css: string, startOrder = 0): CssRule[] {
  const rules: CssRule[] = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let order = startOrder;
  let m: RegExpExecArray | null;
  // Drop @-rule blocks (media queries etc.) entirely.
  const cleaned = src
    .replace(/@[^{;]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/@[^;{]+;/g, '');
  while ((m = re.exec(cleaned))) {
    const decls = parseDeclarations(m[2]!);
    for (const raw of m[1]!.split(',')) {
      const sel = parseSelector(raw.trim());
      if (sel) rules.push({ selector: sel, decls, order: order++ });
    }
  }
  return rules;
}

function parseSelector(s: string): SimpleSelector | null {
  if (!s || /[\s>+~:[\]*]/.test(s)) return null;
  const m = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(s);
  if (!m) return null;
  const sel: SimpleSelector = { classes: [], specificity: 0 };
  if (m[1]) {
    sel.tag = m[1];
    sel.specificity += 1;
  }
  for (const part of m[2]!.match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '#') {
      sel.id = part.slice(1);
      sel.specificity += 100;
    } else {
      sel.classes.push(part.slice(1));
      sel.specificity += 10;
    }
  }
  return sel;
}

/** Declarations from stylesheet rules that match the element, in cascade order. */
export function matchRules(
  rules: CssRule[],
  tag: string,
  id: string | undefined,
  classList: string[],
): Declarations {
  const matched = rules.filter(({ selector: s }) => {
    if (s.tag && s.tag !== tag) return false;
    if (s.id && s.id !== id) return false;
    return s.classes.every((c) => classList.includes(c));
  });
  matched.sort((a, b) => a.selector.specificity - b.selector.specificity || a.order - b.order);
  return Object.assign({}, ...matched.map((r) => r.decls)) as Declarations;
}

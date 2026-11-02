/**
 * The user guide (docs/guide/*.md) as topics and searchable sections. Pure functions; the files
 * are loaded in helpDocs.ts.
 */

export type HelpSection = {
  /** Topic id, e.g. "fills". */
  topic: string;
  /** Heading id within the topic ('' for the text before the first ## heading). */
  anchor: string;
  heading: string;
  /** Plain text of the section, for searching. */
  text: string;
};

export type HelpTopic = {
  id: string;
  title: string;
  /** File name, e.g. "04-fills.md" (used to resolve links between pages). */
  file: string;
  markdown: string;
  sections: HelpSection[];
};

export type HelpResult = {
  topic: string;
  anchor: string;
  topicTitle: string;
  heading: string;
  /** Escaped HTML with the matches wrapped in <mark>. */
  snippet: string;
  score: number;
};

/** "Pen height" → "pen-height". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "04-fills.md" → "fills". */
export const topicIdFromFile = (file: string) =>
  file.replace(/^.*\//, '').replace(/\.md$/, '').replace(/^\d+-/, '');

/** Markdown → plain text, for searching and snippets. */
export function plainText(md: string): string {
  return md
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^[\s-]+$/gm, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builds topics from guide files (path → markdown), in file name order. */
export function buildTopics(files: Record<string, string>): HelpTopic[] {
  return Object.keys(files)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const markdown = files[path]!;
      const file = path.replace(/^.*\//, '');
      const id = topicIdFromFile(file);
      const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? id;
      const sections: HelpSection[] = [];
      let heading = title;
      let anchor = '';
      let body: string[] = [];
      const flush = () => {
        const text = plainText(body.join('\n'));
        if (text || anchor) sections.push({ topic: id, anchor, heading, text });
      };
      for (const line of markdown.split('\n')) {
        const h = /^##\s+(.+)$/.exec(line);
        if (h) {
          flush();
          heading = h[1]!.trim();
          anchor = slug(heading);
          body = [];
        } else if (!/^#\s/.test(line)) body.push(line);
      }
      flush();
      return { id, title, file, markdown, sections };
    });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words of a query, lowercase. */
export const queryTerms = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);

/** Wraps each term in <mark>, after escaping. */
export function highlight(text: string, terms: string[]): string {
  if (!terms.length) return escapeHtml(text);
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi');
  return text
    .split(re)
    .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}

/**
 * Finds sections containing every word of the query (anywhere in the heading or text).
 * Matches in headings and titles rank higher; whole-word matches rank above partial ones.
 */
export function searchHelp(topics: HelpTopic[], query: string, limit = 30): HelpResult[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const results: HelpResult[] = [];
  for (const t of topics)
    for (const s of t.sections) {
      const heading = s.heading.toLowerCase();
      const title = t.title.toLowerCase();
      const text = s.text.toLowerCase();
      let score = 0;
      let all = true;
      for (const term of terms) {
        const inHeading = heading.includes(term);
        const inTitle = title.includes(term);
        const count = text.split(term).length - 1;
        if (!inHeading && !inTitle && count === 0) {
          all = false;
          break;
        }
        const word = new RegExp(`\\b${escapeRe(term)}\\b`);
        score +=
          (inHeading ? 10 : 0) +
          (inTitle ? 4 : 0) +
          Math.min(count, 5) +
          (word.test(heading) || word.test(text) ? 2 : 0);
      }
      if (!all) continue;
      results.push({
        topic: t.id,
        anchor: s.anchor,
        topicTitle: t.title,
        heading: s.heading,
        snippet: snippet(s.text, terms),
        score,
      });
    }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** About 160 characters around the first match. */
function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length);
  const start = Math.max(0, first - 60);
  const end = Math.min(text.length, start + 160);
  const cut = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  return highlight(cut, terms);
}

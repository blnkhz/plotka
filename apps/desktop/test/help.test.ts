import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTopics,
  highlight,
  plainText,
  queryTerms,
  searchHelp,
  slug,
  topicIdFromFile,
} from '../src/renderer/src/lib/help';

const guideDir = join(__dirname, '../../../docs/guide');
const files = Object.fromEntries(
  readdirSync(guideDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => [f, readFileSync(join(guideDir, f), 'utf8')]),
);
const topics = buildTopics(files);

describe('help topics', () => {
  it('reads every guide page in order, with a title', () => {
    expect(topics.length).toBe(Object.keys(files).length);
    expect(topics[0]!.id).toBe('getting-started');
    for (const t of topics) expect(t.title).not.toBe(t.id);
  });

  it('every link between pages points to a page and section that exist', () => {
    for (const t of topics)
      for (const [, file, anchor] of t.markdown.matchAll(/\]\(([\w-]+\.md)(?:#([\w-]+))?\)/g)) {
        const target = topics.find((x) => x.file === file);
        expect(target, `${t.file} links to ${file}`).toBeDefined();
        if (anchor) expect(target!.sections.map((s) => s.anchor)).toContain(anchor);
      }
  });

  it('every "?" button in the app opens a topic and section that exist', () => {
    const dir = join(__dirname, '../src/renderer/src/components');
    const refs = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((f) =>
        [...readFileSync(join(dir, f), 'utf8').matchAll(/help="([^"]+)"/g)].map((m) => m[1]!),
      );
    expect(refs.length).toBeGreaterThan(10);
    for (const ref of refs) {
      const [topic, anchor] = ref.split('#');
      const t = topics.find((x) => x.id === topic);
      expect(t, ref).toBeDefined();
      if (anchor)
        expect(
          t!.sections.map((s) => s.anchor),
          ref,
        ).toContain(anchor);
    }
  });
});

describe('help search', () => {
  it('slugs, ids and plain text', () => {
    expect(slug('Start, pause, resume, stop')).toBe('start-pause-resume-stop');
    expect(topicIdFromFile('docs/guide/04-fills.md')).toBe('fills');
    expect(plainText('- **Bold** and [a link](x.md) and `code`')).toBe('Bold and a link and code');
    expect(queryTerms('  Pen,  HEIGHT? ')).toEqual(['pen', 'height']);
  });

  it('finds sections with every word, best matches first', () => {
    const r = searchHelp(topics, 'pen height');
    expect(r[0]!.heading).toBe('Pen height');
    expect(searchHelp(topics, 'kaleidoscope')[0]!.topic).toBe('transforms');
    expect(searchHelp(topics, 'firmware old')[0]!.topic).toBe('troubleshooting');
    expect(searchHelp(topics, 'zzzz nothing')).toEqual([]);
    expect(searchHelp(topics, '')).toEqual([]);
  });

  it('snippets are escaped and highlighted', () => {
    expect(highlight('a <b> pen', ['pen'])).toBe('a &lt;b&gt; <mark>pen</mark>');
    const [first] = searchHelp(topics, 'jitter');
    expect(first!.snippet).toContain('<mark>');
    expect(first!.snippet).not.toMatch(/<(?!\/?mark>)/);
  });
});

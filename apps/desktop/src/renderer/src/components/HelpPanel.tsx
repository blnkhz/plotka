import { useEffect, useMemo, useRef, useState } from 'react';
import { Marked } from 'marked';
import { searchHelp, slug, topicIdFromFile } from '../lib/help';
import { findTopic, HELP_TOPICS } from '../lib/helpDocs';
import { useStore } from '../store';
import styles from './HelpPanel.module.css';

/** Markdown → HTML with heading ids (for jumping to sections) and topic links. */
const md = new Marked({
  renderer: {
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      const t = title ? ` title="${title}"` : '';
      // Links to other guide pages ("04-fills.md#angle") become in-app topic links.
      const m = /^(?:\.\/)?([\w-]+\.md)(?:#([\w-]+))?$/.exec(href);
      if (m)
        return `<a href="#" data-topic="${topicIdFromFile(m[1]!)}" data-anchor="${m[2] ?? ''}"${t}>${label}</a>`;
      return `<a href="${href}" target="_blank" rel="noreferrer"${t}>${label}</a>`;
    },
  },
});

/** The searchable user guide (docs/guide), over the app like the doodle pad. */
export function HelpPanel() {
  const help = useStore((s) => s.help);
  const openHelp = useStore((s) => s.openHelp);
  const closeHelp = useStore((s) => s.closeHelp);
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const topic = findTopic(help.topic) ?? HELP_TOPICS[0];
  const html = useMemo(() => (topic ? (md.parse(topic.markdown) as string) : ''), [topic]);
  const results = useMemo(() => searchHelp(HELP_TOPICS, query), [query]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Show the requested section (or the top) when the topic or section changes.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const target = help.anchor ? el.querySelector(`#${CSS.escape(help.anchor)}`) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add(styles.flash!);
      const t = setTimeout(() => target.classList.remove(styles.flash!), 1200);
      return () => clearTimeout(t);
    }
    el.scrollTop = 0;
  }, [html, help.anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query) setQuery('');
        else closeHelp();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [query, closeHelp]);

  const go = (topicId: string, anchor = '') => {
    openHelp(topicId, anchor);
    setQuery('');
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Help">
      <header className={styles.header}>
        <strong>Help</strong>
        <input
          ref={searchRef}
          type="search"
          className={styles.search}
          placeholder="Search help…"
          aria-label="Search help"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) go(results[0].topic, results[0].anchor);
          }}
        />
        <span className={styles.spacer} />
        <button onClick={closeHelp}>Close</button>
      </header>
      <div className={styles.body}>
        <nav className={styles.side} aria-label={query ? 'Search results' : 'Topics'}>
          {query ? (
            results.length ? (
              <ol className={styles.results}>
                {results.map((r) => (
                  <li key={`${r.topic}#${r.anchor}`}>
                    <button onClick={() => go(r.topic, r.anchor)}>
                      <span className={styles.resultTitle}>
                        {r.heading}
                        {r.heading !== r.topicTitle && (
                          <span className={styles.muted}> · {r.topicTitle}</span>
                        )}
                      </span>
                      <span
                        className={styles.snippet}
                        dangerouslySetInnerHTML={{ __html: r.snippet }}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>Nothing found for “{query}”.</p>
            )
          ) : (
            <ul className={styles.topics}>
              {HELP_TOPICS.map((t) => (
                <li key={t.id}>
                  <button
                    className={t.id === topic?.id ? styles.current : undefined}
                    aria-current={t.id === topic?.id ? 'page' : undefined}
                    onClick={() => go(t.id)}
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <article
          ref={contentRef}
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest('a[data-topic]');
            if (!a) return;
            e.preventDefault();
            go(a.getAttribute('data-topic')!, a.getAttribute('data-anchor') ?? '');
          }}
        />
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { EXAMPLE_SIZE, exampleArt } from '../lib/exampleArt';
import { openWithDialog } from '../lib/openFile';
import { useStore } from '../store';
import styles from './Splash.module.css';
// The app icon is the logo (Matcha Mauve in every theme).
import logoUrl from '../../../../build/icon.svg?url';

const SHOW_KEY = 'plotka.splash';
/** The key before the app was named Plotka: read if the new one isn't set yet. */
const OLD_SHOW_KEY = 'plotter-studio.splash';

/** Whether to show the splash screen at start: on unless turned off (or skipped by tests). */
export function splashAtStart(): boolean {
  if (new URLSearchParams(location.search).get('splash') === '0') return false;
  try {
    return (localStorage.getItem(SHOW_KEY) ?? localStorage.getItem(OLD_SHOW_KEY)) !== 'off';
  } catch {
    return true;
  }
}

type Recent = { path: string; name: string; folder: string };

/** Shown when the app opens: an example plot, ways to start, and recent files. */
export function Splash({ onClose }: { onClose: () => void }) {
  const art = useMemo(() => exampleArt(), []);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [version, setVersion] = useState('');
  const [show, setShow] = useState(true);

  useEffect(() => {
    void window.api.invoke('recent:list').then((r) => setRecent(r.slice(0, 4)));
    void window.api.invoke('app:getInfo').then((i) => setVersion(i.version));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const setShowAtStart = (on: boolean) => {
    setShow(on);
    try {
      localStorage.setItem(SHOW_KEY, on ? 'on' : 'off');
    } catch {
      // Not fatal: it shows again next time.
    }
  };
  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Plotka"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.art}>
          <svg
            className={styles.paper}
            viewBox={`0 0 ${EXAMPLE_SIZE.width} ${EXAMPLE_SIZE.height}`}
            role="img"
            aria-label="Example plot: a spiral, a hatched circle, ripples and waves"
          >
            <path d={art.spiral} className={styles.pen1} />
            <path d={art.hatch} className={styles.pen2} />
            <path d={art.ripples} className={styles.pen2} />
            <path d={art.waves} className={styles.pen1} />
          </svg>
          <p className={styles.caption}>Example plot · spiral, hatch, ripples, waves · 2 pens</p>
        </div>

        <div className={styles.side}>
          <button className={styles.close} onClick={onClose} aria-label="Close" title="Close (Esc)">
            ×
          </button>
          <div className={styles.brand}>
            <img src={logoUrl} alt="" width={60} height={60} />
            Plotka
          </div>
          <h1 className={styles.title}>
            Draw it.
            <br />
            Plot it.
          </h1>
          <p className={styles.lede}>Turn SVGs, doodles and text into pen plots.</p>
          <div className={styles.actions}>
            <button className={styles.open} onClick={then(() => void openWithDialog())}>
              Open…
            </button>
            <button
              className={styles.doodle}
              onClick={then(() => useStore.getState().setDoodle({ open: true }))}
            >
              Doodle…
            </button>
            <button
              className={styles.text}
              onClick={then(() => {
                useStore.getState().addText();
                useStore.getState().setTab('fill');
              })}
            >
              + Text
            </button>
          </div>

          {recent.length > 0 && (
            <div className={styles.recent}>
              <h2>Recent</h2>
              <ul>
                {recent.map((r) => (
                  <li key={r.path}>
                    <button
                      title={r.path}
                      onClick={then(() => void window.api.invoke('recent:open', r.path))}
                    >
                      <span className={styles.name}>{r.name}</span>
                      <span className={styles.folder}>{r.folder}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.footer}>
            <label>
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShowAtStart(e.target.checked)}
              />
              Show at start
            </label>
            {version && <span>Version {version}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import styles from './AutoReload.module.css';

/** IMPORT-5: toolbar switch for reloading the artwork when it changes, and a brief confirmation. */
export function AutoReload() {
  const path = useStore((s) => s.source?.path);
  const autoReload = useStore((s) => s.autoReload);
  const reloadedAt = useStore((s) => s.reloadedAt);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!reloadedAt) return;
    const show = setTimeout(() => setFlash(true), 0);
    const hide = setTimeout(() => setFlash(false), 3000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [reloadedAt]);

  if (!path) return null;
  return (
    <>
      <label
        className={styles.toggle}
        title="Reload the file when it's saved in another app (Illustrator, Inkscape, code). All settings are kept."
      >
        <input
          type="checkbox"
          checked={autoReload}
          onChange={(e) => useStore.setState({ autoReload: e.target.checked })}
        />
        Auto-reload
      </label>
      {flash && (
        <span className={styles.flash} role="status">
          Reloaded
        </span>
      )}
    </>
  );
}

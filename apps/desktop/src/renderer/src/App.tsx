import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/ipc';
import styles from './App.module.css';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.api.invoke('app:getInfo').then(setInfo);
  }, []);

  return (
    <div className={styles.shell}>
      <aside className={styles.left}>Layers</aside>
      <main className={styles.center}>
        <p className={styles.empty}>Open an SVG to start.</p>
      </main>
      <aside className={styles.right}>
        {info && (
          <small className={styles.muted}>
            v{info.version} · Electron {info.electron}
          </small>
        )}
      </aside>
    </div>
  );
}

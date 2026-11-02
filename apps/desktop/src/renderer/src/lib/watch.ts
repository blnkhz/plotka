import { useStore } from '../store';

/**
 * IMPORT-5: keeps the main process watching the open artwork while auto-reload is on, and
 * reloads it (keeping all settings) when it changes on disk. Call once at startup.
 */
export function startWatching(): () => void {
  let watched: string | null = null;
  const sync = () => {
    const { source, autoReload } = useStore.getState();
    const want = autoReload && source?.path ? source.path : null;
    if (want === watched) return;
    watched = want;
    if (want) void window.api.invoke('watch:start', want);
    else void window.api.invoke('watch:stop');
  };
  const unsub = useStore.subscribe((s, p) => {
    if (s.source?.path !== p.source?.path || s.autoReload !== p.autoReload) sync();
  });
  const off = window.api.on('file:changed', ({ path, bytes }) => {
    const { source, autoReload, reloadSource } = useStore.getState();
    if (autoReload && source?.path === path) void reloadSource(bytes);
  });
  sync();
  return () => {
    unsub();
    off();
    void window.api.invoke('watch:stop');
  };
}

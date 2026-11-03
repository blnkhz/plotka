import { useSyncExternalStore } from 'react';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribe(onChange: () => void) {
  const mq = query();
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * 'light' or 'dark', updated when macOS or View > Appearance switches it. Canvases read their
 * colours from CSS variables when they draw, so they list this as a redraw input.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, () => (query().matches ? 'dark' : 'light'));
}

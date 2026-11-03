import { useSyncExternalStore } from 'react';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribe(onChange: () => void) {
  const mq = query();
  mq.addEventListener('change', onChange);
  // A colour theme is a `data-theme` attribute; two light themes share the colour scheme.
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    mq.removeEventListener('change', onChange);
    mo.disconnect();
  };
}

const snapshot = () =>
  `${query().matches ? 'dark' : 'light'}:${document.documentElement.dataset['theme'] ?? ''}`;

/**
 * Changes whenever the colours do: macOS light / dark, or View > Appearance. Canvases read their
 * colours from CSS variables when they draw, so they list this as a redraw input.
 */
export function useThemeKey(): string {
  return useSyncExternalStore(subscribe, snapshot);
}

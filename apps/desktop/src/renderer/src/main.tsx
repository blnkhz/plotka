import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Bundled fonts (SIL Open Font License; see THIRD_PARTY_NOTICES.md): the interface, and numbers.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './styles/global.css';
import { APPEARANCES, themeAttr, type Appearance } from '@shared/themes';

// View > Appearance: the colour theme arrives in the URL (so the first paint has it) and then
// as events. Plain system / light / dark need nothing here: they come through
// prefers-color-scheme.
function applyTheme(theme: Appearance) {
  const attr = themeAttr(theme);
  if (attr) document.documentElement.dataset['theme'] = attr;
  else delete document.documentElement.dataset['theme'];
}
const initial = new URLSearchParams(location.search).get('theme') as Appearance | null;
if (initial && APPEARANCES.includes(initial)) applyTheme(initial);
window.api.on('app:appearance', ({ theme }) => applyTheme(theme));

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

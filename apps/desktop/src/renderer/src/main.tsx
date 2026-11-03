import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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

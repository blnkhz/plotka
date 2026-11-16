# Appearance: light, dark or follow the system

Goal: let the app be light or dark regardless of the macOS setting.

- **How**: Electron's `nativeTheme.themeSource` (`system`, `light`, `dark`). It also sets what
  the page's `prefers-color-scheme` reports, so `global.css` stays as it is.
- **Where it's kept**: `userData/appearance.json` (`{ "theme": "dark" }`), read and applied in the
  main process before the first window opens, so the window doesn't flash the wrong colours.
- **UI**: View > Appearance, three radio items (Use System Setting, Light, Dark).
- **Canvases**: the preview and the doodle pad read colours from CSS variables when they draw,
  so they redraw when the scheme changes (`useColorScheme`). Before this, switching macOS to
  dark with the app open left the canvas in the old colours until something else redrew it.
- **Colour themes**: six more, listed in `src/shared/themes.ts` (id, menu label, light or dark
  base). Their colours are in `global.css` under `:root[data-theme='<id>']`, on top of their
  base's colours (warnings, travel lines and the bed outline come from the base). The base goes
  to `themeSource`, so native controls and scrollbars match. The page gets the id in the URL
  at load (no flash) and as an `app:appearance` event on a change. Canvases redraw on the
  theme attribute too, since two light themes share `prefers-color-scheme`.
- **New colour names**: `--accent-text` (the accent as text, links and focus rings; darker
  where the accent is too light to read), `--pop` / `--on-pop` (Start plot and other plot
  buttons). In plain light and dark they equal the accent, so those look as before, except
  that the Doodle button now uses the accent too.

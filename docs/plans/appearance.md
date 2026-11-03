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
- **More themes later**: themes beyond light and dark would be more variable sets in
  `global.css` under `:root[data-theme=…]`, picked from the same menu; each also says which
  base (light or dark) to give `themeSource`, so native controls and scrollbars match.

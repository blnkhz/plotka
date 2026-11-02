# Epic 10 plan: PROJ-1 save and open projects (+ travel distance in the toolbar)

## File format: `.plot.json`

```json
{
  "format": "plotter-studio-project",
  "version": 1,
  "savedAt": "2026-11-02T18:00:00.000Z",
  "source": { "name": "motif.svg", "base64": "…" },
  "layerMode": "auto",
  "layerOverrides": { "layer-1": { "settings": { "fill": { … } } } },
  "page": { … },
  "optimize": { … },
  "profileId": "axidraw-v3-a3",
  "pipeline": [{ "id": "…", "type": "tile", "enabled": true, "params": { … } }],
  "doodle": { "strokes": [ … ], "settings": { … }, "size": { … } },
  "plotSkip": { "layer-1~2": true },
  "view": { "penWidth": 0.4 }
}
```

- **The artwork is embedded** (base64 of the original file), so a project still opens after the
  SVG is moved or edited. Layer overrides are keyed by layer id, and import is deterministic, so
  they reattach.
- **Doodle strokes** are saved too, so "Edit doodle…" works after reopening.
- **Not in the project:** pen heights and the connection (they belong to the machine, saved
  separately), view toggles other than pen width, the window layout.
- **Reading:** unknown or missing fields fall back to defaults, so projects from older versions
  open after new settings are added. A newer `version` than the app knows is refused with a
  clear message. Values are checked (types, ranges) before use; a bad file gives a plain error,
  never a half-loaded state.

## App

- Toolbar: Open… (opens SVGs and projects), **Save** (⌘S), Save As (⇧⌘S).
- The window title shows the project name and an edited dot (macOS `setDocumentEdited`).
  Any change to the project's settings marks it edited; saving or opening clears it.
- Closing with unsaved changes asks first (Cancel / Close without saving). This is in addition
  to the mid-plot question.
- The main process remembers the current project path (from its open and save dialogs), so the
  renderer never sends file paths to write to. Opening an SVG starts a new, untitled project.

## Travel distance

The toolbar summary shows paths, pen-down distance, pen-up travel and time. The Plot tab's stats
table already has these per layer.

Later: PROJ-2 undo/redo, PROJ-4 recent files and autosave.

## PROJ-2 undo / redo

- **What's undoable:** the project's settings: layer settings (fills, passes, visibility,
  colors), layer mode, page setup, optimization, the transform list, plot layer choices, pen
  width and the machine profile. Opening a file or project starts a fresh history. Doodle strokes
  keep their own undo inside the doodle pad. Machine actions (jog, pen) aren't undoable.
- **How:** snapshots of those settings before each change, up to 200 steps. Changes within
  0.4 s of each other (spinner clicks, a re-import after a layer mode change) form one step.
  Undoing a layer mode change re-imports the file in the old mode, then restores the layer
  settings.
- **Shortcuts:** a real app menu (File: Open, Save, Save As; Edit: Undo, Redo, Cut, Copy,
  Paste, Select All). Menu shortcuts are the only handlers for ⌘O, ⌘S, ⇧⌘S, ⌘Z, ⇧⌘Z, so a
  key press never acts twice. In a text field, Undo undoes typing. With the doodle pad open, it
  undoes strokes. The toolbar has Undo and Redo buttons too.

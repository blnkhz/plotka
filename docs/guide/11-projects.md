# Projects and undo

## Saving and opening

**Save** (⌘S) saves everything as a project file (`.plot.json`). The first time, it asks for a
name and place; after that it saves to the same file. **Save As…** (⇧⌘S) saves a copy under a new
name. **Open…** (⌘O) opens projects as well as SVGs, and you can drop a project on the window.

A project keeps:

- a copy of the artwork, so it still opens if the original SVG is moved or changed,
- the layer settings (fills, passes, outlines, colors, which layers to show and plot),
- the page setup, optimization settings and the transforms,
- your doodle strokes.

Pen heights and the plotter connection belong to the machine, not the drawing, so they're not in
the project. Pen heights are remembered by the app.

The window title shows the project's name, with "(edited)" when there are unsaved changes.
Closing with unsaved changes asks first. Opening an SVG starts a new project; the transforms stay,
so you can try the same pattern on other artwork.

## Recent files

**File → Open Recent** lists the last 10 projects and SVGs you opened or saved (also in the Dock
icon's menu). **Clear Menu** empties it. A file that has been moved or deleted is taken off the
list when you pick it. You can also open SVGs and projects from Finder with **Open With**.

## Autosave and recovery

While you have unsaved changes, Plotka keeps a copy of your work a few seconds after
each change. It's stored in the app's own data, never over your project file, so nothing is
saved anywhere you didn't choose.

If the app closes without saving (a crash, a forced quit, the computer shutting down), the next
start shows a bar: **Restore** brings the work back as an unsaved project (save it to keep it),
**Discard** throws it away. Saving, or choosing **Close without saving**, removes the copy.

## Undo and redo

**Undo** (⌘Z) and **Redo** (⇧⌘Z), also in the toolbar and the Edit menu, step back and forward
through settings changes: layer settings, layer mode, page setup, optimization, transforms, which
layers to plot and the pen width. Quick repeated changes to one setting (like clicking a spinner
arrow) count as one step.

- In a text box, Undo undoes your typing.
- In the doodle pad, Undo removes the last stroke.
- Moving the plotter (jog, pen up and down) can't be undone.
- Opening a file or project starts a fresh history.

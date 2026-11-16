# PLOT-7: Plot log

Goal (spec): find old settings. So each entry keeps the whole project as plotted, not just a
summary, and can be opened again.

- **Where**: the main process writes it (it owns the plot loop, so a reload of the window
  doesn't lose an entry): `userData/plot-log/index.json`, newest first, and `<id>.plot.json`
  per plot (artwork embedded, so it opens even if the file changed or moved). Last 200 kept.
- **Entry**: file, project name, start / end, time plotting (pauses excluded), share done,
  outcome (in progress, finished, stopped, failed, interrupted if the app closed mid-plot),
  paths, pen-down distance, machine, continued (PLOT-5), and the user's note.
- **Recording**: the renderer adds `log` info to the plot request; the service updates the entry
  only when the outcome changes. A failed plot can still be resumed and finish. Dry runs aren't
  logged.
- **UI**: Plot tab, "Plot log": latest 5 (Show all), note field, Open (as a new project; asks
  first if there are unsaved changes), delete.
- **Tests**: app test with the simulated plotter: finished entry, note kept after reload, Open
  restores a changed setting, delete.

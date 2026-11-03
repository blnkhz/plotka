import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

const fixtures = join(__dirname, '../../../packages/core/test/fixtures/svg');
const shots = process.env['SCREENSHOT_DIR'];

/**
 * Launches the app with a fresh, temporary data folder (never the user's own settings).
 * PLOTTER_STUDIO_E2E skips the "unsaved changes" question on close; PLOTTER_STUDIO_NO_SPLASH
 * skips the splash screen (the splash test turns it back on).
 */
const launch = (env: Record<string, string> = {}) =>
  electron.launch({
    args: [join(__dirname, '..')],
    env: {
      ...process.env,
      PLOTTER_STUDIO_E2E: '1',
      PLOTTER_STUDIO_NO_SPLASH: '1',
      PLOTTER_STUDIO_USER_DATA: mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-')),
      ...env,
    },
  });

async function dropFile(page: Page, name: string) {
  const content = readFileSync(join(fixtures, name), 'utf8');
  await page.locator('#root > div').waitFor();
  await page.evaluate(
    ({ name, content }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], name, { type: 'image/svg+xml' }));
      const target = document.querySelector('#root > div')!;
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    },
    { name, content },
  );
}

test('open a file, change the page, see stats', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await expect(page.getByText('Open or drop an SVG to start.')).toBeVisible();

  await dropFile(page, 'inkscape.svg');
  await expect(page.getByText('inkscape.svg')).toBeVisible();
  await expect(page.getByText('Outlines', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'inkscape.png') });

  // A4 landscape, 15 mm margin (MVP setup)
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByText('Total')).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'landscape-stats.png') });

  // A3 portrait is taller than the V3/A3 travel -> blocking warning
  await page.getByRole('tab', { name: 'Page' }).click();
  await page.getByLabel('Paper', { exact: true }).selectOption('a3');
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByText(/Plotting is blocked/)).toBeVisible();

  await dropFile(page, 'figma.svg');
  await page.getByLabel('Original').check();
  await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
  await page.getByLabel('Paper', { exact: true }).selectOption('a4');
  if (shots) await page.screenshot({ path: join(shots, 'figma.png') });

  await app.close();
});

test('crosshatch a layer (MVP fill setup)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await dropFile(page, 'inkscape.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();

  const pathCount = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  const before = await pathCount();

  await page.getByText('Fills', { exact: true }).click();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('crosshatch');
  await expect(page.getByText('16.7 /cm')).toBeVisible(); // 0.6 mm default
  await expect.poll(pathCount).toBeGreaterThan(before);
  if (shots) await page.screenshot({ path: join(shots, 'crosshatch.png') });

  // Lines with and without the pen kept down (a zigzag) differ.
  const crosshatchPaths = await pathCount();
  await page.getByLabel('Fill type').selectOption('lines');
  await expect.poll(pathCount).toBeLessThan(crosshatchPaths);
  const zigzagPaths = await pathCount();
  await page.getByLabel('Keep pen down between lines').uncheck();
  await expect.poll(pathCount).toBeGreaterThan(zigzagPaths);
  await page.getByLabel('Keep pen down between lines').check();
  await expect.poll(pathCount).toBe(zigzagPaths);
  if (shots) await page.screenshot({ path: join(shots, 'zigzag.png') });

  // Optimization: travel drops versus file order, and turning it off restores file order.
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
  await expect(page.getByText('File order')).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'optimize.png') });
  await page.getByLabel('Reorder to cut travel').uncheck();
  await page.getByLabel('Join touching paths').uncheck();
  if (shots) await page.screenshot({ path: join(shots, 'optimize-off.png') });
  await app.close();
});

test('more fill types, overlaps and density from color', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await dropFile(page, 'overlap.svg');
  await expect(page.getByText('overlap.svg')).toBeVisible();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByText(/1 white shape is not drawn/)).toBeVisible();

  const type = page.getByLabel('Fill type');
  await type.selectOption('lines');
  if (shots) await page.screenshot({ path: join(shots, 'overlap-lines.png') });
  await page.getByLabel('Hide parts covered by shapes on top').uncheck();
  if (shots) await page.screenshot({ path: join(shots, 'overlap-lines-unhidden.png') });
  await page.getByLabel('Hide parts covered by shapes on top').check();

  await page.getByLabel('Spacing from fill color').check();
  if (shots) await page.screenshot({ path: join(shots, 'overlap-density.png') });
  await page.getByLabel('Spacing from fill color').uncheck();

  for (const t of ['concentric', 'spiral', 'dots'] as const) {
    await type.selectOption(t);
    await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
    if (shots) await page.screenshot({ path: join(shots, `overlap-${t}.png`) });
  }
  await expect(page.getByText('Dot spacing')).toBeVisible();
  await expect(page.getByText('Jitter')).toBeVisible();
  await app.close();
});

test('passes: repeat a layer with slight shifts in several pen colors', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await dropFile(page, 'overlap.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  const angle = page.getByRole('spinbutton', { name: 'Angle', exact: true });
  await angle.fill('90');
  await angle.press('Enter');
  await page.getByLabel('Repeat with slight shifts').check();
  await expect(page.getByText('Pens', { exact: true })).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'passes.png') });

  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByLabel('Layer 1 · pass 3')).toBeChecked();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  if (shots) await page.screenshot({ path: join(shots, 'passes-zoom.png') });
  await app.close();
});

test('doodle, turn it into vectors, then tile it', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const canvas = page.getByTestId('doodle-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // A wobbly loop that ends near its start, then a zigzag with sharp corners.
  await page.mouse.move(cx + 120, cy);
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2 * 0.98;
    const r = 120 + 4 * Math.sin(i * 1.3);
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  await page.mouse.up();
  await page.mouse.move(cx - 200, cy + 200);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(cx - 200 + i * 50, cy + 200 + (i % 2) * 60, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByText(/2 strokes → \d+ curves/)).toBeVisible();
  await page.getByLabel('Fill closed shapes').check();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-curves.png') });
  await page.getByRole('button', { name: 'Straight lines' }).click();
  await page.getByLabel('Smoothing').fill('80');
  await expect(page.getByText(/2 strokes → \d+ lines/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-lines.png') });
  await page.getByRole('button', { name: 'Curves' }).click();

  await page.getByRole('button', { name: 'Use drawing' }).click();
  await expect(page.getByText('Doodle.svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit doodle…' })).toBeVisible();

  // Tile it 3 × 3 as a brick pattern with alternate columns mirrored.
  await page.getByLabel('Add transform').selectOption('tile');
  const columns = page.getByRole('spinbutton', { name: 'Columns', exact: true });
  await columns.fill('3');
  await columns.press('Enter');
  const rows = page.getByRole('spinbutton', { name: 'Rows', exact: true });
  await rows.fill('3');
  await rows.press('Enter');
  const shift = page.getByRole('spinbutton', { name: 'Row shift', exact: true });
  await shift.fill('50');
  await shift.press('Enter');
  await page.getByLabel('Mirror').selectOption('columns');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'tile.png') });

  // Turning the step off restores the single drawing.
  await page.getByLabel('Use Tile').uncheck();
  if (shots) await page.screenshot({ path: join(shots, 'tile-off.png') });
  await app.close();
});

test('tessellate with wallpaper patterns', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await expect(page.getByText('motif.svg')).toBeVisible();
  await page.getByLabel('Add transform').selectOption('tessellate');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  for (const pattern of ['p6m', 'p6', 'p4', 'p4g', 'p3', 'p31m', 'hex', 'tri', 'pgg', 'cmm']) {
    await page.getByLabel('Pattern').selectOption(pattern);
    await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
    if (shots) await page.screenshot({ path: join(shots, `tess-${pattern}.png`) });
  }
  await page.getByLabel('Pattern').selectOption('p4');
  await page.getByLabel('Clip to its piece').uncheck();
  const size = page.getByRole('spinbutton', { name: 'Artwork size', exact: true });
  await size.fill('160');
  await size.press('Enter');
  if (shots) await page.screenshot({ path: join(shots, 'tess-p4-overlap.png') });
  await app.close();
});

test('connect the simulated plotter, jog, plot, pause, resume, finish', async () => {
  const app = await launch({ PLOTTER_SIM_SPEED: '40' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Simulated plotter', { exact: true })).toBeVisible();
  await expect(page.getByText('Not set (motors off)')).toBeVisible();

  // Jog sets home where the motors switch on, then moves.
  await page.getByRole('button', { name: 'Jog right 10 mm' }).click();
  await expect(page.getByText('X 10.0 · Y 0.0 mm')).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('X 0.0 · Y 0.0 mm')).toBeVisible();
  await page.getByLabel('Pen down height').fill('25');
  if (shots) await page.screenshot({ path: join(shots, 'machine-tab.png') });

  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Start plot' }).click();
  await expect(page.getByText('Plotting')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible({ timeout: 10000 });
  if (shots) await page.screenshot({ path: join(shots, 'plot-paused.png') });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60000 });
  if (shots) await page.screenshot({ path: join(shots, 'plot-done.png') });
  await app.close();
});

test('save a project and open it again with all its settings (PROJ-1)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'plotter-studio-')), 'My pattern.plot.json');
  const app = await launch();
  // Stand in for the native dialogs.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
  }, file);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  const title = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle());

  await dropFile(page, 'motif.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByLabel('Add transform').selectOption('tessellate');
  await page.getByLabel('Pattern').selectOption('p4g');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('dots');
  await expect(page.getByText(/paths · draw .* · travel .* · ≈/)).toBeVisible();
  await expect.poll(title).toContain('motif (edited)');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(title).toBe('My pattern — Plotka');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  expect(saved.format).toBe('plotter-studio-project');
  expect(saved.source.name).toBe('motif.svg');
  expect(saved.pipeline[0].params.pattern).toBe('p4g');

  // Start over with another file, then reopen the project.
  await dropFile(page, 'figma.svg');
  await expect(page.getByLabel('Pattern')).toHaveValue('p4g'); // transforms aren't per file
  await page.getByRole('button', { name: 'Open…' }).click();
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect.poll(title).toBe('My pattern — Plotka');
  await expect(page.getByLabel('Pattern')).toHaveValue('p4g');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('dots');
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);
  if (shots) await page.screenshot({ path: join(shots, 'project-reopened.png') });
  await app.close();
});

test('undo and redo settings from the Edit menu and the toolbar (PROJ-2)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  const menu = (id: string) =>
    app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.click(), id);

  await dropFile(page, 'motif.svg');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  const landscape = page.getByRole('button', { name: 'Landscape' });
  await landscape.click();
  await page.getByLabel('Add transform').selectOption('tile');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('spiral');

  await menu('undo');
  await expect(page.getByLabel('Fill type')).toHaveValue('none');
  await menu('undo');
  await expect(page.getByLabel('Use Tile')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(landscape).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(landscape).not.toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await menu('redo');
  await expect(landscape).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('Use Tile')).toHaveCount(1);
  // A new change clears what could be redone.
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();

  // Layer mode: undo imports the file again in the old mode.
  await page.getByRole('button', { name: 'By color' }).click();
  await expect(page.getByRole('button', { name: 'By color' })).toHaveClass(/active/);
  await menu('undo');
  await expect(page.getByRole('button', { name: 'One layer' })).toHaveClass(/active/);

  // In a text field, Undo undoes the typing, not a setting.
  const scale = page.getByRole('spinbutton', { name: 'Scale', exact: true }).first();
  const before = await scale.inputValue();
  await scale.click();
  await scale.pressSequentially('5');
  expect(await scale.inputValue()).not.toBe(before);
  await menu('undo');
  await expect(scale).toHaveValue(before);
  await expect(page.getByRole('button', { name: 'Portrait' })).toHaveClass(/active/);
  await page.keyboard.press('Escape');

  // In the doodle pad, Undo removes the last stroke.
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText(/^1 stroke →/)).toBeVisible();
  await menu('undo');
  await expect(page.getByText(/^0 strokes →/)).toBeVisible();
  await menu('redo');
  await expect(page.getByText(/^1 stroke →/)).toBeVisible();
  await app.close();
});

test('help: topics, search, links between pages, and "?" buttons', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Help' });
  await expect(dialog.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'help.png') });

  // Search, then open the best result.
  await dialog.getByLabel('Search help').fill('crosshatch angle');
  await expect(dialog.getByRole('navigation', { name: 'Search results' })).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'help-search.png') });
  await dialog.getByLabel('Search help').press('Enter');
  await expect(dialog.getByRole('heading', { name: 'Fills', level: 1 })).toBeVisible();

  // A link to another page opens that page.
  await dialog.getByRole('button', { name: 'Getting started' }).click();
  await dialog.getByRole('link', { name: 'Projects and undo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Projects and undo', level: 1 })).toBeVisible();

  // Esc closes; a "?" button opens the matching section.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByRole('button', { name: 'Help: Plotter' }).click();
  await expect(dialog.getByRole('heading', { name: 'Connecting', level: 2 })).toBeInViewport();

  // From the Help menu too.
  await page.keyboard.press('Escape');
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('help')!.click());
  await expect(dialog).toBeVisible();
  await app.close();
});

test('a file with only filled shapes plots right away, and undrawn fills are explained', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'fill-only.svg');
  // Filled automatically with lines, so there's something to plot.
  await expect(page.getByText(/[1-9]\d* paths · draw/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'fill-only.png') });

  // Turning the fill off: the shapes show faintly, and a notice offers ways to draw them.
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('none');
  await expect(page.getByText(/2 filled shapes in Layer 1 won’t be drawn/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'fill-only-notice.png') });
  await page.getByRole('button', { name: 'Draw their outlines' }).click();
  await expect(page.getByText(/won’t be drawn/)).toHaveCount(0);
  await expect(page.getByText(/2 paths · draw/)).toBeVisible();

  // "Leave them" hides the notice for this file.
  await page.getByLabel('Draw outlines of filled shapes').uncheck();
  await page.getByRole('button', { name: 'Leave them' }).click();
  await expect(page.getByText(/won’t be drawn/)).toHaveCount(0);
  await app.close();
});

test('doodle: fill closed shapes without keeping their outlines', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + 120, cy);
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2; // ends exactly where it started
    await page.mouse.move(cx + 120 * Math.cos(a), cy + 120 * Math.sin(a));
  }
  await page.mouse.up();

  await expect(page.getByLabel('Keep outlines')).toBeDisabled();
  await page.getByLabel('Fill closed shapes').check();
  await expect(page.getByLabel('Keep outlines')).toBeChecked();
  await page.getByLabel('Keep outlines').uncheck();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-fill-only.png') });
  await page.getByRole('button', { name: 'Use drawing' }).click();

  // No outline strokes, one filled shape, hatched with lines.
  await expect(page.getByTitle('Strokes / filled shapes')).toHaveText('0/1');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('lines');
  await expect(page.getByText(/won’t be drawn/)).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'doodle-fill-only-used.png') });
  await app.close();
});

test('remove and restore layers; a hidden layer that still plots is flagged', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'inkscape.svg');
  const paths = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  const before = await paths();

  // Hiding a layer that's still ticked for plotting shows a warning.
  await page.getByTitle('Hide in preview').first().click();
  await expect(page.getByText('A hidden layer is still plotted.', { exact: false })).toBeVisible();
  await page.getByTitle('Show in preview').first().click();

  // Remove a layer: gone from the list and the plot; Restore and Undo bring it back.
  await page.getByRole('button', { name: 'Remove Outlines' }).click();
  await expect(page.getByRole('button', { name: 'Remove Outlines' })).toHaveCount(0);
  await expect(page.getByText('1 removed layer')).toBeVisible();
  await expect.poll(paths).toBeLessThan(before);
  if (shots) await page.screenshot({ path: join(shots, 'layer-removed.png') });
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('button', { name: 'Remove Outlines' })).toBeVisible();
  await expect.poll(paths).toBe(before);

  await page.getByRole('button', { name: 'Remove Outlines' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Remove Outlines' })).toBeVisible();

  // A removed layer stays removed when switching layer modes and back.
  await page.getByRole('button', { name: 'Remove Outlines' }).click();
  await page.getByRole('button', { name: 'One layer' }).click();
  await expect(page.getByText('1 removed layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'By color' }).click();
  await page.getByRole('button', { name: 'From file' }).click();
  await expect(page.getByRole('button', { name: 'Remove Outlines' })).toHaveCount(0);
  await expect(page.getByText('1 removed layer')).toBeVisible();
  await app.close();
});

test('per-layer speed changes the time estimate (MOTION-3)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const seconds = async () => {
    const t = (await page.getByText(/paths · draw/).textContent())!.split('≈')[1]!.trim();
    const m = /(?:(\d+)m\s*)?(\d+)s/.exec(t)!;
    return Number(m[1] ?? 0) * 60 + Number(m[2]);
  };
  const before = await seconds();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByText('55 mm/s')).toBeVisible(); // 25% of 221 mm/s
  const drawing = page.getByRole('spinbutton', { name: 'Drawing', exact: true });
  await drawing.fill('60');
  await drawing.press('Enter');
  await expect(page.getByText('133 mm/s')).toBeVisible();
  await expect.poll(seconds).toBeLessThan(before);
  await app.close();
});

test('dry run traces the outline with the pen up (PLOT-6)', async () => {
  const app = await launch({ PLOTTER_SIM_SPEED: '40' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(page.getByText('Dry run done')).toBeVisible({ timeout: 30000 });
  // Ready to plot for real afterwards.
  await expect(page.getByRole('button', { name: 'Start plot' })).toBeEnabled();
  await app.close();
});

test('heavy processing runs in the background; the window stays responsive (PREVIEW-5)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await expect(page.getByText(/paths · draw/)).toBeVisible();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('concentric');
  await page.getByLabel('Add transform').selectOption('tessellate');
  for (const [name, value] of [
    ['Columns', '24'],
    ['Rows', '24'],
  ] as const) {
    const f = page.getByRole('spinbutton', { name, exact: true });
    await f.fill(value);
    await f.press('Enter');
  }
  await expect(page.getByRole('status')).toHaveText('Updating…');
  // While it works, the UI still reacts right away.
  const t0 = Date.now();
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('tab', { name: 'Page' })).toHaveAttribute('aria-selected', 'true');
  const tabMs = Date.now() - t0;
  expect(tabMs).toBeLessThan(500);
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByText(/paths · draw/)).toBeVisible();
  console.log(`tab switch while processing: ${tabMs} ms`);
  await app.close();
});

test('autosave: unsaved work comes back after a crash (PROJ-4)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-'));
  const open = async () => {
    const app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator('#root > div').waitFor();
    return { app, page };
  };

  let { app, page } = await open();
  await dropFile(page, 'motif.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.waitForTimeout(4000); // autosave writes 3 s after the last change
  app.process().kill('SIGKILL'); // no clean shutdown

  ({ app, page } = await open());
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('closed with unsaved changes to motif');
  if (shots) await page.screenshot({ path: join(shots, 'recovery.png') });
  await banner.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle()))
    .toContain('(edited)');
  await page.waitForTimeout(4000);
  app.process().kill('SIGKILL');

  // Discard removes it for good.
  ({ app, page } = await open());
  await page.getByRole('alert').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await app.close();
  ({ app, page } = await open());
  await page.waitForTimeout(500);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await app.close();
});

test('recent files: File → Open Recent reopens projects (PROJ-4)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plotter-studio-'));
  const file = join(dir, 'Recent test.plot.json');
  const app = await launch();
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  }, file);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const recentLabel = () =>
    app.evaluate(
      ({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('recent-0')?.label ?? null,
    );
  await expect.poll(recentLabel).toBe('Recent test.plot.json');

  // Open something else, then reopen the project from the menu.
  await dropFile(page, 'figma.svg');
  await expect(page.getByText('figma.svg')).toBeVisible();
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('recent-0')!.click());
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);

  // A file that's gone is dropped from the menu.
  const { rmSync } = await import('node:fs');
  rmSync(file);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('recent-0')!.click());
  await expect.poll(recentLabel).not.toBe('Recent test.plot.json');
  await app.close();
});

test('auto-reload: the artwork reloads when its file changes, keeping settings (IMPORT-5)', async () => {
  const { writeFileSync, renameSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'plotter-studio-watch-'));
  const file = join(dir, 'art.svg');
  const svg = (shapes: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">${shapes}</svg>`;
  // Save the way many editors do: write a new file, then rename it over the old one.
  const save = (shapes: string) => {
    writeFileSync(join(dir, 'tmp.svg'), svg(shapes));
    renameSync(join(dir, 'tmp.svg'), file);
  };
  writeFileSync(file, svg('<path d="M10 10 L90 10" stroke="#000"/>'));

  const app = await launch();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
  }, file);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByRole('button', { name: 'Open…' }).click();
  await expect(page.getByText('art.svg')).toBeVisible();
  await expect(page.getByText(/^1 paths · draw/)).toBeVisible();
  await page.getByRole('button', { name: 'Landscape' }).click();

  save('<path d="M10 10 L90 10" stroke="#000"/><path d="M10 50 L90 50" stroke="#000"/>');
  await expect(page.getByText('Reloaded')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/^2 paths · draw/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/); // kept

  // Switched off: changes are ignored.
  await page.getByLabel('Auto-reload').uncheck();
  save('<path d="M10 90 L90 90" stroke="#000"/>');
  await page.waitForTimeout(1500);
  await expect(page.getByText(/^2 paths · draw/)).toBeVisible();
  await app.close();
});

test('continue a stopped plot from where it stopped (PLOT-5)', async () => {
  test.setTimeout(90000);
  const app = await launch({ PLOTTER_SIM_SPEED: '4' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg'); // outlines only: about 20 s of plotting, 5 s at 4x
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Start plot' }).click();
  await expect(page.getByText('Plotting')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible({ timeout: 20000 });

  const panel = page.getByText(/^Stopped at path \d+ of \d+ in Layer 1/);
  await expect(panel).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'continue.png') });
  await page.getByRole('button', { name: 'Continue plot' }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(panel).toHaveCount(0);
  await app.close();
});

test('export what will be plotted as SVG and toolpath JSON (PREVIEW-6)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plotter-studio-export-'));
  const app = await launch();
  await app.evaluate(({ dialog }, dir) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const opts = args[args.length - 1] as { defaultPath: string };
      return { canceled: false, filePath: `${dir}/${opts.defaultPath}` };
    }) as never;
  }, dir);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  await page.getByRole('tab', { name: 'Plot' }).click();
  const count = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  await expect.poll(count).toBeGreaterThan(3);
  const paths = await count();

  await page.getByRole('button', { name: 'Export SVG…' }).click();
  const svgFile = join(dir, 'motif (plotted).svg');
  await expect
    .poll(() => {
      try {
        return readFileSync(svgFile, 'utf8').length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  const svg = readFileSync(svgFile, 'utf8');
  expect(svg).toContain('inkscape:groupmode="layer"');
  expect(svg.match(/<path /g)).toHaveLength(paths);

  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.getMenuItemById('exportJson')!.click(),
  );
  const jsonFile = join(dir, 'motif (plotted).json');
  await expect
    .poll(() => {
      try {
        return readFileSync(jsonFile, 'utf8').length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  const json = JSON.parse(readFileSync(jsonFile, 'utf8'));
  expect(json.format).toBe('plotter-studio-toolpath');
  expect(json.layers[0].paths).toHaveLength(paths);
  await app.close();
});

test('playback: scrub and play the plot order (PREVIEW-4)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  await page.getByRole('button', { name: '▶ Playback' }).click();
  const bar = page.getByRole('group', { name: 'Playback' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Pause playback' }).click(); // it starts playing

  const slider = bar.getByLabel('Playback time');
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round(max * 0.4)));
  await expect(bar.getByText(/^\d+:\d\d \/ \d+:\d\d$/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'playback.png') });

  await bar.getByRole('button', { name: '100×' }).click();
  await bar.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(bar.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
    timeout: 20000,
  }); // ended
  const [now, total] = (await bar.getByText(/ \/ /).textContent())!.split(' / ');
  expect(now).toBe(total);
  await bar.getByRole('button', { name: 'Close playback' }).click();
  await expect(bar).toHaveCount(0);
  await app.close();
});

test('your default fill is used for automatic fills and remembered (HATCH-7)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-'));
  let app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('crosshatch');
  const spacing = page.getByRole('spinbutton', { name: 'Spacing', exact: true });
  await spacing.fill('0.4');
  await spacing.press('Enter');
  await page.getByRole('button', { name: 'Save as my default fill' }).click();
  await expect(page.getByText('Your default fill: Crosshatch, 0.4 mm, 45°.')).toBeVisible();
  await app.close();

  // After a restart, a fill-only file gets it.
  app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'fill-only.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('crosshatch');
  await expect(page.getByRole('spinbutton', { name: 'Spacing', exact: true })).toHaveValue('0.4');
  await app.close();
});

test('named page presets: save, apply, delete, remembered (PAGE-4)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-'));
  let app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Landscape' }).click();
  const margin = page.getByRole('spinbutton', { name: 'Margin', exact: true });
  await margin.fill('20');
  await margin.press('Enter');
  await page.getByLabel('Preset name').fill('A4 landscape 20 mm');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByLabel('Page preset')).toHaveValue('A4 landscape 20 mm');

  // Change things, then apply the preset again.
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByLabel('Page preset')).toHaveValue('');
  await page.getByLabel('Page preset').selectOption('A4 landscape 20 mm');
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);
  await expect(margin).toHaveValue('20');
  await app.close();

  // Remembered after a restart; Delete removes it.
  app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
  page = await app.firstWindow();
  await page.locator('#root > div').waitFor();
  await page.getByLabel('Page preset').selectOption('A4 landscape 20 mm');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Page preset')).toHaveCount(0);
  await app.close();
});

test('open paths from code as JSON (IMPORT-7)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'spiral.json');
  await expect(page.getByText('spiral.json')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Spiral' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Dots' })).toBeVisible();
  await expect(page.getByText(/^5 paths · draw/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'json-import.png') });
  await app.close();
});

test('machine profiles: pick another model, duplicate and edit your own (DRIVER-5b)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-'));
  let app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Machine profile').selectOption('nextdraw-8511');
  await expect(page.getByText('300 × 218 mm')).toBeVisible();
  await expect(page.getByText(/Not yet tested with this app/)).toBeVisible();

  await page.getByRole('button', { name: 'Duplicate to edit' }).click();
  await expect(page.getByLabel('Profile name')).toHaveValue('Bantam Tools NextDraw 8511 (my copy)');
  const travelX = page.getByRole('spinbutton', { name: 'Travel X', exact: true });
  await travelX.fill('320');
  await travelX.press('Enter');
  await expect(page.getByText('320 × 218 mm')).toBeVisible();
  const steps = page.getByRole('spinbutton', { name: 'Steps/mm', exact: true });
  await steps.fill('0');
  await steps.press('Enter');
  await expect(page.getByText(/Steps per mm must be a number from 1/)).toBeVisible();
  await app.close();

  // Your profile, and the choice of it, are remembered.
  app = await launch({ PLOTTER_STUDIO_USER_DATA: data });
  page = await app.firstWindow();
  await page.locator('#root > div').waitFor();
  await page.getByRole('tab', { name: 'Machine' }).click();
  await expect(page.getByLabel('Profile name')).toHaveValue('Bantam Tools NextDraw 8511 (my copy)');
  await expect(page.getByText('320 × 218 mm')).toBeVisible();
  await app.close();
});

test('line width is labelled as a preview-only setting', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const width = page.getByRole('spinbutton', { name: 'Line width' });
  await expect(width).toHaveValue('0.4');
  await expect(page.getByText('preview only', { exact: true })).toBeVisible();
  await width.fill('0.8');
  await expect(width).toHaveValue('0.8');
  if (shots) await page.screenshot({ path: join(shots, 'line-width.png') });
  await app.close();
});

test('kaleidoscope: adjust by dragging and zooming in the preview (GEN-1)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByLabel('Add transform').selectOption('kaleidoscope');
  await expect(page.getByLabel('Source')).toHaveValue('wedge');
  const centerX = page.getByRole('spinbutton', { name: 'Center X', exact: true });
  const zoom = page.getByRole('spinbutton', { name: 'Zoom', exact: true });
  await expect(centerX).toHaveValue('0');
  if (shots) await page.screenshot({ path: join(shots, 'kaleidoscope.png') });

  await page.getByRole('button', { name: 'Adjust in preview' }).click();
  await expect(page.getByText('Drag to move the artwork', { exact: false })).toBeVisible();
  const box = (await page.getByTestId('preview').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 6, y, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => Number(await centerX.inputValue())).toBeLessThan(0);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(100);
  if (shots) await page.screenshot({ path: join(shots, 'kaleidoscope-adjusted.png') });

  // Undo: the zoom, then the whole drag in one step.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Adjust in preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(zoom).toHaveValue('100');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(centerX).toHaveValue('0');

  // Only the last transform can be adjusted.
  await page.getByLabel('Add transform').selectOption('tile');
  await expect(page.getByRole('button', { name: 'Adjust in preview' })).toBeDisabled();
  await app.close();
});

test('fractal: presets and per-copy settings (GEN-3)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const paths = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  await page.getByLabel('Add transform').selectOption('fractal');
  // Default: 3 copies over 5 levels, last level only.
  await expect(page.getByRole('spinbutton', { name: 'Copy 3 size' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Copy 4 size' })).toHaveCount(0);
  await expect.poll(paths).toBeGreaterThan(200);
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'fractal-triangle.png') });

  await page.getByLabel('Start from').selectOption({ label: 'Branches' });
  await expect(page.getByRole('spinbutton', { name: 'Copies per level' })).toHaveValue('2');
  await expect(page.getByRole('spinbutton', { name: 'Copy 3 size' })).toHaveCount(0);
  await expect(page.getByLabel('Keep every level')).toBeChecked();
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'fractal-branches.png') });

  await page.getByLabel('Start from').selectOption({ label: 'Pinwheel' });
  await expect(page.getByRole('spinbutton', { name: 'Copy 4 turn' })).toHaveValue('285');
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'fractal-corners.png') });
  await page.getByLabel('Start from').selectOption({ label: 'Spiral' });
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'fractal-spiral.png') });
  await app.close();
});

test('plot log: a finished plot is logged with a note, and opens with its settings (PLOT-7)', async () => {
  test.setTimeout(90000);
  const app = await launch({ PLOTTER_SIM_SPEED: '8' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByText('Plots you make are listed here', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Start plot' }).click();
  await expect(page.getByText('In progress', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible({ timeout: 60000 });

  const note = page.getByPlaceholder('Add a note (pen, paper…)');
  await note.fill('0.3 fineliner, Bristol');
  await note.press('Enter');
  await expect(note).toHaveValue('0.3 fineliner, Bristol');
  if (shots) await page.screenshot({ path: join(shots, 'plot-log.png') });

  // Change a setting, then open the logged plot: its settings come back.
  await page.getByRole('tab', { name: 'Page' }).click();
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('button', { name: 'Portrait' })).toHaveClass(/active/);
  const title = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle());
  await expect.poll(title).toMatch(/^motif \(plotted \d{4}-\d\d-\d\d\) — /);

  // The note survives a restart of the window's view of the log.
  await page.reload();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByPlaceholder('Add a note (pen, paper…)')).toHaveValue(
    '0.3 fineliner, Bristol',
  );
  await page.getByRole('button', { name: /Delete log entry/ }).click();
  await expect(page.getByText('Plots you make are listed here', { exact: false })).toBeVisible();
  await app.close();
});

test('ripples fill: drag its center in the preview', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('ripples');
  const x = page.getByRole('spinbutton', { name: 'Center X / Y' }).first();
  await expect(x).toHaveValue('0');
  await page.getByRole('button', { name: 'Place in preview' }).click();
  const box = (await page.getByTestId('preview').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx + i * 5, cy, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(5);
  await app.close();
});

test('spiral fill: move its center with the fields or by dragging in the preview', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('spiral');
  const x = page.getByRole('spinbutton', { name: 'Center X / Y' }).first();
  await expect(x).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Place in preview' }).click();
  await expect(page.getByText('Drag to move the center')).toBeVisible();
  const box = (await page.getByTestId('preview').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx + i * 5, cy, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(5);
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'spiral-center.png') });

  // One drag, one undo step; then Reset.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Place in preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(x).toHaveValue('0');
  await x.fill('12');
  await x.press('Enter');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(x).toHaveValue('0');
  await page.getByLabel('Same center for all shapes').check();
  await expect(page.getByLabel('Same center for all shapes')).toBeChecked();
  await app.close();
});

test('the side panel resizes by dragging, fits its content, and remembers its width', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const panel = page.getByRole('tablist').locator('..');
  const width = async () => Math.round((await panel.boundingBox())!.width);
  /** True if any tab's content is wider than the panel (needs sideways scrolling). */
  const overflows = async () => {
    for (const tab of ['Page', 'Fill', 'Machine', 'Plot']) {
      await page.getByRole('tab', { name: tab }).click();
      const wide = await panel.evaluate((el) => {
        const body = el.lastElementChild as HTMLElement;
        return body.scrollWidth > body.clientWidth + 1;
      });
      if (wide) return tab;
    }
    return null;
  };
  expect(await width()).toBe(300);
  expect(await overflows()).toBeNull();

  const handle = page.getByRole('separator', { name: 'Resize the side panel' });
  const drag = async (dx: number) => {
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 200);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + 200, { steps: 5 });
    await page.mouse.up();
  };
  const near = async (w: number) => expect(Math.abs((await width()) - w)).toBeLessThanOrEqual(2);
  await drag(-150);
  await near(450);
  await drag(400); // stops at the narrowest
  expect(await width()).toBe(260);
  expect(await overflows()).toBeNull();
  await drag(-2000); // stops where the preview keeps its room: 1400 - 240 - 320
  expect(await width()).toBe(840);

  await handle.dblclick();
  expect(await width()).toBe(300);
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  expect(await width()).toBe(310);
  await drag(-90);
  await page.reload();
  await page.getByRole('tablist').waitFor();
  await near(400);
  await app.close();
});

test('waves and noise fills, with the amplitude held back unless lines may cross', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const paths = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('waves');
  await expect(page.getByRole('spinbutton', { name: 'Wavelength' })).toHaveValue('10');
  await expect.poll(paths).toBeGreaterThan(3);
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'fill-waves.png') });

  const phase = page.getByRole('spinbutton', { name: 'Phase shift' });
  await phase.fill('180');
  await phase.press('Enter');
  const amp = page.getByRole('spinbutton', { name: 'Amplitude' });
  await amp.fill('3');
  await amp.press('Enter');
  await expect(page.getByText(/Held to 0\.3 mm so lines don't cross/)).toBeVisible();
  await page.getByLabel('Let lines cross').check();
  await expect(page.getByText(/Held to/)).toHaveCount(0);

  await page.getByLabel('Fill type').selectOption('noise');
  await expect(page.getByRole('spinbutton', { name: 'Bump size' })).toHaveValue('15');
  await page.getByLabel('Let lines cross').uncheck();
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'fill-noise.png') });
  await app.close();
});

test('arrange: move and resize layers and the whole artwork by dragging', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'inkscape.svg');
  const canvas = page.getByTestId('preview');
  type Box = { minX: number; minY: number; maxX: number; maxY: number };
  const box = async (): Promise<Box> =>
    JSON.parse((await canvas.getAttribute('data-arrange-box'))!);
  /** Screen point of a paper point (mm). */
  const screen = async (x: number, y: number) => {
    const [s, vx, vy] = (await canvas.getAttribute('data-view'))!.split(',').map(Number);
    const r = (await canvas.boundingBox())!;
    return { x: r.x + vx! + x * s!, y: r.y + vy! + y * s!, scale: s! };
  };
  const drag = async (from: { x: number; y: number }, dx: number, dy: number, noSnap = false) => {
    await page.mouse.move(from.x, from.y);
    if (noSnap) await page.keyboard.down('Meta');
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
    await page.mouse.up();
    if (noSnap) await page.keyboard.up('Meta');
    await expect(page.getByText('Updating…')).toHaveCount(0);
  };
  const fillTabValue = async (name: string, nth = 0) => {
    await page.getByRole('tab', { name: 'Fill' }).click();
    return Number(await page.getByRole('spinbutton', { name }).nth(nth).inputValue());
  };

  await page.getByRole('button', { name: '✥ Arrange' }).click();
  await page.getByTitle('Outlines', { exact: true }).click();
  await expect(page.getByRole('status').getByText('Outlines', { exact: true })).toBeVisible();
  const b0 = await box();

  // Move without snapping: 40 px right.
  const c = await screen((b0.minX + b0.maxX) / 2, (b0.minY + b0.maxY) / 2);
  await drag(c, 40, 0, true);
  await expect.poll(async () => (await box()).minX).toBeCloseTo(b0.minX + 40 / c.scale, 1);
  expect(await fillTabValue('Move X / Y')).toBeCloseTo(40 / c.scale, 1);
  if (shots) await page.screenshot({ path: join(shots, 'arrange-layer.png') });

  // One drag is one undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => fillTabValue('Move X / Y')).toBe(0);

  // Snapping: drop the left edge 0.8 mm right of the margin (15 mm): it lands on it.
  const start = await screen((b0.minX + b0.maxX) / 2, (b0.minY + b0.maxY) / 2);
  await drag(start, (15.8 - b0.minX) * start.scale, 0);
  await expect.poll(async () => (await box()).minX).toBeCloseTo(15, 3);

  // A corner keeps the proportions.
  const b1 = await box();
  const se = await screen(b1.maxX, b1.maxY);
  await drag(se, 30, 4, true);
  const b2 = await box();
  expect(b2.maxX - b2.minX).toBeGreaterThan(b1.maxX - b1.minX);
  expect((b2.maxX - b2.minX) / (b2.maxY - b2.minY)).toBeCloseTo(
    (b1.maxX - b1.minX) / (b1.maxY - b1.minY),
    2,
  );
  expect(await fillTabValue('Size W / H', 0)).toBeCloseTo(await fillTabValue('Size W / H', 1), 0);

  // Arrow keys nudge by 1 mm.
  const before = await fillTabValue('Move X / Y');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => fillTabValue('Move X / Y')).toBeCloseTo(before + 1, 1);

  // The round handle turns it: a quarter turn snaps to exactly 90°, and its box turns too.
  const f0 = JSON.parse((await canvas.getAttribute('data-arrange-frame'))!);
  const scaleNow = (await screen(0, 0)).scale;
  const knob = await screen(f0.cx, f0.cy - f0.h / 2 - 24 / scaleNow);
  const r = f0.h / 2 + 24 / scaleNow;
  const right = await screen(f0.cx + r * 0.995, f0.cy + r * 0.05); // just short of 90°
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(right.x, right.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('Updating…')).toHaveCount(0);
  expect(await fillTabValue('Rotation')).toBe(90);
  const turnedBox = await box();
  expect(turnedBox.maxX - turnedBox.minX).toBeCloseTo(f0.h, 0);
  expect(turnedBox.maxY - turnedBox.minY).toBeCloseTo(f0.w, 0);
  if (shots) await page.screenshot({ path: join(shots, 'arrange-rotate.png') });

  // Empty paper: all layers together. Each layer moves; the Page tab doesn't change.
  const outlinesY = await fillTabValue('Move X / Y', 1);
  const corner = await screen(205, 292);
  await page.mouse.click(corner.x, corner.y);
  await expect(page.getByRole('status').getByText('All layers')).toBeVisible();
  const art = await box();
  const mid = await screen((art.minX + art.maxX) / 2, (art.minY + art.maxY) / 2);
  await drag(mid, 0, 30, true);
  await expect.poll(async () => (await box()).minY).toBeCloseTo(art.minY + 30 / mid.scale, 1);
  if (shots) await page.screenshot({ path: join(shots, 'arrange-whole.png') });
  await page.getByTitle('Fills', { exact: true }).click();
  await expect.poll(() => fillTabValue('Move X / Y', 1)).toBeCloseTo(30 / mid.scale, 1);
  await page.getByTitle('Outlines', { exact: true }).click();
  await expect.poll(() => fillTabValue('Move X / Y', 1)).toBeCloseTo(outlinesY + 30 / mid.scale, 1);
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Offset X / Y' }).nth(1)).toHaveValue('0');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '✥ Arrange' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await app.close();
});

test('arrange with one layer: always that layer, never a separate "all layers" box', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const canvas = page.getByTestId('preview');
  await page.getByRole('button', { name: '✥ Arrange' }).click();
  const bar = page.getByRole('status');
  await expect(bar.getByText('Layer 1', { exact: true })).toBeVisible();
  // Clicking empty paper keeps the layer: there's nothing else to arrange.
  const [s, vx, vy] = (await canvas.getAttribute('data-view'))!.split(',').map(Number);
  const r = (await canvas.boundingBox())!;
  await page.mouse.click(r.x + vx! + 205 * s!, r.y + vy! + 292 * s!);
  await expect(bar.getByText('Layer 1', { exact: true })).toBeVisible();
  await expect(bar.getByText('All layers')).toHaveCount(0);
  await expect(bar.getByText(/click empty paper/)).toHaveCount(0);
  await app.close();
});

test('doodle with outlines kept: the Fill tab can still turn the outlines off', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + 120, cy);
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    await page.mouse.move(cx + 120 * Math.cos(a), cy + 120 * Math.sin(a));
  }
  await page.mouse.up();
  await page.getByLabel('Fill closed shapes').check();
  await expect(page.getByLabel('Keep outlines')).toBeChecked();
  await page.getByRole('button', { name: 'Use drawing' }).click();

  const draw = async () =>
    (await page.getByText(/\d+ paths · draw/).textContent())!.match(/draw ([\d.]+ m?m)/)![1]!;
  await page.getByRole('tab', { name: 'Fill' }).click();
  const outlines = page.getByLabel('Draw outlines of filled shapes');
  await expect(outlines).toBeChecked();
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  const withOutline = await draw();
  await outlines.uncheck();
  await expect.poll(draw).not.toBe(withOutline); // the outline is gone from the plot
  await outlines.check();
  await expect.poll(draw).toBe(withOutline);
  await app.close();
});

test('more fills: triangles, hexagons, wave shapes, flow, ripples, stipple', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'fill-only.svg');
  const paths = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  const settle = () => expect(page.getByText('Updating…')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Fill' }).click();
  const type = page.getByLabel('Fill type');
  const spacing = (name: string) => page.getByRole('spinbutton', { name, exact: true });

  // Smallest first: switching only ever raises the spacing.
  for (const [t, min] of [
    ['stipple', 1],
    ['triangles', 3],
    ['hexagons', 4],
  ] as const) {
    await type.selectOption(t);
    // Sparser fills start at a sensible spacing instead of the 0.6 mm of line hatching.
    const label = t === 'hexagons' ? 'Cell size' : t === 'stipple' ? 'Dot spacing' : 'Spacing';
    await expect(spacing(label)).toHaveValue(String(min));
    await expect.poll(paths).toBeGreaterThan(2);
    if (t === 'stipple') {
      await expect(page.getByText(/stipple by tone/)).toBeVisible();
      // Dashes instead of dots: the pen draws lines (dots draw 0 mm).
      await expect(page.getByText(/paths · draw 0 mm/)).toBeVisible();
      await expect(spacing('Dash angle')).toHaveCount(0);
      await spacing('Dash length').fill('1.5');
      await spacing('Dash length').press('Enter');
      await expect(spacing('Dash angle')).toBeVisible();
      await expect(page.getByText(/paths · draw [1-9][\d.]* m/)).toBeVisible();
      await settle();
      if (shots) await page.screenshot({ path: join(shots, 'fill-stipple-dashes.png') });
      await spacing('Dash length').fill('0');
      await spacing('Dash length').press('Enter');
    }
    await settle();
    if (shots) await page.screenshot({ path: join(shots, `fill-${t}.png`) });
  }
  await type.selectOption('waves');
  for (const shape of ['triangle', 'square'] as const) {
    await page.getByLabel('Wave shape').selectOption(shape);
    await settle();
    if (shots) await page.screenshot({ path: join(shots, `fill-waves-${shape}.png`) });
  }

  await type.selectOption('flow');
  await expect(spacing('Stroke length')).toHaveValue('0');
  await settle();
  if (shots) await page.screenshot({ path: join(shots, 'fill-flow.png') });
  await spacing('Stroke length').fill('4');
  await spacing('Stroke length').press('Enter');
  await settle();
  if (shots) await page.screenshot({ path: join(shots, 'fill-flow-short.png') });

  await type.selectOption('ripples');
  await expect(page.getByRole('button', { name: 'Place in preview' })).toBeVisible();
  await settle();
  if (shots) await page.screenshot({ path: join(shots, 'fill-ripples.png') });
  await app.close();
});

test('text: type it in a single-stroke font, style it, delete and undo (LATER-6)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  const draw = async () =>
    Number(
      (await page.getByText(/\d+ paths · draw/).textContent())!.match(/draw ([\d.]+) m?m/)![1],
    );

  // No file open: text still works.
  await page.getByRole('button', { name: '+ Add text' }).click();
  const text = page.getByLabel('Text', { exact: true });
  await expect(text).toHaveValue('Text');
  await expect(page.getByTitle('“Text”')).toBeVisible(); // its layer
  await text.fill('Hello\nplotter');
  await expect(page.getByTitle('“Hello”')).toBeVisible();
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  const sans = await draw();
  await page.getByLabel('Text style').selectOption({ label: 'Script' });
  await expect.poll(draw).not.toBe(sans);
  const size = page.getByRole('spinbutton', { name: 'Size', exact: true });
  await size.fill('20');
  await size.press('Enter');
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'text.png') });

  // ✕ deletes it; Undo brings it back.
  await page.getByRole('button', { name: 'Remove “Hello”' }).click();
  await expect(page.getByTitle('“Hello”')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTitle('“Hello”')).toBeVisible();

  // Dropping in new artwork starts a new project: the text stays with the old one.
  await dropFile(page, 'motif.svg');
  await expect(page.getByTitle('Layer 1', { exact: true })).toBeVisible();
  await expect(page.getByTitle('“Hello”')).toHaveCount(0);
  await app.close();
});

test('View > Appearance: light, dark and colour themes, kept after a restart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-'));
  const env = { PLOTTER_STUDIO_USER_DATA: dataDir };
  const bg = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  // Playwright pins pages to light by default; let the app's own setting through.
  const open = async (app: Awaited<ReturnType<typeof launch>>) => {
    const page = await app.firstWindow();
    await page.emulateMedia({ colorScheme: null });
    await page.locator('#root > div').waitFor();
    return page;
  };
  const pick = (app: Awaited<ReturnType<typeof launch>>, id: string) =>
    app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.click(), id);

  let app = await launch(env);
  let page = await open(app);
  // The preview canvas redraws in the new colours (its top-left pixel is the --canvas grey).
  const corner = () =>
    page
      .getByTestId('preview')
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(','),
      );
  await pick(app, 'appearance-dark');
  await expect.poll(() => bg(page)).toBe('#1b1b1d');
  await expect.poll(corner).toBe('22,22,24'); // #161618
  await pick(app, 'appearance-light');
  await expect.poll(() => bg(page)).toBe('#f4f4f2');
  await expect.poll(corner).toBe('228,228,224'); // #e4e4e0
  // Colour themes: two light ones in a row still redraw the canvas.
  await pick(app, 'appearance-butter');
  await expect.poll(() => bg(page)).toBe('#fff1b8');
  await expect.poll(corner).toBe('245,224,138'); // #f5e08a
  await pick(app, 'appearance-matcha');
  await expect.poll(() => bg(page)).toBe('#e4cee0');
  await expect.poll(corner).toBe('215,188,210'); // #d7bcd2
  if (shots) await page.screenshot({ path: join(shots, 'theme-matcha.png') });
  await pick(app, 'appearance-ube');
  await expect.poll(() => bg(page)).toBe('#241436');
  // A dark theme is dark underneath, so native controls match.
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  if (shots) await page.screenshot({ path: join(shots, 'theme-ube.png') });
  await pick(app, 'appearance-matcha');
  await app.close();

  // Kept for next time (from the first paint), and the menu shows it.
  app = await launch(env);
  page = await open(app);
  await expect.poll(() => bg(page)).toBe('#e4cee0');
  const checked = await app.evaluate(
    ({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('appearance-matcha')!.checked,
  );
  expect(checked).toBe(true);
  // Back to following the system.
  await pick(app, 'appearance-system');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['theme']))
    .toBe(undefined);
  await app.close();
});

test('splash screen: start from it, open a recent file, turn it off', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'plotter-studio-e2e-'));
  // One recent file, as the app would have saved it.
  const motif = join(fixtures, 'motif.svg');
  writeFileSync(join(dataDir, 'recent.json'), JSON.stringify([{ path: motif, name: 'motif.svg' }]));
  const env = { PLOTTER_STUDIO_USER_DATA: dataDir, PLOTTER_STUDIO_NO_SPLASH: '' };
  const splash = (page: Page) => page.getByRole('dialog', { name: 'Welcome to Plotka' });

  // Shown at start; Esc closes it.
  let app = await launch(env);
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(splash(page)).toBeVisible();
  await expect(page.getByRole('img', { name: /Example plot/ })).toBeVisible();
  await expect(splash(page).getByText(/Version \d/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'splash.png') });
  await page.keyboard.press('Escape');
  await expect(splash(page)).toHaveCount(0);
  await app.close();

  // A recent file opens and closes it.
  app = await launch(env);
  page = await app.firstWindow();
  await splash(page)
    .getByRole('button', { name: /motif\.svg/ })
    .click();
  await expect(splash(page)).toHaveCount(0);
  await expect(page.getByText('motif.svg', { exact: true })).toBeVisible();
  await app.close();

  // + Text starts a text layer; then turn the splash off for next time.
  app = await launch(env);
  page = await app.firstWindow();
  await splash(page).getByLabel('Show at start').uncheck();
  await splash(page).getByRole('button', { name: '+ Text' }).click();
  await expect(splash(page)).toHaveCount(0);
  await expect(page.getByLabel('Text', { exact: true })).toHaveValue('Text');
  await app.close();

  app = await launch(env);
  page = await app.firstWindow();
  await page.locator('#root > div').waitFor();
  await expect(page.getByRole('button', { name: 'Doodle…' })).toBeVisible();
  await expect(splash(page)).toHaveCount(0);
  await app.close();
});

test('doodle: combine overlapping shapes (merge, cut out, separate, undo)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Two closed loops that overlap in the middle.
  for (const ox of [-50, 50]) {
    await page.mouse.move(cx + ox + 80, cy);
    await page.mouse.down();
    for (let i = 1; i <= 90; i++) {
      const a = (i / 90) * Math.PI * 2 * 0.99;
      await page.mouse.move(cx + ox + 80 * Math.cos(a), cy + 80 * Math.sin(a));
    }
    await page.mouse.up();
  }
  await page.getByLabel('Fill closed shapes').check();
  const merge = page.getByRole('button', { name: 'Merge' });
  const separate = page.getByRole('button', { name: 'Separate' });
  await expect(merge).toBeDisabled();

  // Select both (⇧ adds), then merge.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.mouse.click(cx - 100, cy);
  await expect(page.getByText('1 shape selected.')).toBeVisible();
  await page.keyboard.down('Shift');
  await page.mouse.click(cx + 100, cy);
  await page.keyboard.up('Shift');
  await expect(page.getByText('2 shapes selected.')).toBeVisible();
  await merge.click();
  await expect(separate).toBeEnabled();
  await expect(page.getByText(/2 strokes → \d+ /)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-merge.png') });

  // Undo brings the two shapes back; redo merges again; Separate splits it.
  const pad = page.getByRole('dialog', { name: 'Doodle' });
  await pad.getByRole('button', { name: 'Undo' }).click();
  await expect(separate).toBeDisabled();
  await pad.getByRole('button', { name: 'Redo' }).click();
  await page.mouse.click(cx, cy);
  await separate.click();
  await expect(page.getByText('2 shapes selected.')).toBeVisible();

  // Cut the right one out of the left: one crescent.
  await page.getByRole('button', { name: 'Cut out' }).click();
  await expect(separate).toBeEnabled();
  await expect(page.getByText('A combined shape is selected.')).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-cut.png') });
  await page.getByRole('button', { name: 'Use drawing' }).click();
  await expect(page.getByText('Doodle.svg')).toBeVisible();
  // One filled shape (not two).
  await expect(page.getByTitle('Strokes / filled shapes')).toHaveText('0/1');
  await app.close();
});

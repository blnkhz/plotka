import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

const fixtures = join(__dirname, '../../../packages/core/test/fixtures/svg');
const shots = process.env['SCREENSHOT_DIR'];

/**
 * Launches the app with a fresh, temporary data folder (never the user's own settings).
 * PLOTTER_STUDIO_E2E skips the "unsaved changes" question on close.
 */
const launch = (env: Record<string, string> = {}) =>
  electron.launch({
    args: [join(__dirname, '..')],
    env: {
      ...process.env,
      PLOTTER_STUDIO_E2E: '1',
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

  await page.getByLabel('Fill type').selectOption('zigzag');
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
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '+' }).click();
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
  await expect.poll(title).toBe('My pattern — Plotter Studio');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  expect(saved.format).toBe('plotter-studio-project');
  expect(saved.source.name).toBe('motif.svg');
  expect(saved.pipeline[0].params.pattern).toBe('p4g');

  // Start over with another file, then reopen the project.
  await dropFile(page, 'figma.svg');
  await expect(page.getByLabel('Pattern')).toHaveValue('p4g'); // transforms aren't per file
  await page.getByRole('button', { name: 'Open…' }).click();
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect.poll(title).toBe('My pattern — Plotter Studio');
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

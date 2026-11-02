import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

const fixtures = join(__dirname, '../../../packages/core/test/fixtures/svg');
const shots = process.env['SCREENSHOT_DIR'];

/** Launches the app; PLOTTER_STUDIO_E2E skips the "unsaved changes" question on close. */
const launch = (env: Record<string, string> = {}) =>
  electron.launch({
    args: [join(__dirname, '..')],
    env: { ...process.env, PLOTTER_STUDIO_E2E: '1', ...env },
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
  await expect(page.getByText('Outlines')).toBeVisible();
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'inkscape.png') });

  // A4 landscape, 15 mm margin (MVP setup)
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByText('Total')).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'landscape-stats.png') });

  // A3 portrait is taller than the V3/A3 travel -> blocking warning
  await page.getByRole('tab', { name: 'Page' }).click();
  await page.getByLabel('Paper').selectOption('a3');
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByText(/Plotting is blocked/)).toBeVisible();

  await dropFile(page, 'figma.svg');
  await page.getByLabel('Original').check();
  await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
  await page.getByLabel('Paper').selectOption('a4');
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
  expect(await pathCount()).toBeGreaterThan(before);
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
  const { mkdtempSync, readFileSync: read } = await import('node:fs');
  const { tmpdir } = await import('node:os');
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

  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(title).toBe('My pattern — Plotter Studio');
  const saved = JSON.parse(read(file, 'utf8'));
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

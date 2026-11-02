import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

const fixtures = join(__dirname, '../../../packages/core/test/fixtures/svg');
const shots = process.env['SCREENSHOT_DIR'];

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
  const app = await electron.launch({ args: [join(__dirname, '..')] });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await expect(page.getByText('Open or drop an SVG to start.')).toBeVisible();

  await dropFile(page, 'inkscape.svg');
  await expect(page.getByText('inkscape.svg')).toBeVisible();
  await expect(page.getByText('Outlines')).toBeVisible();
  await expect(page.getByText(/\d+ paths · ≈/)).toBeVisible();
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
  const app = await electron.launch({ args: [join(__dirname, '..')] });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await dropFile(page, 'inkscape.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();

  const pathCount = async () =>
    Number((await page.getByText(/\d+ paths · ≈/).textContent())!.match(/(\d+) paths/)![1]);
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
  const app = await electron.launch({ args: [join(__dirname, '..')] });
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
    await expect(page.getByText(/\d+ paths · ≈/)).toBeVisible();
    if (shots) await page.screenshot({ path: join(shots, `overlap-${t}.png`) });
  }
  await expect(page.getByText('Dot spacing')).toBeVisible();
  await expect(page.getByText('Jitter')).toBeVisible();
  await app.close();
});

test('passes: repeat a layer with slight shifts in several pen colors', async () => {
  const app = await electron.launch({ args: [join(__dirname, '..')] });
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
  await expect(page.getByText('Layer 1 · pass 3')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '+' }).click();
  if (shots) await page.screenshot({ path: join(shots, 'passes-zoom.png') });
  await app.close();
});

test('doodle, turn it into vectors, then tile it', async () => {
  const app = await electron.launch({ args: [join(__dirname, '..')] });
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
  await expect(page.getByText(/\d+ paths · ≈/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'tile.png') });

  // Turning the step off restores the single drawing.
  await page.getByLabel('Use Tile').uncheck();
  if (shots) await page.screenshot({ path: join(shots, 'tile-off.png') });
  await app.close();
});

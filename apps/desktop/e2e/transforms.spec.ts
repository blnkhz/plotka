import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

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

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

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

  // Round the turns: same paths, shorter draw (corners cut); only offered with the pen kept down.
  const drawn = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/draw ([\d.]+)/)![1]);
  const sharpDraw = await drawn();
  await page.getByLabel('Round the turns').check();
  await expect.poll(drawn).toBeLessThan(sharpDraw);
  expect(await pathCount()).toBe(zigzagPaths);
  await page.getByLabel('Keep pen down between lines').uncheck();
  await expect(page.getByLabel('Round the turns')).toHaveCount(0);
  await page.getByLabel('Keep pen down between lines').check();
  await page.getByLabel('Round the turns').uncheck();

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

test('your default fill is used for automatic fills and remembered (HATCH-7)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  let app = await launch({ PLOTKA_USER_DATA: data });
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
  app = await launch({ PLOTKA_USER_DATA: data });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'fill-only.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('crosshatch');
  await expect(page.getByRole('spinbutton', { name: 'Spacing', exact: true })).toHaveValue('0.4');
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
  // The centers show once the ripples are worked out; a drag before that pans the view.
  await expect(page.getByText('Drag to move the center')).toBeVisible();
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

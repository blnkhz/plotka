import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

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
    if (noSnap) await page.keyboard.down('ControlOrMeta');
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
    await page.mouse.up();
    if (noSnap) await page.keyboard.up('ControlOrMeta');
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

test('double-click a layer name to rename it', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: '+ Add layer' }).click();
  const row = page.getByRole('listitem').filter({ has: page.getByLabel('Remove') });
  const name = page.getByLabel(/^Name of /);

  // Enter keeps it, and it shows wherever the layer is named.
  await row.getByText('Layer 1').dblclick();
  await name.fill('Background');
  await name.press('Enter');
  await expect(row.getByText('Background')).toBeVisible();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByText('Fill · Background')).toBeVisible();

  // Esc leaves it, an empty name is ignored, and clicking away keeps the new one.
  await row.getByText('Background').dblclick();
  await name.fill('Nope');
  await name.press('Escape');
  await expect(row.getByText('Background')).toBeVisible();
  await row.getByText('Background').dblclick();
  await name.fill('   ');
  await name.press('Enter');
  await expect(row.getByText('Background')).toBeVisible();
  // Quick changes to the same setting are one undo step; pause like a person would.
  await page.waitForTimeout(500);
  await row.getByText('Background').dblclick();
  await name.fill('Sky');
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(row.getByText('Sky')).toBeVisible();

  // The doodle pad shows it, and Undo takes it back.
  await page.getByRole('button', { name: 'Add doodle…' }).click();
  await expect(page.getByRole('dialog', { name: 'Doodle' }).getByText('Sky')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row.getByText('Background')).toBeVisible();
  await app.close();
});

test('duplicate layers: a file layer, a doodle and text', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  const rows = page.getByRole('listitem').filter({ has: page.getByLabel('Remove') });

  // The copy comes with the fill, and then has its own.
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('hexagons');
  await page.getByRole('button', { name: 'Duplicate Layer 1' }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('Fill · Layer 1 copy')).toBeVisible();
  await expect(page.getByLabel('Fill type')).toHaveValue('hexagons');
  await page.getByLabel('Fill type').selectOption('lines');
  await rows.filter({ hasText: /^Layer 1\s*\d/ }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('hexagons');

  await page.getByRole('button', { name: '+ Add text' }).click();
  await page.getByRole('button', { name: 'Duplicate “Text”' }).click();
  await expect(page.getByTitle('“Text” copy')).toBeVisible();
  await expect(rows).toHaveCount(4);
  if (shots) await page.screenshot({ path: join(shots, 'layer-duplicates.png') });

  // Undo takes it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(3);
  await app.close();
});

import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch } from './helpers';

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
  await expect(page.getByRole('button', { name: 'Edit doodle…' })).toBeVisible();
  // One filled shape (not two).
  await expect(page.getByTitle('Strokes / filled shapes')).toHaveText('0/1');
  await app.close();
});

test('doodles are separate layers with their own fills, and can be edited again', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();

  const loop = async (dx: number) => {
    const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
    const cx = box.x + box.width / 2 + dx;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx + 80, cy);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2 * 0.98;
      await page.mouse.move(cx + 80 * Math.cos(a), cy + 80 * Math.sin(a));
    }
    await page.mouse.up();
  };
  const layers = page.getByRole('listitem').filter({ hasText: /^(Doodle|Layer) \d/ });
  const edit = page.getByRole('button', { name: 'Edit doodle…' });
  const add = page.getByRole('button', { name: 'Add doodle…' });

  await add.click();
  await loop(-120);
  await page.getByLabel('Fill closed shapes').check();
  await page.getByRole('button', { name: 'Use drawing' }).click();
  await expect(layers).toHaveCount(1);
  await expect(edit).toBeVisible();

  // A new layer has no doodle yet, so it offers to add one, starting blank.
  await page.getByRole('button', { name: '+ Add layer' }).click();
  await expect(layers).toHaveCount(2);
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByText(/^0 strokes →/)).toBeVisible();
  await expect(page.getByLabel('Show other doodles')).toBeChecked();
  await loop(120);
  await page.getByRole('button', { name: 'Use drawing' }).click();
  await expect(layers).toHaveCount(2);
  if (shots) await page.screenshot({ path: join(shots, 'doodle-layers.png') });

  // Each has its own settings: the fill of the first doesn't change with the second.
  await page.getByRole('tab', { name: 'Fill' }).click();
  await layers.filter({ hasText: 'Doodle 1' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('lines');
  await page.getByLabel('Fill type').selectOption('hexagons');
  await layers.filter({ hasText: 'Layer 1' }).click();
  await expect(page.getByLabel('Fill type')).not.toHaveValue('hexagons');

  // Editing opens that doodle's own strokes; Cancel leaves it alone, Update layer changes it.
  await layers.filter({ hasText: 'Doodle 1' }).click();
  await edit.click();
  await expect(page.getByText(/^1 stroke →/)).toBeVisible();
  await expect(page.getByLabel('Fill closed shapes')).toBeChecked();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await edit.click();
  await expect(page.getByText(/^1 stroke →/)).toBeVisible();
  await loop(0);
  await page.getByRole('button', { name: 'Update layer' }).click();
  await expect(layers).toHaveCount(2);
  await layers.filter({ hasText: 'Doodle 1' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('hexagons');

  // Deleting a doodle can be undone.
  await page.getByRole('button', { name: 'Remove Layer 1' }).click();
  await expect(layers).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(layers).toHaveCount(2);
  await app.close();
});

test('doodle: place basic shapes, move them and combine them', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const pad = page.getByRole('dialog', { name: 'Doodle' });
  const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const drag = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(cx + x0, cy + y0);
    await page.mouse.down();
    await page.mouse.move(cx + x1, cy + y1, { steps: 8 });
    await page.mouse.up();
  };

  // Dragged out, and placed with a click. Apart for now.
  await expect(pad.getByRole('button', { name: 'Rectangle' })).toHaveAttribute(
    'title',
    'Rectangle',
  );
  await pad.getByRole('button', { name: 'Rectangle' }).click();
  await drag(-250, -100, -50, 100);
  await expect(pad.getByText(/^1 shape$/)).toBeVisible();
  await pad.getByRole('button', { name: 'Ellipse' }).click();
  await page.mouse.click(cx + 150, cy);
  await expect(pad.getByText(/^2 shapes$/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-shapes.png') });

  // They don't overlap yet...
  await page.keyboard.down('Shift');
  await page.mouse.click(cx - 150, cy);
  await page.keyboard.up('Shift');
  await pad.getByRole('button', { name: 'Keep overlap' }).click();
  await expect(pad.getByText("These shapes don't overlap.")).toBeVisible();

  // ...until the ellipse is dragged onto the rectangle. Moving is one undo step.
  await page.mouse.click(cx + 150, cy);
  await drag(150, 0, -30, 0);
  await page.keyboard.down('Shift');
  await page.mouse.click(cx - 200, cy);
  await page.keyboard.up('Shift');
  await pad.getByRole('button', { name: 'Keep overlap' }).click();
  await expect(pad.getByText('A combined shape is selected.')).toBeVisible();
  await expect(pad.getByText(/^2 shapes$/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'doodle-shapes-combined.png') });
  await pad.getByRole('button', { name: 'Separate' }).click();
  await pad.getByRole('button', { name: 'Cut out' }).click();

  await page.getByLabel('Fill closed shapes').check();
  await page.getByRole('button', { name: 'Use drawing' }).click();
  await expect(page.getByTitle('Strokes / filled shapes')).toHaveText('0/1');
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();

  // Delete removes the selection.
  await page.getByRole('button', { name: 'Edit doodle…' }).click();
  await pad.getByRole('button', { name: 'Select' }).click();
  await page.mouse.click(cx - 200, cy);
  await page.keyboard.press('Backspace');
  await expect(pad.getByText(/^0 strokes →/)).toBeVisible();
  await app.close();
});

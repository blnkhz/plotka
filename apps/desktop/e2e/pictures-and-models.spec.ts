import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, cubeFiles, dropText } from './helpers';

test('image dithering: open a picture, tune the marks, use it, edit it again', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  // A left-to-right gradient, black to white, dropped on the window as a PNG.
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 150;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 300, 0);
    g.addColorStop(0, '#000');
    g.addColorStop(1, '#fff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 300, 150);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'gradient.png', { type: 'image/png' }));
    const target = document.querySelector('#root > div')!;
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
  const pad = page.getByRole('dialog', { name: 'Image' });
  await expect(pad).toBeVisible();
  // 150 mm at 1 mm cells: a 150 × 75 grid; about half the cells inked.
  const header = pad.getByText(/gradient\.png → [\d,]+ marks/);
  await expect(pad.getByText(/150 × 75 grid/)).toBeVisible();
  const marks = async () =>
    Number((await header.textContent())!.match(/→ ([\d,]+) marks/)![1]!.replace(/,/g, ''));
  const half = await marks();
  expect(half).toBeGreaterThan(150 * 75 * 0.4);
  expect(half).toBeLessThan(150 * 75 * 0.6);
  if (shots) await page.screenshot({ path: join(shots, 'image-pad.png') });

  // Bigger cells: fewer marks. Brighter: fewer again.
  const cell = pad.getByRole('spinbutton', { name: 'Cell' });
  await cell.fill('2');
  await cell.press('Enter');
  await expect(pad.getByText(/75 × 38 grid/)).toBeVisible();
  const coarse = await marks();
  expect(coarse).toBeLessThan(half / 3);
  await pad.getByLabel('Brightness').fill('40');
  await expect.poll(marks).toBeLessThan(coarse);
  // Halftone: a mark in (nearly) every cell, sized by the dark.
  await pad.getByLabel('Method').selectOption('halftone');
  await expect.poll(marks).toBeGreaterThan(coarse);
  await expect(pad.getByText('up to 80% of a cell')).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'image-pad-halftone.png') });
  await pad.getByLabel('Method').selectOption('diffusion');
  await pad.getByLabel('Mark shape').selectOption('dot');
  if (shots) await page.screenshot({ path: join(shots, 'image-pad-dots.png') });

  // Dithering runs in a worker; Use image waits until the marks match the settings.
  await expect(pad.getByRole('status').filter({ hasText: 'Dithering…' })).toHaveCount(0);
  await expect(pad.getByRole('button', { name: 'Use image' })).toBeEnabled();

  // Use it: it opens as artwork; Edit image… brings back the same settings.
  await pad.getByRole('button', { name: 'Use image' }).click();
  await expect(pad).toHaveCount(0);
  await expect(page.getByText('gradient (dithered).svg')).toBeVisible();
  await expect(page.getByText(/[\d,]+ paths · draw/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit image…' }).click();
  await expect(pad.getByLabel('Mark shape')).toHaveValue('dot');
  await expect(pad.getByRole('spinbutton', { name: 'Cell' })).toHaveValue('2');
  await page.keyboard.press('Escape');
  await expect(pad).toHaveCount(0);
  await app.close();
});

test('3D slicer: STL, OBJ and PLY; visible part vs full mesh; use it and edit it again', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  const files = cubeFiles();
  const pad = page.getByRole('dialog', { name: '3D model' });

  await dropText(page, 'cube.stl', files['cube.stl']);
  await expect(pad).toBeVisible();
  // From ¾ above, each of the 60 slices shows as one line round the two near sides.
  await expect(pad.getByText(/cube\.stl → 60 lines · 12 triangles · 150 × \d+ mm/)).toBeVisible();
  // How much of the result is inked.
  const ink = () =>
    page.getByTestId('model-result').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! < 120) n++;
      return n;
    });
  await expect.poll(ink).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const visible = await ink();
  if (shots) await page.screenshot({ path: join(shots, 'slicer.png') });

  // The full mesh draws the back of every slice too: more ink.
  await pad.getByRole('button', { name: 'Full mesh' }).click();
  await expect.poll(ink).toBeGreaterThan(visible * 1.4);
  // Fewer lines: closed loops, one per plane.
  const lines = pad.getByRole('spinbutton', { name: 'Lines' });
  await lines.fill('20');
  await lines.press('Enter');
  await expect(pad.getByText(/→ 20 lines/)).toBeVisible();
  // From straight above, the slices on the sides are under the top face: hidden.
  await pad.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(400); // the result follows the view a moment later
  const fromAbove = await ink();
  await pad.getByRole('button', { name: 'Visible part' }).click();
  await expect.poll(ink).toBeLessThan(fromAbove * 0.2);
  await expect(pad.getByText(/nothing to draw from this view/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'slicer-top.png') });
  await pad.getByRole('button', { name: '¾', exact: true }).click();
  await page.waitForTimeout(400);

  // Use it; Edit 3D model… brings back the same settings.
  await pad.getByRole('button', { name: 'Use model' }).click();
  await expect(pad).toHaveCount(0);
  await expect(page.getByText('cube (sliced).svg')).toBeVisible();
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit 3D model…' }).click();
  await expect(pad.getByRole('spinbutton', { name: 'Lines' })).toHaveValue('20');
  await page.keyboard.press('Escape');

  // The same cube as OBJ and PLY (quads, split into triangles).
  for (const name of ['cube.obj', 'cube.ply'] as const) {
    await dropText(page, name, files[name]);
    await expect(
      pad.getByText(new RegExp(`${name.replace('.', '\\.')} → \\d+ lines · 12 triangles`)),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await app.close();
});

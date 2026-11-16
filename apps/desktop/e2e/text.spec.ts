import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

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

test('blackletter for a parallel pen: sized from the nib, with a nib preview', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.getByRole('button', { name: '+ Add text' }).click();
  await page.getByLabel('Text', { exact: true }).fill('Anno Domini\nminimum');
  await page.getByLabel('Text style').selectOption({ label: 'Blackletter (parallel pen)' });

  // Capitals 7 nib widths tall: 26.6 mm with the 3.8 mm nib, and the preview turns the pen on.
  const size = page.getByRole('spinbutton', { name: 'Size', exact: true });
  await expect(size).toHaveValue('26.6');
  await expect(size).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Parallel pen' })).toBeChecked();
  await expect(page.getByRole('img', { name: 'Text drawn with the parallel pen' })).toBeVisible();

  // A narrower nib: the size follows.
  await page.getByLabel('Nib width').first().selectOption('2.4');
  await expect(size).toHaveValue('16.8');
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'blackletter.png') });

  // The ornate one keeps the nib sizing.
  await page.getByLabel('Text style').selectOption({ label: 'Blackletter ornate (parallel pen)' });
  await expect(size).toHaveValue('16.8');
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'blackletter-ornate.png') });

  // The Gothic has capitals 6 nib widths tall: 14.4 mm with the 2.4 mm nib.
  await page.getByLabel('Text style').selectOption({ label: 'Gothic (parallel pen)' });
  await expect(size).toHaveValue('14.4');
  await expect(page.getByText('Updating…')).toHaveCount(0);
  if (shots) await page.screenshot({ path: join(shots, 'pen-gothic.png') });

  // Off "From nib", the size is your own again.
  await page.getByRole('checkbox', { name: 'From nib' }).uncheck();
  await expect(size).toBeEnabled();
  await app.close();
});

test('parallel pen view: nib width presets, custom width and angle', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await expect(page.getByText('Updating…')).toHaveCount(0);
  // How much of the preview is inked (dark pixels).
  const ink = () =>
    page.getByTestId('preview').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! < 120 && d[i + 1]! < 120) n++;
      return n;
    });
  const round = await ink();

  await page.getByLabel('Parallel pen').check();
  await expect(page.getByLabel('Line width')).toBeDisabled();
  const width = page.getByLabel('Nib width');
  await expect(width).toHaveValue('3.8');
  await expect.poll(ink).toBeGreaterThan(round * 3);
  const wide = await ink();
  if (shots) await page.screenshot({ path: join(shots, 'parallel-pen.png') });

  // A smaller Pilot Parallel size inks less.
  await width.selectOption('1.5');
  await expect.poll(ink).toBeLessThan(wide);

  // Custom width.
  await width.selectOption('custom');
  const custom = page.getByLabel('Custom nib width');
  await custom.fill('8');
  await expect.poll(ink).toBeGreaterThan(wide);

  // Turning the nib changes which strokes are thick; undo puts the angle back.
  const angle = page.getByLabel('Nib angle');
  await expect(angle).toHaveValue('45');
  const at45 = await ink();
  // Quick changes to the same setting are one undo step; pause like a person would.
  await page.waitForTimeout(500);
  await angle.fill('-45');
  await expect.poll(ink).not.toBe(at45);
  if (shots) await page.screenshot({ path: join(shots, 'parallel-pen-angle.png') });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(angle).toHaveValue('45');

  // Off: back to the round pen.
  await page.getByLabel('Parallel pen').uncheck();
  await expect(width).toHaveCount(0);
  await expect.poll(ink).toBeLessThan(wide / 2);
  await app.close();
});

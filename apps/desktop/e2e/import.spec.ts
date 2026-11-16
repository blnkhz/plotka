import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

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

test('auto-reload: the artwork reloads when its file changes, keeping settings (IMPORT-5)', async () => {
  const { writeFileSync, renameSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'plotka-watch-'));
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

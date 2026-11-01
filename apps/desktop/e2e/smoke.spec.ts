import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

const fixtures = join(__dirname, '../../../packages/core/test/fixtures/svg');
const shots = process.env['SCREENSHOT_DIR'];

async function dropFile(page: Page, name: string) {
  const content = readFileSync(join(fixtures, name), 'utf8');
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
  await page.getByRole('button', { name: 'Plot' }).click();
  await expect(page.getByText('Total')).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'landscape-stats.png') });

  // A3 portrait is taller than the V3/A3 travel -> blocking warning
  await page.getByRole('button', { name: 'Page' }).click();
  await page.locator('select').first().selectOption('a3');
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByText(/Plotting is blocked/)).toBeVisible();

  await dropFile(page, 'figma.svg');
  await page.getByLabel('Original').check();
  await page.getByLabel('Travel').check();
  await page.locator('select').first().selectOption('a4');
  if (shots) await page.screenshot({ path: join(shots, 'figma.png') });

  await app.close();
});

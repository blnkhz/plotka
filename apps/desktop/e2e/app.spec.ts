import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { fixtures, shots, launch, dropFile } from './helpers';

test('help: topics, search, links between pages, and "?" buttons', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Help' });
  await expect(dialog.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'help.png') });

  // Search, then open the best result.
  await dialog.getByLabel('Search help').fill('crosshatch angle');
  await expect(dialog.getByRole('navigation', { name: 'Search results' })).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'help-search.png') });
  await dialog.getByLabel('Search help').press('Enter');
  await expect(dialog.getByRole('heading', { name: 'Fills', level: 1 })).toBeVisible();

  // A link to another page opens that page.
  await dialog.getByRole('button', { name: 'Getting started' }).click();
  await dialog.getByRole('link', { name: 'Projects and undo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Projects and undo', level: 1 })).toBeVisible();

  // Esc closes; a "?" button opens the matching section.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByRole('button', { name: 'Help: Plotter' }).click();
  await expect(dialog.getByRole('heading', { name: 'Connecting', level: 2 })).toBeInViewport();

  // From the Help menu too.
  await page.keyboard.press('Escape');
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('help')!.click());
  await expect(dialog).toBeVisible();
  await app.close();
});

test('heavy processing runs in the background; the window stays responsive (PREVIEW-5)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await expect(page.getByText(/paths · draw/)).toBeVisible();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('concentric');
  await page.getByLabel('Add transform').selectOption('tessellate');
  for (const [name, value] of [
    ['Columns', '24'],
    ['Rows', '24'],
  ] as const) {
    const f = page.getByRole('spinbutton', { name, exact: true });
    await f.fill(value);
    await f.press('Enter');
  }
  await expect(page.getByRole('status')).toHaveText('Updating…');
  // While it works, the UI still reacts right away.
  const t0 = Date.now();
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('tab', { name: 'Page' })).toHaveAttribute('aria-selected', 'true');
  const tabMs = Date.now() - t0;
  expect(tabMs).toBeLessThan(500);
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByText(/paths · draw/)).toBeVisible();
  console.log(`tab switch while processing: ${tabMs} ms`);
  await app.close();
});

test('export what will be plotted as SVG and toolpath JSON (PREVIEW-6)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plotka-export-'));
  const app = await launch();
  await app.evaluate(({ dialog }, dir) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const opts = args[args.length - 1] as { defaultPath: string };
      return { canceled: false, filePath: `${dir}/${opts.defaultPath}` };
    }) as never;
  }, dir);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  await page.getByRole('tab', { name: 'Plot' }).click();
  const count = async () =>
    Number((await page.getByText(/\d+ paths · draw/).textContent())!.match(/(\d+) paths/)![1]);
  await expect.poll(count).toBeGreaterThan(3);
  const paths = await count();

  await page.getByRole('button', { name: 'Export SVG…' }).click();
  const svgFile = join(dir, 'motif (plotted).svg');
  await expect
    .poll(() => {
      try {
        return readFileSync(svgFile, 'utf8').length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  const svg = readFileSync(svgFile, 'utf8');
  expect(svg).toContain('inkscape:groupmode="layer"');
  expect(svg.match(/<path /g)).toHaveLength(paths);

  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.getMenuItemById('exportJson')!.click(),
  );
  const jsonFile = join(dir, 'motif (plotted).json');
  await expect
    .poll(() => {
      try {
        return readFileSync(jsonFile, 'utf8').length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  const json = JSON.parse(readFileSync(jsonFile, 'utf8'));
  expect(json.format).toBe('plotka-toolpath');
  expect(json.layers[0].paths).toHaveLength(paths);
  await app.close();
});

test('line width is labelled as a preview-only setting', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const width = page.getByRole('spinbutton', { name: 'Line width' });
  await expect(width).toHaveValue('0.4');
  await expect(page.getByText('preview only', { exact: true })).toBeVisible();
  await width.fill('0.8');
  await expect(width).toHaveValue('0.8');
  if (shots) await page.screenshot({ path: join(shots, 'line-width.png') });
  await app.close();
});

test('the side panel resizes by dragging, fits its content, and remembers its width', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const panel = page.getByRole('tablist').locator('..');
  const width = async () => Math.round((await panel.boundingBox())!.width);
  /** True if any tab's content is wider than the panel (needs sideways scrolling). */
  const overflows = async () => {
    for (const tab of ['Page', 'Fill', 'Machine', 'Plot']) {
      await page.getByRole('tab', { name: tab }).click();
      const wide = await panel.evaluate((el) => {
        const body = el.lastElementChild as HTMLElement;
        return body.scrollWidth > body.clientWidth + 1;
      });
      if (wide) return tab;
    }
    return null;
  };
  expect(await width()).toBe(300);
  expect(await overflows()).toBeNull();

  const handle = page.getByRole('separator', { name: 'Resize the side panel' });
  const drag = async (dx: number) => {
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 200);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + 200, { steps: 5 });
    await page.mouse.up();
  };
  const near = async (w: number) => expect(Math.abs((await width()) - w)).toBeLessThanOrEqual(2);
  await drag(-150);
  await near(450);
  await drag(400); // stops at the narrowest
  expect(await width()).toBe(260);
  expect(await overflows()).toBeNull();
  await drag(-2000); // stops where the preview keeps its room: 1400 - 240 - 320
  expect(await width()).toBe(840);

  await handle.dblclick();
  expect(await width()).toBe(300);
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  expect(await width()).toBe(310);
  await drag(-90);
  await page.reload();
  await page.getByRole('tablist').waitFor();
  await near(400);
  await app.close();
});

test('View > Appearance: light, dark and colour themes, kept after a restart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  const env = { PLOTKA_USER_DATA: dataDir };
  const bg = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  // Playwright pins pages to light by default; let the app's own setting through.
  const open = async (app: Awaited<ReturnType<typeof launch>>) => {
    const page = await app.firstWindow();
    await page.emulateMedia({ colorScheme: null });
    await page.locator('#root > div').waitFor();
    return page;
  };
  const pick = (app: Awaited<ReturnType<typeof launch>>, id: string) =>
    app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.click(), id);

  let app = await launch(env);
  let page = await open(app);
  // The preview canvas redraws in the new colours (its top-left pixel is the --canvas grey).
  const corner = () =>
    page
      .getByTestId('preview')
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(','),
      );
  await pick(app, 'appearance-dark');
  await expect.poll(() => bg(page)).toBe('#1b1b1d');
  await expect.poll(corner).toBe('22,22,24'); // #161618
  await pick(app, 'appearance-light');
  await expect.poll(() => bg(page)).toBe('#f4f4f2');
  await expect.poll(corner).toBe('228,228,224'); // #e4e4e0
  // Colour themes: two light ones in a row still redraw the canvas.
  await pick(app, 'appearance-butter');
  await expect.poll(() => bg(page)).toBe('#fff1b8');
  await expect.poll(corner).toBe('245,224,138'); // #f5e08a
  await pick(app, 'appearance-matcha');
  await expect.poll(() => bg(page)).toBe('#e4cee0');
  await expect.poll(corner).toBe('215,188,210'); // #d7bcd2
  if (shots) await page.screenshot({ path: join(shots, 'theme-matcha.png') });
  await pick(app, 'appearance-ube');
  await expect.poll(() => bg(page)).toBe('#241436');
  // A dark theme is dark underneath, so native controls match.
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  if (shots) await page.screenshot({ path: join(shots, 'theme-ube.png') });
  await pick(app, 'appearance-matcha');
  await app.close();

  // Kept for next time (from the first paint), and the menu shows it.
  app = await launch(env);
  page = await open(app);
  await expect.poll(() => bg(page)).toBe('#e4cee0');
  const checked = await app.evaluate(
    ({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('appearance-matcha')!.checked,
  );
  expect(checked).toBe(true);
  // Back to following the system.
  await pick(app, 'appearance-system');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['theme']))
    .toBe(undefined);
  await app.close();
});

test('splash screen: start from it, open a recent file, turn it off', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  // One recent file, as the app would have saved it.
  const motif = join(fixtures, 'motif.svg');
  writeFileSync(join(dataDir, 'recent.json'), JSON.stringify([{ path: motif, name: 'motif.svg' }]));
  const env = { PLOTKA_USER_DATA: dataDir, PLOTKA_NO_SPLASH: '' };
  const splash = (page: Page) => page.getByRole('dialog', { name: 'Welcome to Plotka' });

  // Shown at start; Esc closes it.
  let app = await launch(env);
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(splash(page)).toBeVisible();
  await expect(page.getByRole('img', { name: /Example plot/ })).toBeVisible();
  await expect(splash(page).getByText(/Version \d/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'splash.png') });
  await page.keyboard.press('Escape');
  await expect(splash(page)).toHaveCount(0);
  await app.close();

  // A recent file opens and closes it.
  app = await launch(env);
  page = await app.firstWindow();
  await splash(page)
    .getByRole('button', { name: /motif\.svg/ })
    .click();
  await expect(splash(page)).toHaveCount(0);
  await expect(page.getByText('motif.svg', { exact: true })).toBeVisible();
  await app.close();

  // + Text starts a text layer; then turn the splash off for next time.
  app = await launch(env);
  page = await app.firstWindow();
  await splash(page).getByLabel('Show at start').uncheck();
  await splash(page).getByRole('button', { name: '+ Text' }).click();
  await expect(splash(page)).toHaveCount(0);
  await expect(page.getByLabel('Text', { exact: true })).toHaveValue('Text');
  await app.close();

  app = await launch(env);
  page = await app.firstWindow();
  await page.locator('#root > div').waitFor();
  await expect(page.getByRole('button', { name: 'Doodle…' })).toBeVisible();
  await expect(splash(page)).toHaveCount(0);
  await app.close();
});

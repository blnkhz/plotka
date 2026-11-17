import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

test('save a project and open it again with all its settings (PROJ-1)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'plotka-')), 'My pattern.plot.json');
  const app = await launch();
  // Stand in for the native dialogs.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
  }, file);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  const title = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle());

  await dropFile(page, 'motif.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByLabel('Add transform').selectOption('tessellate');
  await page.getByLabel('Pattern').selectOption('p4g');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('dots');
  await expect(page.getByText(/paths · draw .* · travel .* · ≈/)).toBeVisible();
  await expect.poll(title).toContain('motif (edited)');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(title).toBe('My pattern — Plotka');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  expect(saved.format).toBe('plotka-project');
  expect(saved.source.name).toBe('motif.svg');
  expect(saved.pipeline[0].params.pattern).toBe('p4g');

  // Start over with another file, then reopen the project.
  await dropFile(page, 'figma.svg');
  await expect(page.getByLabel('Pattern')).toHaveValue('p4g'); // transforms aren't per file
  await page.getByRole('button', { name: 'Open…' }).click();
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect.poll(title).toBe('My pattern — Plotka');
  await expect(page.getByLabel('Pattern')).toHaveValue('p4g');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByLabel('Fill type')).toHaveValue('dots');
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);
  if (shots) await page.screenshot({ path: join(shots, 'project-reopened.png') });
  await app.close();
});

test('undo and redo settings from the Edit menu and the toolbar (PROJ-2)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  const menu = (id: string) =>
    app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.click(), id);

  await dropFile(page, 'motif.svg');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  const landscape = page.getByRole('button', { name: 'Landscape' });
  await landscape.click();
  await page.getByLabel('Add transform').selectOption('tile');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('spiral');

  await menu('undo');
  await expect(page.getByLabel('Fill type')).toHaveValue('none');
  await menu('undo');
  await expect(page.getByLabel('Use Tile')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(landscape).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(landscape).not.toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await menu('redo');
  await expect(landscape).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('Use Tile')).toHaveCount(1);
  // A new change clears what could be redone.
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();

  // Layer mode: undo imports the file again in the old mode.
  await page.getByRole('button', { name: 'By color' }).click();
  await expect(page.getByRole('button', { name: 'By color' })).toHaveClass(/active/);
  await menu('undo');
  await expect(page.getByRole('button', { name: 'One layer' })).toHaveClass(/active/);

  // In a text field, Undo undoes the typing, not a setting.
  const scale = page.getByRole('spinbutton', { name: 'Scale', exact: true }).first();
  const before = await scale.inputValue();
  await scale.click();
  await scale.pressSequentially('5');
  expect(await scale.inputValue()).not.toBe(before);
  await menu('undo');
  await expect(scale).toHaveValue(before);
  await expect(page.getByRole('button', { name: 'Portrait' })).toHaveClass(/active/);
  await page.keyboard.press('Escape');

  // In the doodle pad, Undo removes the last stroke.
  await page.getByRole('button', { name: 'Doodle…' }).click();
  const box = (await page.getByTestId('doodle-canvas').boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText(/^1 stroke →/)).toBeVisible();
  await menu('undo');
  await expect(page.getByText(/^0 strokes →/)).toBeVisible();
  await menu('redo');
  await expect(page.getByText(/^1 stroke →/)).toBeVisible();
  await app.close();
});

/**
 * Kills the app with no clean shutdown, and waits until it's gone. On Windows, Electron's helper
 * processes outlive a killed main process for a moment and keep the single-instance lock, so a
 * copy started then quits at once: kill the whole process tree there.
 */
async function crash(app: ElectronApplication) {
  const proc = app.process();
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    proc.kill('SIGKILL');
  }
  await exited;
}

/** Launches the app, trying again for a few seconds while a crashed copy still holds the lock. */
async function relaunch(env: Record<string, string>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await launch(env);
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

test('autosave: unsaved work comes back after a crash (PROJ-4)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  const open = async () => {
    const app = await relaunch({ PLOTKA_USER_DATA: data });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator('#root > div').waitFor();
    return { app, page };
  };

  let { app, page } = await open();
  await dropFile(page, 'motif.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.waitForTimeout(4000); // autosave writes 3 s after the last change
  await crash(app); // no clean shutdown

  ({ app, page } = await open());
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('closed with unsaved changes to motif');
  if (shots) await page.screenshot({ path: join(shots, 'recovery.png') });
  await banner.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle()))
    .toContain('(edited)');
  await page.waitForTimeout(4000);
  await crash(app);

  // Discard removes it for good.
  ({ app, page } = await open());
  await page.getByRole('alert').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await app.close();
  ({ app, page } = await open());
  await page.waitForTimeout(500);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await app.close();
});

test('recent files: File → Open Recent reopens projects (PROJ-4)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plotka-'));
  const file = join(dir, 'Recent test.plot.json');
  const app = await launch();
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  }, file);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const recentLabel = () =>
    app.evaluate(
      ({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('recent-0')?.label ?? null,
    );
  await expect.poll(recentLabel).toBe('Recent test.plot.json');

  // Open something else, then reopen the project from the menu.
  await dropFile(page, 'figma.svg');
  await expect(page.getByText('figma.svg')).toBeVisible();
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('recent-0')!.click());
  await expect(page.getByText('motif.svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);

  // A file that's gone is dropped from the menu.
  const { rmSync } = await import('node:fs');
  rmSync(file);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('recent-0')!.click());
  await expect.poll(recentLabel).not.toBe('Recent test.plot.json');
  await app.close();
});

test('named page presets: save, apply, delete, remembered (PAGE-4)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  let app = await launch({ PLOTKA_USER_DATA: data });
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('button', { name: 'Landscape' }).click();
  const margin = page.getByRole('spinbutton', { name: 'Margin', exact: true });
  await margin.fill('20');
  await margin.press('Enter');
  await page.getByLabel('Preset name').fill('A4 landscape 20 mm');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByLabel('Page preset')).toHaveValue('A4 landscape 20 mm');

  // Change things, then apply the preset again.
  await page.getByRole('button', { name: 'Portrait' }).click();
  await expect(page.getByLabel('Page preset')).toHaveValue('');
  await page.getByLabel('Page preset').selectOption('A4 landscape 20 mm');
  await expect(page.getByRole('button', { name: 'Landscape' })).toHaveClass(/active/);
  await expect(margin).toHaveValue('20');
  await app.close();

  // Remembered after a restart; Delete removes it.
  app = await launch({ PLOTKA_USER_DATA: data });
  page = await app.firstWindow();
  await page.locator('#root > div').waitFor();
  await page.getByLabel('Page preset').selectOption('A4 landscape 20 mm');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Page preset')).toHaveCount(0);
  await app.close();
});

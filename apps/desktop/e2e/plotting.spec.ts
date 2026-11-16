import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shots, launch, dropFile } from './helpers';

test('connect the simulated plotter, jog, plot, pause, resume, finish', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  const app = await launch({ PLOTTER_SIM_SPEED: '40', PLOTKA_USER_DATA: data });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Simulated plotter', { exact: true })).toBeVisible();
  await expect(page.getByText('Not set (motors off)')).toBeVisible();

  // Jog sets home where the motors switch on, then moves.
  await page.getByRole('button', { name: 'Jog right 10 mm' }).click();
  await expect(page.getByText('X 10.0 · Y 0.0 mm')).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('X 0.0 · Y 0.0 mm')).toBeVisible();
  await page.getByLabel('Pen down height').fill('25');
  if (shots) await page.screenshot({ path: join(shots, 'machine-tab.png') });

  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Start plot' }).click();
  await expect(page.getByText('Plotting')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible({ timeout: 10000 });
  if (shots) await page.screenshot({ path: join(shots, 'plot-paused.png') });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60000 });
  if (shots) await page.screenshot({ path: join(shots, 'plot-done.png') });

  // Help › Report a Problem opens the bug report form and shows the log.
  const opened = await app.evaluate(async ({ Menu, shell }) => {
    const calls: string[] = [];
    shell.openExternal = (async (url: string) => void calls.push(url)) as never;
    shell.showItemInFolder = ((path: string) => void calls.push(path)) as never;
    const help = Menu.getApplicationMenu()!.items.find((i) => i.role === 'help')!;
    help.submenu!.items.find((i) => i.label === 'Report a Problem…')!.click();
    return calls;
  });
  expect(opened[0]).toMatch(/plotka\.log$/);
  expect(opened[1]).toMatch(
    /^https:\/\/github\.com\/blnkhz\/plotka\/issues\/new\?template=bug_report\.yml&app=[\d.]+&os=macOS/,
  );
  await app.close();

  // The app log (Help › Show Log File) tells the story for bug reports.
  const log = readFileSync(join(data, 'logs', 'plotka.log'), 'utf8');
  expect(log).toMatch(/INFO {2}Plotka started version="[\d.]+"/);
  expect(log).toContain('INFO  Connected port="simulated"');
  expect(log).toContain('INFO  Plot started');
  expect(log).toContain('INFO  Plot paused');
  expect(log).toContain('INFO  Plot done');
});

test('per-layer speed changes the time estimate (MOTION-3)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  const seconds = async () => {
    const t = (await page.getByText(/paths · draw/).textContent())!.split('≈')[1]!.trim();
    const m = /(?:(\d+)m\s*)?(\d+)s/.exec(t)!;
    return Number(m[1] ?? 0) * 60 + Number(m[2]);
  };
  const before = await seconds();
  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByText('55 mm/s')).toBeVisible(); // 25% of 221 mm/s
  const drawing = page.getByRole('spinbutton', { name: 'Drawing', exact: true });
  await drawing.fill('60');
  await drawing.press('Enter');
  await expect(page.getByText('133 mm/s')).toBeVisible();
  await expect.poll(seconds).toBeLessThan(before);
  await app.close();
});

test('dry run traces the outline with the pen up (PLOT-6)', async () => {
  const app = await launch({ PLOTTER_SIM_SPEED: '40' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(page.getByText('Dry run done')).toBeVisible({ timeout: 30000 });
  // Ready to plot for real afterwards.
  await expect(page.getByRole('button', { name: 'Start plot' })).toBeEnabled();
  await app.close();
});

test('continue a stopped plot from where it stopped (PLOT-5)', async () => {
  test.setTimeout(90000);
  const app = await launch({ PLOTTER_SIM_SPEED: '4' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg'); // outlines only: about 20 s of plotting, 5 s at 4x
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Start plot' }).click();
  await expect(page.getByText('Plotting')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible({ timeout: 20000 });

  const panel = page.getByText(/^Stopped at path \d+ of \d+ in Layer 1/);
  await expect(panel).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'continue.png') });
  await page.getByRole('button', { name: 'Continue plot' }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(panel).toHaveCount(0);
  await app.close();
});

test('playback: scrub and play the plot order (PREVIEW-4)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Fill' }).click();
  await page.getByLabel('Fill type').selectOption('lines');
  await expect(page.getByText(/\d+ paths · draw/)).toBeVisible();
  await page.getByRole('button', { name: '▶ Playback' }).click();
  const bar = page.getByRole('group', { name: 'Playback' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Pause playback' }).click(); // it starts playing

  const slider = bar.getByLabel('Playback time');
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round(max * 0.4)));
  await expect(bar.getByText(/^\d+:\d\d \/ \d+:\d\d$/)).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, 'playback.png') });

  await bar.getByRole('button', { name: '100×' }).click();
  await bar.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(bar.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
    timeout: 20000,
  }); // ended
  const [now, total] = (await bar.getByText(/ \/ /).textContent())!.split(' / ');
  expect(now).toBe(total);
  await bar.getByRole('button', { name: 'Close playback' }).click();
  await expect(bar).toHaveCount(0);
  await app.close();
});

test('machine profiles: pick another model, duplicate and edit your own (DRIVER-5b)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  let app = await launch({ PLOTKA_USER_DATA: data });
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#root > div').waitFor();
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Machine profile').selectOption('nextdraw-8511');
  await expect(page.getByText('300 × 218 mm')).toBeVisible();
  await expect(page.getByText(/Not yet tested with this app/)).toBeVisible();

  await page.getByRole('button', { name: 'Duplicate to edit' }).click();
  await expect(page.getByLabel('Profile name')).toHaveValue('Bantam Tools NextDraw 8511 (my copy)');
  const travelX = page.getByRole('spinbutton', { name: 'Travel X', exact: true });
  await travelX.fill('320');
  await travelX.press('Enter');
  await expect(page.getByText('320 × 218 mm')).toBeVisible();
  const steps = page.getByRole('spinbutton', { name: 'Steps/mm', exact: true });
  await steps.fill('0');
  await steps.press('Enter');
  await expect(page.getByText(/Steps per mm must be a number from 1/)).toBeVisible();
  await app.close();

  // Your profile, and the choice of it, are remembered.
  app = await launch({ PLOTKA_USER_DATA: data });
  page = await app.firstWindow();
  await page.locator('#root > div').waitFor();
  await page.getByRole('tab', { name: 'Machine' }).click();
  await expect(page.getByLabel('Profile name')).toHaveValue('Bantam Tools NextDraw 8511 (my copy)');
  await expect(page.getByText('320 × 218 mm')).toBeVisible();
  await app.close();
});

test('plot log: a finished plot is logged with a note, and opens with its settings (PLOT-7)', async () => {
  test.setTimeout(90000);
  const app = await launch({ PLOTTER_SIM_SPEED: '8' });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 900 });
  await dropFile(page, 'motif.svg');
  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByText('Plots you make are listed here', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Machine' }).click();
  await page.getByLabel('Port').selectOption('simulated');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await page.getByRole('button', { name: 'Start plot' }).click();
  await expect(page.getByText('In progress', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible({ timeout: 60000 });

  const note = page.getByPlaceholder('Add a note (pen, paper…)');
  await note.fill('0.3 fineliner, Bristol');
  await note.press('Enter');
  await expect(note).toHaveValue('0.3 fineliner, Bristol');
  if (shots) await page.screenshot({ path: join(shots, 'plot-log.png') });

  // Change a setting, then open the logged plot: its settings come back.
  await page.getByRole('tab', { name: 'Page' }).click();
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByRole('tab', { name: 'Plot' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('tab', { name: 'Page' }).click();
  await expect(page.getByRole('button', { name: 'Portrait' })).toHaveClass(/active/);
  const title = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle());
  await expect.poll(title).toMatch(/^motif \(plotted \d{4}-\d\d-\d\d\) — /);

  // The note survives a restart of the window's view of the log.
  await page.reload();
  await page.getByRole('tab', { name: 'Plot' }).click();
  await expect(page.getByPlaceholder('Add a note (pen, paper…)')).toHaveValue(
    '0.3 fineliner, Bristol',
  );
  await page.getByRole('button', { name: /Delete log entry/ }).click();
  await expect(page.getByText('Plots you make are listed here', { exact: false })).toBeVisible();
  await app.close();
});

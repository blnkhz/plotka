import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type Page } from '@playwright/test';

/** Shared by the e2e specs: launching the app with a fresh data folder, and dropping files on it. */

export const fixtures = join(__dirname, '../../../packages/core/test/fixtures/svg');
export const shots = process.env['SCREENSHOT_DIR'];
/** With SCREENSHOT_DIR: the appearance to take them in (e.g. `matcha`), instead of the system's. */
const shotTheme = process.env['SCREENSHOT_THEME'];

/**
 * Launches the app with a fresh, temporary data folder (never the user's own settings).
 * PLOTKA_E2E skips the "unsaved changes" question on close; PLOTKA_NO_SPLASH
 * skips the splash screen (the splash test turns it back on).
 */
export const launch = (env: Record<string, string> = {}) => {
  const data = env['PLOTKA_USER_DATA'] ?? mkdtempSync(join(tmpdir(), 'plotka-e2e-'));
  const saved = join(data, 'appearance.json');
  if (shotTheme && !existsSync(saved)) writeFileSync(saved, JSON.stringify({ theme: shotTheme }));
  return electron.launch({
    args: [join(__dirname, '..')],
    env: {
      ...process.env,
      PLOTKA_E2E: '1',
      PLOTKA_NO_SPLASH: '1',
      ...env,
      PLOTKA_USER_DATA: data,
    },
  });
};

export async function dropFile(page: Page, name: string) {
  const content = readFileSync(join(fixtures, name), 'utf8');
  await page.locator('#root > div').waitFor();
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

/** A cube from -1 to 1 as text 3D files: STL (12 facets), OBJ (6 quads), PLY (6 quads). */
export function cubeFiles() {
  const v = (i: number) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1];
  const quads = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  const facet = (a: number, b: number, c: number) =>
    `facet normal 0 0 0\nouter loop\n${[a, b, c].map((i) => `vertex ${v(i).join(' ')}`).join('\n')}\nendloop\nendfacet`;
  const stl = `solid cube\n${quads.flatMap(([a, b, c, d]) => [facet(a!, b!, c!), facet(a!, c!, d!)]).join('\n')}\nendsolid cube\n`;
  const obj =
    Array.from({ length: 8 }, (_, i) => `v ${v(i).join(' ')}`).join('\n') +
    '\n' +
    quads.map((q) => `f ${q.map((i) => i + 1).join(' ')}`).join('\n') +
    '\n';
  const ply = [
    'ply',
    'format ascii 1.0',
    'element vertex 8',
    'property float x',
    'property float y',
    'property float z',
    'element face 6',
    'property list uchar int vertex_indices',
    'end_header',
    ...Array.from({ length: 8 }, (_, i) => v(i).join(' ')),
    ...quads.map((q) => `4 ${q.join(' ')}`),
    '',
  ].join('\n');
  return { 'cube.stl': stl, 'cube.obj': obj, 'cube.ply': ply };
}

export async function dropText(page: Page, name: string, content: string) {
  await page.evaluate(
    ({ name, content }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], name, { type: 'application/octet-stream' }));
      const target = document.querySelector('#root > div')!;
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    },
    { name, content },
  );
}

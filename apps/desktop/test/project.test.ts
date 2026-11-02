import { describe, expect, it } from 'vitest';
import {
  createStep,
  defaultDoodleSettings,
  defaultOptimizeSettings,
  defaultPageSetup,
  defaultPassSettings,
} from '@plotter-studio/core';
import {
  fromBase64,
  isProjectFile,
  mergeDefaults,
  parseProject,
  PROJECT_FORMAT,
  projectNameFromFile,
  serializeProject,
  toBase64,
  type ProjectData,
} from '../src/renderer/src/lib/project';

const svg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm"/>',
);

const sample = (): ProjectData => ({
  source: { name: 'motif.svg', bytes: svg },
  layerMode: 'byColor',
  layerOverrides: {
    'layer-1': {
      visible: false,
      color: '#ff0000',
      settings: {
        fill: { type: 'dots', spacing: 0.8, angle: 30, inset: 0.2, connect: false, jitter: 0.5 },
        passes: { ...defaultPassSettings(), count: 4, colors: ['#112233'] },
        hideCovered: false,
      },
    },
  },
  page: {
    ...defaultPageSetup(),
    orientation: 'landscape',
    margins: { top: 5, right: 6, bottom: 7, left: 8 },
  },
  optimize: { ...defaultOptimizeSettings(), twoOpt: false },
  profileId: 'axidraw-v3-a3',
  pipeline: [
    { ...createStep('tessellate'), params: { ...createStep('tessellate').params, pattern: 'p4g' } },
  ],
  doodle: {
    strokes: [
      {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
    ],
    settings: { ...defaultDoodleSettings(), style: 'lines' },
    size: { width: 120, height: 80 },
  },
  plotSkip: { 'layer-1~2': true },
  view: { penWidth: 0.3 },
});

describe('project files (PROJ-1)', () => {
  it('names and extensions', () => {
    expect(isProjectFile('Thing.PLOT.json')).toBe(true);
    expect(isProjectFile('thing.json')).toBe(false);
    expect(projectNameFromFile('/Users/me/Plots/My drawing.plot.json')).toBe('My drawing');
  });

  it('base64 round-trips bytes, including large files', () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 7) % 256);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });

  it('saves and reopens everything', () => {
    const d = sample();
    const text = serializeProject(d, new Date('2026-11-02T00:00:00Z'));
    const json = JSON.parse(text);
    expect(json.format).toBe(PROJECT_FORMAT);
    expect(json.version).toBe(1);
    expect(json.savedAt).toBe('2026-11-02T00:00:00.000Z');
    expect(parseProject(text)).toEqual(d);
  });

  it('keeps where the artwork came from (for auto-reload), but only SVG paths', () => {
    const d = {
      ...sample(),
      source: { name: 'motif.svg', bytes: svg, path: '/Users/me/art/motif.svg' },
    };
    expect(parseProject(serializeProject(d)).source?.path).toBe('/Users/me/art/motif.svg');
    const bad = JSON.parse(serializeProject(d));
    bad.source.path = '/etc/passwd';
    expect(parseProject(JSON.stringify(bad)).source?.path).toBeUndefined();
  });

  it('fills in defaults for missing settings (older files) and ignores wrong types', () => {
    const text = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      page: { orientation: 'landscape', scale: 'big', margins: { top: 3 } },
      layerMode: 'nonsense',
      layerOverrides: {
        a: { visible: 'no', settings: { speedPenDown: 300, fill: { type: 'unknown' } } },
      },
      pipeline: [{ id: 'x', type: 'tile', params: { columns: 3, evil: { a: 1 } } }, 'junk'],
    });
    const p = parseProject(text);
    expect(p.page.orientation).toBe('landscape');
    expect(p.page.scale).toBe(defaultPageSetup().scale);
    expect(p.page.margins).toEqual({ ...defaultPageSetup().margins, top: 3 });
    expect(p.layerMode).toBe('auto');
    expect(p.layerOverrides['a']).toEqual({ settings: { speedPenDown: 100 } });
    expect(p.pipeline).toEqual([{ id: 'x', type: 'tile', enabled: true, params: { columns: 3 } }]);
    expect(p.source).toBeNull();
    expect(p.doodle).toBeNull();
    expect(p.optimize).toEqual(defaultOptimizeSettings());
  });

  it('refuses other files, damaged files and newer versions with plain messages', () => {
    expect(() => parseProject('{not json')).toThrow(/damaged/);
    expect(() => parseProject('{"hello":1}')).toThrow(/isn't a Plotter Studio project/);
    expect(() => parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: 99 }))).toThrow(
      /newer version/,
    );
    expect(() =>
      parseProject(
        JSON.stringify({
          format: PROJECT_FORMAT,
          version: 1,
          source: { name: 'a.svg', base64: '%%%' },
        }),
      ),
    ).toThrow(/artwork/);
  });

  it('mergeDefaults keeps nested defaults and only same-type values', () => {
    expect(
      mergeDefaults({ a: 1, b: { c: true, d: 'x' } }, { a: 'no', b: { c: false }, z: 9 }),
    ).toEqual({
      a: 1,
      b: { c: false, d: 'x' },
    });
    expect(mergeDefaults({ n: 1 }, { n: Infinity })).toEqual({ n: 1 });
  });
});

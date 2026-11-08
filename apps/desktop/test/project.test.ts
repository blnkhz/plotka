import { describe, expect, it } from 'vitest';
import {
  createStep,
  defaultDitherSettings,
  defaultDoodleSettings,
  defaultSliceSettings,
  defaultOptimizeSettings,
  defaultPageSetup,
  defaultPassSettings,
  doodleToSvg,
} from '@plotka/core';
import {
  fromBase64,
  isProjectFile,
  mergeDefaults,
  parseFill,
  LEGACY_PROJECT_FORMAT,
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
  layerCopies: [{ id: 'c1', of: 'layer-1', name: 'Layer 1 copy', mode: 'auto' }],
  doodles: [
    {
      id: 'd1',
      name: 'Doodle 1',
      strokes: [{ points: [{ x: 9, y: 9 }] }],
      settings: { ...defaultDoodleSettings(), fillClosed: true },
      size: { width: 200, height: 100 },
    },
  ],
  doodle: {
    strokes: [
      {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
      // A combined shape, nested: kept as its pieces.
      {
        op: 'subtract',
        items: [
          { op: 'union', items: [{ points: [{ x: 5, y: 5 }] }, { points: [{ x: 6, y: 6 }] }] },
          { points: [{ x: 7, y: 7 }] },
        ],
      },
    ],
    settings: { ...defaultDoodleSettings(), style: 'lines' },
    size: { width: 120, height: 80 },
  },
  plotSkip: { 'layer-1~2': true },
  view: { penWidth: 0.3, nib: { on: true, width: 2.75, angle: 30 } },
  image: {
    name: 'cat.png',
    bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    settings: { ...defaultDitherSettings(), method: 'diffusion', shape: 'line', cell: 0.8 },
  },
  model: {
    name: 'teapot.stl',
    bytes: new Uint8Array([115, 111, 108, 105, 100]),
    settings: { ...defaultSliceSettings(), lines: 90, axis: 'z', tilt: 15, mode: 'full' },
    camera: { position: [1, 2, 3], target: [0, 0.5, 0] },
  },
  texts: [
    {
      id: 'note1',
      text: 'Hello\nworld',
      font: 'script',
      size: 8,
      lineSpacing: 1.2,
      letterSpacing: 0.5,
      align: 'center',
      x: 20,
      y: 250,
    },
  ],
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

  it('still opens files saved before the app was named Plotka', () => {
    const d = sample();
    const old = JSON.parse(serializeProject(d));
    old.format = LEGACY_PROJECT_FORMAT;
    expect(parseProject(JSON.stringify(old))).toEqual(d);
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

  it('image pad settings: unknown values fall back to defaults', () => {
    const text = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      image: {
        name: 'a.png',
        base64: 'AAEC',
        settings: { method: 'magic', shape: 'star', cell: 2 },
      },
    });
    const image = parseProject(text).image!;
    expect(image.bytes).toEqual(new Uint8Array([0, 1, 2]));
    expect(image.settings.method).toBe('ordered');
    expect(image.settings.shape).toBe('circle');
    expect(image.settings.cell).toBe(2);
  });

  it('3D model: unknown settings fall back; a bad camera is dropped', () => {
    const text = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      model: {
        name: 'a.obj',
        base64: 'AAEC',
        settings: { axis: 'w', mode: 'x-ray', projection: 'fisheye', lines: 40 },
        camera: { position: [1, 2], target: [0, 0, 0] },
      },
    });
    const model = parseProject(text).model!;
    expect(model.settings).toEqual({ ...defaultSliceSettings(), lines: 40 });
    expect(model.camera).toBeNull();
  });

  it('leaves out damaged doodle entries (unknown operations, empty shapes)', () => {
    const text = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      doodle: {
        strokes: [
          { op: 'melt', items: [{ points: [{ x: 1, y: 1 }] }] },
          { op: 'union', items: [] },
          { op: 'union', items: [{ points: [{ x: 'a', y: 1 }] }, { points: [{ x: 2, y: 2 }] }] },
        ],
      },
    });
    expect(parseProject(text).doodle?.strokes).toEqual([
      { op: 'union', items: [{ points: [{ x: 2, y: 2 }] }] },
    ]);
  });

  it('turns the doodle that was the artwork of an older project into a doodle layer', () => {
    const strokes = [
      {
        points: [
          { x: 1, y: 1 },
          { x: 20, y: 30 },
        ],
      },
    ];
    const settings = defaultDoodleSettings();
    const size = { width: 120, height: 80 };
    const old = (svg: string, name = 'Doodle.svg') =>
      JSON.stringify({
        format: PROJECT_FORMAT,
        version: 1,
        source: { name, base64: toBase64(new TextEncoder().encode(svg)) },
        doodle: { strokes, settings, size },
        layerOverrides: { 'layer-1': { color: '#ff0000' }, 'text-a': { plot: false } },
        plotSkip: { 'layer-1~2': true },
      });
    const svg = doodleToSvg(strokes, settings, size);

    const p = parseProject(old(svg));
    expect(p.source).toBeNull();
    expect(p.doodle).toBeNull();
    expect(p.doodles).toEqual([{ id: '1', name: 'Doodle 1', strokes, settings, size }]);
    expect(p.layerOverrides).toEqual({
      'doodle-1': { color: '#ff0000' },
      'text-a': { plot: false },
    });
    expect(p.plotSkip).toEqual({ 'doodle-1~2': true });

    // The strokes changed after the drawing was used, or another file is open: the plot stays
    // what it was, and the strokes stay on the pad.
    for (const q of [parseProject(old('<svg/>')), parseProject(old(svg, 'art.svg'))]) {
      expect(q.source).not.toBeNull();
      expect(q.doodles).toEqual([]);
      expect(q.doodle?.strokes).toEqual(strokes);
      expect(q.layerOverrides['layer-1']).toEqual({ color: '#ff0000' });
    }
  });

  it('keeps the names given to layers, ignoring empty ones', () => {
    const raw = JSON.parse(serializeProject(sample())) as Record<string, unknown>;
    raw['layerOverrides'] = { a: { name: 'Outlines' }, b: { name: '  ' }, c: { name: 7 } };
    const { layerOverrides } = parseProject(JSON.stringify(raw));
    expect(layerOverrides['a']?.name).toBe('Outlines');
    expect(layerOverrides['b']?.name).toBeUndefined();
    expect(layerOverrides['c']?.name).toBeUndefined();
  });

  it('keeps empty layers and placed shapes', () => {
    const raw = JSON.parse(serializeProject(sample())) as { doodles: Record<string, unknown>[] };
    const points = [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 9 },
    ];
    raw.doodles[0]!['strokes'] = [{ points, exact: true }];
    raw.doodles.push({ ...raw.doodles[0], id: 'empty', name: 'Layer 1', strokes: [] });
    const [shape, empty] = parseProject(JSON.stringify(raw)).doodles;
    expect(shape!.strokes).toEqual([{ points, exact: true }]);
    expect(empty).toMatchObject({ id: 'empty', name: 'Layer 1', strokes: [] });
  });

  it('leaves out damaged layer duplicates', () => {
    const raw = JSON.parse(serializeProject(sample())) as { layerCopies: unknown[] };
    const good = raw.layerCopies[0];
    raw.layerCopies = [
      7,
      good,
      good,
      { id: 'x', of: 'layer-1', name: 'x', mode: 'nope' },
      { id: 'y', name: 'y', mode: 'auto' },
    ];
    expect(parseProject(JSON.stringify(raw)).layerCopies).toEqual(sample().layerCopies);
    delete (raw as { layerCopies?: unknown }).layerCopies;
    expect(parseProject(JSON.stringify(raw)).layerCopies).toEqual([]);
  });

  it('leaves out damaged doodle layers', () => {
    const raw = JSON.parse(serializeProject(sample())) as { doodles: unknown[] };
    const good = raw.doodles[0];
    raw.doodles = [
      7,
      good,
      good, // the same id again
      { id: 'no-strokes', name: 'x' },
      { id: 'bad id!', name: 'x', strokes: [{ points: [{ x: 1, y: 1 }] }] },
    ];
    expect(parseProject(JSON.stringify(raw)).doodles).toEqual(sample().doodles);
  });

  it('refuses other files, damaged files and newer versions with plain messages', () => {
    expect(() => parseProject('{not json')).toThrow(/damaged/);
    expect(() => parseProject('{"hello":1}')).toThrow(/isn't a Plotka project/);
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

  it('keeps a moved layer, and refuses squashed or flipped sizes', () => {
    const d = sample();
    d.layerOverrides['layer-1'] = {
      settings: { placement: { dx: 12.5, dy: -3, sx: 1.5, sy: 0.75 } },
    };
    const back = parseProject(serializeProject(d));
    expect(back.layerOverrides['layer-1']?.settings?.placement).toEqual({
      dx: 12.5,
      dy: -3,
      sx: 1.5,
      sy: 0.75,
    });
    const raw = JSON.parse(serializeProject(d));
    raw.layerOverrides['layer-1'].settings.placement = { dx: 0, dy: 0, sx: -2, sy: 0 };
    const fixed = parseProject(JSON.stringify(raw)).layerOverrides['layer-1']?.settings?.placement;
    expect(fixed!.sx).toBeGreaterThan(0);
    expect(fixed!.sy).toBeGreaterThan(0);
  });

  it('keeps text, and cleans up damaged text', () => {
    expect(parseProject(serializeProject(sample())).texts).toEqual(sample().texts);
    const raw = JSON.parse(serializeProject(sample()));
    raw.texts = [
      { id: 'a', text: 'ok', font: 'nope', size: -5, align: 'sideways', x: 'x' },
      { id: 'a', text: 'duplicate id' },
      { id: '../bad', text: 'bad id' },
      'not text',
    ];
    expect(parseProject(JSON.stringify(raw)).texts).toEqual([
      {
        id: 'a',
        text: 'ok',
        font: 'sans',
        size: 0.5,
        lineSpacing: 1,
        letterSpacing: 0,
        align: 'left',
        x: 0,
        y: 0,
      },
    ]);
  });

  it('keeps blackletter text sized from the nib', () => {
    const raw = JSON.parse(serializeProject(sample()));
    raw.texts = [{ id: 'b', text: 'Hodie', font: 'blackletter', size: 26.6, matchNib: true }];
    expect(parseProject(JSON.stringify(raw)).texts[0]).toMatchObject({
      font: 'blackletter',
      size: 26.6,
      matchNib: true,
    });
  });

  it('reads the old Zigzag fill as Lines with the pen kept down', () => {
    const f = parseFill({ type: 'zigzag', spacing: 0.8, angle: 30, inset: 0, connect: false });
    expect(f).toMatchObject({ type: 'lines', connect: true, spacing: 0.8, angle: 30 });
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

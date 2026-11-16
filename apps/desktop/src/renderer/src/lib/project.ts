import {
  defaultSliceSettings,
  doodleToSvg,
  type SliceSettings,
  defaultDitherSettings,
  DITHER_METHODS,
  MARK_SHAPES,
  type DitherSettings,
  defaultDoodleSettings,
  defaultFillSettings,
  defaultOptimizeSettings,
  defaultPageSetup,
  defaultPassSettings,
  SUPPORTED_FILL_TYPES,
  type DoodleLayerItem,
  type DoodleSettings,
  type BooleanOp,
  type DoodleItem,
  type FillSettings,
  type LayerMode,
  type LayerSettings,
  type OptimizeSettings,
  type PageSetup,
  type PassSettings,
  type PipelineStep,
  type TextItem,
  TEXT_FONTS,
} from '@plotka/core';
import { DEFAULT_NIB } from './nib';
import type { LayerCopy, ViewOptions } from '../store';

/** Project files (PROJ-1). See docs/plans/epic-10-projects.md for the format. */
export const PROJECT_FORMAT = 'plotka-project';
/** What files saved before the app was named Plotka say in `format`: still opened. */
export const LEGACY_PROJECT_FORMAT = 'plotter-studio-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.plot.json';

export type ProjectLayerOverride = {
  /** The name the user gave the layer. */
  name?: string;
  visible?: boolean;
  plot?: boolean;
  color?: string;
  settings?: Partial<LayerSettings>;
  removed?: boolean;
};

export type ProjectData = {
  /** The artwork, embedded. `path` is where it came from (for reloading when it changes). */
  source: { name: string; bytes: Uint8Array; path?: string } | null;
  layerMode: LayerMode;
  layerOverrides: Record<string, ProjectLayerOverride>;
  page: PageSetup;
  optimize: OptimizeSettings;
  profileId: string;
  pipeline: PipelineStep[];
  /** Doodles, each a layer of the drawing. */
  doodles: DoodleLayerItem[];
  /** Duplicates of the artwork file's layers. */
  layerCopies: LayerCopy[];
  /** A new drawing left on the doodle pad, not used yet. */
  doodle: {
    strokes: DoodleItem[];
    settings: DoodleSettings;
    size: { width: number; height: number };
  } | null;
  plotSkip: Record<string, true>;
  view: Pick<ViewOptions, 'penWidth' | 'nib'>;
  /** LATER-6: text typed in the app. */
  texts: TextItem[];
  /** The picture last turned into pen marks, and how (kept to edit again). */
  image: { name: string; bytes: Uint8Array; settings: DitherSettings } | null;
  /** The 3D model last sliced, how, and the view (kept to edit again). */
  model: {
    name: string;
    bytes: Uint8Array;
    settings: SliceSettings;
    camera: { position: [number, number, number]; target: [number, number, number] } | null;
  } | null;
};

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export const isProjectFile = (name: string) => name.toLowerCase().endsWith(PROJECT_EXTENSION);

/** "My drawing.plot.json" → "My drawing". */
export const projectNameFromFile = (file: string) =>
  file.replace(/^.*[\\/]/, '').replace(/\.plot\.json$/i, '');

// --- base64 (chunked, so large files don't overflow the call stack) ---

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// --- writing ---

export function serializeProject(d: ProjectData, now = new Date()): string {
  return JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: now.toISOString(),
      source: d.source
        ? {
            name: d.source.name,
            base64: toBase64(d.source.bytes),
            ...(d.source.path ? { path: d.source.path } : {}),
          }
        : null,
      layerMode: d.layerMode,
      layerOverrides: d.layerOverrides,
      page: d.page,
      optimize: d.optimize,
      profileId: d.profileId,
      pipeline: d.pipeline,
      doodles: d.doodles,
      layerCopies: d.layerCopies,
      doodle: d.doodle,
      plotSkip: d.plotSkip,
      view: d.view,
      texts: d.texts,
      image: d.image
        ? { name: d.image.name, base64: toBase64(d.image.bytes), settings: d.image.settings }
        : null,
      model: d.model
        ? {
            name: d.model.name,
            base64: toBase64(d.model.bytes),
            settings: d.model.settings,
            camera: d.model.camera,
          }
        : null,
    },
    null,
    1,
  );
}

// --- reading: everything is checked; anything missing or wrong falls back to a default ---

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Takes each key of `defaults` from `input` when it has the same kind of value (recursing into
 * plain objects), so new settings get defaults and wrong types are ignored.
 */
export function mergeDefaults<T extends object>(defaults: T, input: unknown): T {
  if (!isObj(input)) return defaults;
  const out: Obj = { ...(defaults as Obj) };
  for (const [k, d] of Object.entries(defaults as Obj)) {
    const v = input[k];
    if (v === undefined) continue;
    if (isObj(d)) out[k] = mergeDefaults(d, v);
    else if (
      typeof d === 'number' ? isNum(v) : typeof v === typeof d && !isObj(v) && !Array.isArray(v)
    )
      out[k] = v;
  }
  return out as T;
}

const LAYER_MODES: LayerMode[] = ['auto', 'single', 'byColor'];

export function parseFill(v: unknown): FillSettings | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  const f = mergeDefaults(defaultFillSettings(), v);
  // Zigzag was Lines with the pen kept down; it's that now.
  if (v['type'] === 'zigzag') Object.assign(f, { type: 'lines', connect: true });
  if (!(SUPPORTED_FILL_TYPES as readonly string[]).includes(f.type)) return undefined;
  if (isNum(v['crossAngle'])) f.crossAngle = v['crossAngle'];
  if (isNum(v['jitter'])) f.jitter = v['jitter'];
  if (typeof v['densityFromColor'] === 'boolean') f.densityFromColor = v['densityFromColor'];
  if (typeof v['roundTurns'] === 'boolean') f.roundTurns = v['roundTurns'];
  if (isNum(v['centerX'])) f.centerX = v['centerX'];
  if (isNum(v['centerY'])) f.centerY = v['centerY'];
  if (typeof v['sharedCenter'] === 'boolean') f.sharedCenter = v['sharedCenter'];
  for (const k of [
    'amplitude',
    'wavelength',
    'phase',
    'noiseScale',
    'seed',
    'strokeLength',
    'dashLength',
    'dashAngle',
  ] as const)
    if (isNum(v[k])) f[k] = v[k];
  if (typeof v['allowCross'] === 'boolean') f.allowCross = v['allowCross'];
  if (v['waveShape'] === 'sine' || v['waveShape'] === 'triangle' || v['waveShape'] === 'square')
    f.waveShape = v['waveShape'];
  return f;
}

function parsePasses(v: unknown): PassSettings | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  const p = mergeDefaults(defaultPassSettings(), v);
  const colors = Array.isArray(v['colors'])
    ? v['colors'].filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
    : [];
  return { ...p, colors: colors.length ? colors : p.colors };
}

function parseLayerSettings(v: unknown): Partial<LayerSettings> | undefined {
  if (!isObj(v)) return undefined;
  const out: Partial<LayerSettings> = {};
  for (const k of ['speedPenDown', 'speedPenUp', 'penPosUp', 'penPosDown'] as const)
    if (isNum(v[k])) out[k] = Math.min(100, Math.max(0, v[k]));
  for (const k of ['drawOutline', 'hideCovered'] as const)
    if (typeof v[k] === 'boolean') out[k] = v[k];
  if ('fill' in v) {
    const f = parseFill(v['fill']);
    if (f !== undefined) out.fill = f;
  }
  if ('passes' in v) {
    const p = parsePasses(v['passes']);
    if (p !== undefined) out.passes = p;
  }
  const pl = v['placement'];
  if (pl === null) out.placement = null;
  else if (isObj(pl) && isNum(pl['dx']) && isNum(pl['dy']) && isNum(pl['sx']) && isNum(pl['sy']))
    out.placement = {
      dx: pl['dx'],
      dy: pl['dy'],
      // Never zero or negative: a layer can't be squashed flat or flipped by a damaged file.
      sx: Math.max(1e-3, pl['sx']),
      sy: Math.max(1e-3, pl['sy']),
      ...(isNum(pl['rot']) && pl['rot'] !== 0 ? { rot: pl['rot'] } : {}),
    };
  return out;
}

function parseOverrides(v: unknown): Record<string, ProjectLayerOverride> {
  const out: Record<string, ProjectLayerOverride> = {};
  if (!isObj(v)) return out;
  for (const [id, o] of Object.entries(v)) {
    if (!isObj(o)) continue;
    const r: ProjectLayerOverride = {};
    if (typeof o['visible'] === 'boolean') r.visible = o['visible'];
    if (typeof o['plot'] === 'boolean') r.plot = o['plot'];
    if (o['removed'] === true) r.removed = true;
    if (typeof o['name'] === 'string' && o['name'].trim()) r.name = o['name'].slice(0, 80);
    if (typeof o['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(o['color'])) r.color = o['color'];
    const s = parseLayerSettings(o['settings']);
    if (s && Object.keys(s).length) r.settings = s;
    out[id] = r;
  }
  return out;
}

function parsePipeline(v: unknown): PipelineStep[] {
  if (!Array.isArray(v)) return [];
  const steps: PipelineStep[] = [];
  for (const s of v) {
    if (!isObj(s) || typeof s['id'] !== 'string' || typeof s['type'] !== 'string') continue;
    const params: PipelineStep['params'] = {};
    if (isObj(s['params']))
      for (const [k, p] of Object.entries(s['params']))
        if (isNum(p) || typeof p === 'string' || typeof p === 'boolean') params[k] = p;
    steps.push({ id: s['id'], type: s['type'], enabled: s['enabled'] !== false, params });
  }
  return steps;
}

const BOOLEAN_OPS: readonly BooleanOp[] = ['union', 'subtract', 'intersect', 'exclude'];

/** Doodle strokes and combined shapes (a tree of them); damaged entries are left out. */
function parseStrokes(v: unknown, depth = 0): DoodleItem[] {
  if (!Array.isArray(v) || depth > 50) return [];
  return v
    .map((s): DoodleItem | null => {
      if (!isObj(s)) return null;
      if (BOOLEAN_OPS.includes(s['op'] as BooleanOp)) {
        const items = parseStrokes(s['items'], depth + 1);
        return items.length ? { op: s['op'] as BooleanOp, items } : null;
      }
      if (!Array.isArray(s['points'])) return null;
      const points = s['points']
        .filter((p): p is Obj => isObj(p) && isNum(p['x']) && isNum(p['y']))
        .map((p) => ({ x: p['x'] as number, y: p['y'] as number }));
      if (!points.length) return null;
      return s['exact'] === true ? { points, exact: true } : { points };
    })
    .filter((s): s is DoodleItem => !!s);
}

/** Reads a project file. Throws ProjectError with a plain message if it can't be used. */
export function parseProject(text: string): ProjectData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("This project file is damaged (it isn't valid JSON).");
  }
  if (!isObj(raw) || (raw['format'] !== PROJECT_FORMAT && raw['format'] !== LEGACY_PROJECT_FORMAT))
    throw new ProjectError("This isn't a Plotka project file.");
  const version = raw['version'];
  if (!isNum(version) || version < 1)
    throw new ProjectError('This project file is damaged (it has no version).');
  if (version > PROJECT_VERSION)
    throw new ProjectError(
      'This project was saved by a newer version of Plotka. Update the app to open it.',
    );

  let source: ProjectData['source'] = null;
  const src = raw['source'];
  if (isObj(src) && typeof src['name'] === 'string' && typeof src['base64'] === 'string') {
    try {
      source = { name: src['name'], bytes: fromBase64(src['base64']) };
      if (
        typeof src['path'] === 'string' &&
        /\.(svg|json)$/i.test(src['path']) &&
        !/\.plot\.json$/i.test(src['path'])
      )
        source.path = src['path'];
    } catch {
      throw new ProjectError('The artwork inside this project is damaged.');
    }
  }

  let image: ProjectData['image'] = null;
  const img = raw['image'];
  if (isObj(img) && typeof img['name'] === 'string' && typeof img['base64'] === 'string') {
    try {
      const settings = mergeDefaults(defaultDitherSettings(), img['settings']);
      if (!DITHER_METHODS.includes(settings.method)) settings.method = 'ordered';
      if (!MARK_SHAPES.includes(settings.shape)) settings.shape = 'circle';
      image = { name: img['name'], bytes: fromBase64(img['base64']), settings };
    } catch {
      // A damaged picture only loses the image pad's copy; the artwork itself is separate.
    }
  }

  let model: ProjectData['model'] = null;
  const mdl = raw['model'];
  if (isObj(mdl) && typeof mdl['name'] === 'string' && typeof mdl['base64'] === 'string') {
    try {
      const settings = mergeDefaults(defaultSliceSettings(), mdl['settings']);
      if (!['x', 'y', 'z'].includes(settings.axis)) settings.axis = 'y';
      if (!['visible', 'full'].includes(settings.mode)) settings.mode = 'visible';
      if (!['perspective', 'orthographic'].includes(settings.projection))
        settings.projection = 'perspective';
      const cam = mdl['camera'];
      const vec = (v: unknown): v is [number, number, number] =>
        Array.isArray(v) && v.length === 3 && v.every(isNum);
      const camera =
        isObj(cam) && vec(cam['position']) && vec(cam['target'])
          ? { position: cam['position'], target: cam['target'] }
          : null;
      model = { name: mdl['name'], bytes: fromBase64(mdl['base64']), settings, camera };
    } catch {
      // A damaged model only loses the slicer's copy; the artwork itself is separate.
    }
  }

  const d = raw['doodle'];
  const defaultsDoodle = defaultDoodleSettings();
  const doodle: ProjectData['doodle'] = isObj(d)
    ? {
        strokes: parseStrokes(d['strokes']),
        settings: mergeDefaults(defaultsDoodle, d['settings']),
        size: mergeDefaults({ width: 150, height: 150 }, d['size']),
      }
    : null;

  const plotSkip: Record<string, true> = {};
  if (isObj(raw['plotSkip']))
    for (const [k, v] of Object.entries(raw['plotSkip'])) if (v === true) plotSkip[k] = true;

  const layerOverrides = parseOverrides(raw['layerOverrides']);
  const art = { source, doodles: parseDoodles(raw['doodles']), doodle, layerOverrides, plotSkip };
  if (!Array.isArray(raw['doodles'])) migrateUsedDoodle(art);

  const layerMode = LAYER_MODES.includes(raw['layerMode'] as LayerMode)
    ? (raw['layerMode'] as LayerMode)
    : 'auto';
  const page = mergeDefaults(defaultPageSetup(), raw['page']);
  return {
    ...art,
    layerMode,
    layerCopies: parseLayerCopies(raw['layerCopies']),
    page,
    optimize: mergeDefaults(defaultOptimizeSettings(), raw['optimize']),
    profileId: typeof raw['profileId'] === 'string' ? raw['profileId'] : '',
    pipeline: parsePipeline(raw['pipeline']),
    view: mergeDefaults({ penWidth: 0.4, nib: { on: false, ...DEFAULT_NIB } }, raw['view']),
    texts: parseTexts(raw['texts']),
    image,
    model,
  };
}

/** Duplicated file layers; anything damaged is dropped. */
function parseLayerCopies(v: unknown): LayerCopy[] {
  if (!Array.isArray(v)) return [];
  const out: LayerCopy[] = [];
  for (const c of v) {
    if (!isObj(c) || typeof c['id'] !== 'string' || typeof c['of'] !== 'string') continue;
    if (!/^[\w-]{1,40}$/.test(c['id']) || out.some((o) => o.id === c['id'])) continue;
    if (typeof c['name'] !== 'string' || !LAYER_MODES.includes(c['mode'] as LayerMode)) continue;
    out.push({
      id: c['id'],
      of: c['of'],
      name: c['name'].slice(0, 80),
      mode: c['mode'] as LayerMode,
    });
  }
  return out;
}

/** Doodle layers (an empty layer has no strokes yet); anything damaged is dropped. */
function parseDoodles(v: unknown): DoodleLayerItem[] {
  if (!Array.isArray(v)) return [];
  const out: DoodleLayerItem[] = [];
  for (const d of v) {
    if (!isObj(d) || typeof d['id'] !== 'string' || typeof d['name'] !== 'string') continue;
    if (!/^[\w-]{1,40}$/.test(d['id']) || out.some((o) => o.id === d['id'])) continue;
    if (!Array.isArray(d['strokes'])) continue;
    const strokes = parseStrokes(d['strokes']);
    out.push({
      id: d['id'],
      name: d['name'].slice(0, 80),
      strokes,
      settings: mergeDefaults(defaultDoodleSettings(), d['settings']),
      size: mergeDefaults({ width: 150, height: 150 }, d['size']),
    });
  }
  return out;
}

/**
 * Projects from before doodle layers had one doodle, and using it made it the artwork file
 * ("Doodle.svg"). If that file is exactly the doodle, it becomes a doodle layer with the file
 * layer's settings. Otherwise the strokes stay on the pad and the artwork isn't touched.
 */
function migrateUsedDoodle(
  p: Pick<ProjectData, 'source' | 'doodles' | 'doodle' | 'layerOverrides' | 'plotSkip'>,
) {
  const { source, doodle } = p;
  if (!source || source.name !== 'Doodle.svg' || source.path || !doodle?.strokes.length) return;
  const svg = doodleToSvg(doodle.strokes, doodle.settings, doodle.size);
  if (new TextDecoder().decode(source.bytes) !== svg) return;
  p.source = null;
  p.doodle = null;
  p.doodles = [{ id: '1', name: 'Doodle 1', ...doodle }];
  // A doodle's SVG makes one layer. Its pass layers are skipped as `layer-1~<pass>`.
  const moved = (id: string) => id.replace(/^layer-1(?=~|$)/, 'doodle-1');
  p.layerOverrides = Object.fromEntries(
    Object.entries(p.layerOverrides).map(([id, o]) => [moved(id), o]),
  );
  p.plotSkip = Object.fromEntries(Object.entries(p.plotSkip).map(([id, v]) => [moved(id), v]));
}

const ALIGNS = ['left', 'center', 'right'] as const;

/** Text blocks; anything damaged is dropped (an unknown style falls back to Sans). */
function parseTexts(v: unknown): TextItem[] {
  if (!Array.isArray(v)) return [];
  const fonts = new Set<string>(TEXT_FONTS.map((f) => f.id));
  const out: TextItem[] = [];
  for (const t of v) {
    if (!isObj(t) || typeof t['id'] !== 'string' || typeof t['text'] !== 'string') continue;
    if (!/^[\w-]{1,40}$/.test(t['id']) || out.some((o) => o.id === t['id'])) continue;
    const num = (k: string, d: number, min: number, max: number) =>
      isNum(t[k]) ? Math.min(max, Math.max(min, t[k] as number)) : d;
    out.push({
      id: t['id'],
      text: t['text'].slice(0, 10000),
      font: typeof t['font'] === 'string' && fonts.has(t['font']) ? t['font'] : 'sans',
      size: num('size', 10, 0.5, 1000),
      ...(t['matchNib'] === true ? { matchNib: true } : {}),
      lineSpacing: num('lineSpacing', 1, 0.1, 10),
      letterSpacing: num('letterSpacing', 0, -100, 100),
      align: ALIGNS.includes(t['align'] as (typeof ALIGNS)[number])
        ? (t['align'] as TextItem['align'])
        : 'left',
      x: num('x', 0, -10000, 10000),
      y: num('y', 0, -10000, 10000),
    });
  }
  return out;
}

import {
  defaultDoodleSettings,
  defaultFillSettings,
  defaultOptimizeSettings,
  defaultPageSetup,
  defaultPassSettings,
  SUPPORTED_FILL_TYPES,
  type DoodleSettings,
  type DoodleStroke,
  type FillSettings,
  type LayerMode,
  type LayerSettings,
  type OptimizeSettings,
  type PageSetup,
  type PassSettings,
  type PipelineStep,
} from '@plotter-studio/core';

/** Project files (PROJ-1). See docs/plans/epic-10-projects.md for the format. */
export const PROJECT_FORMAT = 'plotter-studio-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.plot.json';

export type ProjectLayerOverride = {
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
  doodle: {
    strokes: DoodleStroke[];
    settings: DoodleSettings;
    size: { width: number; height: number };
  } | null;
  plotSkip: Record<string, true>;
  view: { penWidth: number };
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
      doodle: d.doodle,
      plotSkip: d.plotSkip,
      view: d.view,
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

function parseStrokes(v: unknown): DoodleStroke[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) =>
      isObj(s) && Array.isArray(s['points'])
        ? {
            points: s['points']
              .filter((p): p is Obj => isObj(p) && isNum(p['x']) && isNum(p['y']))
              .map((p) => ({ x: p['x'] as number, y: p['y'] as number })),
          }
        : null,
    )
    .filter((s): s is DoodleStroke => !!s && s.points.length > 0);
}

/** Reads a project file. Throws ProjectError with a plain message if it can't be used. */
export function parseProject(text: string): ProjectData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("This project file is damaged (it isn't valid JSON).");
  }
  if (!isObj(raw) || raw['format'] !== PROJECT_FORMAT)
    throw new ProjectError("This isn't a Plotter Studio project file.");
  const version = raw['version'];
  if (!isNum(version) || version < 1)
    throw new ProjectError('This project file is damaged (it has no version).');
  if (version > PROJECT_VERSION)
    throw new ProjectError(
      'This project was saved by a newer version of Plotter Studio. Update the app to open it.',
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

  const layerMode = LAYER_MODES.includes(raw['layerMode'] as LayerMode)
    ? (raw['layerMode'] as LayerMode)
    : 'auto';
  const page = mergeDefaults(defaultPageSetup(), raw['page']);
  return {
    source,
    layerMode,
    layerOverrides: parseOverrides(raw['layerOverrides']),
    page,
    optimize: mergeDefaults(defaultOptimizeSettings(), raw['optimize']),
    profileId: typeof raw['profileId'] === 'string' ? raw['profileId'] : '',
    pipeline: parsePipeline(raw['pipeline']),
    doodle,
    plotSkip,
    view: mergeDefaults({ penWidth: 0.4 }, raw['view']),
  };
}

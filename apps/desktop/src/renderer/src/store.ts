import { create } from 'zustand';
import {
  createStep,
  defaultSliceSettings,
  type SliceSettings,
  defaultDitherSettings,
  type DitherSettings,
  defaultDoodleSettings,
  defaultFillSettings,
  defaultOptimizeSettings,
  defaultPageSetup,
  doodleToSvg,
  importFile,
  marginBox,
  paperSize,
  withTexts,
  type DoodleSettings,
  type TextItem,
  type FillSettings,
  type DoodleItem,
  type ParamValues,
  type PipelineStep,
  type Layer,
  type LayerMode,
  type LayerSettings,
  type OptimizeSettings,
  type PageSetup,
  type PlotDocument,
} from '@plotka/core';
import {
  BUILTIN_PROFILES,
  DEFAULT_PROFILE_ID,
  getProfile,
  validateProfile,
  type MachineProfile,
} from '@plotka/plotter';
import type { PlotterStatus } from '@shared/ipc';
import type { Processed } from './lib/pipeline';
import { mergeDefaults, parseFill } from './lib/project';
import { DEFAULT_NIB, type Nib } from './lib/nib';

export type LayerOverride = Partial<Pick<Layer, 'visible' | 'plot' | 'color'>> & {
  settings?: Partial<LayerSettings>;
  /** Removed from the drawing (not shown, not plotted, not listed). Restorable. */
  removed?: boolean;
};

export type ViewOptions = {
  travel: boolean;
  original: boolean;
  bed: boolean;
  margins: boolean;
  /** Pen tip width in mm for drawing strokes. */
  penWidth: number;
  /** Preview as a parallel (flat-nib) pen: nib width in mm and angle in degrees. */
  nib: { on: boolean } & Nib;
};

export type Tab = 'page' | 'fill' | 'machine' | 'plot';

type Source = { name: string; path?: string; bytes: Uint8Array };

/** Same artwork file (a reload or re-import), as opposed to a different file being opened. */
/** Same artwork file (or both none, e.g. only typed text). */
export const sameArtwork = (a: Source | null, b: Source | null) =>
  (!a && !b) || (!!a && !!b && a.name === b.name && a.path === b.path);

export type DoodleState = {
  open: boolean;
  /** What the doodle is made of, in drawing order: strokes and combined shapes. */
  strokes: DoodleItem[];
  /** Earlier and undone versions of `strokes`, for undo / redo in the pad. */
  past: DoodleItem[][];
  future: DoodleItem[][];
  settings: DoodleSettings;
  /** Artboard size in mm. */
  size: { width: number; height: number };
};

/** An image being turned into pen marks (image pad), kept so it can be edited again. */
export type ImageState = {
  open: boolean;
  /** The image file's name, and its bytes as opened (null: none yet). */
  name: string;
  bytes: Uint8Array | null;
  settings: DitherSettings;
};

/** A 3D model being sliced (3D slicer pad), kept so it can be edited again. */
export type ModelState = {
  open: boolean;
  name: string;
  bytes: Uint8Array | null;
  settings: SliceSettings;
  /** Where the 3D view was looking from and at (null: the default view). */
  camera: { position: [number, number, number]; target: [number, number, number] } | null;
};

type State = {
  source: Source | null;
  layerMode: LayerMode;
  doc: PlotDocument | null;
  error: string | null;
  loading: boolean;
  layerOverrides: Record<string, LayerOverride>;
  /**
   * Overrides of the other layer modes for the open file. Layer ids are positional per mode,
   * so each mode keeps its own edits (removed layers, colors…) while the user switches.
   */
  overridesByMode: Partial<Record<LayerMode, Record<string, LayerOverride>>>;
  selectedLayerId: string | null;
  /** The transform step being adjusted by dragging in the preview, if any. */
  adjustStepId: string | null;
  /** LATER-6: text typed in the app, each shown as a layer of `doc` (id `text-<id>`). */
  texts: TextItem[];
  /** Adds a text block (on the paper's top-left margin) and selects it. Returns its id. */
  addText(): string;
  updateText(id: string, patch: Partial<TextItem>): void;
  removeText(id: string): void;
  /** The layer whose spiral fill center is being placed in the preview, if any. */
  adjustSpiralId: string | null;
  /**
   * Arrange mode: moving and resizing in the preview. `target` is the layer being arranged, or
   * null for all layers together (only offered with more than one).
   */
  arrange: { on: boolean; target: string | null };
  page: PageSetup;
  optimize: OptimizeSettings;
  profileId: string;
  view: ViewOptions;
  tab: Tab;
  /** Incremented to ask the preview to fit the view. */
  fitRequest: number;
  /** Transform steps (tile, ...), applied in order before the page setup. */
  pipeline: PipelineStep[];
  doodle: DoodleState;
  image: ImageState;
  model: ModelState;
  /** Live plotter status from the main process. */
  plotter: PlotterStatus | null;
  /** Last plotter error, shown in the Machine / Plot tabs. */
  plotterError: string | null;
  /** Pen heights in %, used for every layer. Saved between sessions. */
  penHeights: { up: number; down: number };
  /** Layers left out of the next plot (PLOT-3). */
  plotSkip: Record<string, true>;
  /** Project name (file name without .plot.json) and whether it has unsaved changes. */
  projectName: string;
  dirty: boolean;
  /** The help window: open, and which topic / section it shows. */
  help: { open: boolean; topic: string; anchor: string };
  /** The "filled shapes won't be drawn" notice was dismissed for this file. */
  undrawnNoticeHidden: boolean;
  /** The pipeline's latest result (lib/pipelineRunner.ts), and whether a newer one is coming. */
  processed: Processed | null;
  processing: boolean;
  /** PLOT-5: where the last plot stopped (layer, path, mm along it), to continue from. */
  checkpoint: { layerId: string; pathIndex: number; offset: number; pathCount: number } | null;
  /** DRIVER-5b: the user's own machine profiles (copies of built-ins, edited). Saved. */
  customProfiles: MachineProfile[];
  /** Copy a profile to edit it; selects the copy. */
  duplicateProfile(id: string): void;
  /** Replace one of the user's profiles (validated by the caller). */
  updateCustomProfile(profile: MachineProfile): void;
  deleteCustomProfile(id: string): void;
  /** PAGE-4: named page setups, saved between sessions. */
  pagePresets: { name: string; page: PageSetup }[];
  savePagePreset(name: string): void;
  deletePagePreset(name: string): void;
  /** HATCH-7: the fill used whenever the app fills shapes for you. Saved between sessions. */
  defaultFill: FillSettings;
  setDefaultFill(fill: FillSettings): void;
  /** PREVIEW-4: playback of the plot order in the preview (time in ms, speed multiplier). */
  playback: { on: boolean; t: number; playing: boolean; speed: number };
  /** IMPORT-5: reload the artwork when its file changes on disk. */
  autoReload: boolean;
  /** When the artwork was last reloaded from disk (for a short confirmation). */
  reloadedAt: number | null;
  /** Unsaved work from a previous run, waiting for Restore or Discard (PROJ-4). */
  recovery: { name: string; savedAt: string } | null;
  /** Whether Undo / Redo have something to do (PROJ-2). */
  canUndo: boolean;
  canRedo: boolean;

  openFile(source: Source): Promise<void>;
  setLayerMode(mode: LayerMode): Promise<void>;
  /** The artwork file changed on disk: import it again, keeping every setting. */
  reloadSource(bytes: Uint8Array): Promise<void>;
  setPage(patch: Partial<PageSetup>): void;
  setOptimize(patch: Partial<OptimizeSettings>): void;
  setLayer(id: string, patch: LayerOverride): void;
  selectLayer(id: string | null): void;
  setAdjustStep(id: string | null): void;
  setAdjustSpiral(layerId: string | null): void;
  setArrange(on: boolean): void;
  /** A layer id, or null for all layers together. */
  setArrangeTarget(target: string | null): void;
  setView(patch: Partial<ViewOptions>): void;
  setTab(tab: Tab): void;
  requestFit(): void;
  addStep(type: string): void;
  updateStep(id: string, patch: { enabled?: boolean; params?: ParamValues }): void;
  removeStep(id: string): void;
  moveStep(id: string, delta: -1 | 1): void;
  setDoodle(patch: Partial<DoodleState>): void;
  /** Changes some doodle settings, keeping the rest as they are now (not as last rendered). */
  setDoodleSettings(patch: Partial<DoodleSettings>): void;
  /** Opens help, at a topic (and section) if given. */
  openHelp(topic?: string, anchor?: string): void;
  closeHelp(): void;
  /** Changes the doodle's strokes and shapes as one undoable step. */
  setDoodleItems(next: DoodleItem[]): void;
  /** Undo / redo the last change in the doodle pad (draw, erase, clear, combine...). */
  doodleUndo(): void;
  doodleRedo(): void;
  setPenHeights(h: { up: number; down: number }): void;
  togglePlotLayer(id: string): void;
  /** Turns the doodle into vectors and opens it as the artwork. */
  applyDoodle(): Promise<void>;
  setImage(patch: Partial<ImageState>): void;
  setImageSettings(patch: Partial<DitherSettings>): void;
  /** Opens the image pad's result (an SVG of pen marks) as the artwork. */
  applyImage(svg: string): Promise<void>;
  setModel(patch: Partial<ModelState>): void;
  setModelSettings(patch: Partial<SliceSettings>): void;
  /** Opens the slicer's result (an SVG of the slices) as the artwork. */
  applyModel(svg: string): Promise<void>;
};

/** Doodle pad undo steps kept. */
const DOODLE_HISTORY = 200;
const PEN_HEIGHTS_KEY = 'penHeights';
const DEFAULT_FILL_KEY = 'defaultFill';
const PAGE_PRESETS_KEY = 'pagePresets';
const CUSTOM_PROFILES_KEY = 'customProfiles';
const PROFILE_ID_KEY = 'profileId';

/** The machine chosen last time, if it still exists. */
function loadProfileId(): string {
  try {
    const id = localStorage.getItem(PROFILE_ID_KEY);
    if (id && knownProfile(id, loadCustomProfiles())) return id;
  } catch {
    // Ignore unreadable storage.
  }
  return DEFAULT_PROFILE_ID;
}

/** A profile by id: built-in, or one of the user's; the default if neither. */
export function resolveProfile(id: string, custom: readonly MachineProfile[]): MachineProfile {
  return getProfile(id) ?? custom.find((p) => p.id === id) ?? getProfile(DEFAULT_PROFILE_ID)!;
}

/** Built-in and user profile ids, for checking a project's saved profile. */
export const knownProfile = (id: string, custom: readonly MachineProfile[]) =>
  BUILTIN_PROFILES.some((p) => p.id === id) || custom.some((p) => p.id === id);

function loadCustomProfiles(): MachineProfile[] {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_PROFILES_KEY) ?? '[]') as unknown;
    if (!Array.isArray(v)) return [];
    const out: MachineProfile[] = [];
    for (const p of v) {
      try {
        out.push(validateProfile(p));
      } catch {
        // Skip a broken entry rather than lose the others.
      }
    }
    return out;
  } catch {
    return [];
  }
}

function storeCustomProfiles(list: MachineProfile[]) {
  try {
    localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: edits last for this session only.
  }
}

function loadPagePresets(): { name: string; page: PageSetup }[] {
  try {
    const v = JSON.parse(localStorage.getItem(PAGE_PRESETS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (p): p is { name: string; page: unknown } =>
          !!p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string',
      )
      .map((p) => ({ name: p.name.slice(0, 80), page: mergeDefaults(defaultPageSetup(), p.page) }));
  } catch {
    return [];
  }
}

function storePagePresets(presets: { name: string; page: PageSetup }[]) {
  try {
    localStorage.setItem(PAGE_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Storage unavailable: presets last for this session only.
  }
}

function loadDefaultFill(): FillSettings {
  try {
    const f = parseFill(JSON.parse(localStorage.getItem(DEFAULT_FILL_KEY) ?? 'null'));
    if (f && f.type !== 'none') return f;
  } catch {
    // Ignore unreadable storage.
  }
  return defaultFillSettings();
}

function loadPenHeights(): { up: number; down: number } {
  const servo = getProfile(DEFAULT_PROFILE_ID)!.servo;
  const fallback = { up: servo.penPosUp, down: servo.penPosDown };
  try {
    const v = JSON.parse(localStorage.getItem(PEN_HEIGHTS_KEY) ?? 'null') as unknown;
    if (v && typeof v === 'object' && 'up' in v && 'down' in v) {
      const { up, down } = v as { up: unknown; down: unknown };
      if (typeof up === 'number' && typeof down === 'number') return { up, down };
    }
  } catch {
    // Ignore unreadable storage.
  }
  return fallback;
}

/** The doodle as an SVG, with the current settings. */
export const doodleSvg = (d: DoodleState) => doodleToSvg(d.strokes, d.settings, d.size);

/** The drawing with its text layers; with no file open, an empty paper-sized one. */
export function docWithTexts(
  doc: PlotDocument | null,
  texts: TextItem[],
  page: PageSetup,
): PlotDocument | null {
  if (doc) return withTexts(doc, texts);
  if (!texts.length) return null;
  const { width, height } = paperSize(page);
  return withTexts({ width, height, layers: [], warnings: [] }, texts);
}

export const useStore = create<State>()((set, get) => ({
  source: null,
  layerMode: 'auto',
  doc: null,
  error: null,
  loading: false,
  layerOverrides: {},
  overridesByMode: {},
  selectedLayerId: null,
  adjustStepId: null,
  adjustSpiralId: null,
  texts: [],
  addText() {
    const s = get();
    const m = marginBox(s.page);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item: TextItem = {
      id,
      text: 'Text',
      font: 'sans',
      size: 10,
      lineSpacing: 1,
      letterSpacing: 0,
      align: 'left',
      x: m.x,
      y: m.y,
    };
    const texts = [...s.texts, item];
    set({ texts, doc: docWithTexts(s.doc, texts, s.page), selectedLayerId: `text-${id}` });
    return id;
  },
  updateText(id, patch) {
    set((s) => {
      const texts = s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t));
      return { texts, doc: docWithTexts(s.doc, texts, s.page) };
    });
  },
  removeText(id) {
    set((s) => {
      const texts = s.texts.filter((t) => t.id !== id);
      const doc = docWithTexts(s.doc, texts, s.page);
      const gone = s.selectedLayerId === `text-${id}`;
      return {
        texts,
        doc: doc && (doc.layers.length || s.source) ? doc : null,
        selectedLayerId: gone ? (doc?.layers[0]?.id ?? null) : s.selectedLayerId,
      };
    });
  },
  arrange: { on: false, target: null },
  page: defaultPageSetup(),
  optimize: defaultOptimizeSettings(),
  profileId: loadProfileId(),
  view: {
    travel: false,
    original: false,
    bed: true,
    margins: true,
    penWidth: 0.4,
    nib: { on: false, ...DEFAULT_NIB },
  },
  tab: 'page',
  fitRequest: 0,
  pipeline: [],
  plotter: null,
  plotterError: null,
  penHeights: loadPenHeights(),
  plotSkip: {},
  projectName: 'Untitled',
  dirty: false,
  canUndo: false,
  canRedo: false,
  processed: null,
  processing: false,
  recovery: null,
  autoReload: true,
  playback: { on: false, t: 0, playing: false, speed: 20 },
  customProfiles: loadCustomProfiles(),
  duplicateProfile: (id) => {
    const src = resolveProfile(id, get().customProfiles);
    const copy: MachineProfile = {
      ...structuredClone(src),
      id: `custom-${Date.now().toString(36)}`,
      name: `${src.name} (my copy)`,
      tested: false,
    };
    const list = [...get().customProfiles, copy];
    set({ customProfiles: list, profileId: copy.id });
    storeCustomProfiles(list);
  },
  updateCustomProfile: (profile) => {
    const list = get().customProfiles.map((p) => (p.id === profile.id ? profile : p));
    set({ customProfiles: list });
    storeCustomProfiles(list);
  },
  deleteCustomProfile: (id) => {
    const list = get().customProfiles.filter((p) => p.id !== id);
    set((s) => ({
      customProfiles: list,
      profileId: s.profileId === id ? DEFAULT_PROFILE_ID : s.profileId,
    }));
    storeCustomProfiles(list);
  },
  pagePresets: loadPagePresets(),
  savePagePreset: (name) => {
    const n = name.trim();
    if (!n) return;
    const presets = [
      ...get().pagePresets.filter((p) => p.name !== n),
      { name: n, page: { ...get().page } },
    ].sort((a, b) => a.name.localeCompare(b.name));
    set({ pagePresets: presets });
    storePagePresets(presets);
  },
  deletePagePreset: (name) => {
    const presets = get().pagePresets.filter((p) => p.name !== name);
    set({ pagePresets: presets });
    storePagePresets(presets);
  },
  defaultFill: loadDefaultFill(),
  setDefaultFill: (fill) => {
    set({ defaultFill: { ...fill } });
    try {
      localStorage.setItem(DEFAULT_FILL_KEY, JSON.stringify(fill));
    } catch {
      // Storage unavailable: the default lasts for this session only.
    }
  },
  checkpoint: null,
  reloadedAt: null,
  undrawnNoticeHidden: false,
  help: { open: false, topic: 'getting-started', anchor: '' },
  image: { open: false, name: '', bytes: null, settings: defaultDitherSettings() },
  model: { open: false, name: '', bytes: null, settings: defaultSliceSettings(), camera: null },
  doodle: {
    open: false,
    strokes: [],
    past: [],
    future: [],
    settings: defaultDoodleSettings(),
    size: { width: 150, height: 150 },
  },

  async openFile(source) {
    set({ loading: true, error: null });
    try {
      const imported = await importFile(source.bytes, source.name, {
        layerMode: get().layerMode,
        defaultFill: get().defaultFill,
      });
      set((s) => {
        const doc = withTexts(imported, s.texts);
        // Re-importing the same file (a layer mode switch) brings back that mode's edits. Text
        // layers are the same in every mode, so their edits stay.
        const same = s.source === source;
        const textEdits = Object.fromEntries(
          Object.entries(s.layerOverrides).filter(([id]) => id.startsWith('text-')),
        );
        const layerOverrides = {
          ...((same && s.overridesByMode[s.layerMode]) || {}),
          ...textEdits,
        };
        return {
          source,
          doc,
          loading: false,
          layerOverrides,
          overridesByMode: same ? s.overridesByMode : {},
          undrawnNoticeHidden: same ? s.undrawnNoticeHidden : false,
          selectedLayerId: doc.layers.find((l) => !layerOverrides[l.id]?.removed)?.id ?? null,
          fitRequest: s.fitRequest + 1,
        };
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async reloadSource(bytes) {
    const { source, layerMode } = get();
    if (!source) return;
    try {
      const imported = await importFile(bytes, source.name, {
        layerMode,
        defaultFill: get().defaultFill,
      });
      const doc = withTexts(imported, get().texts);
      set((s) => ({
        source: { ...source, bytes },
        doc,
        error: null,
        reloadedAt: Date.now(),
        selectedLayerId: doc.layers.some((l) => l.id === s.selectedLayerId)
          ? s.selectedLayerId
          : (doc.layers[0]?.id ?? null),
      }));
    } catch (e) {
      // Half-written or broken while the editor saves: keep the last good version.
      set({
        error: `Couldn’t reload ${source.name}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },

  async setLayerMode(layerMode) {
    const prev = get();
    if (layerMode === prev.layerMode) return;
    set({
      layerMode,
      overridesByMode: { ...prev.overridesByMode, [prev.layerMode]: prev.layerOverrides },
    });
    const { source } = get();
    if (source) await get().openFile(source);
  },

  setPage: (patch) => set((s) => ({ page: { ...s.page, ...patch } })),
  setOptimize: (patch) => set((s) => ({ optimize: { ...s.optimize, ...patch } })),

  setLayer: (id, patch) =>
    set((s) => {
      const prev = s.layerOverrides[id] ?? {};
      return {
        layerOverrides: {
          ...s.layerOverrides,
          [id]: { ...prev, ...patch, settings: { ...prev.settings, ...patch.settings } },
        },
      };
    }),

  selectLayer: (selectedLayerId) =>
    set((s) => ({
      selectedLayerId,
      // Placing a spiral center is for one layer: picking another ends it.
      adjustSpiralId: s.adjustSpiralId === selectedLayerId ? s.adjustSpiralId : null,
      // Arranging follows the selected layer.
      ...(s.arrange.on && selectedLayerId
        ? { arrange: { on: true, target: selectedLayerId } }
        : {}),
    })),
  // One thing is adjusted in the preview at a time.
  setAdjustStep: (adjustStepId) =>
    set((s) => ({ adjustStepId, adjustSpiralId: null, arrange: { ...s.arrange, on: false } })),
  setAdjustSpiral: (adjustSpiralId) =>
    set((s) => ({ adjustSpiralId, adjustStepId: null, arrange: { ...s.arrange, on: false } })),
  setArrange: (on) =>
    set((s) => ({
      // Starts on the selected layer.
      arrange: { on, target: s.selectedLayerId },
      ...(on ? { adjustStepId: null, adjustSpiralId: null } : {}),
    })),
  setArrangeTarget: (target) =>
    set((s) => ({
      arrange: { ...s.arrange, target },
      ...(target ? { selectedLayerId: target } : {}),
    })),
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  setTab: (tab) => set({ tab }),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),

  addStep: (type) => set((s) => ({ pipeline: [...s.pipeline, createStep(type)] })),
  updateStep: (id, patch) =>
    set((s) => ({
      pipeline: s.pipeline.map((st) =>
        st.id === id
          ? {
              ...st,
              enabled: patch.enabled ?? st.enabled,
              params: { ...st.params, ...patch.params },
            }
          : st,
      ),
    })),
  removeStep: (id) =>
    set((s) => ({
      pipeline: s.pipeline.filter((st) => st.id !== id),
      adjustStepId: s.adjustStepId === id ? null : s.adjustStepId,
    })),
  moveStep: (id, delta) =>
    set((s) => {
      const i = s.pipeline.findIndex((st) => st.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= s.pipeline.length) return {};
      const next = [...s.pipeline];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { pipeline: next };
    }),

  setDoodle: (patch) => set((s) => ({ doodle: { ...s.doodle, ...patch } })),
  setDoodleSettings: (patch) =>
    set((s) => ({ doodle: { ...s.doodle, settings: { ...s.doodle.settings, ...patch } } })),
  openHelp: (topic, anchor) =>
    set((s) => ({
      help: {
        open: true,
        topic: topic ?? s.help.topic,
        anchor: topic ? (anchor ?? '') : s.help.anchor,
      },
    })),
  closeHelp: () => set((s) => ({ help: { ...s.help, open: false } })),
  setDoodleItems: (next) =>
    set((s) => ({
      doodle: {
        ...s.doodle,
        strokes: next,
        past: [...s.doodle.past, s.doodle.strokes].slice(-DOODLE_HISTORY),
        future: [],
      },
    })),
  doodleUndo: () =>
    set((s) => {
      const { strokes, past, future } = s.doodle;
      const prev = past[past.length - 1];
      return prev
        ? {
            doodle: {
              ...s.doodle,
              strokes: prev,
              past: past.slice(0, -1),
              future: [...future, strokes],
            },
          }
        : {};
    }),
  doodleRedo: () =>
    set((s) => {
      const { strokes, past, future } = s.doodle;
      const next = future[future.length - 1];
      return next
        ? {
            doodle: {
              ...s.doodle,
              strokes: next,
              past: [...past, strokes],
              future: future.slice(0, -1),
            },
          }
        : {};
    }),
  setPenHeights: (penHeights) => {
    set({ penHeights });
    try {
      localStorage.setItem(PEN_HEIGHTS_KEY, JSON.stringify(penHeights));
    } catch {
      // Storage unavailable: heights last for this session only.
    }
  },
  togglePlotLayer: (id) =>
    set((s) => {
      const next = { ...s.plotSkip };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { plotSkip: next };
    }),
  setImage: (patch) => set((s) => ({ image: { ...s.image, ...patch } })),
  setImageSettings: (patch) =>
    set((s) => ({ image: { ...s.image, settings: { ...s.image.settings, ...patch } } })),
  setModel: (patch) => set((s) => ({ model: { ...s.model, ...patch } })),
  setModelSettings: (patch) =>
    set((s) => ({ model: { ...s.model, settings: { ...s.model.settings, ...patch } } })),
  async applyModel(svg) {
    const { name } = get().model;
    set((s) => ({ model: { ...s.model, open: false } }));
    const base = name.replace(/\.[^.]+$/, '') || 'Model';
    await get().openFile({ name: `${base} (sliced).svg`, bytes: new TextEncoder().encode(svg) });
  },
  async applyImage(svg) {
    const { name } = get().image;
    set((s) => ({ image: { ...s.image, open: false } }));
    const base = name.replace(/\.[^.]+$/, '') || 'Image';
    await get().openFile({ name: `${base} (dithered).svg`, bytes: new TextEncoder().encode(svg) });
  },
  async applyDoodle() {
    const doodle = get().doodle;
    const svg = doodleSvg(doodle);
    set((s) => ({ doodle: { ...s.doodle, open: false } }));
    await get().openFile({ name: 'Doodle.svg', bytes: new TextEncoder().encode(svg) });
    // Shapes were filled on purpose: hatch them (unless the import already chose a fill),
    // so a fill-only shape next to open lines doesn't end up undrawn.
    const doc = get().doc;
    if (doodle.settings.fillClosed && doc)
      for (const l of doc.layers)
        if (!l.settings.fill && l.fills.length > 0)
          get().setLayer(l.id, { settings: { fill: { ...get().defaultFill } } });
  },
}));

/**
 * A layer's settings as they are right now (not as last rendered), for changes that build on
 * the current value, so two quick changes in a row don't overwrite each other.
 */
export function currentLayerSettings(id: string): LayerSettings | undefined {
  const { doc, layerOverrides } = useStore.getState();
  if (!doc) return undefined;
  return applyOverrides(doc, layerOverrides).layers.find((l) => l.id === id)?.settings;
}

/** Applies UI overrides (visibility, plot toggle, settings) to the imported layers. */
export function applyOverrides(
  doc: PlotDocument,
  overrides: Record<string, LayerOverride>,
): PlotDocument {
  return {
    ...doc,
    layers: doc.layers
      .filter((l) => !overrides[l.id]?.removed)
      .map((l) => {
        const o = overrides[l.id];
        if (!o) return l;
        const { settings, removed: _removed, ...rest } = o;
        return { ...l, ...rest, settings: { ...l.settings, ...settings } };
      }),
  };
}

// Remember the chosen machine for next time.
useStore.subscribe((s, p) => {
  if (s.profileId === p.profileId) return;
  try {
    localStorage.setItem(PROFILE_ID_KEY, s.profileId);
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
});

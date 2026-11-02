import { create } from 'zustand';
import {
  createStep,
  defaultDoodleSettings,
  defaultFillSettings,
  defaultOptimizeSettings,
  defaultPageSetup,
  doodleToSvg,
  importFile,
  type DoodleSettings,
  type DoodleStroke,
  type ParamValues,
  type PipelineStep,
  type Layer,
  type LayerMode,
  type LayerSettings,
  type OptimizeSettings,
  type PageSetup,
  type PlotDocument,
} from '@plotter-studio/core';
import { DEFAULT_PROFILE_ID, getProfile } from '@plotter-studio/plotter';
import type { PlotterStatus } from '@shared/ipc';
import type { Processed } from './lib/pipeline';

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
};

export type Tab = 'page' | 'fill' | 'machine' | 'plot';

type Source = { name: string; path?: string; bytes: Uint8Array };

export type DoodleState = {
  open: boolean;
  strokes: DoodleStroke[];
  /** Strokes undone, for redo. */
  undone: DoodleStroke[];
  settings: DoodleSettings;
  /** Artboard size in mm. */
  size: { width: number; height: number };
};

type State = {
  source: Source | null;
  layerMode: LayerMode;
  doc: PlotDocument | null;
  error: string | null;
  loading: boolean;
  layerOverrides: Record<string, LayerOverride>;
  selectedLayerId: string | null;
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
  /** Unsaved work from a previous run, waiting for Restore or Discard (PROJ-4). */
  recovery: { name: string; savedAt: string } | null;
  /** Whether Undo / Redo have something to do (PROJ-2). */
  canUndo: boolean;
  canRedo: boolean;

  openFile(source: Source): Promise<void>;
  setLayerMode(mode: LayerMode): Promise<void>;
  setPage(patch: Partial<PageSetup>): void;
  setOptimize(patch: Partial<OptimizeSettings>): void;
  setLayer(id: string, patch: LayerOverride): void;
  selectLayer(id: string | null): void;
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
  /** Undo / redo the last stroke in the doodle pad. */
  doodleUndo(): void;
  doodleRedo(): void;
  setPenHeights(h: { up: number; down: number }): void;
  togglePlotLayer(id: string): void;
  /** Turns the doodle into vectors and opens it as the artwork. */
  applyDoodle(): Promise<void>;
};

const PEN_HEIGHTS_KEY = 'penHeights';

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

export const useStore = create<State>()((set, get) => ({
  source: null,
  layerMode: 'auto',
  doc: null,
  error: null,
  loading: false,
  layerOverrides: {},
  selectedLayerId: null,
  page: defaultPageSetup(),
  optimize: defaultOptimizeSettings(),
  profileId: DEFAULT_PROFILE_ID,
  view: { travel: false, original: false, bed: true, margins: true, penWidth: 0.4 },
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
  undrawnNoticeHidden: false,
  help: { open: false, topic: 'getting-started', anchor: '' },
  doodle: {
    open: false,
    strokes: [],
    undone: [],
    settings: defaultDoodleSettings(),
    size: { width: 150, height: 150 },
  },

  async openFile(source) {
    set({ loading: true, error: null });
    try {
      const doc = await importFile(source.bytes, source.name, { layerMode: get().layerMode });
      set((s) => ({
        source,
        doc,
        loading: false,
        layerOverrides: {},
        undrawnNoticeHidden: s.source === source ? s.undrawnNoticeHidden : false,
        selectedLayerId: doc.layers[0]?.id ?? null,
        fitRequest: s.fitRequest + 1,
      }));
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async setLayerMode(layerMode) {
    set({ layerMode });
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

  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
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
  removeStep: (id) => set((s) => ({ pipeline: s.pipeline.filter((st) => st.id !== id) })),
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
  doodleUndo: () =>
    set((s) => {
      const { strokes, undone } = s.doodle;
      const last = strokes[strokes.length - 1];
      return last
        ? { doodle: { ...s.doodle, strokes: strokes.slice(0, -1), undone: [...undone, last] } }
        : {};
    }),
  doodleRedo: () =>
    set((s) => {
      const { strokes, undone } = s.doodle;
      const next = undone[undone.length - 1];
      return next
        ? { doodle: { ...s.doodle, strokes: [...strokes, next], undone: undone.slice(0, -1) } }
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
          get().setLayer(l.id, { settings: { fill: defaultFillSettings() } });
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

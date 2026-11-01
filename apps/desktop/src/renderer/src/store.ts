import { create } from 'zustand';
import {
  defaultOptimizeSettings,
  defaultPageSetup,
  importFile,
  type Layer,
  type LayerMode,
  type LayerSettings,
  type OptimizeSettings,
  type PageSetup,
  type PlotDocument,
} from '@plotter-studio/core';
import { DEFAULT_PROFILE_ID } from '@plotter-studio/plotter';

export type LayerOverride = Partial<Pick<Layer, 'visible' | 'plot' | 'color'>> & {
  settings?: Partial<LayerSettings>;
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

  openFile(source: Source): Promise<void>;
  setLayerMode(mode: LayerMode): Promise<void>;
  setPage(patch: Partial<PageSetup>): void;
  setOptimize(patch: Partial<OptimizeSettings>): void;
  setLayer(id: string, patch: LayerOverride): void;
  selectLayer(id: string | null): void;
  setView(patch: Partial<ViewOptions>): void;
  setTab(tab: Tab): void;
  requestFit(): void;
};

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

  async openFile(source) {
    set({ loading: true, error: null });
    try {
      const doc = await importFile(source.bytes, source.name, { layerMode: get().layerMode });
      set((s) => ({
        source,
        doc,
        loading: false,
        layerOverrides: {},
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
}));

/** Applies UI overrides (visibility, plot toggle, settings) to the imported layers. */
export function applyOverrides(
  doc: PlotDocument,
  overrides: Record<string, LayerOverride>,
): PlotDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const o = overrides[l.id];
      if (!o) return l;
      const { settings, ...rest } = o;
      return { ...l, ...rest, settings: { ...l.settings, ...settings } };
    }),
  };
}

import { DEFAULT_PROFILE_ID } from '@plotter-studio/plotter';
import { docWithTexts, knownProfile, sameArtwork, useStore, type ViewOptions } from '../store';

type State = ReturnType<typeof useStore.getState>;
import {
  parseProject,
  ProjectError,
  projectNameFromFile,
  serializeProject,
  type ProjectData,
} from './project';

type Source = { name: string; path?: string; bytes: Uint8Array };

/** While true, store changes don't mark the project edited (opening, loading). */
let quiet = false;

async function quietly(fn: () => Promise<void> | void) {
  quiet = true;
  try {
    await fn();
  } finally {
    quiet = false;
  }
}

/** The current project, as saved to disk. */
export function currentProject(): ProjectData {
  const s = useStore.getState();
  return {
    source: s.source
      ? {
          name: s.source.name,
          bytes: s.source.bytes,
          ...(s.source.path ? { path: s.source.path } : {}),
        }
      : null,
    layerMode: s.layerMode,
    layerOverrides: s.layerOverrides,
    page: s.page,
    optimize: s.optimize,
    profileId: s.profileId,
    pipeline: s.pipeline,
    doodle: s.doodle.strokes.length
      ? { strokes: s.doodle.strokes, settings: s.doodle.settings, size: s.doodle.size }
      : null,
    plotSkip: s.plotSkip,
    view: { penWidth: s.view.penWidth, nib: s.view.nib },
    texts: s.texts,
    image: s.image.bytes
      ? { name: s.image.name, bytes: s.image.bytes, settings: s.image.settings }
      : null,
  };
}

const baseName = (file: string) => file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

// --- PROJ-2: undo / redo of settings ---

/** The settings undo covers. Doodle strokes have their own undo in the pad. */
type Snapshot = Pick<
  State,
  | 'layerMode'
  | 'layerOverrides'
  | 'page'
  | 'optimize'
  | 'pipeline'
  | 'plotSkip'
  | 'profileId'
  | 'texts'
> &
  Pick<ViewOptions, 'penWidth' | 'nib'>;

const MAX_HISTORY = 200;
/** Repeated changes to the same setting closer together than this form one undo step. */
const COALESCE_MS = 400;
let past: Snapshot[] = [];
let future: Snapshot[] = [];
let lastRecord = -Infinity;
let lastKey = '';

const snapshot = (s: State): Snapshot => ({
  layerMode: s.layerMode,
  layerOverrides: s.layerOverrides,
  page: s.page,
  optimize: s.optimize,
  pipeline: s.pipeline,
  plotSkip: s.plotSkip,
  profileId: s.profileId,
  penWidth: s.view.penWidth,
  nib: s.view.nib,
  texts: s.texts,
});

/** Which settings changed, as a key (empty if none). */
function changedKey(s: State, p: State): string {
  const keys: string[] = [];
  if (s.layerMode !== p.layerMode) keys.push('layerMode');
  if (s.layerOverrides !== p.layerOverrides) keys.push('layers');
  if (s.page !== p.page) keys.push('page');
  if (s.optimize !== p.optimize) keys.push('optimize');
  if (s.pipeline !== p.pipeline) keys.push('pipeline');
  if (s.plotSkip !== p.plotSkip) keys.push('plotSkip');
  // Adding or deleting text is a step of its own, never merged with typing in it.
  if (s.texts !== p.texts) keys.push(s.texts.length !== p.texts.length ? 'textList' : 'texts');
  if (s.profileId !== p.profileId) keys.push('profile');
  if (s.view.penWidth !== p.view.penWidth) keys.push('penWidth');
  if (s.view.nib !== p.view.nib) keys.push('nib');
  return keys.join(',');
}

function syncFlags() {
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const s = useStore.getState();
  if (s.canUndo !== canUndo || s.canRedo !== canRedo) useStore.setState({ canUndo, canRedo });
}

function record(before: Snapshot, key: string) {
  const now = Date.now();
  const sameBurst = key === lastKey && now - lastRecord < COALESCE_MS && past.length > 0;
  if (!sameBurst) {
    past.push(before);
    if (past.length > MAX_HISTORY) past.shift();
  }
  lastRecord = now;
  lastKey = key;
  future = [];
  syncFlags();
}

/**
 * A gesture (like a drag in the preview) is one undo step however many changes it makes.
 * Call `endGesture` when it's over.
 */
let gesture: { before: Snapshot; recorded: boolean } | null = null;
export function beginGesture() {
  gesture = { before: snapshot(useStore.getState()), recorded: false };
}
export function endGesture() {
  gesture = null;
  lastRecord = -Infinity;
}

export function resetHistory() {
  past = [];
  future = [];
  lastRecord = -Infinity;
  lastKey = '';
  syncFlags();
}

async function restore(target: Snapshot) {
  await quietly(async () => {
    const s = useStore.getState();
    if (target.layerMode !== s.layerMode && s.source) {
      // Layer mode decides how the file is split into layers: import it again that way.
      useStore.setState({ layerMode: target.layerMode });
      await s.openFile(s.source);
    } else useStore.setState({ layerMode: target.layerMode });
    useStore.setState((cur) => ({
      layerOverrides: target.layerOverrides,
      page: target.page,
      optimize: target.optimize,
      pipeline: target.pipeline,
      plotSkip: target.plotSkip,
      profileId: target.profileId,
      view: { ...cur.view, penWidth: target.penWidth, nib: target.nib },
      texts: target.texts,
      doc: docWithTexts(cur.doc, target.texts, target.page),
      dirty: true,
    }));
  });
  lastRecord = -Infinity;
  syncFlags();
}

export async function undo() {
  const target = past.pop();
  if (!target) return;
  future.push(snapshot(useStore.getState()));
  await restore(target);
}

export async function redo() {
  const target = future.pop();
  if (!target) return;
  past.push(snapshot(useStore.getState()));
  await restore(target);
}

/** Opens artwork (an SVG) as a new, untitled project. */
export async function openArtwork(source: Source, { forget }: { forget: boolean }) {
  if (forget) await window.api.invoke('project:forget');
  await quietly(async () => {
    // New artwork is a new project: no text from the last one.
    useStore.setState({ texts: [] });
    await useStore.getState().openFile(source);
  });
  if (!useStore.getState().error) {
    useStore.setState({ projectName: baseName(source.name) || 'Untitled', dirty: false });
    resetHistory();
  }
}

/** Opens a .plot.json project. */
export async function openProject(
  bytes: Uint8Array,
  fileName: string,
  { forget }: { forget: boolean },
) {
  let d: ProjectData;
  try {
    d = parseProject(new TextDecoder().decode(bytes));
  } catch (e) {
    useStore.setState({ error: e instanceof ProjectError ? e.message : String(e) });
    return;
  }
  if (forget) await window.api.invoke('project:forget');
  await quietly(async () => {
    const s = useStore.getState();
    useStore.setState({
      layerMode: d.layerMode,
      page: d.page,
      optimize: d.optimize,
      profileId: knownProfile(d.profileId, s.customProfiles) ? d.profileId : DEFAULT_PROFILE_ID,
      pipeline: d.pipeline,
      doodle: {
        ...s.doodle,
        open: false,
        past: [],
        future: [],
        ...(d.doodle ?? { strokes: [] }),
      },
      view: { ...s.view, penWidth: d.view.penWidth, nib: d.view.nib },
      image: d.image
        ? { open: false, ...d.image }
        : { ...s.image, open: false, name: '', bytes: null },
      texts: d.texts,
      error: null,
    });
    if (d.source) await useStore.getState().openFile(d.source);
    else {
      // Text only (or nothing): an empty paper with the text layers.
      const doc = docWithTexts(null, d.texts, d.page);
      useStore.setState({ source: null, doc, selectedLayerId: doc?.layers[0]?.id ?? null });
    }
    // openFile resets these, so they go last.
    useStore.setState({ layerOverrides: d.layerOverrides, plotSkip: d.plotSkip });
  });
  useStore.setState({ projectName: projectNameFromFile(fileName), dirty: false });
  resetHistory();
}

/** ⌘S / ⇧⌘S. Returns false if cancelled or failed. */
export async function saveProject(saveAs = false): Promise<boolean> {
  const { projectName } = useStore.getState();
  try {
    const r = await window.api.invoke(
      'project:save',
      serializeProject(currentProject()),
      saveAs,
      projectName,
    );
    if (!r) return false;
    useStore.setState({ projectName: r.name, dirty: false, error: null });
    return true;
  } catch (e) {
    useStore.setState({ error: `Couldn't save: ${e instanceof Error ? e.message : String(e)}` });
    return false;
  }
}

/**
 * Marks the project edited when anything saved in it changes, and keeps the window title in
 * sync. Call once at startup.
 */
export function trackProject(): () => void {
  const unsub = useStore.subscribe((s, p) => {
    if (!quiet) {
      // Undo history. New artwork (a doodle, a dropped file) starts over; the layer changes
      // that come with any import (e.g. after a layer mode change) aren't steps of their own.
      if (!sameArtwork(s.source, p.source)) resetHistory();
      // Text edits change the drawing too (its text layers), but they're the user's own steps.
      else if (s.doc === p.doc || s.texts !== p.texts) {
        const key = changedKey(s, p);
        if (key && gesture) {
          if (!gesture.recorded) record(gesture.before, 'gesture');
          gesture.recorded = true;
        } else if (key) record(snapshot(p), key);
      }
    }
    if (!quiet && !s.dirty) {
      const changed =
        s.source !== p.source ||
        s.layerMode !== p.layerMode ||
        s.layerOverrides !== p.layerOverrides ||
        s.page !== p.page ||
        s.optimize !== p.optimize ||
        s.profileId !== p.profileId ||
        s.pipeline !== p.pipeline ||
        s.doodle.strokes !== p.doodle.strokes ||
        s.doodle.settings !== p.doodle.settings ||
        s.doodle.size !== p.doodle.size ||
        s.plotSkip !== p.plotSkip ||
        s.texts !== p.texts ||
        s.view.penWidth !== p.view.penWidth ||
        s.view.nib !== p.view.nib ||
        s.image.bytes !== p.image.bytes ||
        s.image.settings !== p.image.settings;
      if (changed) useStore.setState({ dirty: true });
    }
    if (s.projectName !== p.projectName || s.dirty !== p.dirty)
      void window.api.invoke('project:state', s.projectName, s.dirty);
  });
  const { projectName, dirty } = useStore.getState();
  void window.api.invoke('project:state', projectName, dirty);
  return unsub;
}

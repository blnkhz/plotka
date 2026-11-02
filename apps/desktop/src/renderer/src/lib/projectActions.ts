import { DEFAULT_PROFILE_ID, getProfile } from '@plotter-studio/plotter';
import { useStore } from '../store';
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
    source: s.source ? { name: s.source.name, bytes: s.source.bytes } : null,
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
    view: { penWidth: s.view.penWidth },
  };
}

const baseName = (file: string) => file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

/** Opens artwork (an SVG) as a new, untitled project. */
export async function openArtwork(source: Source, { forget }: { forget: boolean }) {
  if (forget) await window.api.invoke('project:forget');
  await quietly(() => useStore.getState().openFile(source));
  if (!useStore.getState().error)
    useStore.setState({ projectName: baseName(source.name) || 'Untitled', dirty: false });
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
      profileId: getProfile(d.profileId) ? d.profileId : DEFAULT_PROFILE_ID,
      pipeline: d.pipeline,
      doodle: {
        ...s.doodle,
        open: false,
        undone: [],
        ...(d.doodle ?? { strokes: [] }),
      },
      view: { ...s.view, penWidth: d.view.penWidth },
      error: null,
    });
    if (d.source) await useStore.getState().openFile(d.source);
    else useStore.setState({ source: null, doc: null, selectedLayerId: null });
    // openFile resets these, so they go last.
    useStore.setState({ layerOverrides: d.layerOverrides, plotSkip: d.plotSkip });
  });
  useStore.setState({ projectName: projectNameFromFile(fileName), dirty: false });
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
        s.view.penWidth !== p.view.penWidth;
      if (changed) useStore.setState({ dirty: true });
    }
    if (s.projectName !== p.projectName || s.dirty !== p.dirty)
      void window.api.invoke('project:state', s.projectName, s.dirty);
  });
  const { projectName, dirty } = useStore.getState();
  void window.api.invoke('project:state', projectName, dirty);
  return unsub;
}

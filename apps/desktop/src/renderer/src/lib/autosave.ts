import { useStore } from '../store';
import { serializeProject } from './project';
import { currentProject, openProject } from './projectActions';

type State = ReturnType<typeof useStore.getState>;

/** Wait after the last change before writing the recovery file, ms. */
export const AUTOSAVE_DELAY_MS = 3000;

/** The parts of the state that a project saves; a change in any of them is worth autosaving. */
const projectParts = (s: State) =>
  [
    s.source,
    s.layerMode,
    s.layerOverrides,
    s.page,
    s.optimize,
    s.profileId,
    s.pipeline,
    s.plotSkip,
    s.doodle.strokes,
    s.doodle.settings,
    s.doodle.size,
    s.view.penWidth,
  ] as const;

/**
 * PROJ-4 autosave: while there are unsaved changes, write the project to the recovery file a few
 * seconds after the last change; remove it once the work is saved (or a file is opened). While a
 * previous run's recovery is waiting for the user's answer, nothing is written over it.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const write = () => {
    timer = null;
    const s = useStore.getState();
    if (!s.dirty || s.recovery) return;
    void window.api.invoke('autosave:write', serializeProject(currentProject()), s.projectName);
  };
  const unsub = useStore.subscribe((s, p) => {
    if (s.recovery) return;
    if (p.dirty && !s.dirty) {
      if (timer) clearTimeout(timer);
      timer = null;
      void window.api.invoke('autosave:clear');
      return;
    }
    if (!s.dirty) return;
    const a = projectParts(s);
    const b = projectParts(p);
    if (s.dirty !== p.dirty || a.some((v, i) => v !== b[i])) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, AUTOSAVE_DELAY_MS);
    }
  });
  // Unsaved work from a run that didn't close cleanly?
  void window.api.invoke('autosave:check').then((recovery) => {
    if (recovery) useStore.setState({ recovery });
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}

/** Restores the recovered work as an unsaved project. */
export async function restoreRecovery() {
  const s = useStore.getState();
  const info = s.recovery;
  const content = await window.api.invoke('autosave:read');
  useStore.setState({ recovery: null });
  if (!content || !info) return;
  await openProject(new TextEncoder().encode(content), `${info.name}.plot.json`, { forget: true });
  // It was never saved: keep it marked as edited (which also autosaves it again).
  useStore.setState({ dirty: true });
}

export async function discardRecovery() {
  useStore.setState({ recovery: null });
  await window.api.invoke('autosave:clear');
}

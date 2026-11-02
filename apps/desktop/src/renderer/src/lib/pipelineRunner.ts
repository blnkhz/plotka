import { applyOverrides, useStore } from '../store';
import { computeProcessed, type PipelineInput, type Processed } from './pipeline';

type State = ReturnType<typeof useStore.getState>;
type Reply = { id: number; result?: Processed; error?: string };

/** The store values the pipeline depends on; a change in any of them re-runs it. */
const inputsOf = (s: State) =>
  [s.doc, s.layerOverrides, s.page, s.optimize, s.pipeline, s.profileId, s.penHeights] as const;

function buildInput(s: State): PipelineInput | null {
  if (!s.doc) return null;
  return {
    doc: applyOverrides(s.doc, s.layerOverrides),
    page: s.page,
    optimize: s.optimize,
    transforms: s.pipeline,
    profileId: s.profileId,
    penHeights: s.penHeights,
  };
}

/**
 * PREVIEW-5: runs the pipeline once per change, in a Web Worker, and stores the result
 * (`processed`). If the inputs change while a run is busy, that worker is stopped and a new one
 * started with the latest inputs. Call once at startup; returns a cleanup function.
 */
export function startPipeline(): () => void {
  let worker: Worker | null = null;
  let busy = false;
  let nextId = 0;
  let latest = 0;

  const makeWorker = () => {
    const w = new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (e: MessageEvent<Reply>) => {
      busy = false;
      if (e.data.id !== latest) return; // a newer run was started
      if (e.data.error) useStore.setState({ processing: false, error: e.data.error });
      else useStore.setState({ processed: e.data.result ?? null, processing: false });
    };
    w.onerror = (e) => {
      busy = false;
      useStore.setState({ processing: false, error: `Processing failed: ${e.message}` });
    };
    return w;
  };

  const run = (s: State) => {
    const input = buildInput(s);
    const id = ++nextId;
    latest = id;
    if (!input) {
      useStore.setState({ processed: null, processing: false });
      return;
    }
    if (typeof Worker === 'undefined') {
      useStore.setState({ processed: computeProcessed(input), processing: false });
      return;
    }
    if (busy && worker) {
      // Don't finish stale work: start over with the latest inputs.
      worker.terminate();
      worker = null;
    }
    worker ??= makeWorker();
    busy = true;
    useStore.setState({ processing: true });
    worker.postMessage({ id, input });
  };

  const unsub = useStore.subscribe((s, p) => {
    const a = inputsOf(s);
    const b = inputsOf(p);
    if (a.every((v, i) => v === b[i])) return;
    // A different file: drop the old result rather than show it on the new page.
    if (s.doc !== p.doc) useStore.setState({ processed: null });
    run(s);
  });
  run(useStore.getState());
  return () => {
    unsub();
    worker?.terminate();
  };
}

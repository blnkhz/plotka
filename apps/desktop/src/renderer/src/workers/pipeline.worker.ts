/// <reference lib="webworker" />
import { computeProcessed, type PipelineInput } from '../lib/pipeline';

/** PREVIEW-5: runs the pipeline off the main thread. One request at a time. */
self.onmessage = (e: MessageEvent<{ id: number; input: PipelineInput }>) => {
  const { id, input } = e.data;
  try {
    self.postMessage({ id, result: computeProcessed(input) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

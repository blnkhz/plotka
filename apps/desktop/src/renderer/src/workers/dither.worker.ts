/// <reference lib="webworker" />
import { ditherImage, type DitherGrid, type DitherSettings } from '@plotka/core';

export type DitherRequest = {
  id: number;
  pixels: Uint8ClampedArray;
  grid: DitherGrid;
  settings: DitherSettings;
};

/** Turns a picture's sampled pixels into pen marks off the main thread, so the pad stays live. */
self.onmessage = (e: MessageEvent<DitherRequest>) => {
  const { id, pixels, grid, settings } = e.data;
  try {
    self.postMessage({ id, result: ditherImage(pixels, grid, settings) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

import type { PlotDocument } from '../model';
import { tessellate } from './tessellate';
import { tile } from './tile';
import type { ParamValues, PipelineStep, TransformDef } from './types';

export * from './types';
export { tile, MAX_TILE_POINTS } from './tile';
export { tessellate, MAX_TESSELLATE_POINTS } from './tessellate';
export { seededRandom } from './random';

/** Every transform the app offers, in menu order. Add new ones here. */
export const TRANSFORMS: readonly TransformDef[] = [tile, tessellate];

export const getTransform = (type: string): TransformDef | undefined =>
  TRANSFORMS.find((t) => t.type === type);

export const defaultParams = (def: TransformDef): ParamValues =>
  Object.fromEntries(def.params.map((p) => [p.key, p.default]));

let nextId = 1;
/** A new step of the given type with default params. */
export function createStep(type: string): PipelineStep {
  const def = getTransform(type);
  if (!def) throw new Error(`Unknown transform: ${type}`);
  return {
    id: `${type}-${Date.now().toString(36)}-${nextId++}`,
    type,
    enabled: true,
    params: defaultParams(def),
  };
}

/** Runs the enabled steps in order. Unknown types are skipped with a warning. */
export function applyTransforms(doc: PlotDocument, steps: readonly PipelineStep[]): PlotDocument {
  let out = doc;
  for (const step of steps) {
    if (!step.enabled) continue;
    const def = getTransform(step.type);
    if (!def) {
      out = {
        ...out,
        warnings: [...out.warnings, `Unknown transform "${step.type}" was skipped.`],
      };
      continue;
    }
    out = def.apply(out, { ...defaultParams(def), ...step.params });
  }
  return out;
}
export * from './wallpaper';

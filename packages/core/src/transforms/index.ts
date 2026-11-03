import type { PlotDocument } from '../model';
import { kaleidoscope } from './kaleidoscope';
import { spiralRepeat } from './spiral';
import { symmetry } from './symmetry';
import { tessellate } from './tessellate';
import { tile } from './tile';
import type { ParamValues, PipelineStep, TransformDef, TransformGuide } from './types';

export * from './types';
export { tile, MAX_TILE_POINTS } from './tile';
export { tessellate, MAX_TESSELLATE_POINTS } from './tessellate';
export { symmetry, MAX_SYMMETRY_POINTS } from './symmetry';
export { spiralRepeat, MAX_SPIRAL_POINTS } from './spiral';
export { kaleidoscope, kaleidoscopeSourcePoint, MAX_KALEIDOSCOPE_POINTS } from './kaleidoscope';
export { seededRandom } from './random';

/** Every transform the app offers, in menu order. Add new ones here. */
export const TRANSFORMS: readonly TransformDef[] = [
  tile,
  tessellate,
  symmetry,
  kaleidoscope,
  spiralRepeat,
];

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
  return applyTransformsWithGuide(doc, steps).doc;
}

/** A transform's guide, tagged with its step. */
export type StepGuide = TransformGuide & { stepId: string };

/**
 * Like `applyTransforms`, plus the guide of the last enabled step if it has one (only the last:
 * steps after it would move what the guide shows).
 */
export function applyTransformsWithGuide(
  doc: PlotDocument,
  steps: readonly PipelineStep[],
): { doc: PlotDocument; guide: StepGuide | null } {
  let out = doc;
  let guide: StepGuide | null = null;
  for (const step of steps) {
    if (!step.enabled) continue;
    const def = getTransform(step.type);
    if (!def) {
      guide = null;
      out = {
        ...out,
        warnings: [...out.warnings, `Unknown transform "${step.type}" was skipped.`],
      };
      continue;
    }
    const params = { ...defaultParams(def), ...step.params };
    // An earlier step's frame doesn't describe this step's output.
    const input: PlotDocument = out.frame ? { ...out, frame: undefined } : out;
    const g = def.guide?.(input, params) ?? null;
    guide = g ? { ...g, stepId: step.id } : null;
    out = def.apply(input, params);
  }
  return { doc: out, guide };
}
export * from './wallpaper';

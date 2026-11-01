import type { PlotDocument } from '../model';
import { svgImporter } from './svg';
import { ImportError, type Importer, type ImportOptions } from './types';

export * from './types';
export { svgImporter } from './svg';

const registry: Importer[] = [svgImporter];

/** Adds an importer. Later registrations win when several can import the same file. */
export function registerImporter(importer: Importer): void {
  const existing = registry.findIndex((i) => i.id === importer.id);
  if (existing !== -1) registry.splice(existing, 1);
  registry.unshift(importer);
}

export const listImporters = (): readonly Importer[] => registry;

/** Every extension any registered importer accepts, e.g. ['.svg']. */
export const supportedExtensions = (): string[] => [
  ...new Set(registry.flatMap((i) => i.extensions)),
];

export function findImporter(bytes: Uint8Array, filename: string): Importer | undefined {
  const lower = filename.toLowerCase();
  const byExt = registry.filter((i) => i.extensions.some((e) => lower.endsWith(e)));
  return (
    byExt.find((i) => i.canImport(bytes, filename)) ??
    registry.find((i) => i.canImport(bytes, filename))
  );
}

export async function importFile(
  bytes: Uint8Array,
  filename: string,
  opts: ImportOptions = {},
): Promise<PlotDocument> {
  const importer = findImporter(bytes, filename);
  if (!importer) throw new ImportError(`No importer for ${filename}`);
  return importer.import(bytes, filename, opts);
}

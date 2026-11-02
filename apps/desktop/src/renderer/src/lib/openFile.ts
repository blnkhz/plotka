import { supportedExtensions } from '@plotter-studio/core';
import { useStore } from '../store';
import { isProjectFile, PROJECT_EXTENSION } from './project';
import { openArtwork, openProject } from './projectActions';

/** Open… : artwork or a project. */
export async function openWithDialog(): Promise<void> {
  // Save dialogs can't filter on ".plot.json", so allow ".json" and check the name.
  const result = await window.api.invoke('file:open', [...supportedExtensions(), '.json']);
  if (!result) return;
  // The main process has already updated its current project path from the dialog.
  if (isProjectFile(result.name)) await openProject(result.bytes, result.name, { forget: false });
  else if (isSupportedFile(result.name)) await openArtwork(result, { forget: false });
  else useStore.setState({ error: unsupported(result.name) });
}

export function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return supportedExtensions().some((ext) => lower.endsWith(ext));
}

const unsupported = (name: string) =>
  `Can't open ${name}. Supported: ${[...supportedExtensions(), PROJECT_EXTENSION].join(', ')}`;

export async function openDroppedFile(file: File): Promise<void> {
  if (!isProjectFile(file.name) && !isSupportedFile(file.name)) {
    useStore.setState({ error: unsupported(file.name) });
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A dropped file has no path the main process knows, so Save will ask where.
  if (isProjectFile(file.name)) await openProject(bytes, file.name, { forget: true });
  else await openArtwork({ name: file.name, bytes }, { forget: true });
}

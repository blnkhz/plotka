import { supportedExtensions } from '@plotka/core';
import { useStore } from '../store';
import { isProjectFile, PROJECT_EXTENSION } from './project';
import { openArtwork, openProject } from './projectActions';
import { IMAGE_EXTENSIONS, isImageFile, openImage } from './imageFiles';
import { isModelFile, MODEL_EXTENSIONS, openModel } from './modelFiles';

/** Open… : artwork or a project. */
export async function openWithDialog(): Promise<void> {
  // Save dialogs can't filter on ".plot.json", so allow ".json" and check the name.
  const result = await window.api.invoke('file:open', [
    ...supportedExtensions(),
    '.json',
    ...IMAGE_EXTENSIONS,
    ...MODEL_EXTENSIONS,
  ]);
  if (!result) return;
  // The main process has already updated its current project path from the dialog.
  if (isImageFile(result.name)) openImage(result.bytes, result.name);
  else if (isModelFile(result.name)) openModel(result.bytes, result.name);
  else if (isProjectFile(result.name))
    await openProject(result.bytes, result.name, { forget: false });
  else if (isSupportedFile(result.name)) await openArtwork(result, { forget: false });
  else useStore.setState({ error: unsupported(result.name) });
}

export function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return supportedExtensions().some((ext) => lower.endsWith(ext));
}

const unsupported = (name: string) =>
  `Can't open ${name}. Supported: ${[...supportedExtensions(), PROJECT_EXTENSION, ...IMAGE_EXTENSIONS, ...MODEL_EXTENSIONS].join(', ')}`;

/** A file from Open Recent, the Dock or Finder (the main process already set the project path). */
export async function openFromOutside(f: { name: string; path: string; bytes: Uint8Array }) {
  if (isImageFile(f.name)) openImage(f.bytes, f.name);
  else if (isModelFile(f.name)) openModel(f.bytes, f.name);
  else if (isProjectFile(f.name)) await openProject(f.bytes, f.name, { forget: false });
  else await openArtwork(f, { forget: false });
}

export async function openDroppedFile(file: File): Promise<void> {
  if (
    !isProjectFile(file.name) &&
    !isSupportedFile(file.name) &&
    !isImageFile(file.name) &&
    !isModelFile(file.name)
  ) {
    useStore.setState({ error: unsupported(file.name) });
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // List it in Open Recent and allow watching it (the main process checks the path) before
  // opening, so auto-reload can start right away.
  const path = window.api.pathForFile(file);
  if (path) await window.api.invoke('file:dropped', path);
  // A dropped project's own path isn't trusted for saving, so Save will ask where.
  if (isImageFile(file.name)) openImage(bytes, file.name);
  else if (isModelFile(file.name)) openModel(bytes, file.name);
  else if (isProjectFile(file.name)) await openProject(bytes, file.name, { forget: true });
  else await openArtwork({ name: file.name, bytes, ...(path ? { path } : {}) }, { forget: true });
}

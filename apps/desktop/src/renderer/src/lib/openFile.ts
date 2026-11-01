import { supportedExtensions } from '@plotter-studio/core';
import { useStore } from '../store';

export async function openWithDialog(): Promise<void> {
  const result = await window.api.invoke('file:open', supportedExtensions());
  if (result) await useStore.getState().openFile(result);
}

export function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return supportedExtensions().some((ext) => lower.endsWith(ext));
}

export async function openDroppedFile(file: File): Promise<void> {
  if (!isSupportedFile(file.name)) {
    useStore.setState({
      error: `Can't open ${file.name}. Supported: ${supportedExtensions().join(', ')}`,
    });
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await useStore.getState().openFile({ name: file.name, bytes });
}

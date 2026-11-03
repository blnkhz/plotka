import { useStore } from '../store';

/** Pictures the image pad opens (decoded by the browser, so no extra library). */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

export const isImageFile = (name: string) =>
  IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** Opens a picture in the image pad (the artwork changes only when it's used). */
export function openImage(bytes: Uint8Array, name: string) {
  useStore.getState().setImage({ open: true, name, bytes });
}

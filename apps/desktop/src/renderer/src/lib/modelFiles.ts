import { Box3, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { useStore } from '../store';

/** 3D models the slicer opens (read with Three.js's loaders). */
export const MODEL_EXTENSIONS = ['.obj', '.stl', '.ply', '.glb', '.gltf', '.3mf'];

export const isModelFile = (name: string) =>
  MODEL_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** Opens a model in the 3D slicer (the artwork changes only when it's used). */
export function openModel(bytes: Uint8Array, name: string) {
  // A new model starts from the default view.
  useStore.getState().setModel({ open: true, name, bytes, camera: null });
}

export class ModelError extends Error {}

/**
 * Every triangle in the file, with the meshes' own placement applied, centred and scaled so the
 * largest side is 2 units: 9 numbers per triangle.
 */
export async function loadMesh(bytes: Uint8Array, name: string): Promise<Float32Array> {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let root: Object3D;
  try {
    switch (ext) {
      case '.obj':
        root = new OBJLoader().parse(new TextDecoder().decode(bytes));
        break;
      case '.stl':
        root = new Mesh(new STLLoader().parse(buf as ArrayBuffer));
        break;
      case '.ply':
        root = new Mesh(new PLYLoader().parse(buf as ArrayBuffer));
        break;
      case '.glb':
      case '.gltf':
        root = (await new GLTFLoader().parseAsync(buf as ArrayBuffer, '')).scene;
        break;
      case '.3mf':
        root = new ThreeMFLoader().parse(buf as ArrayBuffer);
        break;
      default:
        throw new ModelError(`“${name}” isn't a 3D model Plotka can read.`);
    }
  } catch (e) {
    if (e instanceof ModelError) throw e;
    throw new ModelError(
      ext === '.gltf'
        ? `“${name}” can't be read. A .gltf with its data in separate files won't open: export it as .glb.`
        : `“${name}” can't be read as a 3D model.`,
    );
  }
  root.updateMatrixWorld(true);
  const out: number[] = [];
  const v = new Vector3();
  root.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const mesh = o as Mesh;
    let g = mesh.geometry as BufferGeometry;
    if (g.index) g = g.toNonIndexed();
    const pos = g.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i + 2 < pos.count; i += 3)
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld);
        out.push(v.x, v.y, v.z);
      }
  });
  if (!out.length)
    throw new ModelError(`“${name}” has no surfaces to slice (only points or lines).`);
  // Centre and scale to a 2-unit box.
  const box = new Box3();
  for (let i = 0; i < out.length; i += 3)
    box.expandByPoint(v.set(out[i]!, out[i + 1]!, out[i + 2]!));
  const c = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const k = 2 / Math.max(size.x, size.y, size.z, 1e-9);
  const positions = new Float32Array(out.length);
  for (let i = 0; i < out.length; i += 3) {
    positions[i] = (out[i]! - c.x) * k;
    positions[i + 1] = (out[i + 1]! - c.y) * k;
    positions[i + 2] = (out[i + 2]! - c.z) * k;
  }
  return positions;
}

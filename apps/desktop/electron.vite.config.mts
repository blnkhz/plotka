import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Workspace packages are TS source, so they are bundled rather than externalized.
const workspace = ['@plotka/core', '@plotka/plotter'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspace })],
    resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspace })],
    resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
    plugins: [react()],
  },
});

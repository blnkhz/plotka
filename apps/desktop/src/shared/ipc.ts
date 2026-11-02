/**
 * Single source of truth for every IPC channel between main and renderer.
 *
 * - `InvokeChannels`: renderer -> main request/response (ipcRenderer.invoke / ipcMain.handle).
 * - `EventChannels`: main -> renderer push events (webContents.send / ipcRenderer.on).
 *
 * Adding a channel: add it to the map below, add a handler in `src/main/ipc.ts`,
 * and it appears on `window.api` automatically.
 */

export type OpenFileResult = {
  path: string;
  name: string;
  bytes: Uint8Array;
} | null;

export type AppInfo = {
  version: string;
  platform: string;
  electron: string;
};

export interface InvokeChannels {
  'app:getInfo': { args: []; result: AppInfo };
  'file:open': { args: [extensions: string[]]; result: OpenFileResult };
  /** Shows a save dialog and writes text. Returns the saved path, or null if cancelled. */
  'file:saveText': {
    args: [defaultName: string, content: string, extensions: string[]];
    result: string | null;
  };
}

export interface EventChannels {
  'app:menu': { action: 'open' | 'save' | 'undo' | 'redo' };
}

export type InvokeChannel = keyof InvokeChannels;
export type EventChannel = keyof EventChannels;

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'file:open',
  'file:saveText',
] as const satisfies readonly InvokeChannel[];
export const EVENT_CHANNELS = ['app:menu'] as const satisfies readonly EventChannel[];

/** The shape of `window.api` exposed by the preload script. */
export type Api = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeChannels[C]['args']
  ): Promise<InvokeChannels[C]['result']>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void;
};

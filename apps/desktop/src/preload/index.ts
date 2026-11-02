import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, type Api } from '@shared/ipc';

const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const eventAllowed = new Set<string>(EVENT_CHANNELS);

const api: Api = {
  invoke(channel, ...args) {
    if (!invokeAllowed.has(channel)) throw new Error(`Unknown IPC channel: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, listener) {
    if (!eventAllowed.has(channel)) throw new Error(`Unknown IPC event: ${channel}`);
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) =>
      listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  pathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('api', api);

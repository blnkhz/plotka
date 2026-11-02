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

import type { Bounds, Toolpath } from '@plotter-studio/core';
import type {
  LayerMotionSettings,
  MachineProfile,
  MachineState,
  RunProgress,
} from '@plotter-studio/plotter';

export type PortInfo = { path: string; label: string; isPlotter: boolean };

/** Value for the simulated plotter in the port list. */
export const SIMULATED_PORT = 'simulated';

export type PlotterStatus = {
  connection: {
    connected: boolean;
    port: string | null;
    firmware: string | null;
    simulated: boolean;
    /** True if the plotter went away without being disconnected from the app. */
    lost: boolean;
  };
  machine: MachineState | null;
  plot: RunProgress | null;
  /** What the runner is doing: a real plot or a pen-up dry run. */
  plotKind: 'plot' | 'dryRun' | null;
};

export type ManualCommand =
  | { kind: 'penUp' }
  | { kind: 'penDown' }
  | { kind: 'penToggle' }
  | { kind: 'motorsOff' }
  | { kind: 'home' }
  | { kind: 'jog'; dx: number; dy: number }
  /** Pen heights in %; `show` moves the pen to that height so it can be seen. */
  | { kind: 'penHeights'; up: number; down: number; show?: 'up' | 'down' };

export type PlotRequest = {
  /** The machine profile (built-in or the user's own); validated in the main process. */
  profile: MachineProfile;
  toolpath: Toolpath;
  settings: Record<string, LayerMotionSettings>;
};

/** Result of a plotter action: errors come back as plain messages for the UI. */
export type ActionResult = { ok: true } | { ok: false; error: string };

export type AppInfo = {
  version: string;
  platform: string;
  electron: string;
};

export interface InvokeChannels {
  'app:getInfo': { args: []; result: AppInfo };
  'file:open': { args: [extensions: string[]]; result: OpenFileResult };
  /** Shows a save dialog and writes text. Returns the saved path, or null if cancelled. */
  /**
   * Saves the project text. Without `saveAs`, writes to the current project file if there is
   * one; otherwise asks where. Returns the project name, or null if cancelled.
   */
  'project:save': {
    args: [content: string, saveAs: boolean, suggestedName: string];
    result: { name: string } | null;
  };
  /** PROJ-4 autosave: write unsaved work to the recovery file, or remove it. */
  'autosave:write': { args: [content: string, name: string]; result: void };
  'autosave:clear': { args: []; result: void };
  /** Unsaved work left by a previous run, if any. */
  'autosave:check': { args: []; result: { name: string; savedAt: string } | null };
  'autosave:read': { args: []; result: string | null };
  /** IMPORT-5: watch the open artwork for changes (only files the app itself opened). */
  'watch:start': { args: [path: string]; result: boolean };
  'watch:stop': { args: []; result: void };
  /** The window is listening for 'file:opened': open files that arrived before it was. */
  'app:rendererReady': { args: []; result: void };
  /** A file dropped on the window, for the recent files list (path from the preload). */
  'file:dropped': { args: [path: string]; result: void };
  /** The renderer started a new, untitled project (e.g. a dropped SVG). */
  'project:forget': { args: []; result: void };
  /** Title and edited state for the window. */
  'project:state': { args: [name: string, dirty: boolean]; result: void };
  'plotter:listPorts': { args: []; result: PortInfo[] };
  'plotter:connect': { args: [port: string, profile: MachineProfile]; result: ActionResult };
  'plotter:disconnect': { args: []; result: ActionResult };
  'plotter:status': { args: []; result: PlotterStatus };
  'plotter:command': { args: [command: ManualCommand]; result: ActionResult };
  'plot:start': { args: [request: PlotRequest]; result: ActionResult };
  /** PLOT-6: trace the drawing's bounds with the pen up. */
  'plot:dryRun': { args: [profile: MachineProfile, bounds: Bounds]; result: ActionResult };
  'plot:control': {
    args: [action: 'pause' | 'resume' | 'stop' | 'toggle'];
    result: ActionResult;
  };
  'file:saveText': {
    args: [defaultName: string, content: string, extensions: string[]];
    result: string | null;
  };
}

export interface EventChannels {
  'app:menu': {
    action: 'open' | 'save' | 'saveAs' | 'undo' | 'redo' | 'help' | 'exportSvg' | 'exportJson';
  };
  'plotter:changed': PlotterStatus;
  /** A file opened from Open Recent, the Dock or Finder. */
  'file:opened': { path: string; name: string; bytes: Uint8Array };
  /** The watched artwork changed on disk (IMPORT-5). */
  'file:changed': { path: string; bytes: Uint8Array };
}

export type InvokeChannel = keyof InvokeChannels;
export type EventChannel = keyof EventChannels;

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'file:open',
  'file:saveText',
  'project:save',
  'project:forget',
  'autosave:write',
  'autosave:clear',
  'autosave:check',
  'autosave:read',
  'file:dropped',
  'app:rendererReady',
  'watch:start',
  'watch:stop',
  'project:state',
  'plotter:listPorts',
  'plotter:connect',
  'plotter:disconnect',
  'plotter:status',
  'plotter:command',
  'plot:start',
  'plot:dryRun',
  'plot:control',
] as const satisfies readonly InvokeChannel[];
export const EVENT_CHANNELS = [
  'app:menu',
  'plotter:changed',
  'file:opened',
  'file:changed',
] as const satisfies readonly EventChannel[];

/** The shape of `window.api` exposed by the preload script. */
export type Api = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeChannels[C]['args']
  ): Promise<InvokeChannels[C]['result']>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void;
  /** The file system path of a dropped file ('' if it has none). */
  pathForFile(file: File): string;
};

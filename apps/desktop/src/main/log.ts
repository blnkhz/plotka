import { homedir, release } from 'node:os';
import { join } from 'node:path';
import { app, shell, type WebContents } from 'electron';
import { createLogger, type Logger } from './logger';
import { bugReportUrl, describeMac } from './report';

/**
 * The app's log, at ~/Library/Logs/Plotka/plotka.log (Help › Show Log File). It records what's
 * useful in a bug report: the app and OS versions, connections, plots and how they ended, and
 * errors from the main process and the window. No artwork and no full paths outside ~.
 */
let logger: Logger | null = null;

function get(): Logger {
  return (logger ??= createLogger({
    file: join(app.getPath('logs'), 'plotka.log'),
    home: homedir(),
    echo: !app.isPackaged,
  }));
}

export const log: Logger = {
  get file() {
    return get().file;
  },
  info: (m, d) => get().info(m, d),
  warn: (m, d) => get().warn(m, d),
  error: (m, d) => get().error(m, d),
};

/** Logs the versions at startup and catches errors nothing else handles. Call once, early. */
export function startLogging() {
  log.info('Plotka started', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    macOS: process.platform === 'darwin' ? process.getSystemVersion() : undefined,
    platform: process.platform,
    kernel: release(),
    arch: process.arch,
    electron: process.versions.electron,
  });
  process.on('uncaughtException', (e) => log.error('Uncaught exception', e));
  process.on('unhandledRejection', (e) => log.error('Unhandled promise rejection', e));
  app.on('child-process-gone', (_e, d) =>
    log.error('Helper process ended', { type: d.type, reason: d.reason, exitCode: d.exitCode }),
  );
  app.on('will-quit', () => log.info('Plotka quit'));
}

/** Records errors and crashes in a window. */
export function watchWebContents(wc: WebContents) {
  wc.on('console-message', (e) => {
    if (e.level === 'error') log.error('Window error', { message: e.message, source: e.sourceId });
  });
  wc.on('render-process-gone', (_e, d) =>
    log.error('Window crashed', { reason: d.reason, exitCode: d.exitCode }),
  );
  wc.on('unresponsive', () => log.warn('Window not responding'));
  wc.on('responsive', () => log.info('Window responding again'));
}

/** Help › Show Log File. */
export function revealLog() {
  log.info('Log file shown');
  shell.showItemInFolder(log.file);
}

/**
 * Help › Report a Problem: opens the GitHub bug report form with the versions filled in, and
 * shows the log in Finder so it can be dragged into the form.
 */
export function reportProblem() {
  log.info('Report a problem');
  shell.showItemInFolder(log.file);
  const os = describeMac(process.getSystemVersion(), process.arch);
  void shell.openExternal(bugReportUrl(app.getVersion(), os));
}

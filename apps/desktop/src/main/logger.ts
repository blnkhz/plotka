import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /** The log file. When it grows past `maxBytes` it becomes `<file>.1` and a new one starts. */
  file: string;
  maxBytes?: number;
  /** Replaced with `~` in every line, so logs people attach to issues don't show their name. */
  home?: string;
  /** Also print to stdout/stderr (on in development). */
  echo?: boolean;
  now?: () => Date;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: unknown): void;
  readonly file: string;
}

const DEFAULT_MAX_BYTES = 1_000_000;

/** An Error, or anything else, as one readable piece of text (with the stack for errors). */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.stack ?? `${e.name}: ${e.message}`;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function formatData(data: unknown): string {
  if (data === undefined) return '';
  if (data instanceof Error || typeof data !== 'object' || data === null)
    return ` ${describeError(data)}`;
  const parts = Object.entries(data as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v instanceof Error ? describeError(v) : JSON.stringify(v)}`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

/** One log line: `2026-11-14T10:00:00.000Z INFO  message key=value …`. */
export function formatLine(
  level: LogLevel,
  message: string,
  data: unknown,
  now: Date,
  home?: string,
): string {
  let line = `${now.toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${formatData(data)}`;
  if (home && home.length > 1) line = line.split(home).join('~');
  return `${line}\n`;
}

/**
 * A small file logger for the main process. Writes are synchronous so the last lines before a
 * crash make it to disk; the log only gets a handful of lines per plot, so that's cheap.
 * Logging never throws: a log that can't be written must not break plotting.
 */
export function createLogger(opts: LoggerOptions): Logger {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = opts.now ?? (() => new Date());
  let dirReady = false;

  const rotate = () => {
    try {
      if (statSync(opts.file).size < maxBytes) return;
      rmSync(`${opts.file}.1`, { force: true });
      renameSync(opts.file, `${opts.file}.1`);
    } catch {
      // No file yet.
    }
  };

  const write = (level: LogLevel, message: string, data: unknown) => {
    const line = formatLine(level, message, data, now(), opts.home);
    if (opts.echo) (level === 'info' ? process.stdout : process.stderr).write(line);
    try {
      if (!dirReady) {
        mkdirSync(dirname(opts.file), { recursive: true });
        dirReady = true;
      }
      rotate();
      appendFileSync(opts.file, line);
    } catch {
      // Not fatal.
    }
  };

  return {
    file: opts.file,
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}

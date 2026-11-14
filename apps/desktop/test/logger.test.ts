import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger, describeError, formatLine } from '../src/main/logger';

const at = new Date('2026-11-14T10:00:00.000Z');
const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'plotka-log-')), 'logs', 'plotka.log');

describe('log lines', () => {
  it('has the time, the level and the message', () => {
    expect(formatLine('info', 'Plotka started', undefined, at)).toBe(
      '2026-11-14T10:00:00.000Z INFO  Plotka started\n',
    );
  });

  it('adds data as key=value and leaves out undefined values', () => {
    const line = formatLine(
      'warn',
      'Connect failed',
      { port: '/dev/cu.x', n: 2, gone: undefined },
      at,
    );
    expect(line).toContain('WARN  Connect failed port="/dev/cu.x" n=2\n');
    expect(line).not.toContain('gone');
  });

  it('includes the stack of an error', () => {
    const line = formatLine('error', 'Uncaught exception', new Error('boom'), at);
    expect(line).toContain('ERROR Uncaught exception Error: boom');
    expect(line).toContain('logger.test.ts');
  });

  it('replaces the home folder with ~', () => {
    const line = formatLine(
      'info',
      'x',
      { path: '/Users/someone/art/a.svg' },
      at,
      '/Users/someone',
    );
    expect(line).toContain('path="~/art/a.svg"');
    expect(line).not.toContain('someone');
  });

  it('describes things that are not errors', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError({ code: 1 })).toBe('{"code":1}');
  });
});

describe('the log file', () => {
  it('creates the folder and appends lines', () => {
    const file = tmpFile();
    const log = createLogger({ file, now: () => at });
    log.info('one');
    log.error('two', { why: 'test' });
    expect(readFileSync(file, 'utf8').split('\n')).toEqual([
      '2026-11-14T10:00:00.000Z INFO  one',
      '2026-11-14T10:00:00.000Z ERROR two why="test"',
      '',
    ]);
  });

  it('starts a new file when it gets too big, keeping one old one', () => {
    const file = tmpFile();
    const log = createLogger({ file, maxBytes: 100, now: () => at });
    log.info('a'.repeat(120));
    log.info('second');
    expect(readFileSync(`${file}.1`, 'utf8')).toContain('aaaa');
    expect(readFileSync(file, 'utf8')).toContain('second');
    log.info('b'.repeat(120));
    log.info('third');
    expect(readFileSync(`${file}.1`, 'utf8')).toContain('second');
    expect(readFileSync(`${file}.1`, 'utf8')).not.toContain('aaaa');
  });

  it("doesn't throw when it can't write", () => {
    const dir = mkdtempSync(join(tmpdir(), 'plotka-log-'));
    // A file where the folder should be.
    writeFileSync(join(dir, 'logs'), '');
    const log = createLogger({ file: join(dir, 'logs', 'plotka.log') });
    expect(() => log.error('still fine')).not.toThrow();
    expect(existsSync(join(dir, 'logs', 'plotka.log'))).toBe(false);
  });
});

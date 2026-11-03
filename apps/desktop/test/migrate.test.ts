import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateUserData } from '../src/main/migrate';

describe('moving settings from the old app name', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'plotka-migrate-'));
    const from = join(dir, 'Plotter Studio');
    const to = join(dir, 'Plotka');
    return { from, to };
  };

  it('moves the old folder when there is no new one', () => {
    const { from, to } = setup();
    mkdirSync(from);
    writeFileSync(join(from, 'recent.json'), '[]');
    expect(migrateUserData(from, to)).toBe(true);
    expect(readFileSync(join(to, 'recent.json'), 'utf8')).toBe('[]');
    expect(existsSync(from)).toBe(false);
  });

  it('leaves both alone when the new one already exists', () => {
    const { from, to } = setup();
    mkdirSync(from);
    mkdirSync(to);
    writeFileSync(join(to, 'appearance.json'), '{}');
    expect(migrateUserData(from, to)).toBe(false);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(join(to, 'appearance.json'))).toBe(true);
  });

  it('does nothing without an old folder', () => {
    const { from, to } = setup();
    expect(migrateUserData(from, to)).toBe(false);
    expect(existsSync(to)).toBe(false);
  });
});

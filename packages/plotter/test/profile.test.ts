import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PROFILES,
  DEFAULT_PROFILE_ID,
  ebb,
  getProfile,
  ProfileError,
  validateProfile,
} from '../src';

describe('machine profiles', () => {
  it('has the default AxiDraw V3/A3 profile with the vendor bed size', () => {
    const p = getProfile(DEFAULT_PROFILE_ID)!;
    expect(p.name).toBe('AxiDraw V3/A3');
    expect(p.bed).toEqual({ width: 430, height: 297 });
  });
  it('profile ids are unique and values are positive', () => {
    expect(new Set(BUILTIN_PROFILES.map((p) => p.id)).size).toBe(BUILTIN_PROFILES.length);
    for (const p of BUILTIN_PROFILES) {
      expect(p.bed.width).toBeGreaterThan(0);
      expect(p.motion.maxSpeedPenDown).toBeGreaterThan(0);
    }
  });
});

describe('more machines (DRIVER-5b)', () => {
  it('every built-in profile passes validation unchanged', () => {
    for (const p of BUILTIN_PROFILES) expect(validateProfile(p)).toEqual(p);
  });
  it('only the V3/A3 is marked tested; the others carry their sources', () => {
    expect(BUILTIN_PROFILES.filter((p) => p.tested).map((p) => p.id)).toEqual(['axidraw-v3-a3']);
    for (const p of BUILTIN_PROFILES.filter((x) => !x.tested)) expect(p.notes).toMatch(/Untested/);
  });
  it('vendor travel sizes', () => {
    const bed = (id: string) => getProfile(id)!.bed;
    expect(bed('axidraw-v3-a4')).toEqual({ width: 300, height: 218 });
    expect(bed('axidraw-se-a1')).toEqual({ width: 864, height: 594 });
    expect(bed('axidraw-minikit')).toEqual({ width: 160, height: 101.6 });
    expect(bed('nextdraw-2234')).toEqual({ width: 864, height: 594 });
  });
  it('NextDraw uses the brushless servo on pin 2, sent with the pen command', () => {
    const nd = getProfile('nextdraw-8511')!;
    expect(nd.servo).toMatchObject({ min: 5400, max: 12600, pin: 2 });
    expect(ebb.pen(true, 130, nd.servo.pin)).toBe('SP,1,130,2');
    expect(ebb.pen(false, 130, undefined)).toBe('SP,0,130');
    expect(ebb.pen(false, 130, 1)).toBe('SP,0,130');
    expect(ebb.pen(true, 999999)).toBe('SP,1,65535');
  });
  it('rejects bad values with plain messages', () => {
    const good = getProfile(DEFAULT_PROFILE_ID)!;
    expect(() => validateProfile({ ...good, stepsPerMm: -1 })).toThrow(ProfileError);
    expect(() => validateProfile({ ...good, bed: { width: 'big', height: 1 } })).toThrow(
      /Travel X/,
    );
    expect(() => validateProfile({ ...good, servo: { ...good.servo, min: 30000 } })).toThrow(
      /above/,
    );
    expect(() => validateProfile({ ...good, servo: { ...good.servo, pin: 9 } })).toThrow(/pin/);
    expect(() => validateProfile({ ...good, name: '' })).toThrow(/name/);
  });
});

import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID, getProfile } from '../src';

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

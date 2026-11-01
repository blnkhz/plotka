import { describe, expect, it } from 'vitest';
import { add, distance, lerp, vec2 } from '../src';

describe('vec2', () => {
  it('adds', () => expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 }));
  it('measures distance', () => expect(distance(vec2(0, 0), vec2(3, 4))).toBe(5));
  it('lerps', () => expect(lerp(vec2(0, 0), vec2(10, 20), 0.5)).toEqual({ x: 5, y: 10 }));
});

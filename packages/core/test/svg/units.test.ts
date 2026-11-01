import { describe, expect, it } from 'vitest';
import { lengthToMm } from '../../src/svg/units';
import { normalizeColor } from '../../src/svg/color';
import { parseTransform } from '../../src/svg/transform';
import { applyToPoint } from '../../src';

describe('lengthToMm', () => {
  it.each([
    ['210mm', 210],
    ['21cm', 210],
    ['1in', 25.4],
    ['72pt', 25.4],
    ['96px', 25.4],
    ['96', 25.4],
    ['6pc', 25.4],
    ['4q', 1],
    [' 1e1mm ', 10],
  ])('%s', (v, mm) => expect(lengthToMm(v)).toBeCloseTo(mm, 9));
  it('custom px per inch', () => expect(lengthToMm('72px', 72)).toBeCloseTo(25.4));
  it('rejects percent and junk', () => {
    expect(lengthToMm('100%')).toBeNull();
    expect(lengthToMm('auto')).toBeNull();
    expect(lengthToMm(undefined)).toBeNull();
  });
});

describe('normalizeColor', () => {
  it.each([
    ['#FFF', '#ffffff'],
    ['#E52421', '#e52421'],
    ['#11223344', '#112233'],
    ['black', '#000000'],
    ['rgb(0, 128, 255)', '#0080ff'],
    ['rgb(100%,0%,0%)', '#ff0000'],
  ])('%s', (v, out) => expect(normalizeColor(v)).toBe(out));
  it('none', () => expect(normalizeColor('none')).toBeNull());
});

describe('parseTransform', () => {
  const at = (t: string, x: number, y: number) => {
    const p = applyToPoint(parseTransform(t), x, y);
    return [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6];
  };
  it('translate', () => expect(at('translate(10,20)', 1, 1)).toEqual([11, 21]));
  it('translate one arg', () => expect(at('translate(10)', 0, 0)).toEqual([10, 0]));
  it('scale', () => expect(at('scale(2 3)', 1, 1)).toEqual([2, 3]));
  it('rotate', () => expect(at('rotate(90)', 1, 0)).toEqual([0, 1]));
  it('rotate around a point', () => expect(at('rotate(180 5 5)', 0, 0)).toEqual([10, 10]));
  it('matrix', () => expect(at('matrix(1,0,0,1,5,6)', 0, 0)).toEqual([5, 6]));
  it('skewX', () => expect(at('skewX(45)', 0, 1)).toEqual([1, 1]));
  it('applies left to right (rightmost first)', () =>
    expect(at('translate(10,0) scale(2)', 1, 0)).toEqual([12, 0]));
});

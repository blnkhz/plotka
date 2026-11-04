import { describe, expect, it } from 'vitest';
import {
  createLayer,
  createStep,
  defaultPageSetup,
  BLACKLETTER_CAP_NIBS,
  HERSHEY_FONTS,
  layoutText,
  nibProportions,
  nibTextSize,
  TEXT_FONTS,
  processDocument,
  textLayer,
  withTexts,
  type PlotDocument,
  type Polyline,
  type TextItem,
} from '../../src';

const bounds = (ls: Polyline[]) => {
  const p = ls.flatMap((l) => l.points);
  return {
    minX: Math.min(...p.map((q) => q.x)),
    maxX: Math.max(...p.map((q) => q.x)),
    minY: Math.min(...p.map((q) => q.y)),
    maxY: Math.max(...p.map((q) => q.y)),
  };
};

describe('single-stroke text (LATER-6)', () => {
  it('offers six Hershey styles', () => {
    expect(HERSHEY_FONTS.map((f) => f.name)).toEqual([
      'Sans',
      'Sans bold',
      'Serif',
      'Serif italic',
      'Script',
      'Gothic',
    ]);
  });

  it('capitals are the given size, from y = 0 down to the baseline', () => {
    const { lines } = layoutText('H', { font: 'sans', size: 10 });
    const b = bounds(lines);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(10);
    expect(lines).toHaveLength(3); // H: two uprights and the bar, one stroke each
  });

  it('lays out lines and letters left to right, and aligns lines', () => {
    const one = layoutText('ABC', { font: 'serif', size: 5 });
    const two = layoutText('ABC\nA', { font: 'serif', size: 5, align: 'right' });
    expect(two.width).toBeCloseTo(one.width);
    expect(two.height).toBeGreaterThan(one.height * 1.5);
    // The lone A of the second line sits at the right edge.
    const second = two.lines.filter((l) => l.points.every((p) => p.y > one.height + 1));
    expect(bounds(second).maxX).toBeGreaterThan(two.width * 0.7);
    const spaced = layoutText('ABC', { font: 'serif', size: 5, letterSpacing: 2 });
    expect(spaced.width).toBeCloseTo(one.width + 4);
  });

  it('accented letters keep their base letter; unknown characters become "?"', () => {
    const plain = layoutText('e', { font: 'sans', size: 5 }).lines;
    expect(layoutText('é', { font: 'sans', size: 5 }).lines).toEqual(plain);
    expect(layoutText('✓', { font: 'sans', size: 5 }).lines).toEqual(
      layoutText('?', { font: 'sans', size: 5 }).lines,
    );
  });

  it('every style has every printable character', () => {
    for (const f of HERSHEY_FONTS) {
      const all = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
      const t = layoutText(all, { font: f.id, size: 5 });
      expect(t.lines.length).toBeGreaterThan(90);
      expect(t.width).toBeGreaterThan(0);
    }
  });
});

describe('blackletter for a parallel pen', () => {
  it('is offered after the Hershey styles', () => {
    expect(TEXT_FONTS.map((f) => f.id)).toEqual([
      ...HERSHEY_FONTS.map((f) => f.id),
      'blackletter',
      'blackletterOrnate',
      'penGothic',
    ]);
  });

  it('capitals are 7 nib widths tall: the given size, from y = 0 to the baseline', () => {
    expect(BLACKLETTER_CAP_NIBS).toBe(7);
    expect(nibTextSize(3.8)).toBeCloseTo(26.6);
    const b = bounds(layoutText('HNE', { font: 'blackletter', size: 14 }).lines);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(14);
    // x-height: 5 nib widths of the 7.
    const x = bounds(layoutText('nmu', { font: 'blackletter', size: 14 }).lines);
    expect(x.minY).toBeCloseTo(4);
  });

  it('has every letter and figure; anything else is "?"', () => {
    const alnum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const q = layoutText('?', { font: 'blackletter', size: 7 }).lines;
    for (const ch of alnum) {
      const t = layoutText(ch, { font: 'blackletter', size: 7 });
      expect(t.lines.length, ch).toBeGreaterThan(0);
      expect(t.lines, ch).not.toEqual(q);
    }
    expect(layoutText('§', { font: 'blackletter', size: 7 }).lines).toEqual(q);
  });

  it('the ornate one is the plain one with ornaments added, for the same nib', () => {
    const alnum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const plain = (t: string) => layoutText(t, { font: 'blackletter', size: 7 });
    const ornate = (t: string) => layoutText(t, { font: 'blackletterOrnate', size: 7 });
    let decorated = 0;
    for (const ch of alnum) {
      const p = plain(ch).lines;
      const o = ornate(ch).lines;
      expect(o.length, ch).toBeGreaterThanOrEqual(p.length);
      if (o.length > p.length) decorated++;
    }
    expect(decorated).toBeGreaterThan(40);
    // Same x-height and minims: n is unchanged but for the hairline joining it onward.
    expect(ornate('n').lines.slice(0, 2)).toEqual(plain('n').lines);
    // Capitals keep their height (swashes reach about a nib above them).
    const b = bounds(ornate('ABC').lines);
    expect(b.maxY).toBeLessThan(7.5);
    expect(b.minY).toBeGreaterThan(-1.5);
    // Lines sit further apart, to leave room for the swashes.
    expect(ornate('A\nA').height).toBeGreaterThan(plain('A\nA').height);
    expect(layoutText('§', { font: 'blackletterOrnate', size: 7 }).lines).toEqual(
      ornate('?').lines,
    );
  });

  it('the Gothic: x-height 4 nib widths, capitals 6, sized from the nib by its own proportion', () => {
    expect(nibProportions('penGothic')).toEqual({ capNibs: 6, xNibs: 4 });
    expect(nibProportions('blackletter')).toEqual({ capNibs: 7, xNibs: 5 });
    expect(nibTextSize(3.8, 'penGothic')).toBeCloseTo(22.8);
    const caps = bounds(layoutText('HNE', { font: 'penGothic', size: 12 }).lines);
    expect(caps.minY).toBeCloseTo(0);
    expect(caps.maxY).toBeCloseTo(12);
    // x-height: 4 of the 6 nib widths, so n starts a third of the way down.
    expect(bounds(layoutText('nmu', { font: 'penGothic', size: 12 }).lines).minY).toBeCloseTo(4);
    const q = layoutText('?', { font: 'penGothic', size: 6 }).lines;
    for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!') {
      const t = layoutText(ch, { font: 'penGothic', size: 6 });
      expect(t.lines.length, ch).toBeGreaterThan(0);
      expect(t.lines, ch).not.toEqual(q);
    }
    // Its own letters, not the blackletter's.
    expect(layoutText('a', { font: 'penGothic', size: 6 }).lines).not.toEqual(
      layoutText('a', { font: 'blackletter', size: 6 }).lines,
    );
  });

  it('a text item in blackletter becomes a layer', () => {
    const l = textLayer({
      id: 'b',
      text: 'Anno',
      font: 'blackletter',
      size: 21,
      lineSpacing: 1,
      letterSpacing: 0,
      align: 'left',
      x: 10,
      y: 20,
    });
    expect(bounds(l.strokes).minY).toBeCloseTo(20);
  });
});

describe('text layers in the pipeline', () => {
  const art = (): PlotDocument => {
    const l = createLayer('a', 'A');
    l.strokes.push({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      closed: false,
    });
    return { width: 100, height: 50, layers: [l], warnings: [] };
  };
  const item: TextItem = {
    id: 't1',
    text: 'HI',
    font: 'sans',
    size: 10,
    lineSpacing: 1,
    letterSpacing: 0,
    align: 'left',
    x: 30,
    y: 200,
  };
  const run = (doc: PlotDocument, transforms: ReturnType<typeof createStep>[] = []) =>
    processDocument({
      doc,
      page: defaultPageSetup(),
      bed: { width: 430, height: 297 },
      transforms,
    }).placed;

  it("stays where it was put, and doesn't change how the artwork fits", () => {
    const plain = run(art());
    const withText = run(withTexts(art(), [item]));
    expect(withText.layers[0]!.strokes).toEqual(plain.layers[0]!.strokes);
    const t = withText.layers.find((l) => l.text)!;
    expect(t.id).toBe('text-t1');
    const b = bounds(t.strokes);
    expect(b.minY).toBeCloseTo(200);
    expect(b.maxY).toBeCloseTo(210);
    expect(b.minX).toBeGreaterThanOrEqual(30);
  });

  it('transforms leave text alone', () => {
    const tiled = run(withTexts(art(), [item]), [createStep('tile')]);
    const t = tiled.layers.find((l) => l.text)!;
    expect(t.strokes).toEqual(textLayer(item).strokes);
    expect(tiled.layers[0]!.strokes.length).toBeGreaterThan(1); // the artwork was tiled
  });

  it('withTexts replaces the text layers, keeping the artwork', () => {
    const doc = withTexts(withTexts(art(), [item]), [{ ...item, id: 't2' }]);
    expect(doc.layers.map((l) => l.id)).toEqual(['a', 'text-t2']);
  });
});

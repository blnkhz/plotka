import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDoodleSettings, defaultFillSettings } from '@plotka/core';
import { selectedDoodle, useStore } from '../src/renderer/src/store';

const loop = Array.from({ length: 41 }, (_, i) => {
  const a = (i / 40) * Math.PI * 2;
  return { x: 50 + 20 * Math.cos(a), y: 50 + 20 * Math.sin(a) };
});
const line = {
  points: [
    { x: 0, y: 0 },
    { x: 30, y: 30 },
  ],
};
const st = () => useStore.getState();
const ids = () => st().doc?.layers.map((l) => l.id) ?? [];

/** Draws on the pad and uses the drawing. */
function draw(strokes = [line], fillClosed = false) {
  st().openDoodle();
  st().setDoodleSettings({ fillClosed });
  st().setDoodleItems(strokes);
  st().applyDoodle();
}

beforeEach(() => {
  useStore.setState({
    source: null,
    doc: null,
    doodles: [],
    layerCopies: [],
    layerMode: 'auto',
    texts: [],
    layerOverrides: {},
    selectedLayerId: null,
    doodle: {
      open: false,
      editing: null,
      draft: [],
      strokes: [],
      past: [],
      future: [],
      settings: defaultDoodleSettings(),
      size: { width: 150, height: 150 },
    },
  });
});

describe('doodle layers in the store', () => {
  it('adds each drawing as its own layer, and starts the next one blank', () => {
    draw();
    expect(st().doodle.open).toBe(false);
    expect(st().doodle.strokes).toEqual([]);
    draw();
    expect(st().doodles.map((d) => d.name)).toEqual(['Doodle 1', 'Doodle 2']);
    expect(ids()).toEqual(st().doodles.map((d) => `doodle-${d.id}`));
    expect(st().selectedLayerId).toBe(ids()[1]);
    expect(st().source).toBeNull();
  });

  it('adds a doodle to the artwork that is open, and keeps it when a file is opened', async () => {
    draw();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path d="M0 0L5 5" stroke="#000"/></svg>';
    await st().openFile({ name: 'art.svg', bytes: new TextEncoder().encode(svg) });
    expect(ids()[0]).toBe('layer-1');
    expect(ids()).toHaveLength(2);
    expect(st().doc!.width).toBe(10);
    draw();
    expect(ids()).toHaveLength(3);
  });

  it('sizes a drawing without a file to its largest artboard', () => {
    useStore.setState((s) => ({ doodle: { ...s.doodle, size: { width: 100, height: 300 } } }));
    draw();
    useStore.setState((s) => ({ doodle: { ...s.doodle, size: { width: 200, height: 50 } } }));
    draw();
    expect(st().doc).toMatchObject({ width: 200, height: 300 });
  });

  it('gives only a filled doodle a fill, per layer', () => {
    const fill = { ...defaultFillSettings(), type: 'crosshatch' as const };
    st().setDefaultFill(fill);
    draw([{ points: loop }], true);
    draw([line], false);
    const [a, b] = ids();
    expect(st().layerOverrides[a!]?.settings?.fill).toEqual(fill);
    expect(st().layerOverrides[b!]).toBeUndefined();
  });

  it('edits a layer in place, keeping its fill, id and name', () => {
    draw([{ points: loop }], true);
    draw();
    const id = st().doodles[0]!.id;
    const chosen = { ...defaultFillSettings(), type: 'hexagons' as const };
    st().setLayer(`doodle-${id}`, { settings: { fill: chosen } });

    st().editDoodle(id);
    expect(st().doodle).toMatchObject({ open: true, editing: id });
    expect(st().doodle.strokes).toEqual([{ points: loop }]);
    expect(st().doodle.settings.fillClosed).toBe(true);
    st().setDoodleItems([{ points: loop }, line]);
    st().applyDoodle();

    expect(st().doodles.map((d) => d.name)).toEqual(['Doodle 1', 'Doodle 2']);
    expect(st().doodles[0]!.strokes).toHaveLength(2);
    expect(st().layerOverrides[`doodle-${id}`]?.settings?.fill).toEqual(chosen);
    expect(st().doodle).toMatchObject({ open: false, editing: null, strokes: [] });
  });

  it('cancelling an edit leaves the layer alone', () => {
    draw();
    const before = st().doodles;
    st().editDoodle(before[0]!.id);
    st().setDoodleItems([]);
    st().closeDoodle();
    expect(st().doodles).toBe(before);
    expect(st().doodle).toMatchObject({ editing: null, past: [], strokes: [] });
  });

  it('keeps an unused new drawing while a layer is edited', () => {
    draw();
    st().openDoodle();
    st().setDoodleItems([{ points: loop }]);
    st().closeDoodle();
    expect(st().doodle.strokes).toEqual([{ points: loop }]);

    st().editDoodle(st().doodles[0]!.id);
    expect(st().doodle.strokes).toEqual([line]);
    st().applyDoodle();
    expect(st().doodle.strokes).toEqual([{ points: loop }]);
    st().openDoodle();
    expect(st().doodle.strokes).toEqual([{ points: loop }]);
  });

  it('adds empty layers to draw on, keeping their name and place when drawn on', () => {
    draw();
    st().addLayer();
    st().addLayer();
    const [, a, b] = st().doodles;
    expect([a!.name, b!.name]).toEqual(['Layer 1', 'Layer 2']);
    expect(st().selectedLayerId).toBe(`doodle-${b!.id}`);
    expect(selectedDoodle(st())).toBe(b);

    st().editDoodle(a!.id);
    expect(st().doodle.strokes).toEqual([]);
    st().setDoodleItems([line]);
    st().applyDoodle();
    expect(st().doodles.map((d) => d.name)).toEqual(['Doodle 1', 'Layer 1', 'Layer 2']);
    expect(st().doodles[1]!.strokes).toEqual([line]);
  });

  it('adds a layer with nothing else open, and it can be emptied again', () => {
    st().addLayer();
    expect(ids()).toHaveLength(1);
    const { id } = st().doodles[0]!;
    st().editDoodle(id);
    st().setDoodleItems([line]);
    st().applyDoodle();
    st().editDoodle(id);
    st().setDoodleItems([]);
    st().applyDoodle();
    expect(st().doodles[0]!.strokes).toEqual([]);
    expect(ids()).toHaveLength(1);
  });

  it('duplicates a doodle after the original, with its settings but its own drawing', () => {
    draw();
    draw();
    const [a, b] = st().doodles;
    const fill = { ...defaultFillSettings(), type: 'hexagons' as const };
    st().setLayer(`doodle-${a!.id}`, { color: '#ff0000', settings: { fill } });
    st().duplicateLayer(`doodle-${a!.id}`);

    const [, copy, third] = st().doodles;
    expect(third).toBe(b);
    expect(copy).toMatchObject({ name: 'Doodle 1 copy', strokes: a!.strokes });
    const id = `doodle-${copy!.id}`;
    expect(st().selectedLayerId).toBe(id);
    expect(ids()[1]).toBe(id);
    expect(st().layerOverrides[id]).toMatchObject({ color: '#ff0000', settings: { fill } });

    // Changing one leaves the other alone.
    st().setLayer(id, { settings: { fill: null } });
    expect(st().layerOverrides[`doodle-${a!.id}`]?.settings?.fill).toEqual(fill);
  });

  it('numbers further duplicates, also of a duplicate or a renamed layer', () => {
    draw();
    const first = `doodle-${st().doodles[0]!.id}`;
    st().duplicateLayer(first);
    st().duplicateLayer(first);
    st().duplicateLayer(`doodle-${st().doodles[1]!.id}`);
    st().setLayer(first, { name: 'Sky' });
    st().duplicateLayer(first);
    expect(st().doodles.map((d) => d.name)).toEqual([
      'Doodle 1',
      'Sky copy',
      'Doodle 1 copy 2',
      'Doodle 1 copy 3',
      'Doodle 1 copy',
    ]);
    // The name given to the original isn't the copy's: its own name is.
    expect(st().layerOverrides[`doodle-${st().doodles[1]!.id}`]?.name).toBeUndefined();
  });

  it('duplicates text, named apart from the original', () => {
    const id = st().addText();
    st().duplicateLayer(`text-${id}`);
    const [, copy] = st().texts;
    expect(copy).toMatchObject({ text: 'Text', font: 'sans' });
    expect(copy!.id).not.toBe(id);
    expect(st().layerOverrides[`text-${copy!.id}`]?.name).toBe('“Text” copy');
  });

  it('duplicates a file layer, for that layer mode and that file', async () => {
    const svg = (d: string) =>
      new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path d="${d}" stroke="#000"/></svg>`,
      );
    const source = { name: 'art.svg', bytes: svg('M0 0L5 5') };
    await st().openFile(source);
    st().setLayer('layer-1', { color: '#00ff00' });
    st().duplicateLayer('layer-1');
    const copy = st().layerCopies[0]!;
    const id = `copy-${copy.id}`;
    expect(ids()).toEqual(['layer-1', id]);
    const layer = st().doc!.layers[1]!;
    expect(layer).toMatchObject({ name: 'Layer 1 copy', copyOf: 'layer-1' });
    expect(layer.strokes).toEqual(st().doc!.layers[0]!.strokes);
    expect(st().layerOverrides[id]?.color).toBe('#00ff00');

    // A duplicate of the duplicate is of the same layer, and they don't pile up on a re-import.
    st().duplicateLayer(id);
    expect(st().layerCopies[1]).toMatchObject({ of: 'layer-1', name: 'Layer 1 copy 2' });
    await st().reloadSource(svg('M0 0L9 9'));
    expect(ids()).toHaveLength(3);
    expect(st().doc!.layers[1]!.strokes).toEqual(st().doc!.layers[0]!.strokes);

    // Ids are per layer mode: another mode doesn't show it, and coming back does.
    await st().setLayerMode('byColor');
    expect(ids()).toHaveLength(1);
    await st().setLayerMode('auto');
    expect(ids()).toHaveLength(3);

    // Another file starts without them.
    await st().openFile({ name: 'other.svg', bytes: svg('M1 1L2 2') });
    expect(st().layerCopies).toEqual([]);
    expect(ids()).toEqual(['layer-1']);
  });

  it('removes a layer, and the document with the last one', () => {
    draw();
    draw();
    const [a, b] = st().doodles;
    st().removeDoodle(b!.id);
    expect(ids()).toEqual([`doodle-${a!.id}`]);
    expect(st().selectedLayerId).toBe(`doodle-${a!.id}`);
    st().removeDoodle(a!.id);
    expect(st().doc).toBeNull();
    expect(st().selectedLayerId).toBeNull();
  });

  it('numbers past the highest name, so a name never repeats among the layers', () => {
    draw();
    draw();
    st().removeDoodle(st().doodles[0]!.id);
    draw();
    expect(st().doodles.map((d) => d.name)).toEqual(['Doodle 2', 'Doodle 3']);
  });
});

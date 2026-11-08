import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThemeKey } from '../lib/useThemeKey';
import {
  isDoodleShape,
  moveItem,
  primitiveStroke,
  strokeNear,
  itemShape,
  itemStrokes,
  processItem,
  shapeContains,
  type BooleanOp,
  type DoodleItem,
  type DoodlePath,
  type Primitive,
  type Vec2,
} from '@plotka/core';
import { doodleSvg, useStore } from '../store';
import { NumberField, Row, Section, Segmented } from './controls';
import styles from './DoodlePad.module.css';

type Tool = 'draw' | 'erase' | 'select' | 'shape';

/** The shapes that can be placed, in the order of their buttons. */
const SHAPES: { kind: Primitive; label: string }[] = [
  { kind: 'rectangle', label: 'Rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'star', label: 'Star' },
];
/** A shape's icon: the shape itself, as it will be placed. */
function ShapeIcon({ kind }: { kind: Primitive }) {
  const { points } = primitiveStroke(kind, { x: 2, y: 2 }, { x: 18, y: 18 });
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The size of a shape placed with a click, mm. */
const CLICK_SHAPE = 30;
/** A press that moves less than this (mm) is a click. */
const CLICK_SLOP = 1;

/** The shape operations, in the order of their buttons. */
const OPS: { op: BooleanOp; label: string; title: string }[] = [
  { op: 'union', label: 'Merge', title: 'Join the selected shapes into one' },
  {
    op: 'subtract',
    label: 'Cut out',
    title: 'Cut the shapes drawn later out of the one drawn first',
  },
  { op: 'intersect', label: 'Keep overlap', title: 'Keep only where all of them overlap' },
  { op: 'exclude', label: 'Remove overlap', title: 'Keep everything except where they overlap' },
];
/** Eraser reach, mm. */
const ERASE_RADIUS = 2;
/** Grid spacing on the artboard, mm. */
const GRID = 10;

/** Freehand drawing that turns into clean vectors (lines or Bézier curves). */
export function DoodlePad() {
  const doodle = useStore((s) => s.doodle);
  const setDoodle = useStore((s) => s.setDoodle);
  const close = useStore((s) => s.closeDoodle);
  const doodles = useStore((s) => s.doodles);
  const setDoodleSettings = useStore((s) => s.setDoodleSettings);
  const applyDoodle = useStore((s) => s.applyDoodle);
  const { strokes, past, future, settings, size, editing } = doodle;
  const editedName = useStore(
    (s) =>
      s.layerOverrides[`doodle-${editing}`]?.name ?? s.doodles.find((d) => d.id === editing)?.name,
  );
  const [tool, setTool] = useState<Tool>('draw');
  const [shapeKind, setShapeKind] = useState<Primitive>('rectangle');
  const [showRaw, setShowRaw] = useState(true);
  const [showOthers, setShowOthers] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const live = useRef<Vec2[] | null>(null);
  /** The shape being dragged out: its opposite corners. */
  const liveShape = useRef<{ a: Vec2; b: Vec2 } | null>(null);
  /** The selected items being dragged, and how far they've gone. */
  const moving = useRef<{
    ids: number[];
    from: Vec2;
    dx: number;
    dy: number;
    /** A plain click on this one, without dragging, selects only it. */
    pressed: number | null;
  } | null>(null);
  /** The pointer drawing or erasing right now (tracked ourselves; capture can be lost). */
  const activePointer = useRef<number | null>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });

  // One entry per item (null if nothing is left of it), so indices match `strokes`.
  const processed = useMemo(
    () => strokes.map((s) => processItem(s, settings)),
    [strokes, settings],
  );
  // The other doodle layers, as a guide for drawing this one to fit them.
  const others = useMemo(
    () =>
      doodles
        .filter((d) => d.id !== editing)
        .flatMap((d) => d.strokes.map((s) => processItem(s, d.settings))),
    [doodles, editing],
  );
  const shapes = useMemo(() => strokes.map((s) => itemShape(s, settings)), [strokes, settings]);
  // Placed shapes aren't fitted, so they don't count towards "strokes → curves".
  const segmentCount = processed.reduce(
    (n, p, i) =>
      n +
      (!p || itemStrokes(strokes[i]!).every((s) => s.exact)
        ? 0
        : p.kind === 'curves'
          ? p.curves.length
          : p.kind === 'shape'
            ? p.rings.reduce((m, r) => m + r.length, 0)
            : p.points.length - 1),
    0,
  );

  const setStrokes = useStore((s) => s.setDoodleItems);
  // Selected items (indices), for the version of the doodle they were picked in: any other
  // change (a stroke, undo...) clears the selection.
  const [selection, setSelection] = useState<{ items: DoodleItem[]; ids: number[] }>({
    items: strokes,
    ids: [],
  });
  const selected = useMemo(
    () => (selection.items === strokes ? selection.ids : []),
    [selection, strokes],
  );
  const select = (items: DoodleItem[], ids: number[]) => setSelection({ items, ids });
  const [note, setNote] = useState<string | null>(null);
  // ⌘Z / ⇧⌘Z come through the app menu (Edit → Undo / Redo), which routes them here while
  // the pad is open.
  const undo = useStore((s) => s.doodleUndo);
  const redo = useStore((s) => s.doodleRedo);

  // --- drawing ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    view.current = artboardView(w, h, size);
    const { scale } = view.current;
    const ctx = canvas.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css.getPropertyValue('--canvas').trim() || '#e5e5e0';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * view.current.x, dpr * view.current.y);
    const px = 1 / scale;
    ctx.fillStyle = css.getPropertyValue('--paper').trim() || '#fff';
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let x = GRID; x < size.width; x += GRID) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
    }
    for (let y = GRID; y < size.height; y += GRID) {
      ctx.moveTo(0, y);
      ctx.lineTo(size.width, y);
    }
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (showOthers && others.length) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = Math.max(0.4, 1.5 * px);
      ctx.beginPath();
      for (const p of others) if (p) tracePath(ctx, p);
      ctx.stroke();
    }
    if (showRaw) {
      ctx.strokeStyle = 'rgba(40,90,200,0.35)';
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      for (const s of strokes.flatMap(itemStrokes)) if (!s.exact) polyline(ctx, s.points);
      ctx.stroke();
    }
    // Processed result: what will be plotted.
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(0.4, 1.5 * px);
    const drag = moving.current;
    processed.forEach((p, i) => {
      if (!p) return;
      ctx.save();
      if (drag?.ids.includes(i)) ctx.translate(drag.dx, drag.dy);
      ctx.beginPath();
      tracePath(ctx, p);
      const filled = p.closed && settings.fillClosed;
      if (filled) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fill('evenodd');
      }
      // A filled shape without its outline shows as the tint only.
      if (!filled || settings.keepOutlines) ctx.stroke();
      ctx.restore();
    });
    // Selected shapes: outlined in the accent colour.
    if (selected.length) {
      ctx.strokeStyle = css.getPropertyValue('--accent-text').trim() || '#2f6fde';
      ctx.lineWidth = 3 * px;
      ctx.setLineDash([6 * px, 4 * px]);
      for (const i of selected) {
        const p = processed[i];
        if (!p) continue;
        ctx.save();
        if (drag) ctx.translate(drag.dx, drag.dy);
        ctx.beginPath();
        tracePath(ctx, p);
        ctx.stroke();
        ctx.restore();
      }
      ctx.setLineDash([]);
    }
    if (live.current) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(0.4, 1.5 * px);
      ctx.beginPath();
      polyline(ctx, live.current);
      ctx.stroke();
    }
    if (liveShape.current) {
      const { a, b } = liveShape.current;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(0.4, 1.5 * px);
      ctx.beginPath();
      polyline(ctx, primitiveStroke(shapeKind, a, b).points);
      ctx.closePath();
      ctx.stroke();
    }
  }, [
    shapeKind,
    processed,
    strokes,
    others,
    selected,
    settings.fillClosed,
    settings.keepOutlines,
    showRaw,
    showOthers,
    size,
  ]);

  const themeKey = useThemeKey();
  useEffect(draw, [draw, themeKey]);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      const typing = (e.target as HTMLElement).closest('input, select, textarea') !== null;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selected.length) {
        e.preventDefault();
        setStrokes(strokes.filter((_, i) => !selected.includes(i)));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, selected, setStrokes, strokes]);

  const toMm = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = canvasRef.current!.getBoundingClientRect();
    // From the canvas's current size, not the last redraw: the first press can come before it.
    const v = artboardView(r.width, r.height, size);
    return {
      x: Math.min(size.width, Math.max(0, (e.clientX - r.left - v.x) / v.scale)),
      y: Math.min(size.height, Math.max(0, (e.clientY - r.top - v.y) / v.scale)),
    };
  };
  const eraseAt = (p: Vec2) => {
    const { strokes } = useStore.getState().doodle;
    // A combined shape goes as a whole when any of its strokes is touched.
    const keep = strokes.filter(
      (it) => !itemStrokes(it).some((s) => strokeNear(s, p, ERASE_RADIUS)),
    );
    if (keep.length !== strokes.length) setStrokes(keep);
  };

  /** The topmost closed shape under the point. */
  const shapeAt = (p: Vec2): number | null => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const sh = shapes[i];
      if (sh?.length && shapeContains(sh, p)) return i;
    }
    return null;
  };
  /** Updates the selection for a click there. Returns it, and whether the click is on it. */
  const selectAt = (p: Vec2, add: boolean): { ids: number[]; hit: number | null } => {
    setNote(null);
    const i = shapeAt(p);
    const ids =
      i === null
        ? add
          ? selected
          : []
        : !add
          ? // Pressing one of several selected shapes keeps them all, to drag them together.
            selected.includes(i)
            ? selected
            : [i]
          : selected.includes(i)
            ? selected.filter((j) => j !== i)
            : [...selected, i];
    select(strokes, ids);
    return { ids, hit: i !== null && ids.includes(i) ? i : null };
  };
  /** Puts down a shape, selected and ready to be moved or combined. */
  const placeShape = (a: Vec2, b: Vec2) => {
    const click = Math.hypot(b.x - a.x, b.y - a.y) < CLICK_SLOP;
    // A click makes a shape around that point, kept on the artboard.
    const half = CLICK_SHAPE / 2;
    const cx = Math.min(Math.max(half, a.x), Math.max(half, size.width - half));
    const cy = Math.min(Math.max(half, a.y), Math.max(half, size.height - half));
    const stroke = click
      ? primitiveStroke(shapeKind, { x: cx - half, y: cy - half }, { x: cx + half, y: cy + half })
      : primitiveStroke(shapeKind, a, b);
    const next = [...strokes, stroke];
    setStrokes(next);
    setTool('select');
    select(next, [next.length - 1]);
  };
  const combine = (op: BooleanOp) => {
    const ids = [...selected].sort((a, b) => a - b);
    const shape: DoodleItem = { op, items: ids.map((i) => strokes[i]!) };
    if (!processItem(shape, settings)) {
      setNote(
        op === 'intersect' ? "These shapes don't overlap." : 'Nothing would be left of them.',
      );
      return;
    }
    setNote(null);
    // The result takes the place of the bottom shape.
    const next = strokes.filter((_, i) => !ids.includes(i));
    next.splice(ids[0]!, 0, shape);
    setStrokes(next);
    select(next, [ids[0]!]);
  };
  const single = selected.length === 1 ? strokes[selected[0]!] : undefined;
  const separate = () => {
    if (!single || !isDoodleShape(single)) return;
    const i = selected[0]!;
    const next = [...strokes.slice(0, i), ...single.items, ...strokes.slice(i + 1)];
    setStrokes(next);
    select(
      next,
      single.items.map((_, k) => i + k),
    );
  };
  const closedCount = shapes.filter((sh) => sh?.length).length;
  const drawn = strokes.flatMap(itemStrokes);
  const strokeCount = drawn.filter((s) => !s.exact).length;
  const placedCount = drawn.length - strokeCount;
  const shapesHint =
    tool === 'shape'
      ? 'Drag on the artboard to place it, or click for a 30 mm one. ⇧ keeps it even.'
      : tool !== 'select'
        ? 'Overlapping closed shapes can be combined: pick Select, then click them.'
        : selected.length >= 2
          ? `${selected.length} shapes selected.`
          : single
            ? isDoodleShape(single)
              ? 'A combined shape is selected. ⇧-click to add more, or Separate it.'
              : '1 shape selected. Drag to move it; ⇧-click to add more.'
            : closedCount < 2
              ? 'Place two shapes that overlap, or draw closed ones (end each where it started).'
              : 'Click closed shapes to select them; ⇧-click to add more.';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Doodle">
      <header className={styles.header}>
        <strong>{editedName ?? 'New doodle'}</strong>
        <span className={styles.muted}>
          {(strokeCount > 0 || placedCount === 0) &&
            `${strokeCount} ${strokeCount === 1 ? 'stroke' : 'strokes'} → ${segmentCount} ${
              settings.style === 'curves' ? 'curves' : 'lines'
            }`}
          {strokeCount > 0 && placedCount > 0 && ' · '}
          {placedCount > 0 && `${placedCount} ${placedCount === 1 ? 'shape' : 'shapes'}`}
        </span>
        <span className={styles.spacer} />
        {saved && <span className={styles.muted}>Saved {saved}</span>}
        <button
          disabled={!strokes.length}
          onClick={async () => {
            const path = await window.api.invoke(
              'file:saveText',
              'Doodle.svg',
              doodleSvg(useStore.getState().doodle),
              ['.svg'],
            );
            if (path) setSaved(path.split('/').pop() ?? path);
          }}
        >
          Save SVG…
        </button>
        <button onClick={close}>Cancel</button>
        <button
          className={styles.primary}
          disabled={!strokes.length && !editing}
          onClick={applyDoodle}
        >
          {doodles.find((d) => d.id === editing)?.strokes.length ? 'Update layer' : 'Use drawing'}
        </button>
      </header>
      <div className={styles.body}>
        <div className={styles.stage} ref={wrapRef}>
          <canvas
            ref={canvasRef}
            data-testid="doodle-canvas"
            className={
              tool === 'erase' ? styles.erase : tool === 'select' ? styles.select : styles.draw
            }
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              activePointer.current = e.pointerId;
              // Capture keeps the stroke going if the pointer leaves the canvas; it's a bonus,
              // not what decides whether a move belongs to the stroke.
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Not available: moves over the canvas still draw.
              }
              if (tool === 'select') {
                const from = toMm(e);
                const { ids, hit } = selectAt(from, e.shiftKey);
                if (hit !== null)
                  moving.current = { ids, from, dx: 0, dy: 0, pressed: e.shiftKey ? null : hit };
                else activePointer.current = null;
                return;
              }
              if (tool === 'shape') {
                const a = toMm(e);
                liveShape.current = { a, b: a };
                draw();
                return;
              }
              if (tool === 'erase') eraseAt(toMm(e));
              else live.current = [toMm(e)];
              draw();
            }}
            onPointerMove={(e) => {
              if (activePointer.current !== e.pointerId) return;
              if (moving.current) {
                const p = toMm(e);
                moving.current.dx = p.x - moving.current.from.x;
                moving.current.dy = p.y - moving.current.from.y;
                draw();
                return;
              }
              if (liveShape.current) {
                const { a } = liveShape.current;
                let b = toMm(e);
                if (e.shiftKey) {
                  // Even: as wide as it's tall, towards the pointer.
                  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
                  b = {
                    x: a.x + Math.sign(b.x - a.x || 1) * side,
                    y: a.y + Math.sign(b.y - a.y || 1) * side,
                  };
                }
                liveShape.current = { a, b };
                draw();
                return;
              }
              const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
              if (tool === 'erase') {
                for (const ev of events) eraseAt(toMm(ev));
                return;
              }
              if (!live.current) return;
              for (const ev of events) live.current.push(toMm(ev));
              draw();
            }}
            onPointerUp={(e) => {
              if (activePointer.current !== e.pointerId) return;
              activePointer.current = null;
              if (moving.current) {
                const { ids, dx, dy, pressed } = moving.current;
                moving.current = null;
                if (Math.hypot(dx, dy) < CLICK_SLOP) {
                  if (pressed !== null) select(strokes, [pressed]);
                  return draw();
                }
                const next = strokes.map((it, i) => (ids.includes(i) ? moveItem(it, dx, dy) : it));
                setStrokes(next);
                select(next, ids);
                return;
              }
              if (liveShape.current) {
                const { a, b } = liveShape.current;
                liveShape.current = null;
                placeShape(a, b);
                return;
              }
              const pts = live.current;
              live.current = null;
              if (pts && pts.length > 1)
                setStrokes([...useStore.getState().doodle.strokes, { points: pts }]);
              else draw();
            }}
            onPointerCancel={() => {
              activePointer.current = null;
              live.current = null;
              liveShape.current = null;
              moving.current = null;
              draw();
            }}
          />
        </div>
        <aside className={styles.side}>
          <Section title="Tool">
            <Segmented
              value={tool}
              options={[
                { value: 'draw', label: 'Draw' },
                { value: 'erase', label: 'Erase', title: 'Drag over strokes to remove them' },
                {
                  value: 'select',
                  label: 'Select',
                  title: 'Click closed shapes to combine them; ⇧-click for more',
                },
              ]}
              onChange={(t) => {
                setTool(t);
                setNote(null);
                if (t !== 'select') select(strokes, []);
              }}
            />
            <div className={styles.buttons}>
              <button onClick={undo} disabled={!past.length} title="Undo (⌘Z)">
                Undo
              </button>
              <button onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)">
                Redo
              </button>
              <button onClick={() => setStrokes([])} disabled={!strokes.length}>
                Clear
              </button>
            </div>
          </Section>
          <Section title="Shapes" help="doodle#combining-shapes">
            <div className={styles.shapePicker}>
              {SHAPES.map(({ kind, label }) => (
                <button
                  key={kind}
                  className={tool === 'shape' && shapeKind === kind ? styles.picked : undefined}
                  aria-pressed={tool === 'shape' && shapeKind === kind}
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    setShapeKind(kind);
                    setTool('shape');
                    setNote(null);
                    select(strokes, []);
                  }}
                >
                  <ShapeIcon kind={kind} />
                </button>
              ))}
            </div>
            <p className={styles.hint}>{shapesHint}</p>
            <div className={styles.ops}>
              {OPS.map(({ op, label, title }) => (
                <button
                  key={op}
                  title={title}
                  disabled={selected.length < 2}
                  onClick={() => combine(op)}
                >
                  {label}
                </button>
              ))}
              <button
                title="Split a combined shape back into its pieces"
                disabled={!single || !isDoodleShape(single)}
                onClick={separate}
              >
                Separate
              </button>
            </div>
            {note && (
              <p className={styles.note} role="status">
                {note}
              </p>
            )}
          </Section>
          <Section title="Vectors" help="doodle#turning-strokes-into-vectors">
            <Row label="Style">
              <Segmented
                value={settings.style}
                options={[
                  { value: 'curves', label: 'Curves', title: 'Smooth Bézier curves' },
                  {
                    value: 'lines',
                    label: 'Straight lines',
                    title: 'Straight segments between points',
                  },
                ]}
                onChange={(style) => setDoodleSettings({ style })}
              />
            </Row>
            <Row label="Smoothing">
              <input
                type="range"
                aria-label="Smoothing"
                min={0}
                max={100}
                value={settings.smoothing}
                onChange={(e) => setDoodleSettings({ smoothing: Number(e.target.value) })}
              />
              <span className={styles.muted}>{settings.smoothing}</span>
            </Row>
            <Row label="">
              <label className={styles.check} title="Don't round off sharp turns">
                <input
                  type="checkbox"
                  checked={settings.keepCorners}
                  onChange={(e) => setDoodleSettings({ keepCorners: e.target.checked })}
                />
                Keep sharp corners
              </label>
            </Row>
            <Row label="">
              <label
                className={styles.check}
                title="Join the ends of a stroke that finishes near where it started"
              >
                <input
                  type="checkbox"
                  checked={settings.closeGap > 0}
                  onChange={(e) => setDoodleSettings({ closeGap: e.target.checked ? 3 : 0 })}
                />
                Close shapes when the ends meet
              </label>
            </Row>
            <Row label="">
              <label
                className={styles.check}
                title="Closed shapes become filled, so they can be hatched"
              >
                <input
                  type="checkbox"
                  checked={settings.fillClosed}
                  disabled={settings.closeGap === 0}
                  onChange={(e) => setDoodleSettings({ fillClosed: e.target.checked })}
                />
                Fill closed shapes
              </label>
            </Row>
            <Row label="">
              <label
                className={`${styles.check} ${styles.indent}`}
                title="Also draw the outline around each filled shape. Off: only the fill is plotted. You can change it later with Draw outlines of filled shapes in the Fill tab."
              >
                <input
                  type="checkbox"
                  checked={settings.keepOutlines}
                  disabled={settings.closeGap === 0 || !settings.fillClosed}
                  onChange={(e) => setDoodleSettings({ keepOutlines: e.target.checked })}
                />
                Keep outlines
              </label>
            </Row>
            <Row label="">
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                />
                Show what I drew
              </label>
            </Row>
            {others.length > 0 && (
              <Row label="">
                <label
                  className={styles.check}
                  title="Show your other doodle layers faintly, to draw this one to fit them"
                >
                  <input
                    type="checkbox"
                    checked={showOthers}
                    onChange={(e) => setShowOthers(e.target.checked)}
                  />
                  Show other doodles
                </label>
              </Row>
            )}
          </Section>
          <Section title="Artboard">
            <Row label="Width">
              <NumberField
                value={size.width}
                min={10}
                max={1000}
                step={5}
                suffix="mm"
                onChange={(width) => setDoodle({ size: { ...size, width } })}
              />
            </Row>
            <Row label="Height">
              <NumberField
                value={size.height}
                min={10}
                max={1000}
                step={5}
                suffix="mm"
                onChange={(height) => setDoodle({ size: { ...size, height } })}
              />
            </Row>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function polyline(ctx: CanvasRenderingContext2D, pts: Vec2[]) {
  if (!pts.length) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
}

/** Where the artboard sits on a canvas of w × h px: scale (px per mm) and offset. */
function artboardView(w: number, h: number, size: { width: number; height: number }) {
  const pad = 24;
  const scale = Math.max(1e-6, Math.min((w - 2 * pad) / size.width, (h - 2 * pad) / size.height));
  return { scale, x: (w - size.width * scale) / 2, y: (h - size.height * scale) / 2 };
}

/** Adds a processed path (or a combined shape's rings) to the current canvas path. */
function tracePath(ctx: CanvasRenderingContext2D, p: DoodlePath) {
  if (p.kind === 'shape') {
    for (const r of p.rings) {
      polyline(ctx, r);
      ctx.closePath();
    }
    return;
  }
  if (p.kind === 'lines') polyline(ctx, p.points);
  else {
    const h = p.curves[0]![0];
    ctx.moveTo(h.x, h.y);
    for (const [, a, b, e] of p.curves) ctx.bezierCurveTo(a.x, a.y, b.x, b.y, e.x, e.y);
  }
  if (p.closed) ctx.closePath();
}

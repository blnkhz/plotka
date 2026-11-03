import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThemeKey } from '../lib/useThemeKey';
import { processStroke, type DoodlePath, type DoodleStroke, type Vec2 } from '@plotter-studio/core';
import { doodleSvg, useStore } from '../store';
import { NumberField, Row, Section, Segmented } from './controls';
import styles from './DoodlePad.module.css';

type Tool = 'draw' | 'erase';
/** Eraser reach, mm. */
const ERASE_RADIUS = 2;
/** Grid spacing on the artboard, mm. */
const GRID = 10;

/** Freehand drawing that turns into clean vectors (lines or Bézier curves). */
export function DoodlePad() {
  const doodle = useStore((s) => s.doodle);
  const setDoodle = useStore((s) => s.setDoodle);
  const setDoodleSettings = useStore((s) => s.setDoodleSettings);
  const applyDoodle = useStore((s) => s.applyDoodle);
  const { strokes, undone, settings, size } = doodle;
  const [tool, setTool] = useState<Tool>('draw');
  const [showRaw, setShowRaw] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const live = useRef<Vec2[] | null>(null);
  /** The pointer drawing or erasing right now (tracked ourselves; capture can be lost). */
  const activePointer = useRef<number | null>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });

  const processed = useMemo(
    () => strokes.map((s) => processStroke(s, settings)).filter((p): p is DoodlePath => !!p),
    [strokes, settings],
  );
  const segmentCount = processed.reduce(
    (n, p) => n + (p.kind === 'curves' ? p.curves.length : p.points.length - 1),
    0,
  );

  const setStrokes = useCallback(
    (next: DoodleStroke[]) => setDoodle({ strokes: next, undone: [] }),
    [setDoodle],
  );
  // ⌘Z / ⇧⌘Z come through the app menu (Edit → Undo / Redo), which routes them here while
  // the pad is open.
  const undo = useStore((s) => s.doodleUndo);
  const redo = useStore((s) => s.doodleRedo);
  const close = useCallback(() => setDoodle({ open: false }), [setDoodle]);

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
    if (showRaw) {
      ctx.strokeStyle = 'rgba(40,90,200,0.35)';
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      for (const s of strokes) polyline(ctx, s.points);
      ctx.stroke();
    }
    // Processed result: what will be plotted.
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(0.4, 1.5 * px);
    for (const p of processed) {
      ctx.beginPath();
      if (p.kind === 'lines') polyline(ctx, p.points);
      else {
        const h = p.curves[0]![0];
        ctx.moveTo(h.x, h.y);
        for (const [, a, b, e] of p.curves) ctx.bezierCurveTo(a.x, a.y, b.x, b.y, e.x, e.y);
      }
      if (p.closed) ctx.closePath();
      const filled = p.closed && settings.fillClosed;
      if (filled) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fill();
      }
      // A filled shape without its outline shows as the tint only.
      if (!filled || settings.keepOutlines) ctx.stroke();
    }
    if (live.current) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(0.4, 1.5 * px);
      ctx.beginPath();
      polyline(ctx, live.current);
      ctx.stroke();
    }
  }, [processed, strokes, settings.fillClosed, settings.keepOutlines, showRaw, size]);

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
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

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
    const keep = strokes.filter(
      (s) => !s.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= ERASE_RADIUS),
    );
    if (keep.length !== strokes.length) setStrokes(keep);
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Doodle">
      <header className={styles.header}>
        <strong>Doodle</strong>
        <span className={styles.muted}>
          {strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'} → {segmentCount}{' '}
          {settings.style === 'curves' ? 'curves' : 'lines'}
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
          disabled={!strokes.length}
          onClick={() => void applyDoodle()}
        >
          Use drawing
        </button>
      </header>
      <div className={styles.body}>
        <div className={styles.stage} ref={wrapRef}>
          <canvas
            ref={canvasRef}
            data-testid="doodle-canvas"
            className={tool === 'erase' ? styles.erase : styles.draw}
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
              if (tool === 'erase') eraseAt(toMm(e));
              else live.current = [toMm(e)];
              draw();
            }}
            onPointerMove={(e) => {
              if (activePointer.current !== e.pointerId) return;
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
              const pts = live.current;
              live.current = null;
              if (pts && pts.length > 1)
                setStrokes([...useStore.getState().doodle.strokes, { points: pts }]);
              else draw();
            }}
            onPointerCancel={() => {
              activePointer.current = null;
              live.current = null;
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
              ]}
              onChange={setTool}
            />
            <div className={styles.buttons}>
              <button onClick={undo} disabled={!strokes.length} title="Undo (⌘Z)">
                Undo
              </button>
              <button onClick={redo} disabled={!undone.length} title="Redo (⇧⌘Z)">
                Redo
              </button>
              <button onClick={() => setStrokes([])} disabled={!strokes.length}>
                Clear
              </button>
            </div>
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

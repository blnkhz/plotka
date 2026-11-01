import { useCallback, useEffect, useRef } from 'react';
import { marginBox, paperSize, type Polyline } from '@plotter-studio/core';
import { useProcessed, useProfile, type Processed } from '../lib/useProcessed';
import { useStore, type ViewOptions } from '../store';
import styles from './Preview.module.css';

type ViewTransform = { scale: number; x: number; y: number }; // screen = mm * scale + (x, y)

const MIN_SCALE = 0.2;
const MAX_SCALE = 400;

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef<ViewTransform>({ scale: 2, x: 40, y: 40 });
  const frame = useRef(0);

  const processed = useProcessed();
  const profile = useProfile();
  const page = useStore((s) => s.page);
  const options = useStore((s) => s.view);
  const fitRequest = useStore((s) => s.fitRequest);
  const hasDoc = useStore((s) => s.doc !== null);

  // Latest draw inputs, read by the rAF callback.
  const inputs = useRef({ processed, page, options, bed: profile.bed });
  useEffect(() => {
    inputs.current = { processed, page, options, bed: profile.bed };
  });

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { processed, page, options, bed } = inputs.current;
      render(canvas, view.current, { processed, page, options, bed });
    });
  }, []);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { page, options, bed } = inputs.current;
    const paper = paperSize(page);
    const w = options.bed ? Math.max(paper.width, bed.width) : paper.width;
    const h = options.bed ? Math.max(paper.height, bed.height) : paper.height;
    const pad = 32;
    const scale = Math.min((wrap.clientWidth - pad * 2) / w, (wrap.clientHeight - pad * 2) / h);
    view.current = {
      scale,
      x: (wrap.clientWidth - w * scale) / 2,
      y: (wrap.clientHeight - h * scale) / 2,
    };
    draw();
  }, [draw]);

  // Redraw when inputs change.
  useEffect(draw, [draw, processed, page, options, profile]);
  // Fit on request (file opened, F key, button) and when paper size changes.
  useEffect(fit, [
    fit,
    fitRequest,
    page.paper,
    page.orientation,
    page.customWidth,
    page.customHeight,
  ]);

  // Resize: keep the canvas backing store in sync with its CSS size.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      if (first) {
        first = false;
        fit();
      } else draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, fit]);

  // Pan and zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoomAt = (factor: number, sx: number, sy: number) => {
      const v = view.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      view.current = { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // Pinch (ctrlKey on macOS trackpads) or a notched mouse wheel zooms; trackpad scroll pans.
      const isMouseWheel =
        e.deltaMode !== 0 ||
        (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey || isMouseWheel) {
        const speed = e.ctrlKey ? 0.01 : 0.002;
        zoomAt(Math.exp(-e.deltaY * speed), sx, sy);
      } else {
        view.current = {
          ...view.current,
          x: view.current.x - e.deltaX,
          y: view.current.y - e.deltaY,
        };
        draw();
      }
    };
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      view.current = {
        ...view.current,
        x: view.current.x + e.clientX - drag.x,
        y: view.current.y + e.clientY - drag.y,
      };
      drag = { x: e.clientX, y: e.clientY };
      draw();
    };
    const onUp = () => (drag = null);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [draw]);

  const zoomButton = (factor: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const v = view.current;
    const sx = wrap.clientWidth / 2;
    const sy = wrap.clientHeight / 2;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    const k = scale / v.scale;
    view.current = { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    draw();
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <ViewToggles />
      <div className={styles.zoom}>
        <button onClick={() => zoomButton(1 / 1.25)} title="Zoom out">
          −
        </button>
        <button onClick={fit} title="Fit (F)">
          Fit
        </button>
        <button onClick={() => zoomButton(1.25)} title="Zoom in">
          +
        </button>
      </div>
      {!hasDoc && <div className={styles.empty}>Open or drop an SVG to start.</div>}
    </div>
  );
}

function ViewToggles() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const toggle = (key: 'travel' | 'original' | 'bed' | 'margins', label: string) => (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={view[key]}
        onChange={(e) => setView({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <div className={styles.toggles}>
      {toggle('travel', 'Travel')}
      {toggle('original', 'Original')}
      {toggle('bed', 'Bed')}
      {toggle('margins', 'Margins')}
      <label className={styles.toggle} title="Pen tip width">
        Pen
        <input
          type="number"
          min={0.05}
          max={5}
          step={0.05}
          value={view.penWidth}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v > 0) setView({ penWidth: v });
          }}
        />
        mm
      </label>
    </div>
  );
}

type RenderInput = {
  processed: Processed | null;
  page: ReturnType<typeof useStore.getState>['page'];
  options: ViewOptions;
  bed: { width: number; height: number };
};

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function render(
  canvas: HTMLCanvasElement,
  v: ViewTransform,
  { processed, page, options, bed }: RenderInput,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = cssVar('--canvas');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // World transform: mm -> device pixels.
  ctx.setTransform(v.scale * dpr, 0, 0, v.scale * dpr, v.x * dpr, v.y * dpr);
  const px = 1 / v.scale; // one CSS pixel in mm

  const paper = paperSize(page);

  // Paper
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8 * dpr;
  ctx.fillStyle = cssVar('--paper');
  ctx.fillRect(0, 0, paper.width, paper.height);
  ctx.restore();

  // Machine bed
  if (options.bed) {
    ctx.strokeStyle = cssVar('--bed');
    ctx.lineWidth = px;
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.strokeRect(0, 0, bed.width, bed.height);
    ctx.setLineDash([]);
    // Home marker
    ctx.fillStyle = cssVar('--bed');
    ctx.beginPath();
    ctx.arc(0, 0, 3 * px, 0, Math.PI * 2);
    ctx.fill();
  }

  // Margins
  if (options.margins) {
    const m = marginBox(page);
    ctx.strokeStyle = cssVar('--margin');
    ctx.lineWidth = px;
    ctx.setLineDash([3 * px, 3 * px]);
    ctx.strokeRect(m.x, m.y, m.width, m.height);
    ctx.setLineDash([]);
  }

  if (!processed) return;

  // Original artwork (placed, before clipping): fills tinted, outlines faint.
  if (options.original) {
    ctx.globalAlpha = 0.25;
    for (const layer of processed.placed.layers) {
      if (!layer.visible) continue;
      for (const f of layer.fills) {
        ctx.fillStyle = f.color?.startsWith('#') ? f.color : layer.color;
        ctx.beginPath();
        for (const ring of f.outer) addPath(ctx, ring, true);
        ctx.fill(f.fillRule);
      }
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = px;
      ctx.beginPath();
      for (const s of layer.strokes) addPath(ctx, s.points, s.closed);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Pen-down strokes
  const visible = new Map(processed.clipped.layers.map((l) => [l.id, l]));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(options.penWidth, 0.75 * px);
  for (const lt of processed.toolpath.layers) {
    const layer = visible.get(lt.layerId);
    if (!layer?.visible) continue;
    ctx.strokeStyle = layer.color;
    ctx.beginPath();
    for (const p of lt.paths) addPath(ctx, p.points, p.closed);
    ctx.stroke();
  }

  // Clipped-away parts
  ctx.strokeStyle = cssVar('--danger');
  ctx.lineWidth = Math.max(options.penWidth, 1.5 * px);
  ctx.setLineDash([4 * px, 3 * px]);
  ctx.beginPath();
  for (const [id, lines] of processed.outside) {
    if (!visible.get(id)?.visible) continue;
    for (const l of lines) addPath(ctx, l.points, l.closed);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Travel (pen-up) moves, from home through every path and back.
  if (options.travel) {
    ctx.strokeStyle = cssVar('--travel');
    ctx.lineWidth = px;
    ctx.beginPath();
    let pos = { x: 0, y: 0 };
    for (const lt of processed.toolpath.layers) {
      for (const p of lt.paths) {
        const start = p.points[0]!;
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(start.x, start.y);
        pos = endOf(p);
      }
    }
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }
}

const endOf = (p: Polyline) => (p.closed ? p.points[0]! : p.points[p.points.length - 1]!);

function addPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], closed: boolean) {
  if (pts.length === 0) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  if (closed) ctx.closePath();
}

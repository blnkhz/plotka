import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getTransform,
  marginBox,
  paperSize,
  spiralCenters,
  undrawnFillCount,
  type ParamValues,
  type Polyline,
  type StepGuide,
  type Vec2,
} from '@plotter-studio/core';
import { beginGesture, endGesture } from '../lib/projectActions';
import { useProcessed, useProfile, type Processed } from '../lib/useProcessed';
import { completedCount, partialRoute, penAt } from '../lib/playback';
import { PlaybackBar } from './PlaybackBar';
import { currentLayerSettings, useStore, type ViewOptions } from '../store';
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
  const machine = useStore((s) => s.plotter?.machine);
  const plotPenDown = useStore((s) => s.plotter?.plot?.penDown);
  const pen = machine?.position
    ? {
        x: machine.position.x,
        y: machine.position.y,
        down: plotPenDown ?? machine.penUp === false,
      }
    : null;
  const playback = useStore((s) => s.playback);
  const playbackT = playback.on ? playback.t : null;
  const adjustStepId = useStore((s) => s.adjustStepId);
  const guide = adjustStepId && processed?.guide?.stepId === adjustStepId ? processed.guide : null;
  const adjustSpiralId = useStore((s) => s.adjustSpiralId);
  const spiral = useMemo(() => {
    const layer = adjustSpiralId && processed?.clipped.layers.find((l) => l.id === adjustSpiralId);
    const centers = layer ? spiralCenters(layer) : null;
    if (!layer || !centers) return null;
    // Unique centers (a shared center is the same for every shape).
    const seen = new Set<string>();
    const unique = centers.filter((c): c is Vec2 => {
      if (!c) return false;
      const k = `${c.x.toFixed(3)},${c.y.toFixed(3)}`;
      return !seen.has(k) && !!seen.add(k);
    });
    return { layerId: layer.id, centers: unique };
  }, [adjustSpiralId, processed]);
  const inputs = useRef({
    processed,
    page,
    options,
    bed: profile.bed,
    pen,
    playbackT,
    guide,
    spiral,
  });
  useEffect(() => {
    inputs.current = { processed, page, options, bed: profile.bed, pen, playbackT, guide, spiral };
  });

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      render(canvas, view.current, inputs.current);
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
  useEffect(draw, [
    draw,
    processed,
    page,
    options,
    profile,
    pen?.x,
    pen?.y,
    pen?.down,
    playbackT,
    guide,
    spiral,
  ]);
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
      // Adjusting a transform: the wheel or a pinch zooms the artwork instead of the view.
      if (inputs.current.guide) {
        const speed = e.ctrlKey ? 0.01 : 0.002;
        zoomGuide(inputs.current.guide, Math.exp(-e.deltaY * speed));
        return;
      }
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
    let drag: { x: number; y: number; adjust: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      const adjust = inputs.current.guide !== null || inputs.current.spiral !== null;
      drag = { x: e.clientX, y: e.clientY, adjust };
      if (adjust) beginGesture();
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const g = inputs.current.guide;
      const placement = inputs.current.processed?.placement;
      if (drag.adjust) {
        const sp = inputs.current.spiral;
        if (sp) {
          // Fills are made on the paper, so the drag in mm is the center's move.
          const k = view.current.scale;
          moveSpiralCenter(sp.layerId, (e.clientX - drag.x) / k, (e.clientY - drag.y) / k);
        } else if (g && placement) {
          // Screen px → paper mm → the transform's own mm (undo the page placement's scale
          // and turn), then into the transform's params.
          const k = view.current.scale;
          const dx = (e.clientX - drag.x) / k;
          const dy = (e.clientY - drag.y) / k;
          const [a, b, c, d] = placement;
          const det = a * d - b * c;
          if (det) dragGuide(g, (d * dx - c * dy) / det, (-b * dx + a * dy) / det);
        }
        drag = { ...drag, x: e.clientX, y: e.clientY };
        return;
      }
      view.current = {
        ...view.current,
        x: view.current.x + e.clientX - drag.x,
        y: view.current.y + e.clientY - drag.y,
      };
      drag = { ...drag, x: e.clientX, y: e.clientY };
      draw();
    };
    const onUp = () => {
      if (drag?.adjust) endGesture();
      drag = null;
    };
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

  // Esc ends adjusting.
  const adjusting = adjustStepId !== null || adjustSpiralId !== null;
  useEffect(() => {
    if (!adjusting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setAdjustStep(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adjusting]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${guide || spiral ? styles.adjusting : ''}`}
        data-testid="preview"
      />
      {adjustStepId && <AdjustBar ready={guide !== null} />}
      {adjustSpiralId && (
        <AdjustBar
          ready={spiral !== null}
          text="Drag to move the spiral center"
          notReady="Choose a Spiral fill for this layer to place its center."
        />
      )}
      <PlaybackBar />
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

/** Sets params of the step being adjusted, clamped to their ranges. */
function setGuideParams(stepId: string, values: (params: ParamValues) => ParamValues) {
  const s = useStore.getState();
  const step = s.pipeline.find((st) => st.id === stepId);
  const def = step && getTransform(step.type);
  if (!step || !def) return;
  const current: ParamValues = {};
  for (const p of def.params) current[p.key] = step.params[p.key] ?? p.default;
  const next = values(current);
  const params: ParamValues = {};
  for (const [key, v] of Object.entries(next)) {
    const spec = def.params.find((p) => p.key === key);
    if (spec?.type !== 'number' || typeof v !== 'number') continue;
    const clamped = Math.min(spec.max, Math.max(spec.min, v));
    params[key] = Math.round(clamped * 100) / 100;
  }
  s.updateStep(stepId, { params });
}

/** Moves the artwork under the guide by (dx, dy) mm (in the transform's output). */
function dragGuide(g: StepGuide, dx: number, dy: number) {
  const [a, b, c, d] = g.drag.perMm;
  setGuideParams(g.stepId, (p) => ({
    [g.drag.xKey]: Number(p[g.drag.xKey]) + a * dx + b * dy,
    [g.drag.yKey]: Number(p[g.drag.yKey]) + c * dx + d * dy,
  }));
}

/** Moves a layer's spiral fill center by (dx, dy) mm. */
function moveSpiralCenter(layerId: string, dx: number, dy: number) {
  const fill = currentLayerSettings(layerId)?.fill;
  if (fill?.type !== 'spiral') return;
  const round = (v: number) => Math.round(v * 100) / 100;
  useStore.getState().setLayer(layerId, {
    settings: {
      fill: {
        ...fill,
        centerX: round((fill.centerX ?? 0) + dx),
        centerY: round((fill.centerY ?? 0) + dy),
      },
    },
  });
}

function zoomGuide(g: StepGuide, factor: number) {
  setGuideParams(g.stepId, (p) => ({ [g.zoomKey]: Number(p[g.zoomKey]) * factor }));
}

/** Shown while a transform is adjusted in the preview. */
function AdjustBar({
  ready,
  text = 'Drag to move the artwork (shown in blue) under the outline · scroll or pinch to zoom it',
  notReady = 'Turn the transform on and make it the last one to adjust it here.',
}: {
  ready: boolean;
  text?: string;
  notReady?: string;
}) {
  // Either kind of adjusting: setting one clears the other, so this ends both.
  const setAdjustStep = useStore((s) => s.setAdjustStep);
  return (
    <div className={styles.adjustBar} role="status">
      {ready ? text : notReady}
      <button onClick={() => setAdjustStep(null)}>Done</button>
    </div>
  );
}

const LINE_WIDTH_HINT =
  'How thick lines are drawn in the preview. It doesn’t change the plot: the plotter draws with ' +
  'whatever pen is in it. Set it to your pen’s tip width (e.g. 0.3 mm for a fineliner) for a ' +
  'more accurate view of how dense and dark the plot will look.';

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
      <button
        className={styles.playButton}
        onClick={() =>
          useStore.setState((s) => ({
            playback: { ...s.playback, on: !s.playback.on, playing: !s.playback.on, t: 0 },
          }))
        }
        title="Watch the plot order, at adjustable speed"
      >
        ▶ Playback
      </button>
      <label className={styles.toggle} title={LINE_WIDTH_HINT}>
        Line width
        <input
          type="number"
          aria-label="Line width"
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
        <span className={styles.previewOnly}>preview only</span>
      </label>
    </div>
  );
}

type RenderInput = {
  /** The transform being adjusted: its outline is drawn over everything. */
  guide: StepGuide | null;
  /** The spiral centers being placed. */
  spiral: { centers: Vec2[] } | null;
  processed: Processed | null;
  page: ReturnType<typeof useStore.getState>['page'];
  options: ViewOptions;
  bed: { width: number; height: number };
  /** Live pen position from the plotter, mm from home, and whether it's down. */
  pen: { x: number; y: number; down: boolean } | null;
  /** PREVIEW-4: playback time (ms) when playback is on. */
  playbackT: number | null;
};

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function render(
  canvas: HTMLCanvasElement,
  v: ViewTransform,
  { processed, page, options, bed, pen, playbackT, guide, spiral }: RenderInput,
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

  if (!processed) {
    drawPen(ctx, pen, px);
    return;
  }

  // Filled shapes nothing will draw (no fill type, no outlines): a faint tint with a dashed
  // edge, so they don't seem to have vanished. The Original overlay covers this when it's on.
  if (!options.original) {
    ctx.save();
    ctx.setLineDash([3 * px, 3 * px]);
    ctx.lineWidth = px;
    for (const layer of processed.placed.layers) {
      if (!layer.visible || undrawnFillCount(layer) === 0) continue;
      for (const f of layer.fills) {
        if (f.knockout) continue;
        ctx.beginPath();
        for (const ring of f.outer) addPath(ctx, ring, true);
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = f.color?.startsWith('#') ? f.color : layer.color;
        ctx.fill(f.fillRule);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = cssVar('--muted');
        ctx.stroke();
      }
    }
    ctx.restore();
  }

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

  // Layers left out of the plot (checkbox off): faint, so it's clear they're excluded.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(options.penWidth, 0.75 * px);
  for (const layer of processed.clipped.layers) {
    if (layer.plot || !layer.visible) continue;
    ctx.strokeStyle = layer.color;
    ctx.beginPath();
    for (const s of layer.strokes) addPath(ctx, s.points, s.closed);
    ctx.stroke();
  }
  ctx.restore();

  // Pen-down strokes
  const visible = new Map(processed.clipped.layers.map((l) => [l.id, l]));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(options.penWidth, 0.75 * px);
  // Multiply, so layers drawn over each other mix like ink (shows passes and moiré).
  ctx.globalCompositeOperation = 'multiply';
  if (playbackT === null) {
    for (const lt of processed.toolpath.layers) {
      const layer = visible.get(lt.layerId);
      if (!layer?.visible) continue;
      ctx.strokeStyle = layer.color;
      ctx.stroke(cachedPath(lt.paths));
    }
  } else drawPlayback(ctx, processed, visible, playbackT);
  ctx.globalCompositeOperation = 'source-over';

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

  if (guide) {
    ctx.save();
    if (guide.source) {
      // The artwork where it sits now, so the user sees what goes into the outline.
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = cssVar('--accent');
      ctx.lineWidth = px;
      ctx.beginPath();
      for (const l of guide.source) addPath(ctx, l.points, l.closed);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    addPath(ctx, guide.outline, true);
    ctx.fillStyle = cssVar('--accent');
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([5 * px, 3 * px]);
    ctx.stroke();
    ctx.restore();
  }

  if (spiral) {
    ctx.save();
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 1.5 * px;
    for (const c of spiral.centers) {
      const r = 7 * px;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.moveTo(c.x - 2 * r, c.y);
      ctx.lineTo(c.x + 2 * r, c.y);
      ctx.moveTo(c.x, c.y - 2 * r);
      ctx.lineTo(c.x, c.y + 2 * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPen(ctx, pen, px);
  if (playbackT !== null) {
    const tp = processed.toolpath;
    drawPen(
      ctx,
      penAt(processed.timeline, (l, p) => tp.layers[l]?.paths[p], playbackT),
      px,
    );
  }
}

/**
 * PREVIEW-4: everything faint, the paths drawn by time t in full, the current one partly. The
 * finished paths are added to a cached Path2D per layer as time moves forward, so long plots
 * play smoothly; moving back rebuilds it.
 */
let played: {
  timeline: Processed['timeline'] | null;
  count: number;
  byLayer: Map<number, Path2D>;
} = {
  timeline: null,
  count: 0,
  byLayer: new Map(),
};
function drawPlayback(
  ctx: CanvasRenderingContext2D,
  processed: Processed,
  visible: Map<string, { visible: boolean; color: string }>,
  t: number,
) {
  const tp = processed.toolpath;
  const tl = processed.timeline;
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (const lt of tp.layers) {
    const layer = visible.get(lt.layerId);
    if (!layer?.visible) continue;
    ctx.strokeStyle = layer.color;
    ctx.stroke(cachedPath(lt.paths));
  }
  ctx.restore();

  const k = completedCount(tl, t);
  if (played.timeline !== tl || k < played.count)
    played = { timeline: tl, count: 0, byLayer: new Map() };
  for (let i = played.count; i < k; i++) {
    const li = tl.layer[i]!;
    const p = tp.layers[li]?.paths[tl.path[i]!];
    if (!p) continue;
    let path = played.byLayer.get(li);
    if (!path) played.byLayer.set(li, (path = new Path2D()));
    addPath(path, p.points, p.closed);
  }
  played.count = k;
  for (const [li, path] of played.byLayer) {
    const layer = visible.get(tp.layers[li]!.layerId);
    if (!layer?.visible) continue;
    ctx.strokeStyle = layer.color;
    ctx.stroke(path);
  }
  // The path being drawn right now.
  if (k < tl.end.length && tl.start[k]! <= t) {
    const li = tl.layer[k]!;
    const p = tp.layers[li]?.paths[tl.path[k]!];
    const layer = visible.get(tp.layers[li]?.layerId ?? '');
    if (p && layer?.visible) {
      const span = tl.end[k]! - tl.start[k]!;
      ctx.strokeStyle = layer.color;
      ctx.beginPath();
      addPath(ctx, partialRoute(p, span > 0 ? (t - tl.start[k]!) / span : 1), false);
      ctx.stroke();
    }
  }
}

/** The live pen: a ring with a crosshair, filled while the pen is down. */
function drawPen(ctx: CanvasRenderingContext2D, pen: RenderInput['pen'], px: number) {
  if (!pen) return;
  const r = 6 * px;
  ctx.save();
  ctx.strokeStyle = cssVar('--accent');
  ctx.fillStyle = cssVar('--accent');
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.arc(pen.x, pen.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pen.x - 2 * r, pen.y);
  ctx.lineTo(pen.x - r, pen.y);
  ctx.moveTo(pen.x + r, pen.y);
  ctx.lineTo(pen.x + 2 * r, pen.y);
  ctx.moveTo(pen.x, pen.y - 2 * r);
  ctx.lineTo(pen.x, pen.y - r);
  ctx.moveTo(pen.x, pen.y + r);
  ctx.lineTo(pen.x, pen.y + 2 * r);
  ctx.stroke();
  if (pen.down) {
    ctx.beginPath();
    ctx.arc(pen.x, pen.y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const endOf = (p: Polyline) => (p.closed ? p.points[0]! : p.points[p.points.length - 1]!);

/**
 * PREVIEW-5: each layer's paths as one Path2D, built once per processed result and reused for
 * every redraw (panning and zooming only re-stroke it).
 */
const pathCache = new WeakMap<Polyline[], Path2D>();
function cachedPath(paths: Polyline[]): Path2D {
  let p = pathCache.get(paths);
  if (!p) {
    p = new Path2D();
    for (const line of paths) addPath(p, line.points, line.closed);
    pathCache.set(paths, p);
  }
  return p;
}

function addPath(ctx: CanvasPath, pts: { x: number; y: number }[], closed: boolean) {
  if (pts.length === 0) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  if (closed) ctx.closePath();
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useColorScheme } from '../lib/useColorScheme';
import {
  getTransform,
  marginBox,
  paperSize,
  fillCenters,
  undrawnFillCount,
  type ParamValues,
  type Polyline,
  type StepGuide,
  type Vec2,
} from '@plotter-studio/core';
import { beginGesture, endGesture } from '../lib/projectActions';
import {
  dragFrame,
  frameBox,
  frameCorners,
  frameCursor,
  frameHandleAt,
  frameHandles,
  frameMatrix,
  frameOfBox,
  layerAt,
  rotateHandle,
  snapAngle,
  snapBox,
  snapTargets,
  type Frame,
  type FrameHandle,
  type Guides,
} from '../lib/arrange';
import { arrangeData, commitArrange, type ArrangeData } from '../lib/arrangeActions';
import { useProcessed, useProfile, type Processed } from '../lib/useProcessed';
import { completedCount, partialRoute, penAt } from '../lib/playback';
import { PlaybackBar } from './PlaybackBar';
import { currentLayerSettings, useStore, type ViewOptions } from '../store';
import styles from './Preview.module.css';

type ViewTransform = { scale: number; x: number; y: number }; // screen = mm * scale + (x, y)

/**
 * A drag in arrange mode, drawn by transforming what's already drawn (the pipeline runs once,
 * on release). After release it stays until the new result arrives, so nothing jumps back.
 */
type LiveArrange = {
  target: string | null;
  from: Frame;
  frame: Frame;
  guides: Guides;
  committed: boolean;
  /** Turning: show the angle by the handle. */
  turning?: boolean;
};
/** Screen px within which handles and lines can be grabbed, and snapping happens. */
const GRAB_PX = 6;
const SNAP_PX = 6;
/** Screen px from the top of the box to the rotate handle. */
const STALK_PX = 24;

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
    const centers = layer ? fillCenters(layer) : null;
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
  const arrangeOn = useStore((s) => s.arrange.on);
  const arrangeTarget = useStore((s) => s.arrange.target);
  const arrangeInfo = useMemo(
    () => (arrangeOn ? arrangeData(processed) : null),
    [arrangeOn, processed],
  );
  const arrange = arrangeInfo ? { target: arrangeTarget, data: arrangeInfo } : null;
  const live = useRef<LiveArrange | null>(null);
  const inputs = useRef({
    processed,
    page,
    options,
    bed: profile.bed,
    pen,
    playbackT,
    guide,
    spiral,
    arrange,
    live,
  });
  useEffect(() => {
    inputs.current = {
      processed,
      page,
      options,
      bed: profile.bed,
      pen,
      playbackT,
      guide,
      spiral,
      arrange,
      live,
    };
  });
  // A committed drag stays drawn until its result arrives.
  useEffect(() => {
    if (live.current?.committed) live.current = null;
  }, [processed]);

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      render(canvas, view.current, inputs.current);
      // For the app tests: where the paper is on screen, and the arranged box (mm).
      const v = view.current;
      canvas.dataset['view'] = `${v.scale},${v.x},${v.y}`;
      const a = inputs.current.arrange;
      const l = inputs.current.live.current;
      const frame =
        a &&
        (l && l.target === a.target
          ? l.frame
          : a.target === null
            ? a.data.art
            : a.data.frames[a.target]);
      canvas.dataset['arrangeBox'] = frame ? JSON.stringify(frameBox(frame)) : '';
      canvas.dataset['arrangeFrame'] = frame ? JSON.stringify(frame) : '';
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

  // Redraw when inputs change (and the colours, with light / dark).
  const scheme = useColorScheme();
  useEffect(draw, [
    draw,
    scheme,
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
    arrangeInfo,
    arrangeTarget,
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
    type ArrangeDrag = { handle: FrameHandle; start: Frame; target: string | null; p0: Vec2 };
    let drag: { x: number; y: number; adjust: boolean; arrange?: ArrangeDrag } | null = null;
    let space = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') space = e.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    const toPaper = (e: PointerEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      const v = view.current;
      return {
        x: (e.clientX - rect.left - v.x) / v.scale,
        y: (e.clientY - rect.top - v.y) / v.scale,
      };
    };
    /** What a press in arrange mode grabs: a handle, a layer, all layers, or nothing. */
    const arrangeGrab = (e: PointerEvent): ArrangeDrag | null => {
      const a = inputs.current.arrange;
      const processed = inputs.current.processed;
      if (!a || !processed || e.button !== 0 || space) return null;
      const p = toPaper(e);
      const tol = GRAB_PX / view.current.scale;
      const stalk = STALK_PX / view.current.scale;
      const frame = (t: string | null) => (t === null ? a.data.art : a.data.frames[t]) ?? null;
      const current = frame(a.target);
      const h = current ? frameHandleAt(current, p, tol, stalk) : null;
      if (current && h && h !== 'move')
        return { handle: h, start: current, target: a.target, p0: p };
      const hit = layerAt(processed.placed.layers, a.data.boxes, p, tol);
      if (hit && a.data.frames[hit]) {
        if (hit !== a.target) useStore.getState().setArrangeTarget(hit);
        return { handle: 'move', start: a.data.frames[hit], target: hit, p0: p };
      }
      if (current && h === 'move')
        return { handle: 'move', start: current, target: a.target, p0: p };
      const paper = paperSize(inputs.current.page);
      const art = a.data.art;
      if (art && p.x >= 0 && p.y >= 0 && p.x <= paper.width && p.y <= paper.height) {
        // Empty paper, with more than one layer: all of them together.
        useStore.getState().setArrangeTarget(null);
        if (frameHandleAt(art, p, tol, stalk) === 'move')
          return { handle: 'move', start: art, target: null, p0: p };
      }
      return null;
    };
    const onDown = (e: PointerEvent) => {
      const adjust = inputs.current.guide !== null || inputs.current.spiral !== null;
      const arrange = arrangeGrab(e) ?? undefined;
      drag = { x: e.clientX, y: e.clientY, adjust, arrange };
      if (adjust) beginGesture();
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) {
        // Arrange mode: show what a press would do.
        const a = inputs.current.arrange;
        if (!a) return;
        const current = a.target === null ? a.data.art : a.data.frames[a.target];
        const k = view.current.scale;
        const h = current ? frameHandleAt(current, toPaper(e), GRAB_PX / k, STALK_PX / k) : null;
        canvas.style.cursor = current && h ? frameCursor(current, h) : '';
        return;
      }
      if (drag.arrange) {
        const { handle, start, target, p0 } = drag.arrange;
        const p = toPaper(e);
        const a = inputs.current.arrange;
        // A group with layers turned off-axis can only be scaled in proportion.
        const free = e.shiftKey && !(target === null && a?.data.offAxis);
        const o = { keepRatio: !free, fromCenter: e.altKey };
        let frame = dragFrame(start, handle, p0, p, o);
        let guides: Guides = { xs: [], ys: [] };
        if (handle === 'rotate') {
          frame = { ...frame, rot: snapAngle(frame.rot, { step15: e.shiftKey, off: e.metaKey }) };
        } else if (!e.metaKey && a && (handle === 'move' || Math.abs(frame.rot) < 1e-9)) {
          // Snap the box it takes up on the paper (resizing only when it isn't turned).
          const others = Object.entries(a.data.boxes)
            .filter(([id]) => target !== null && id !== target)
            .map(([, b]) => b);
          const box = frameBox(frame);
          const snapped = snapBox(
            box,
            frameBox(start),
            handle,
            snapTargets(inputs.current.page, others),
            SNAP_PX / view.current.scale,
            o,
          );
          frame =
            handle === 'move'
              ? {
                  ...frame,
                  cx: frame.cx + snapped.box.minX - box.minX,
                  cy: frame.cy + snapped.box.minY - box.minY,
                }
              : frameOfBox(snapped.box);
          guides = snapped.guides;
        }
        live.current = {
          target,
          from: start,
          frame,
          guides,
          committed: false,
          turning: handle === 'rotate',
        };
        draw();
        return;
      }
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
      const l = live.current;
      const processed = inputs.current.processed;
      if (drag?.arrange && l && !l.committed && processed) {
        if (commitArrange(processed, l.target, l.from, l.frame))
          live.current = { ...l, guides: { xs: [], ys: [] }, committed: true, turning: false };
        else live.current = null;
        draw();
      }
      drag = null;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
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

  // Esc ends adjusting and arranging; in arrange mode the arrow keys nudge (Shift: 10 mm).
  const adjusting = adjustStepId !== null || adjustSpiralId !== null || arrangeOn;
  useEffect(() => {
    if (!adjusting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setAdjustStep(null);
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = arrows[e.key];
      const a = inputs.current.arrange;
      const processed = inputs.current.processed;
      const typing = (e.target as HTMLElement).closest('input, select, textarea, [role=separator]');
      if (!dir || !a || !processed || typing) return;
      e.preventDefault();
      const l = live.current;
      const pending = l?.target === a.target && l.committed ? l.frame : null;
      // Measured from what's drawn now (a nudge before the last one's result arrives adds up).
      const base = a.target === null ? a.data.art : a.data.frames[a.target];
      const start = pending ?? base;
      if (!start || !base) return;
      const step = e.shiftKey ? 10 : 1;
      const frame = { ...start, cx: start.cx + dir[0] * step, cy: start.cy + dir[1] * step };
      if (commitArrange(processed, a.target, base, frame)) {
        live.current = {
          target: a.target,
          from: base,
          frame,
          guides: { xs: [], ys: [] },
          committed: true,
        };
        draw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adjusting, draw]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${guide || spiral ? styles.adjusting : ''} ${
          arrangeOn ? styles.arranging : ''
        }`}
        data-testid="preview"
      />
      {adjustStepId && <AdjustBar ready={guide !== null} />}
      {arrangeOn && <ArrangeBar />}
      {adjustSpiralId && (
        <AdjustBar
          ready={spiral !== null}
          text="Drag to move the center"
          notReady="Choose a Spiral or Ripples fill for this layer to place its center."
        />
      )}
      <PlaybackBar />
      <ViewToggles />
      <div className={styles.zoom}>
        <button onClick={() => zoomButton(1 / 1.25)} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <button onClick={fit} title="Fit (F)">
          Fit
        </button>
        <button onClick={() => zoomButton(1.25)} title="Zoom in" aria-label="Zoom in">
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

function ArrangeButton() {
  const on = useStore((s) => s.arrange.on);
  const setArrange = useStore((s) => s.setArrange);
  const hasDoc = useStore((s) => s.doc !== null);
  return (
    <button
      className={`${styles.playButton} ${on ? styles.on : ''}`}
      aria-pressed={on}
      disabled={!hasDoc}
      onClick={() => setArrange(!on)}
      title="Move and resize layers by dragging"
    >
      ✥ Arrange
    </button>
  );
}

/** Shown in arrange mode: what's selected and how to move it. */
function ArrangeBar() {
  const target = useStore((s) => s.arrange.target);
  const name = useStore((s) =>
    target === null ? null : (s.doc?.layers.find((l) => l.id === target)?.name ?? null),
  );
  const setArrange = useStore((s) => s.setArrange);
  const several = useStore(
    (s) => (s.doc?.layers.filter((l) => !s.layerOverrides[l.id]?.removed).length ?? 0) > 1,
  );
  return (
    <div className={`${styles.adjustBar} ${styles.arrangeBar}`} role="status">
      <span>
        <strong>{name ?? 'All layers'}</strong> · drag to move · squares resize (⇧ free, ⌥ from
        center) · circle turns (⇧ 15°) ·{' '}
        {several ? (name ? 'paper: all layers · ' : 'click a layer for one · ') : ''}
        arrows nudge · ⌘ no snapping
      </span>
      <button onClick={() => setArrange(false)}>Done</button>
    </div>
  );
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
      <ArrangeButton />
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
  /** Arrange mode: what's selected and the boxes; `live` is a drag in progress. */
  arrange: { target: string | null; data: ArrangeData } | null;
  live: { current: LiveArrange | null };
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
  { processed, page, options, bed, pen, playbackT, guide, spiral, arrange, live }: RenderInput,
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
  // A drag in arrange mode moves what's drawn until the new result arrives.
  const drag = live.current;
  const moved = drag && new DOMMatrix([...frameMatrix(drag.from, drag.frame)]);
  if (playbackT === null) {
    for (const lt of processed.toolpath.layers) {
      const layer = visible.get(lt.layerId);
      if (!layer?.visible) continue;
      ctx.strokeStyle = layer.color;
      // Pass copies move with the layer they came from.
      const origin = layer.passOf?.layerId ?? layer.id;
      if (moved && (drag.target === null || drag.target === origin)) {
        const p = new Path2D();
        p.addPath(cachedPath(lt.paths), moved);
        ctx.stroke(p);
      } else ctx.stroke(cachedPath(lt.paths));
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

  if (arrange) drawArrange(ctx, arrange, drag, paper, px);

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

/** Arrange mode: the selected frame with its handles, and snap guides while dragging. */
function drawArrange(
  ctx: CanvasRenderingContext2D,
  arrange: { target: string | null; data: ArrangeData },
  drag: LiveArrange | null,
  paper: { width: number; height: number },
  px: number,
) {
  const accent = cssVar('--accent');
  const outline = (f: Frame) => {
    ctx.beginPath();
    addPath(ctx, frameCorners(f), true);
    ctx.stroke();
  };
  const current = arrange.target === null ? arrange.data.art : arrange.data.frames[arrange.target];
  const frame = drag && drag.target === arrange.target ? drag.frame : current;
  ctx.save();
  // Other layers: faint outlines, so it's clear what can be picked.
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = px;
  ctx.setLineDash([2 * px, 3 * px]);
  if (arrange.target !== null)
    for (const [id, f] of Object.entries(arrange.data.frames))
      if (id !== arrange.target) outline(f);
  ctx.globalAlpha = 1;
  if (frame) {
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([5 * px, 3 * px]);
    outline(frame);
    ctx.setLineDash([]);
    // The rotate handle, on a stalk above the middle of the top side.
    const top = frameHandles(frame).find((x) => x.handle === 'n')!.at;
    const knob = rotateHandle(frame, STALK_PX * px);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(knob.x, knob.y);
    ctx.stroke();
    ctx.fillStyle = cssVar('--paper');
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, 4.5 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const s = 7 * px;
    ctx.fillStyle = cssVar('--paper');
    for (const { at } of frameHandles(frame)) {
      ctx.fillRect(at.x - s / 2, at.y - s / 2, s, s);
      ctx.strokeRect(at.x - s / 2, at.y - s / 2, s, s);
    }
    if (drag?.turning) {
      ctx.fillStyle = accent;
      ctx.font = `${12 * px}px system-ui, sans-serif`;
      ctx.fillText(`${Math.round(frame.rot * 10) / 10}°`, knob.x + 9 * px, knob.y - 6 * px);
    }
  }
  if (drag && !drag.committed) {
    ctx.strokeStyle = cssVar('--danger');
    ctx.lineWidth = px;
    ctx.beginPath();
    for (const x of drag.guides.xs) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, paper.height);
    }
    for (const y of drag.guides.ys) {
      ctx.moveTo(0, y);
      ctx.lineTo(paper.width, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

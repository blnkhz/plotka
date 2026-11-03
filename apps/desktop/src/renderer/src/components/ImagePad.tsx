import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ditherGrid,
  ditherSvg,
  type DitherMethod,
  type DitherResult,
  type MarkShape,
} from '@plotter-studio/core';
import { useThemeKey } from '../lib/useThemeKey';
import { useStore } from '../store';
import { NumberField, Row, Section } from './controls';
// Same layout as the doodle pad: header, stage, settings on the right.
import styles from './DoodlePad.module.css';

const SHAPES: { value: MarkShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot (a pen tap)' },
  { value: 'line', label: 'Line' },
  { value: 'x', label: '×' },
  { value: 'plus', label: '+' },
];

/** Points per canvas stroke when drawing the marks. */
const STROKE_BATCH = 20_000;

const METHOD_HINTS: Record<DitherMethod, string> = {
  ordered: 'A tidy, regular pattern of marks.',
  diffusion: 'Marks scattered organically, like film grain.',
  halftone: 'A mark in every cell, bigger where the picture is darker.',
};

/**
 * The picture drawn into a canvas the size of the grid, so each cell gets the average colour of
 * its area. Big reductions go down by halves first, which keeps that average fair.
 */
function sample(bitmap: ImageBitmap, cols: number, rows: number): Uint8ClampedArray {
  let src: CanvasImageSource = bitmap;
  let w = bitmap.width;
  let h = bitmap.height;
  while (w / 2 >= cols * 2 && h / 2 >= rows * 2) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const half = new OffscreenCanvas(w, h);
    const c = half.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, w, h);
    src = half;
  }
  const out = new OffscreenCanvas(cols, rows);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cols, rows);
  return ctx.getImageData(0, 0, cols, rows).data;
}

/** Turns a picture into a grid of pen marks (dithering), with a live preview. */
export function ImagePad() {
  const image = useStore((s) => s.image);
  const setImage = useStore((s) => s.setImage);
  const set = useStore((s) => s.setImageSettings);
  const applyImage = useStore((s) => s.applyImage);
  const { bytes, name, settings } = image;
  const [decoded, setDecoded] = useState<{ bytes: Uint8Array; bitmap: ImageBitmap } | null>(null);
  const [failed, setFailed] = useState<Uint8Array | null>(null);
  const [showPicture, setShowPicture] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Decode once per image (the browser reads PNG, JPEG, WebP, GIF, BMP).
  useEffect(() => {
    if (!bytes) return;
    let alive = true;
    createImageBitmap(new Blob([bytes as BlobPart]))
      .then((bitmap) => alive && setDecoded({ bytes, bitmap }))
      .catch(() => alive && setFailed(bytes));
    return () => {
      alive = false;
    };
  }, [bytes]);
  const bitmap = decoded?.bytes === bytes ? decoded.bitmap : null;
  const error = failed === bytes && bytes ? `“${name}” can't be read as an image.` : null;

  // Dithering a big picture takes a while, so it runs in a worker: the pad stays live and shows
  // that it's working. A change while a run is busy stops it and starts over with the latest.
  type Run = { bitmap: ImageBitmap; settings: typeof settings };
  type Done = Run & ({ result: DitherResult; error?: never } | { result?: never; error: string });
  const [done, setDone] = useState<Done | null>(null);
  const job = useRef<{ worker: Worker | null; busy: boolean; id: number; run: Run | null }>({
    worker: null,
    busy: false,
    id: 0,
    run: null,
  });
  useEffect(() => () => job.current.worker?.terminate(), []);
  useEffect(() => {
    if (!bitmap) return;
    const j = job.current;
    const id = ++j.id;
    const grid = ditherGrid(bitmap.width, bitmap.height, settings);
    const pixels = sample(bitmap, grid.cols, grid.rows);
    if (j.busy && j.worker) {
      j.worker.terminate();
      j.worker = null;
    }
    if (!j.worker) {
      const w = new Worker(new URL('../workers/dither.worker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (e: MessageEvent<{ id: number; result?: DitherResult; error?: string }>) => {
        j.busy = false;
        if (e.data.id !== j.id || !j.run) return; // a newer run was started
        const run = j.run;
        if (e.data.result) setDone({ ...run, result: e.data.result });
        else setDone({ ...run, error: `Dithering failed: ${e.data.error}` });
      };
      w.onerror = (e) => {
        j.busy = false;
        if (j.run) setDone({ ...j.run, error: `Dithering failed: ${e.message}` });
      };
      j.worker = w;
    }
    j.busy = true;
    j.run = { bitmap, settings };
    j.worker.postMessage({ id, pixels, grid, settings }, [pixels.buffer]);
  }, [bitmap, settings]);
  // The last marks for this picture stay on screen (dimmed) while new ones are worked out.
  const [shown, setShown] = useState<{ bitmap: ImageBitmap; result: DitherResult } | null>(null);
  if (done?.result && shown?.result !== done.result)
    setShown({ bitmap: done.bitmap, result: done.result });
  const result = shown && shown.bitmap === bitmap ? shown.result : null;
  const working = !!bitmap && (done?.bitmap !== bitmap || done.settings !== settings);
  const ditherError = !working && done?.error ? done.error : null;

  const close = useCallback(() => setImage({ open: false }), [setImage]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css.getPropertyValue('--canvas').trim() || '#e5e5e0';
    ctx.fillRect(0, 0, w, h);
    if (!result) return;
    const { width, height } = result.grid;
    const pad = 24;
    const scale = Math.max(1e-6, Math.min((w - 2 * pad) / width, (h - 2 * pad) / height));
    const ox = (w - width * scale) / 2;
    const oy = (h - height * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.fillStyle = css.getPropertyValue('--paper').trim() || '#fff';
    ctx.fillRect(0, 0, width, height);
    if (showPicture && bitmap) {
      ctx.globalAlpha = 0.25;
      ctx.drawImage(bitmap, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#111';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A 0.3 mm pen, but never thinner than a screen pixel.
    ctx.lineWidth = Math.max(0.3, 1 / scale);
    // Stroked in batches: one path with millions of points takes the canvas minutes to draw.
    let path = new Path2D();
    let points = 0;
    for (const m of result.marks) {
      path.moveTo(m.points[0]!.x, m.points[0]!.y);
      for (let i = 1; i < m.points.length; i++) path.lineTo(m.points[i]!.x, m.points[i]!.y);
      if (m.closed) path.closePath();
      points += m.points.length;
      if (points >= STROKE_BATCH) {
        ctx.stroke(path);
        path = new Path2D();
        points = 0;
      }
    }
    if (points) ctx.stroke(path);
  }, [result, showPicture, bitmap]);
  const themeKey = useThemeKey();
  useEffect(draw, [draw, themeKey]);
  // Redraw on resize with the latest draw, without re-observing (which draws again) on each change.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const grid = result?.grid;
  const svg = () => (result ? ditherSvg(result, name) : '');

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Image">
      <header className={styles.header}>
        <strong>Image</strong>
        <span className={styles.muted}>
          {error ??
            ditherError ??
            (grid
              ? `${name} → ${result.marks.length.toLocaleString()} marks · ${grid.cols} × ${grid.rows} grid · ${grid.width.toFixed(0)} × ${grid.height.toFixed(0)} mm`
              : bitmap
                ? 'Dithering…'
                : 'Reading the image…')}
        </span>
        {working && grid && (
          <span className={styles.working} role="status">
            Dithering…
          </span>
        )}
        <span className={styles.spacer} />
        {saved && <span className={styles.muted}>Saved {saved}</span>}
        <button
          disabled={!result || working}
          onClick={async () => {
            const base = name.replace(/\.[^.]+$/, '') || 'Image';
            const path = await window.api.invoke('file:saveText', `${base} (dithered).svg`, svg(), [
              '.svg',
            ]);
            if (path) setSaved(path.split('/').pop() ?? path);
          }}
        >
          Save SVG…
        </button>
        <button onClick={close}>Cancel</button>
        <button
          className={styles.primary}
          disabled={!result?.marks.length || working}
          onClick={() => void applyImage(svg())}
        >
          Use image
        </button>
      </header>
      <div className={styles.body}>
        <div className={styles.stage} ref={wrapRef}>
          <canvas
            ref={canvasRef}
            data-testid="image-canvas"
            className={working ? styles.stale : undefined}
          />
          {(working || (!result && !error && !ditherError)) && (
            <div className={styles.busy} aria-hidden="true">
              <span className={styles.spinner} />
              {bitmap ? 'Dithering…' : 'Reading the image…'}
            </div>
          )}
        </div>
        <aside className={styles.side}>
          <Section title="Size" help="opening-artwork#images">
            <Row label="Width">
              <NumberField
                value={settings.width}
                min={10}
                max={2000}
                step={5}
                suffix="mm"
                onChange={(width) => set({ width })}
              />
            </Row>
            <Row label="Cell">
              <NumberField
                value={settings.cell}
                min={0.2}
                max={20}
                step={0.1}
                suffix="mm"
                title="The grid's spacing: one mark at most per cell"
                onChange={(cell) => set({ cell })}
              />
            </Row>
            {grid?.capped && (
              <p className={styles.note} role="status">
                That many cells would take very long to plot: the cells are {grid.cell.toFixed(2)}{' '}
                mm instead.
              </p>
            )}
          </Section>
          <Section title="Tone">
            <Row label="Brightness">
              <input
                type="range"
                aria-label="Brightness"
                min={-100}
                max={100}
                value={settings.brightness}
                onChange={(e) => set({ brightness: Number(e.target.value) })}
              />
              <span className={styles.muted}>{settings.brightness}</span>
            </Row>
            <Row label="Contrast">
              <input
                type="range"
                aria-label="Contrast"
                min={0.2}
                max={3}
                step={0.05}
                value={settings.contrast}
                onChange={(e) => set({ contrast: Number(e.target.value) })}
              />
              <span className={styles.muted}>{settings.contrast.toFixed(2)}</span>
            </Row>
            <Row label="">
              <label className={styles.check} title="Mark the light parts instead of the dark ones">
                <input
                  type="checkbox"
                  checked={settings.invert}
                  onChange={(e) => set({ invert: e.target.checked })}
                />
                Invert (for light ink on dark paper)
              </label>
            </Row>
          </Section>
          <Section title="Dithering">
            <Row label="Method">
              <select
                aria-label="Method"
                value={settings.method}
                onChange={(e) => set({ method: e.target.value as DitherMethod })}
              >
                <option value="ordered">Ordered</option>
                <option value="diffusion">Diffusion</option>
                <option value="halftone">Halftone</option>
              </select>
            </Row>
            <p className={styles.hint}>{METHOD_HINTS[settings.method]}</p>
            {settings.method === 'halftone' && settings.shape === 'dot' && (
              <p className={styles.note} role="status">
                Dots are all one size, so they’re placed like Ordered. Pick another shape for marks
                that grow with the dark.
              </p>
            )}
          </Section>
          <Section title="Marks">
            <Row label="Shape">
              <select
                aria-label="Mark shape"
                value={settings.shape}
                onChange={(e) => set({ shape: e.target.value as MarkShape })}
              >
                {SHAPES.map((sh) => (
                  <option key={sh.value} value={sh.value}>
                    {sh.label}
                  </option>
                ))}
              </select>
            </Row>
            {settings.shape !== 'dot' && (
              <Row label="Size">
                <input
                  type="range"
                  aria-label="Mark size"
                  min={10}
                  max={100}
                  step={5}
                  value={settings.markSize}
                  onChange={(e) => set({ markSize: Number(e.target.value) })}
                />
                <span className={styles.muted}>
                  {settings.method === 'halftone' ? 'up to ' : ''}
                  {settings.markSize}% of a cell
                </span>
              </Row>
            )}
            {settings.shape === 'line' && (
              <Row label="Angle">
                <NumberField
                  value={settings.lineAngle}
                  min={-180}
                  max={180}
                  step={15}
                  suffix="°"
                  onChange={(lineAngle) => set({ lineAngle })}
                />
              </Row>
            )}
            <Row label="">
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showPicture}
                  onChange={(e) => setShowPicture(e.target.checked)}
                />
                Show the picture underneath
              </label>
            </Row>
          </Section>
        </aside>
      </div>
    </div>
  );
}

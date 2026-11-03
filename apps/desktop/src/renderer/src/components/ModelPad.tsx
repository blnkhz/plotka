import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  HemisphereLight,
  DirectionalLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  sliceMesh,
  sliceModel,
  sliceNormal,
  sliceSvg,
  type SliceAxis,
  type SliceResult,
} from '@plotka/core';
import { loadMesh, ModelError } from '../lib/modelFiles';
import { useThemeKey } from '../lib/useThemeKey';
import { useStore } from '../store';
import { NumberField, Row, Section, Segmented } from './controls';
// Same layout as the doodle pad: header, stage, settings on the right.
import styles from './DoodlePad.module.css';
import own from './ModelPad.module.css';

const FOV = 35;
/** The model fits in a 2-unit box, so its bounding sphere is at most √3. */
const RADIUS = Math.sqrt(3);

/** How far the camera stands so the whole model fits a view of this shape, with a margin. */
function fitDistance(aspect: number) {
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  return (RADIUS / Math.min(t, t * aspect)) * 1.08;
}

type Preset = 'front' | 'side' | 'top' | 'quarter';
const PRESETS: { id: Preset; label: string; dir: [number, number, number] }[] = [
  { id: 'front', label: 'Front', dir: [0, 0, 1] },
  { id: 'side', label: 'Side', dir: [1, 0, 0] },
  { id: 'top', label: 'Top', dir: [0, 1, 0.0001] },
  { id: 'quarter', label: '¾', dir: [0.62, 0.45, 0.64] },
];

const AXES: { value: SliceAxis; label: string }[] = [
  { value: 'y', label: 'Horizontal (Y)' },
  { value: 'x', label: 'Vertical, side to side (X)' },
  { value: 'z', label: 'Vertical, front to back (Z)' },
];

/** The three.js pieces of the 3D view, made once per open pad. */
type View3D = {
  renderer: WebGLRenderer;
  scene: Scene;
  persp: PerspectiveCamera;
  ortho: OrthographicCamera;
  controls: OrbitControls;
  mesh: Mesh;
  slices: LineSegments;
};

/** Turns a 3D model into parallel slices, drawn as seen from the view you choose. */
export function ModelPad() {
  const model = useStore((s) => s.model);
  const setModel = useStore((s) => s.setModel);
  const set = useStore((s) => s.setModelSettings);
  const applyModel = useStore((s) => s.applyModel);
  const { bytes, name, settings } = model;

  // --- reading the file ---
  const [loaded, setLoaded] = useState<{ bytes: Uint8Array; positions: Float32Array } | null>(null);
  const [failed, setFailed] = useState<{ bytes: Uint8Array; message: string } | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let alive = true;
    loadMesh(bytes, name)
      .then((positions) => alive && setLoaded({ bytes, positions }))
      .catch(
        (e: unknown) =>
          alive &&
          setFailed({
            bytes,
            message: e instanceof ModelError ? e.message : `“${name}” can't be read.`,
          }),
      );
    return () => {
      alive = false;
    };
  }, [bytes, name]);
  const positions = loaded?.bytes === bytes ? loaded.positions : null;
  const error = failed?.bytes === bytes ? failed.message : null;
  const triangles = positions ? positions.length / 9 : 0;

  // --- the 3D view ---
  const viewRef = useRef<HTMLDivElement>(null);
  const three = useRef<View3D | null>(null);
  const [cameraTick, setCameraTick] = useState(0);
  const camera = useCallback(
    () =>
      three.current &&
      (settings.projection === 'orthographic' ? three.current.ortho : three.current.persp),
    [settings.projection],
  );

  const render = useCallback(() => {
    const t = three.current;
    if (!t) return;
    // The flat camera follows the orbiting one; its size matches what the perspective one sees
    // at the model's centre, so switching keeps the framing.
    const d = t.persp.position.distanceTo(t.controls.target);
    t.persp.near = Math.max(0.01, d - RADIUS * 1.2);
    t.persp.far = d + RADIUS * 1.2;
    t.persp.updateProjectionMatrix();
    const half = d * Math.tan(((FOV / 2) * Math.PI) / 180);
    const aspect = t.persp.aspect;
    t.ortho.left = -half * aspect;
    t.ortho.right = half * aspect;
    t.ortho.top = half;
    t.ortho.bottom = -half;
    t.ortho.near = t.persp.near;
    t.ortho.far = t.persp.far;
    t.ortho.position.copy(t.persp.position);
    t.ortho.quaternion.copy(t.persp.quaternion);
    t.ortho.updateProjectionMatrix();
    t.ortho.updateMatrixWorld();
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
    t.renderer.setClearColor(new Color(bg || '#e4e4e0'));
    t.renderer.render(t.scene, settings.projection === 'orthographic' ? t.ortho : t.persp);
  }, [settings.projection]);

  // Set up once.
  useEffect(() => {
    const host = viewRef.current;
    if (!host) return;
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.domElement.dataset['testid'] = 'model-view';
    renderer.domElement.setAttribute('aria-label', '3D view: drag to turn the model');
    host.appendChild(renderer.domElement);
    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x888888, 2.2));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const persp = new PerspectiveCamera(FOV, 1, 0.1, 100);
    const ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 30;
    const mesh = new Mesh(
      new BufferGeometry(),
      new MeshLambertMaterial({
        color: 0xeeeeea,
        // Both sides: files often have faces wound the wrong way round.
        side: DoubleSide,
        // Pushed back a little, so the slice lines on its surface show through.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    const slices = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0x2f6fde }),
    );
    scene.add(mesh, slices);
    three.current = { renderer, scene, persp, ortho, controls, mesh, slices };

    const saved = useStore.getState().model.camera;
    if (saved) {
      persp.position.set(...saved.position);
      controls.target.set(...saved.target);
    }
    let framed = !!saved;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      // The first view waits for the pane's size, so the model fits it.
      if (!framed) {
        framed = true;
        persp.position.set(...scaled(PRESETS[3]!.dir, fitDistance(w / h)));
      }
      controls.update();
      setCameraTick((n) => n + 1);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // Redraw while turning; re-slice and remember the view when it stops.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const onChange = () => render();
    const onEnd = () => {
      const p = t.persp.position;
      const g = t.controls.target;
      setModel({ camera: { position: [p.x, p.y, p.z], target: [g.x, g.y, g.z] } });
      setCameraTick((n) => n + 1);
    };
    t.controls.addEventListener('change', onChange);
    t.controls.addEventListener('end', onEnd);
    render();
    return () => {
      t.controls.removeEventListener('change', onChange);
      t.controls.removeEventListener('end', onEnd);
    };
  }, [render, setModel]);

  // The model in the 3D view.
  useEffect(() => {
    const t = three.current;
    if (!t || !positions) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.computeVertexNormals();
    t.mesh.geometry.dispose();
    t.mesh.geometry = g;
    render();
  }, [positions, render]);

  // The slices on the model (all of them; the result hides what's behind).
  const chains = useMemo(
    () =>
      positions
        ? sliceMesh(
            { positions },
            Math.round(settings.lines),
            sliceNormal(settings.axis, settings.tilt),
          )
        : [],
    [positions, settings.lines, settings.axis, settings.tilt],
  );
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const seg: number[] = [];
    for (const c of chains) {
      const pts = c.closed ? [...c.points, c.points[0]!] : c.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(seg), 3));
    t.slices.geometry.dispose();
    t.slices.geometry = g;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    (t.slices.material as LineBasicMaterial).color = new Color(accent || '#2f6fde');
    render();
  }, [chains, render]);

  // --- the result, as it will be plotted ---
  const [result, setResult] = useState<SliceResult | null>(null);
  useEffect(() => {
    if (!positions) return;
    // Let the view settle (and the pad paint) before working it out.
    const timer = setTimeout(() => {
      const t = three.current;
      const cam = camera();
      if (!t || !cam) return;
      render();
      cam.updateMatrixWorld();
      setResult(
        sliceModel({ positions }, settings, {
          view: cam.matrixWorldInverse.elements,
          projection: cam.projectionMatrix.elements,
          aspect: t.persp.aspect,
        }),
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [positions, settings, cameraTick, camera, render]);

  const resultRef = useRef<HTMLCanvasElement>(null);
  const resultWrap = useRef<HTMLDivElement>(null);
  const drawResult = useCallback(() => {
    const canvas = resultRef.current;
    const wrap = resultWrap.current;
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
    if (!result?.lines.length) return;
    const pad = 20;
    const k = Math.min((w - 2 * pad) / result.width, (h - 2 * pad) / result.height);
    const ox = (w - result.width * k) / 2;
    const oy = (h - result.height * k) / 2;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    ctx.fillStyle = css.getPropertyValue('--paper').trim() || '#fff';
    ctx.fillRect(-4, -4, result.width + 8, result.height + 8);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(0.3, 1 / k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const l of result.lines) {
      ctx.moveTo(l.points[0]!.x, l.points[0]!.y);
      for (let i = 1; i < l.points.length; i++) ctx.lineTo(l.points[i]!.x, l.points[i]!.y);
      if (l.closed) ctx.closePath();
    }
    ctx.stroke();
  }, [result]);
  const themeKey = useThemeKey();
  useEffect(drawResult, [drawResult, themeKey]);
  // The 3D view's background follows the theme too.
  useEffect(() => render(), [render, themeKey]);
  useEffect(() => {
    const ro = new ResizeObserver(drawResult);
    if (resultWrap.current) ro.observe(resultWrap.current);
    return () => ro.disconnect();
  }, [drawResult]);

  const goTo = (dir: [number, number, number]) => {
    const t = three.current;
    if (!t) return;
    t.controls.target.set(0, 0, 0);
    t.persp.position.set(...scaled(dir, fitDistance(t.persp.aspect)));
    t.controls.update();
    const p = t.persp.position;
    setModel({ camera: { position: [p.x, p.y, p.z], target: [0, 0, 0] } });
    setCameraTick((n) => n + 1);
  };

  const close = useCallback(() => setModel({ open: false }), [setModel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  const svg = () => (result ? sliceSvg(result, name) : '');
  const status =
    error ??
    (!positions
      ? 'Reading the model…'
      : result && !result.lines.length
        ? `${name}: nothing to draw from this view (every slice is hidden or outside it)`
        : `${name} → ${result?.lines.length.toLocaleString() ?? '…'} lines · ${triangles.toLocaleString()} triangles` +
          (result ? ` · ${result.width.toFixed(0)} × ${result.height.toFixed(0)} mm` : ''));

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="3D model">
      <header className={styles.header}>
        <strong>3D model</strong>
        <span className={styles.muted}>{status}</span>
        <span className={styles.spacer} />
        <SaveSvg name={name} svg={svg} disabled={!result?.lines.length} />
        <button onClick={close}>Cancel</button>
        <button
          className={styles.primary}
          disabled={!result?.lines.length}
          onClick={() => void applyModel(svg())}
        >
          Use model
        </button>
      </header>
      <div className={styles.body}>
        <div className={own.stage}>
          <div className={own.pane}>
            <div className={own.view} ref={viewRef} />
            <span className={own.caption}>Drag to turn · right-drag to move · scroll to zoom</span>
          </div>
          <div className={own.pane} ref={resultWrap}>
            <canvas ref={resultRef} data-testid="model-result" />
            <span className={own.caption}>As it will be plotted</span>
          </div>
        </div>
        <aside className={styles.side}>
          <Section title="Slices" help="opening-artwork#3d-models">
            <Row label="Lines">
              <NumberField
                value={settings.lines}
                min={2}
                max={500}
                step={5}
                digits={0}
                onChange={(lines) => set({ lines: Math.round(lines) })}
              />
            </Row>
            <Row label="Direction">
              <select
                aria-label="Slice direction"
                value={settings.axis}
                onChange={(e) => set({ axis: e.target.value as SliceAxis })}
              >
                {AXES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Tilt">
              <NumberField
                value={settings.tilt}
                min={-89}
                max={89}
                step={5}
                suffix="°"
                onChange={(tilt) => set({ tilt })}
              />
            </Row>
          </Section>
          <Section title="Show">
            <Segmented
              value={settings.mode}
              options={[
                {
                  value: 'visible',
                  label: 'Visible part',
                  title: 'Leave out what’s behind the model, so it looks solid',
                },
                { value: 'full', label: 'Full mesh', title: 'Every line, the back too' },
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Section>
          <Section title="View">
            <Row label="Projection">
              <Segmented
                value={settings.projection}
                options={[
                  { value: 'perspective', label: 'Perspective' },
                  {
                    value: 'orthographic',
                    label: 'Flat',
                    title: 'No perspective: parallel stays parallel',
                  },
                ]}
                onChange={(projection) => set({ projection })}
              />
            </Row>
            <div className={own.presets}>
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => goTo(p.dir)} title={`${p.label} view`}>
                  {p.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Size">
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
          </Section>
        </aside>
      </div>
    </div>
  );
}

const scaled = (d: [number, number, number], k: number): [number, number, number] => {
  const v = new Vector3(...d).normalize().multiplyScalar(k);
  return [v.x, v.y, v.z];
};

function SaveSvg({ name, svg, disabled }: { name: string; svg: () => string; disabled: boolean }) {
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <>
      {saved && <span className={styles.muted}>Saved {saved}</span>}
      <button
        disabled={disabled}
        onClick={async () => {
          const base = name.replace(/\.[^.]+$/, '') || 'Model';
          const path = await window.api.invoke('file:saveText', `${base} (sliced).svg`, svg(), [
            '.svg',
          ]);
          if (path) setSaved(path.split('/').pop() ?? path);
        }}
      >
        Save SVG…
      </button>
    </>
  );
}

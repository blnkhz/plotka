import type { Vec2 } from '../geometry/vec2';

/**
 * Uniform grid over points for nearest-neighbor queries with removal.
 * Each entry has an id; `nearest` skips removed ids.
 */
export class PointGrid {
  private cells = new Map<number, number[]>();
  private removed: Uint8Array;
  private minX: number;
  private minY: number;
  private cols: number;
  private rows: number;
  private remaining: number;

  constructor(
    private points: Vec2[],
    cellSize?: number,
  ) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!points.length) minX = minY = maxX = maxY = 0;
    const w = Math.max(maxX - minX, 1e-6);
    const h = Math.max(maxY - minY, 1e-6);
    const size = cellSize ?? Math.max(Math.sqrt((w * h) / Math.max(points.length, 1)), 1e-3);
    this.cell = size;
    this.minX = minX;
    this.minY = minY;
    this.cols = Math.max(1, Math.ceil(w / size) + 1);
    this.rows = Math.max(1, Math.ceil(h / size) + 1);
    this.removed = new Uint8Array(points.length);
    this.remaining = points.length;
    points.forEach((p, i) => {
      const key = this.key(this.cx(p.x), this.cy(p.y));
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
    });
  }

  readonly cell: number;

  get size(): number {
    return this.remaining;
  }

  private cx = (x: number) =>
    Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  private cy = (y: number) =>
    Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cell)));
  private key = (cx: number, cy: number) => cy * this.cols + cx;

  remove(id: number): void {
    if (!this.removed[id]) {
      this.removed[id] = 1;
      this.remaining--;
    }
  }

  isRemoved(id: number): boolean {
    return this.removed[id] === 1;
  }

  /** Nearest remaining point to q, optionally within maxDist. Returns its id or -1. */
  nearest(q: Vec2, maxDist = Infinity, accept?: (id: number) => boolean): number {
    if (this.remaining === 0) return -1;
    const qx = this.cx(q.x);
    const qy = this.cy(q.y);
    // Distance from q to the grid's own cell coordinates, so queries outside the grid work.
    const outside = Math.max(
      0,
      this.minX - q.x,
      q.x - (this.minX + this.cols * this.cell),
      this.minY - q.y,
      q.y - (this.minY + this.rows * this.cell),
    );
    let best = -1;
    let bestD = maxDist;
    const maxRing = Math.max(this.cols, this.rows);
    for (let ring = 0; ring <= maxRing; ring++) {
      // Every point in this ring or beyond is at least (ring - 1) * cell away.
      if (best !== -1 || maxDist !== Infinity) {
        if (outside + (ring - 1) * this.cell > bestD) break;
      }
      for (let y = qy - ring; y <= qy + ring; y++) {
        if (y < 0 || y >= this.rows) continue;
        const edgeRow = y === qy - ring || y === qy + ring;
        for (let x = qx - ring; x <= qx + ring; x += edgeRow ? 1 : 2 * ring || 1) {
          if (x < 0 || x >= this.cols) continue;
          const list = this.cells.get(this.key(x, y));
          if (!list) continue;
          for (const id of list) {
            if (this.removed[id]) continue;
            const p = this.points[id]!;
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d < bestD || (d === bestD && best !== -1 && id < best)) {
              if (accept && !accept(id)) continue;
              bestD = d;
              best = id;
            }
          }
        }
      }
    }
    return best;
  }
}

import { applyToPoint, invert, multiply, type Matrix } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec2';

/**
 * The 17 wallpaper groups (every way a pattern can repeat across the plane), plus two plain
 * lattice tilings. Each group is a lattice, a fundamental region (the piece of the cell the motif
 * goes in) and the symmetry operations that copy that region to fill one cell. Lattice shifts
 * then fill the plane.
 *
 * Operations are in fractional (lattice) coordinates, using the standard settings from the
 * International Tables for Crystallography: (u, v) → (a·u + c·v + e, b·u + d·v + f), written in
 * the same [a, b, c, d, e, f] layout as Matrix. Hexagonal groups use a 120° basis.
 */
export type LatticeKind = 'rect' | 'square' | 'hex';

export type WallpaperGroup = {
  id: string;
  /** Plain name for the menu, with the standard notation. */
  label: string;
  lattice: LatticeKind;
  ops: Matrix[];
  /** Fundamental region, fractional coordinates. */
  region: Vec2[];
};

const I: Matrix = [1, 0, 0, 1, 0, 0];
/** Builds an op from the images of u and v and a shift: u' = au·u + av·v + e, v' = bu·u + bv·v + f. */
const op = (au: number, av: number, e: number, bu: number, bv: number, f: number): Matrix => [
  au,
  bu,
  av,
  bv,
  e,
  f,
];
const h = 0.5;
const t1 = 1 / 3;
const t2 = 2 / 3;
const P = (u: number, v: number): Vec2 => ({ x: u, y: v });
const rect = (u0: number, v0: number, u1: number, v1: number) => [
  P(u0, v0),
  P(u1, v0),
  P(u1, v1),
  P(u0, v1),
];
/** Adds the (½, ½) centering to each op. */
const centered = (ops: Matrix[]) => [
  ...ops,
  ...ops.map((m) => [m[0], m[1], m[2], m[3], m[4] + h, m[5] + h] as Matrix),
];

// Square point group ops about the origin.
const R90 = op(0, -1, 0, 1, 0, 0); // (u,v) → (-v, u)
const R180 = op(-1, 0, 0, 0, -1, 0); // (-u, -v)
const R270 = op(0, 1, 0, -1, 0, 0); // (v, -u)
const MU = op(-1, 0, 0, 0, 1, 0); // (-u, v)
const MV = op(1, 0, 0, 0, -1, 0); // (u, -v)
const MD = op(0, 1, 0, 1, 0, 0); // (v, u)
const MD2 = op(0, -1, 0, -1, 0, 0); // (-v, -u)

// Hexagonal ops (120° basis).
const H120 = op(0, -1, 0, 1, -1, 0); // (-v, u - v)
const H240 = op(-1, 1, 0, -1, 0, 0); // (-u + v, -u)
const H180 = R180; // (-u, -v)
const H60 = op(1, -1, 0, 1, 0, 0); // (u - v, u)
const H300 = op(0, 1, 0, -1, 1, 0); // (v, -u + v)
// Mirrors for p3m1: (-v, -u), (-u + v, v), (u, u - v)
const M1 = op(0, -1, 0, -1, 0, 0);
const M2 = op(-1, 1, 0, 0, 1, 0);
const M3 = op(1, 0, 0, 1, -1, 0);
// Mirrors for p31m: (v, u), (u - v, -v), (-u, -u + v)
const N1 = op(0, 1, 0, 1, 0, 0);
const N2 = op(1, -1, 0, 0, -1, 0);
const N3 = op(-1, 0, 0, -1, 1, 0);

export const WALLPAPER_GROUPS: readonly WallpaperGroup[] = [
  { id: 'p1', label: 'Plain grid (p1)', lattice: 'rect', ops: [I], region: rect(0, 0, 1, 1) },
  { id: 'p2', label: 'Half turns (p2)', lattice: 'rect', ops: [I, R180], region: rect(0, 0, 1, h) },
  { id: 'pm', label: 'Mirrors (pm)', lattice: 'rect', ops: [I, MU], region: rect(0, 0, h, 1) },
  {
    id: 'pg',
    label: 'Glide mirrors (pg)',
    lattice: 'rect',
    ops: [I, op(-1, 0, 0, 0, 1, h)],
    region: rect(0, 0, h, 1),
  },
  {
    id: 'cm',
    label: 'Offset mirrors (cm)',
    lattice: 'rect',
    ops: centered([I, MU]),
    region: rect(0, 0, h, h),
  },
  {
    id: 'pmm',
    label: 'Two-way mirrors (pmm)',
    lattice: 'rect',
    ops: [I, MU, MV, R180],
    region: rect(0, 0, h, h),
  },
  {
    id: 'pmg',
    label: 'Mirrors and half turns (pmg)',
    lattice: 'rect',
    ops: [I, R180, op(-1, 0, h, 0, 1, 0), op(1, 0, h, 0, -1, 0)],
    region: rect(0.25, 0, 0.75, h),
  },
  {
    id: 'pgg',
    label: 'Two-way glides (pgg)',
    lattice: 'rect',
    ops: [I, R180, op(-1, 0, h, 0, 1, h), op(1, 0, h, 0, -1, h)],
    region: rect(0, 0, h, h),
  },
  {
    id: 'cmm',
    label: 'Diamond mirrors (cmm)',
    lattice: 'rect',
    ops: centered([I, MU, MV, R180]),
    region: rect(0, 0, h, 0.25),
  },
  {
    id: 'p4',
    label: 'Square, quarter turns (p4)',
    lattice: 'square',
    ops: [I, R90, R180, R270],
    region: rect(0, 0, h, h),
  },
  {
    id: 'p4m',
    label: 'Square kaleidoscope (p4m)',
    lattice: 'square',
    ops: [I, R90, R180, R270, MU, MD, MV, MD2],
    region: [P(0, 0), P(h, 0), P(h, h)],
  },
  {
    id: 'p4g',
    label: 'Square pinwheel (p4g)',
    lattice: 'square',
    ops: [
      I,
      R180,
      R90,
      R270,
      op(-1, 0, h, 0, 1, h),
      op(1, 0, h, 0, -1, h),
      op(0, 1, h, 1, 0, h),
      op(0, -1, h, -1, 0, h),
    ],
    region: [P(0, 0), P(h, 0), P(0, h)],
  },
  {
    id: 'tri',
    label: 'Triangles, alternating',
    lattice: 'hex',
    ops: [I, H180],
    region: [P(0, 0), P(1, 0), P(1, 1)],
  },
  {
    id: 'p3',
    label: 'Triangle, third turns (p3)',
    lattice: 'hex',
    ops: [I, H120, H240],
    region: [P(0, 0), P(t2, t1), P(1, 1), P(t1, t2)],
  },
  {
    id: 'p3m1',
    label: 'Triangle kaleidoscope (p3m1)',
    lattice: 'hex',
    ops: [I, H120, H240, M1, M2, M3],
    region: [P(0, 0), P(t2, t1), P(t1, t2)],
  },
  {
    id: 'p31m',
    label: 'Triangle pinwheel mirrors (p31m)',
    lattice: 'hex',
    ops: [I, H120, H240, N1, N2, N3],
    region: [P(0, 0), P(t2, t1), P(1, 1)],
  },
  {
    id: 'hex',
    label: 'Hexagons (honeycomb)',
    lattice: 'hex',
    ops: [I],
    // The hexagon around the origin: midway to the six neighbors (Voronoi cell).
    region: [P(t1, -t1), P(t2, t1), P(t1, t2), P(-t1, t1), P(-t2, -t1), P(-t1, -t2)],
  },
  {
    id: 'p6',
    label: 'Hexagon, sixth turns (p6)',
    lattice: 'hex',
    ops: [I, H60, H120, H180, H240, H300],
    region: [P(0, 0), P(t2, t1), P(t1, t2)],
  },
  {
    id: 'p6m',
    label: 'Hexagon kaleidoscope (p6m)',
    lattice: 'hex',
    ops: [I, H60, H120, H180, H240, H300, M1, M2, M3, N1, N2, N3],
    region: [P(0, 0), P(t2, t1), P(h, h)],
  },
];

export const getWallpaperGroup = (id: string) => WALLPAPER_GROUPS.find((g) => g.id === id);

/** Lattice basis vectors for a cell size (mm) and, for rectangular lattices, height ÷ width. */
export function latticeBasis(kind: LatticeKind, size: number, aspect = 1): { a: Vec2; b: Vec2 } {
  if (kind === 'hex')
    return { a: { x: size, y: 0 }, b: { x: -size / 2, y: (size * Math.sqrt(3)) / 2 } };
  return { a: { x: size, y: 0 }, b: { x: 0, y: size * (kind === 'square' ? 1 : aspect) } };
}

/** Fractional → Cartesian matrix for a basis. */
export const basisMatrix = (a: Vec2, b: Vec2): Matrix => [a.x, a.y, b.x, b.y, 0, 0];

/** A group's operations as Cartesian matrices for the given basis. */
export function cartesianOps(g: WallpaperGroup, a: Vec2, b: Vec2): Matrix[] {
  const B = basisMatrix(a, b);
  const Bi = invert(B);
  return g.ops.map((m) => multiply(B, multiply(m, Bi)));
}

/** The fundamental region in Cartesian coordinates. */
export function cartesianRegion(g: WallpaperGroup, a: Vec2, b: Vec2): Vec2[] {
  const B = basisMatrix(a, b);
  return g.region.map((p) => applyToPoint(B, p.x, p.y));
}

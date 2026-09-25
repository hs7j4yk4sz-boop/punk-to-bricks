// Fill one layer of stud cells with real bricks/plates/tiles.
// Hidden cells (inside the bust) may take any colour, so a piece can run from
// a visible cell into hidden ones: that is what ties the face to the body.
import { partId, type Kind, type Piece } from './parts';
import { BLACK, COLOR_BY_ID, TRANS_CLEAR } from './palette';

export interface Cell { c: number; vis: boolean }
export type Layer = Map<number, Cell>;

export const key = (x: number, z: number) => (x + 512) * 1024 + (z + 512);
export const kx = (k: number) => Math.floor(k / 1024) - 512;
export const kz = (k: number) => (k % 1024) - 512;

export interface TileOpts {
  kind: Kind; y: number; h: number;
  prefX: boolean;                 // prefer pieces running along x (alternates per layer)
  sizes: [number, number][];
  /** cells occupied by pieces directly underneath; pieces must rest on at least one */
  below?: Set<number> | null;
  /** cells to place first, each with a piece that touches `below` as much as possible */
  priority?: number[];
  group?: Piece['group'];
  /** only use sizes this returns true for (a 1×1 is always allowed, as a last resort) */
  allow?: (kind: Kind, w: number, d: number, color: number) => boolean;
}

const isTrans = (c: number) => !!COLOR_BY_ID.get(c)?.trans;

export function tileLayer(cells: Layer, o: TileOpts): Piece[] {
  const used = new Set<number>();
  const out: Piece[] = [];
  const below = o.below ?? null;

  /** colour of a candidate rectangle, or null if it can't be one piece */
  function rectColor(X: number, Z: number, w: number, d: number): number | null {
    let vis = -1, trans = false;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      const k = key(X + i, Z + j), cell = cells.get(k);
      if (!cell || used.has(k)) return null;
      if (isTrans(cell.c)) trans = true;
      if (cell.vis || isTrans(cell.c)) { if (vis < 0) vis = cell.c; else if (vis !== cell.c) return null; }
    }
    // transparent parts: small sizes only (Trans-Clear supports come up to 2×2)
    if (trans && (o.kind === 'tile' ? w * d > 2 : vis === TRANS_CLEAR ? w > 2 || d > 2 : w * d > 1)) return null;
    // a piece nobody can see is black: cheapest, easiest to find, one lot
    const c = vis >= 0 ? vis : BLACK;
    if (o.allow && w * d > 1 && !o.allow(o.kind, w, d, c)) return null;
    return c;
  }
  const supportOf = (X: number, Z: number, w: number, d: number) => {
    if (!below) return 0;
    let n = 0;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (below.has(key(X + i, Z + j))) n++;
    return n;
  };
  function add(X: number, Z: number, w: number, d: number, c: number) {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) used.add(key(X + i, Z + j));
    out.push({ x: X, z: Z, y: o.y, h: o.h, w, d, c, kind: o.kind, part: partId(o.kind, w, d), group: o.group });
  }
  const orients = (a: number, b: number): [number, number][] => (a === b ? [[a, b]] : [[b, a], [a, b]]);

  // 1) cells that hang over nothing (or were asked for first): bridge them to supported cells
  const first = o.priority ?? (below ? [...cells.keys()].filter(k => !below.has(k)) : []);
  for (const k of first) {
    if (used.has(k) || !cells.has(k)) continue;
    const x = kx(k), z = kz(k);
    let best: { s: number[]; X: number; Z: number; w: number; d: number; c: number } | null = null;
    for (const [a, b] of o.sizes) for (const [w, d] of orients(a, b)) for (let ox = 0; ox < w; ox++) for (let oz = 0; oz < d; oz++) {
      const X = x - ox, Z = z - oz, c = rectColor(X, Z, w, d);
      if (c === null) continue;
      const sup = supportOf(X, Z, w, d);
      if (!sup) continue;
      const s = [sup, w * d];
      if (!best || s[0] > best.s[0] || (s[0] === best.s[0] && s[1] > best.s[1])) best = { s, X, Z, w, d, c };
    }
    if (best) add(best.X, best.Z, best.w, best.d, best.c);
  }

  // 2) everything else, scanning in the preferred direction; the scan cell is always the rectangle's corner
  const order = [...cells.keys()].filter(k => !used.has(k))
    .sort(o.prefX ? (a, b) => kz(a) - kz(b) || kx(a) - kx(b) : (a, b) => kx(a) - kx(b) || kz(a) - kz(b));
  for (const k of order) {
    if (used.has(k)) continue;
    const x = kx(k), z = kz(k);
    let best: { s: number[]; w: number; d: number; c: number } | null = null;
    for (const [a, b] of o.sizes) for (const [w, d] of orients(a, b)) {
      const c = rectColor(x, z, w, d);
      if (c === null) continue;
      const s = [below && supportOf(x, z, w, d) ? 1 : 0, w * d, (o.prefX ? w >= d : d >= w) ? 1 : 0];
      if (!best || s[0] > best.s[0] || (s[0] === best.s[0] && (s[1] > best.s[1] || (s[1] === best.s[1] && s[2] > best.s[2])))) best = { s, w, d, c };
    }
    if (!best) throw new Error('no piece fits a cell');   // 1×1 always fits
    add(x, z, best.w, best.d, best.c);
  }
  return out;
}

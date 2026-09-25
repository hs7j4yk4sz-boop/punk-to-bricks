// Structural checks, done on the final list of pieces only (independent of how
// the model was built): stud connections, floating pieces, collisions, weak
// joints and centre of mass over the base.
import type { Piece } from './parts';

export interface Checks {
  pieces: number;
  connections: number;      // studs engaged between pieces
  floating: number;         // pieces not connected to the base
  floatingIds: number[];
  collisions: number;       // overlapping unit cells
  weak: number;             // pieces held by a single stud
  com: { x: number; z: number; inside: boolean; margin: number };
}

const fpKey = (x: number, z: number) => (x + 512) * 1024 + (z + 512);

export function footprint(p: Piece): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) out.push(fpKey(p.x + i, p.z + j));
  return out;
}

/** Pieces grouped by the stud cell and height they start at, for fast neighbour lookups. */
function indexBottoms(pieces: Piece[]) {
  const m = new Map<number, Map<number, number>>();   // y -> cell -> piece
  pieces.forEach((p, i) => {
    let row = m.get(p.y); if (!row) m.set(p.y, row = new Map());
    for (const k of footprint(p)) row.set(k, i);
  });
  return m;
}

/** adjacency: studs of piece i engage piece j sitting directly on top */
export function connections(pieces: Piece[]) {
  const bottoms = indexBottoms(pieces);
  const adj: Map<number, number>[] = pieces.map(() => new Map());
  let total = 0;
  pieces.forEach((p, i) => {
    if (p.kind === 'tile' || p.kind === 'slope') return;   // smooth top: nothing clicks on it
    const above = bottoms.get(p.y + p.h);
    if (!above) return;
    for (const k of footprint(p)) {
      const j = above.get(k);
      if (j === undefined) continue;
      adj[i].set(j, (adj[i].get(j) ?? 0) + 1); adj[j].set(i, (adj[j].get(i) ?? 0) + 1); total++;
    }
  });
  return { adj, total };
}

export function grounded(pieces: Piece[], adj: Map<number, number>[]): boolean[] {
  const minY = Math.min(...pieces.map(p => p.y));
  const seen = pieces.map(p => p.y === minY);
  const st = pieces.map((_, i) => i).filter(i => seen[i]);
  while (st.length) { const k = st.pop()!; for (const n of adj[k].keys()) if (!seen[n]) { seen[n] = true; st.push(n); } }
  return seen;
}

export function checkModel(pieces: Piece[]): Checks {
  const { adj, total } = connections(pieces);
  const g = grounded(pieces, adj);
  const floatingIds = pieces.map((_, i) => i).filter(i => !g[i]);
  const occ = new Map<string, number>();
  let collisions = 0;
  for (const p of pieces) for (const k of footprint(p)) for (let y = p.y; y < p.y + p.h; y++) {
    const key = k + ':' + y, n = (occ.get(key) ?? 0) + 1;
    occ.set(key, n); if (n === 2) collisions++;
  }
  const minY = Math.min(...pieces.map(p => p.y));
  const weak = pieces.filter((p, i) => p.y > minY && [...adj[i].values()].reduce((a, b) => a + b, 0) === 1).length;
  // centre of mass (piece volume) must sit over the base footprint
  let m = 0, sx = 0, sz = 0;
  for (const p of pieces) { const v = p.w * p.d * p.h; m += v; sx += v * (p.x + p.w / 2); sz += v * (p.z + p.d / 2); }
  const cx = sx / m, cz = sz / m;
  const base = pieces.filter(p => p.y === minY);
  const bx0 = Math.min(...base.map(p => p.x)), bx1 = Math.max(...base.map(p => p.x + p.w));
  const bz0 = Math.min(...base.map(p => p.z)), bz1 = Math.max(...base.map(p => p.z + p.d));
  const margin = Math.min(cx - bx0, bx1 - cx, cz - bz0, bz1 - cz);
  return {
    pieces: pieces.length, connections: total, floating: floatingIds.length, floatingIds, collisions, weak,
    com: { x: +cx.toFixed(1), z: +cz.toFixed(1), inside: margin > 0, margin: +margin.toFixed(1) },
  };
}

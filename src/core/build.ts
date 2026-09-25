// Punk grid -> buildable brick model (Mini or XL).
import { analyze, N, type PixelInfo } from './analyze';
import { checkModel, connections, grounded, type Checks } from './check';
import type { PunkGrid } from './detect';
import { BASE_GRAY, BLACK, COLOR_BY_ID, TRANS_CLEAR } from './palette';
import { partId, partName, SIZES, TILE_SIZES, type Kind, type Piece } from './parts';
import { key, kx, kz, tileLayer, type Layer, type TileOpts } from './tile';
import { availableAtLego } from './lego';

export type SizeId = 'mini' | 'xl';

export interface SizeSpec {
  id: SizeId;
  sx: number;               // studs per pixel (width)
  D: number;                // head depth in studs
  front: number;            // depth of the front colour, studs
  taper: [number, number];  // inset of the top two pixels of each column (rounder top)
  slab: number;             // depth of thin parts (brims, ears)
  frontSlab: number;        // depth of mouth accessories (pipes, cigarettes)
  wall: number;             // wall thickness when hollow
  chamfer: number;          // back corners cut
  rowLayers: { kind: Kind; h: number }[];
  /** optional: odd rows (counting from the bottom) use this instead, e.g. to alternate heights */
  rowLayersAlt?: { kind: Kind; h: number }[];
  baseLayers: { kind: Kind; h: number }[];
  baseMargin: { side: number; front: number; back: number };
  cantilever: number;       // longest overhang (studs) before a support column is added
  slopes: boolean;
  nameplate: [number, number] | null;
}

export const SIZES_SPEC: Record<SizeId, SizeSpec> = {
  mini: {
    id: 'mini', sx: 1, D: 8, front: 2, taper: [2, 1], slab: 4, frontSlab: 3, wall: 1, chamfer: 1,
    // rows alternate 1 brick (3 plates) and 2 plates: 2.5 plates = 8 mm on average, like a stud: square pixels
    rowLayers: [{ kind: 'brick', h: 3 }], rowLayersAlt: [{ kind: 'plate', h: 1 }, { kind: 'plate', h: 1 }],
    baseLayers: [{ kind: 'plate', h: 1 }, { kind: 'plate', h: 1 }],
    baseMargin: { side: 1, front: 2, back: 1 }, cantilever: 6, slopes: false, nameplate: [4, 1],
  },
  xl: {
    id: 'xl', sx: 2, D: 20, front: 2, taper: [4, 2], slab: 8, frontSlab: 4, wall: 2, chamfer: 2,
    rowLayers: [{ kind: 'brick', h: 3 }, { kind: 'plate', h: 1 }, { kind: 'plate', h: 1 }],
    baseLayers: [{ kind: 'brick', h: 3 }, { kind: 'brick', h: 3 }],
    baseMargin: { side: 2, front: 4, back: 2 }, cantilever: 12, slopes: true, nameplate: [6, 2],
  },
};

export interface BomLine { part: string; kind: Kind; name: string; color: number; colorName: string; hex: string; w: number; d: number; qty: number }

export interface Model {
  size: SizeId;
  pieces: Piece[];
  steps: number[][];
  bom: BomLine[];
  colors: Record<number, string>;
  checks: Checks;
  notes: string[];
  /** approximate size in cm: width, depth, height */
  dims: [number, number, number];
}

interface LayerRec { y: number; h: number; kind: Kind; cells: Layer; row: number | null; pieces: Piece[] }

export interface BuildOptions {
  /** only use parts LEGO sells (Pick a Brick), splitting the others into smaller ones */
  preferLego?: boolean;
}

export function buildModel(grid: PunkGrid, size: SizeId, overrides: Partial<SizeSpec> & BuildOptions = {}): Model {
  const S = { ...SIZES_SPEC[size], ...overrides };
  const allow = overrides.preferLego ? availableAtLego : undefined;
  const A = analyze(grid);
  const notes = [...A.notes];
  const { sx, D } = S;

  // ---------- 1. pixels -> stud cells, one map per pixel row ----------
  const rows = [...Array(N).keys()].filter(r => A.px[r].some(Boolean));
  const rTop = rows[0], rBot = rows[rows.length - 1];
  const range = new Map<string, [number, number]>();
  const rangeOf = (r: number, c: number, p: PixelInfo): [number, number] => {
    if (p.role === 'body') { const inset = p.fromTop < 2 ? S.taper[p.fromTop] : 0; return [inset, D - 1 - inset]; }
    if (p.anchor === 'front') return [0, S.frontSlab - 1];
    const z0 = Math.round((D - S.slab) / 2); void r; void c;
    return [z0, z0 + S.slab - 1];
  };
  for (const r of rows) for (let c = 0; c < N; c++) { const p = A.px[r][c]; if (p && !p.depthFrom) range.set(`${r},${c}`, rangeOf(r, c, p)); }
  for (const r of rows) for (let c = 0; c < N; c++) {
    const p = A.px[r][c]; if (!p || !p.depthFrom) continue;
    const t = range.get(`${p.depthFrom[0]},${p.depthFrom[1]}`) ?? rangeOf(r, c, p);
    if (p.role === 'stalk') { const m = Math.floor((t[0] + t[1] + 1) / 2); range.set(`${r},${c}`, [Math.min(m, t[1] - sx + 1), t[1]]); }
    else if (p.role === 'support') { const m = Math.floor((t[0] + t[1] + 1) / 2); range.set(`${r},${c}`, [Math.max(t[0], m - Math.ceil(sx / 2)), Math.max(t[0], m - Math.ceil(sx / 2)) + sx - 1]); }
    else range.set(`${r},${c}`, p.role === 'protrusion' ? t : rangeOf(r, c, p));
  }
  const rowCells = new Map<number, Map<number, number>>();   // row -> cell -> colour
  const supportCell = new Set<string>();                     // `${row}:${cell}` clear supports
  for (const r of rows) {
    const cells = new Map<number, number>();
    for (let c = 0; c < N; c++) {
      const p = A.px[r][c]; if (!p) continue;
      const [z0, z1] = range.get(`${r},${c}`)!;
      for (let z = z0; z <= z1; z++) {
        const colr = p.role === 'support' ? TRANS_CLEAR : p.role !== 'body' || z <= z0 + S.front - 1 ? p.color : z < D / 2 ? p.fill : p.fillBack;
        for (let i = 0; i < sx; i++) { cells.set(key(c * sx + i, z), colr); if (p.role === 'support') supportCell.add(`${r}:${key(c * sx + i, z)}`); }
      }
    }
    // round the two back corners
    for (let z = D - S.chamfer; z < D; z++) {
      const xs = [...cells.keys()].filter(k => kz(k) === z).map(kx);
      if (!xs.length) continue;
      const lo = Math.min(...xs), hi = Math.max(...xs);
      for (const x of xs) if (x < lo + S.chamfer || x > hi - S.chamfer) cells.delete(key(x, z));
    }
    rowCells.set(r, cells);
  }

  // ---------- 2. long overhangs get a clear support column ----------
  let columns = 0;
  for (let r = rBot - 1; r >= rTop; r--) {
    const cells = rowCells.get(r)!;
    for (let iter = 0; iter < 20; iter++) {
      const below = rowCells.get(r + 1)!;
      const dist = new Map<number, number>(), q: number[] = [];
      for (const k of cells.keys()) if (below.has(k)) { dist.set(k, 0); q.push(k); }
      for (let i = 0; i < q.length; i++) {
        const k = q[i], x = kx(k), z = kz(k);
        for (const n of [key(x + 1, z), key(x - 1, z), key(x, z + 1), key(x, z - 1)]) if (cells.has(n) && !dist.has(n)) { dist.set(n, dist.get(k)! + 1); q.push(n); }
      }
      let far: number | null = null, fd = S.cantilever;
      for (const k of cells.keys()) { const d = dist.get(k) ?? Infinity; if (d > fd && d !== Infinity) { fd = d; far = k; } }
      if (far === null) {
        break;
      }
      // column under the far end, aligned to the pixel grid, down to the first solid row
      const X = Math.floor(kx(far) / sx) * sx, Z = Math.min(D - sx, Math.floor(kz(far) / sx) * sx);
      const foot: number[] = [];
      for (let i = 0; i < sx; i++) for (let j = 0; j < sx; j++) if (cells.has(key(X + i, Z + j))) foot.push(key(X + i, Z + j));
      for (let rr = r + 1; rr <= rBot; rr++) {
        const rc = rowCells.get(rr)!;
        if (foot.every(k => rc.has(k))) break;
        for (const k of foot) if (!rc.has(k)) { rc.set(k, TRANS_CLEAR); supportCell.add(`${rr}:${k}`); }
      }
      columns++;
    }
  }
  if (columns) notes.push(`${columns} clear support column${columns > 1 ? 's' : ''} added under long overhangs.`);

  // ---------- 3. base, sized so the centre of mass sits well inside ----------
  // the base covers the footprint of the bottom three rows (jaw included)
  const bottom = [rBot, rBot - 1, rBot - 2].flatMap(r => [...(rowCells.get(r)?.keys() ?? [])]);
  let bx0 = Math.min(...bottom.map(kx)) - S.baseMargin.side, bx1 = Math.max(...bottom.map(kx)) + S.baseMargin.side;
  let bz0 = -S.baseMargin.front, bz1 = D - 1 + S.baseMargin.back;
  {
    let m = 0, cx = 0, cz = 0;
    for (const cells of rowCells.values()) for (const k of cells.keys()) { m++; cx += kx(k) + 0.5; cz += kz(k) + 0.5; }
    cx /= m; cz /= m;
    const need = 2 * sx;
    if (cx - bx0 < need) bx0 = Math.floor(cx - need); if (bx1 + 1 - cx < need) bx1 = Math.ceil(cx + need);
    if (cz - bz0 < need) bz0 = Math.floor(cz - need); if (bz1 + 1 - cz < need) bz1 = Math.ceil(cz + need);
  }
  const baseCells = new Set<number>();
  for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) baseCells.add(key(x, z));

  // ---------- 4. hollow inside, and which cells can be seen ----------
  const present = (r: number, k: number) => (r > rBot ? baseCells.has(k) : rowCells.get(r)?.has(k) ?? false);
  const hollow = new Map<number, Set<number>>();
  for (const r of rows) {
    const h = new Set<number>(), cells = rowCells.get(r)!;
    for (const [k, c] of cells) {
      if (c === TRANS_CLEAR || COLOR_BY_ID.get(c)?.trans || !present(r - 2, k)) continue;
      const x = kx(k), z = kz(k);
      if (z < S.front) continue;   // the front colour is never hollowed out
      let ok = true;
      for (let rr = r - 1; rr <= r + 1 && ok; rr++) for (let dx = -S.wall; dx <= S.wall && ok; dx++) for (let dz = -S.wall; dz <= S.wall && ok; dz++) if (!present(rr, key(x + dx, z + dz))) ok = false;
      if (ok) h.add(k);
    }
    hollow.set(r, h);
  }
  const opaque = (r: number, k: number) => {
    if (r > rBot) return baseCells.has(k);
    const c = rowCells.get(r)?.get(k);
    return c !== undefined && !COLOR_BY_ID.get(c)?.trans;
  };
  const layerCells = (r: number): Layer => {
    const out: Layer = new Map(), cells = rowCells.get(r)!, h = hollow.get(r)!;
    for (const [k, c] of cells) {
      if (h.has(k)) continue;
      const x = kx(k), z = kz(k);
      const vis = !!COLOR_BY_ID.get(c)?.trans
        || [key(x + 1, z), key(x - 1, z), key(x, z + 1), key(x, z - 1)].some(n => !opaque(r, n));
      out.set(k, { c, vis });
    }
    return out;
  };

  // ---------- 5. layers of bricks and plates ----------
  // A row is one brick (Mini) or brick+plate+plate (XL). If something in a
  // row can't be held (a sideways detail in several colours), that row is
  // rebuilt from three plates: same height, but the plates overlap sideways.
  const topRows = headwearRows(A.px, A.skin, rTop);
  const groupOf = (L: LayerRec): Piece['group'] => (L.row === null ? 'base' : topRows.has(L.row) ? 'top' : 'body');
  const occupied = (L: LayerRec) => new Set(L.pieces.flatMap(p => { const o: number[] = []; for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) o.push(key(p.x + i, p.z + j)); return o; }));
  const rowCellsCache = new Map<number, Layer>();
  const makeLayers = (split: Set<number>, repairNotes: string[]): LayerRec[] => {
    const layers: LayerRec[] = [];
    let y = -S.baseLayers.reduce((a, l) => a + l.h, 0);
    for (const l of S.baseLayers) {
      const cells: Layer = new Map();
      for (const k of baseCells) {
        const x = kx(k), z = kz(k);
        cells.set(k, { c: BLACK, vis: x === bx0 || x === bx1 || z === bz0 || z === bz1 });
      }
      layers.push({ y, h: l.h, kind: l.kind, cells, row: null, pieces: [] }); y += l.h;
    }
    for (let r = rBot; r >= rTop; r--) {
      if (!rowCellsCache.has(r)) rowCellsCache.set(r, layerCells(r));
      const cells = rowCellsCache.get(r)!;
      const own = S.rowLayersAlt && (rBot - r) % 2 === 1 ? S.rowLayersAlt : S.rowLayers;
      const height = own.reduce((a, q) => a + q.h, 0);
      const spec = split.has(r) ? Array.from({ length: height }, () => ({ kind: 'plate' as Kind, h: 1 })) : own;
      for (const l of spec) { layers.push({ y, h: l.h, kind: l.kind, cells, row: r, pieces: [] }); y += l.h; }
    }
    layers.forEach((L, i) => {
      L.pieces = tileLayer(L.cells, { kind: L.kind, y: L.y, h: L.h, prefX: i % 2 === 0, sizes: SIZES, below: i ? occupied(layers[i - 1]) : null, group: groupOf(L), allow });
    });
    // ---------- 6. repair anything that doesn't hold ----------
    repair(layers, repairNotes, groupOf, allow);
    return layers;
  };
  const split = new Set<number>();
  let repairNotes: string[] = [];
  let layers = makeLayers(split, repairNotes);
  const rowsPerLayer = S.rowLayers.length;
  for (let round = 0; round < 10 && rowsPerLayer === 1; round++) {
    const ps = layers.flatMap(L => L.pieces), { adj } = connections(ps), g = grounded(ps, adj);
    const bad = new Set<number>();
    layers.forEach(L => L.pieces.forEach(p => { if (L.row !== null && !g[ps.indexOf(p)] && !split.has(L.row)) bad.add(L.row); }));
    if (!bad.size) break;
    split.add(Math.max(...bad));   // lowest row first: its failure often causes the ones above
    repairNotes = [];
    layers = makeLayers(split, repairNotes);
  }
  notes.push(...repairNotes);
  if (split.size) notes.push(`${split.size} row${split.size > 1 ? 's' : ''} built from plates instead of bricks so side details interlock.`);

  // ---------- 7. smooth tops: tiles, curved slopes on headwear ----------
  const tops: Piece[] = [];
  layers.forEach((L, i) => {
    const next = layers[i + 1];
    const nextRowHollow = next?.row != null ? hollow.get(next.row)! : new Set<number>();
    const exposed: Layer = new Map();
    const nextOcc = next ? occupied(next) : new Set<number>();
    for (const [k, cell] of L.cells) if (!(next && (next.cells.has(k) || nextOcc.has(k) || nextRowHollow.has(k)))) exposed.set(k, { c: cell.c, vis: true });
    if (!exposed.size) return;
    const top = L.y + L.h;
    if (L.row === null && S.nameplate) {
      const [w, d] = S.nameplate, cx0 = Math.round((Math.min(...bottom.map(kx)) + Math.max(...bottom.map(kx)) + 1 - w) / 2);
      const z0 = -Math.ceil((S.baseMargin.front + d) / 2);
      let ok = true;
      for (let i2 = 0; i2 < w; i2++) for (let j = 0; j < d; j++) if (!exposed.has(key(cx0 + i2, z0 + j))) ok = false;
      if (ok && (!allow || allow('tile', w, d, BASE_GRAY))) {
        for (let i2 = 0; i2 < w; i2++) for (let j = 0; j < d; j++) exposed.delete(key(cx0 + i2, z0 + j));
        tops.push({ x: cx0, z: z0, y: top, h: 1, w, d, c: BASE_GRAY, kind: 'tile', part: partId('tile', w, d), group: 'base', nameplate: true });
      }
    }
    if (S.slopes && L.row !== null && topRows.has(L.row)) {
      const blocks = new Map<string, number[]>();
      for (const [k, cell] of exposed) if (cell.c !== BLACK && !COLOR_BY_ID.get(cell.c)?.trans) {
        const b = `${Math.floor(kx(k) / 2)},${Math.floor(kz(k) / 2)}`; blocks.set(b, [...(blocks.get(b) ?? []), k]);
      }
      for (const [b, ks] of blocks) {
        if (ks.length !== 4 || new Set(ks.map(k => exposed.get(k)!.c)).size !== 1) continue;
        const [bx, bz] = b.split(',').map(Number), X = 2 * bx, Z = 2 * bz;
        const f = (x: number, z: number) => L.cells.has(key(x, z));
        const open: ('W' | 'E' | 'N' | 'S')[] = [];
        if (!f(X - 1, Z) && !f(X - 1, Z + 1)) open.push('W');
        if (!f(X + 2, Z) && !f(X + 2, Z + 1)) open.push('E');
        if (!f(X, Z - 1) && !f(X + 1, Z - 1)) open.push('N');
        if (!f(X, Z + 2) && !f(X + 1, Z + 2)) open.push('S');
        if (open.length !== 1) continue;
        const c = exposed.get(ks[0])!.c;
        if (allow && !allow('slope', 2, 2, c)) continue;
        ks.forEach(k => exposed.delete(k));
        tops.push({ x: X, z: Z, y: top, h: 2, w: 2, d: 2, c, kind: 'slope', part: partId('slope', 2, 2), dir: open[0], group: groupOf(L) });
      }
    }
    tops.push(...tileLayer(exposed, { kind: 'tile', y: top, h: 1, prefX: i % 2 === 1, sizes: TILE_SIZES, group: groupOf(L), allow }));
  });

  // ---------- 8. steps, parts list, checks ----------
  const pieces: Piece[] = [...layers.flatMap(L => L.pieces), ...tops];
  // one step per layer; tiles and slopes go with the layer at their height
  const layerYs = [...new Set(pieces.map(p => p.y))].sort((a, b) => a - b);
  const stepOf = pieces.map(p => layerYs.indexOf(p.y));
  // a piece that hangs under another (nothing holds it from below yet) is
  // added right after the piece that holds it, in that piece's step
  const { adj } = connections(pieces);
  const deferred = new Set<number>();
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    pieces.forEach((p, i) => {
      if (stepOf[i] === 0) return;
      const nb = [...adj[i].keys()];
      if (nb.some(j => pieces[j].y < p.y && stepOf[j] <= stepOf[i])) return;
      const up = nb.filter(j => pieces[j].y > p.y).map(j => stepOf[j]);
      if (!up.length) return;
      const s = Math.min(...up);
      if (s > stepOf[i]) { stepOf[i] = s; deferred.add(i); changed = true; }
    });
    if (!changed) break;
  }
  const byStep: number[][] = layerYs.map(() => []);
  pieces.forEach((_, i) => byStep[stepOf[i]].push(i));
  const sortedSteps = byStep.filter(s => s.length).map(s => s.sort((a, b) => {
    const da = deferred.has(a) ? 1 : 0, db = deferred.has(b) ? 1 : 0;
    if (da !== db) return da - db;
    const pa = pieces[a], pb = pieces[b];
    return (da ? pb.y - pa.y : pa.y - pb.y) || pa.z - pb.z || pa.x - pb.x;
  }));

  const checks = checkModel(pieces);
  if (checks.floating) notes.push(`${checks.floating} piece${checks.floating > 1 ? 's are' : ' is'} not connected to the base.`);
  const bomMap = new Map<string, BomLine>();
  for (const p of pieces) {
    const k = `${p.part}|${p.c}`, col = COLOR_BY_ID.get(p.c)!;
    const line = bomMap.get(k) ?? { part: p.part, kind: p.kind, name: partName(p.kind, p.w, p.d), color: p.c, colorName: col.name, hex: col.hex, w: Math.min(p.w, p.d), d: Math.max(p.w, p.d), qty: 0 };
    line.qty++; bomMap.set(k, line);
  }
  const bom = [...bomMap.values()].sort((a, b) => a.colorName.localeCompare(b.colorName) || a.kind.localeCompare(b.kind) || a.w - b.w || a.d - b.d);
  const colors: Record<number, string> = {};
  for (const p of pieces) colors[p.c] = COLOR_BY_ID.get(p.c)!.hex;
  const xs = pieces.flatMap(p => [p.x, p.x + p.w]), zs = pieces.flatMap(p => [p.z, p.z + p.d]), ys = pieces.flatMap(p => [p.y, p.y + p.h]);
  const dims: [number, number, number] = [(Math.max(...xs) - Math.min(...xs)) * 0.8, (Math.max(...zs) - Math.min(...zs)) * 0.8, (Math.max(...ys) - Math.min(...ys)) * 0.32].map(v => Math.round(v)) as [number, number, number];
  return { size, pieces, steps: sortedSteps, bom, colors, checks, notes, dims };
}

/** Rows at the top that are hat/hair rather than face: built as a separate sub-assembly. */
function headwearRows(px: (PixelInfo | null)[][], skin: number, rTop: number): Set<number> {
  // the rows above the face (until skin shows up), if at least two of them
  // are mostly hat or hair; black counts when it is a filled area (a black
  // hat), not just the outline
  const block = new Set<number>();
  let wearRows = 0;
  for (let r = rTop; r < 13; r++) {
    const ps = px[r].filter((p): p is PixelInfo => !!p && p.role !== 'support');
    if (!ps.length) continue;
    if (ps.filter(p => p.color === skin).length / ps.length >= 0.25) break;
    const wear = ps.filter(p => p.color !== skin && (p.color !== BLACK || p.fill === BLACK) && !COLOR_BY_ID.get(p.color)?.trans).length / ps.length;
    if (wear >= 0.4) wearRows++;
    block.add(r);
  }
  return wearRows >= 2 ? block : new Set();
}

/** Fix pieces that aren't connected to the base: re-tile around them, bridge from above, or add a support column. */
function repair(layers: LayerRec[], notes: string[], groupOf: (L: LayerRec) => Piece['group'], allow?: TileOpts['allow']) {
  const flat = () => layers.flatMap(L => L.pieces);
  const floatingCount = () => {
    const ps = flat(); const { adj } = connections(ps); const g = grounded(ps, adj);
    return { ps, g, n: g.filter(v => !v).length };
  };
  const cellsOf = (p: Piece) => { const o: number[] = []; for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) o.push(key(p.x + i, p.z + j)); return o; };
  const near = (p: Piece, q: Piece, m: number) => q.x < p.x + p.w + m && p.x < q.x + q.w + m && q.z < p.z + p.d + m && p.z < q.z + q.d + m;
  const gap = (p: Piece, q: Piece) => Math.max(0, q.x - p.x - p.w, p.x - q.x - q.w) + Math.max(0, q.z - p.z - p.d, p.z - q.z - q.d) + Math.abs(q.y - p.y) * 0.3;
  let pillars = 0;

  /** Try to attach floating piece P; returns true if fewer pieces float afterwards. */
  const attempt = (P: Piece, st: ReturnType<typeof floatingCount>): boolean => {
    const Li = layers.findIndex(L => L.pieces.includes(P));
    const groundedCells = (li: number) => {
      const out = new Set<number>();
      if (li < 0 || li >= layers.length) return out;
      layers[li].pieces.forEach(p => { if (st.g[st.ps.indexOf(p)]) cellsOf(p).forEach(k => out.add(k)); });
      return out;
    };
    const retile = (li: number, priority: number[], below: Set<number>) => {
      const L = layers[li], old = L.pieces;
      const region = old.filter(q => !q.support && near(P, q, 4));
      const cells: Layer = new Map();
      region.forEach(q => cellsOf(q).forEach(k => cells.set(k, L.cells.get(k)!)));
      const fresh = tileLayer(cells, { kind: L.kind, y: L.y, h: L.h, prefX: li % 2 === 0, sizes: SIZES, below, priority, group: groupOf(L), allow });
      L.pieces = [...old.filter(q => !region.includes(q)), ...fresh];
      return () => { L.pieces = old; };
    };
    const pc = new Set(cellsOf(P));
    const tries: (() => (() => void) | null)[] = [
      // same layer: a piece covering P's cells that rests on grounded pieces below
      () => (Li > 0 ? retile(Li, [...pc], groundedCells(Li - 1)) : null),
      // layer above: a piece over P that also sits on grounded pieces of P's layer
      () => {
        if (Li + 1 >= layers.length) return null;
        const pri = [...layers[Li + 1].cells.keys()].filter(k => pc.has(k));
        if (!pri.length) return null;
        const g = groundedCells(Li); pc.forEach(k => g.delete(k));
        return retile(Li + 1, pri, g);
      },
      // layer below: a grounded piece reaching under P
      () => {
        if (Li < 2) return null;
        const pri = [...layers[Li - 1].cells.keys()].filter(k => pc.has(k));
        if (!pri.length) return null;
        return retile(Li - 1, pri, groundedCells(Li - 2));
      },
    ];
    for (const t of tries) {
      const undo = t();
      if (!undo) continue;
      if (floatingCount().n < st.n) return true;
      undo();
    }
    // support column under P, down to the first piece
    for (const k of pc) {
      const added: [LayerRec, Piece][] = [];
      let ok = false;
      for (let li = Li - 1; li >= 0; li--) {
        const L = layers[li];
        if (L.pieces.some(q => cellsOf(q).includes(k))) { ok = true; break; }
        // an outline keeps going down in black; anything else gets a clear support
        const p: Piece = { x: kx(k), z: kz(k), y: L.y, h: L.h, w: 1, d: 1, c: P.c === BLACK ? BLACK : TRANS_CLEAR, kind: L.kind, part: partId(L.kind, 1, 1), group: groupOf(L), support: true };
        L.pieces.push(p); added.push([L, p]);
      }
      if (ok && floatingCount().n < st.n) { pillars++; return true; }
      for (const [L, p] of added) L.pieces.splice(L.pieces.indexOf(p), 1);
    }
    return false;
  };

  for (let iter = 0; iter < 400; iter++) {
    const st = floatingCount();
    if (!st.n) break;
    // work outwards from the solid part: floating pieces closest to it first
    const solid = st.ps.filter((_, i) => st.g[i]);
    const loose = st.ps.filter((_, i) => !st.g[i])
      .map(P => ({ P, d: Math.min(...solid.filter(q => Math.abs(q.y - P.y) <= 6).map(q => gap(P, q)), 99) }))
      .sort((a, b) => a.d - b.d).slice(0, 12);
    if (!loose.some(({ P }) => attempt(P, st))) break;
  }
  if (pillars) notes.push(`${pillars} support stack${pillars > 1 ? 's' : ''} added under loose pieces.`);
}

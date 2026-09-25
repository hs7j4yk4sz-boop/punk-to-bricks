// Pixel-level understanding of a Punk: which pixels form the solid head, which
// stick out (brims, pipes, cigarettes, ears), which float (smoke) and need a
// support, and which colour each pixel shows on the sides and back of the bust.
import type { PunkGrid } from './detect';
import { mapColors } from './palette';
import { BLACK, COLOR_BY_ID, TRANS_CLEAR } from './palette';

export const N = 24;
export type Role = 'body' | 'protrusion' | 'support' | 'stalk';

export interface PixelInfo {
  color: number;            // brick colour shown on the front
  role: Role;
  /** protrusions: sits in the middle of the head's depth, or at the front (mouth accessories) */
  anchor: 'center' | 'front';
  /** body pixels: how many pixels of the same column sit above this one (0 = column top) */
  fromTop: number;
  fill: number;             // colour of the inside/sides, front half
  fillBack: number;         // colour of the inside/sides, back half
  /** for supports and floating details: the pixel whose depth they copy */
  depthFrom?: [number, number];
}

export interface Analysis {
  px: (PixelInfo | null)[][];
  /** brick colour of each Punk colour */
  brickOf: number[];
  skin: number;
  notes: string[];
}

const inside = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function analyze(g: PunkGrid): Analysis {
  const notes: string[] = [];
  // ---- colours ----
  const touching = new Set<string>();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[1, 0], [0, 1]]) {
    const a = g.cells[r][c], b = inside(r + dr, c + dc) ? g.cells[r + dr][c + dc] : -1;
    if (a >= 0 && b >= 0 && a !== b) touching.add(a < b ? `${a},${b}` : `${b},${a}`);
  }
  const brickOf = mapColors(g.colors, touching);
  const col = (r: number, c: number) => (g.cells[r][c] < 0 ? -1 : brickOf[g.cells[r][c]]);
  const sil = (r: number, c: number) => inside(r, c) && g.cells[r][c] >= 0;

  // ---- connected parts; floating details get a clear support ----
  const comp: number[][] = Array.from({ length: N }, () => Array(N).fill(-1));
  const comps: [number, number][][] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!sil(r, c) || comp[r][c] >= 0) continue;
    const id = comps.length, list: [number, number][] = [[r, c]]; comp[r][c] = id;
    for (let i = 0; i < list.length; i++) for (const [dr, dc] of D4) {
      const rr = list[i][0] + dr, cc = list[i][1] + dc;
      if (sil(rr, cc) && comp[rr][cc] < 0) { comp[rr][cc] = id; list.push([rr, cc]); }
    }
    comps.push(list);
  }
  const main = comps.reduce((a, b, i) => (b.length > comps[a].length ? i : a), 0);
  const attached = comp.map(row => row.map(v => v === main));
  const support: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const depthFrom = new Map<string, [number, number]>();
  const stalk = new Map<string, number>();   // sideways bridge pixel -> colour
  const detached = comps.map((l, i) => ({ l, i })).filter(o => o.i !== main)
    .sort((a, b) => Math.max(...b.l.map(p => p[0])) - Math.max(...a.l.map(p => p[0])));   // lowest first
  for (const { l } of detached) {
    // cheapest path through empty pixels to the attached part: down is cheap, up is dear
    const cost = Array.from({ length: N }, () => Array(N).fill(Infinity));
    const prev = new Map<string, [number, number] | null>();
    const q: [number, number, number][] = [];
    for (const [r, c] of l) { cost[r][c] = 0; prev.set(`${r},${c}`, null); q.push([0, r, c]); }
    let hit: [number, number] | null = null;
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, r, c] = q.shift()!;
      if (d > cost[r][c]) continue;
      if (attached[r][c]) { hit = [r, c]; break; }
      for (const [dr, dc] of D4) {
        const rr = r + dr, cc = c + dc;
        if (!inside(rr, cc)) continue;
        if (sil(rr, cc) && !attached[rr][cc] && !l.some(p => p[0] === rr && p[1] === cc)) continue;
        const nd = d + (dr === 1 ? 1 : dr === -1 ? 2 : 3);
        if (nd < cost[rr][cc]) { cost[rr][cc] = nd; prev.set(`${rr},${cc}`, [r, c]); q.push([nd, rr, cc]); }
      }
    }
    if (!hit) continue;
    // path from the attached pixel back to the floating group
    const path: [number, number][] = [hit];
    let p = prev.get(`${hit[0]},${hit[1]}`) ?? null;
    while (p) { path.push(p); if (l.some(s => s[0] === p![0] && s[1] === p![1])) break; p = prev.get(`${p[0]},${p[1]}`) ?? null; }
    const detailColor = col(path[path.length - 1][0], path[path.length - 1][1]);
    let n = 0, stalks = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const [r, c] = path[i];
      // vertical runs are clear support blocks (studs hold them); a sideways
      // step must be one piece reaching across, so it takes the detail's colour
      const vertical = path[i - 1][1] === c && path[i + 1][1] === c;
      if (vertical) { support[r][c] = true; n++; } else { stalk.set(`${r},${c}`, detailColor); stalks++; }
      attached[r][c] = true; depthFrom.set(`${r},${c}`, hit);
    }
    for (const [r, c] of l) { attached[r][c] = true; depthFrom.set(`${r},${c}`, hit); }
    const how = [n ? `${n} clear support block${n > 1 ? 's' : ''}` : '', stalks ? `a ${stalks}-pixel bridge set back behind it` : ''].filter(Boolean).join(' and ');
    notes.push(`${l.length} floating pixel${l.length > 1 ? 's' : ''} (row ${l[0][0] + 1}) held by ${how}.`);
  }

  // ---- body vs. thin parts: morphological opening with a 4×4 block ----
  const solid = (r: number, c: number) => inside(r, c) && attached[r][c] && !support[r][c] && !stalk.has(`${r},${c}`);
  const core: boolean[][] = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (!solid(r + i, c + j)) return false;
    return true;
  }));
  const body = (r: number, c: number) => {
    if (!solid(r, c)) return false;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inside(r - i, c - j) && core[r - i][c - j]) return true;
    return false;
  };
  const bodyCols = new Map<number, [number, number]>();
  for (let r = 0; r < N; r++) { const cs = [...Array(N).keys()].filter(c => body(r, c)); if (cs.length) bodyCols.set(r, [cs[0], cs[cs.length - 1]]); }

  // ---- skin: the main colour of the middle of the face ----
  const tally = new Map<number, number>();
  for (let r = 11; r <= 17; r++) for (let c = 7; c <= 14; c++) {
    const k = col(r, c);
    if (k < 0 || k === BLACK || COLOR_BY_ID.get(k)?.trans) continue;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const skin = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? brickOf[0];

  // outline pixels: black on the edge of the Punk, or thin black lines
  const lineBlack = (r: number, c: number) => {
    if (col(r, c) !== BLACK) return false;
    if (D4.some(([dr, dc]) => !sil(r + dr, c + dc))) return true;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && sil(r + dr, c + dc) && col(r + dr, c + dc) === BLACK) n++;
    return n <= 4;
  };
  // small details (highlights, eyes, lips: a few pixels) stay on the front face only
  const pixelsOf = new Map<number, number>();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (sil(r, c)) pixelsOf.set(col(r, c), (pixelsOf.get(col(r, c)) ?? 0) + 1);
  const detail = (k: number) => (pixelsOf.get(k) ?? 0) <= 6;
  const fillable = (r: number, c: number) => solid(r, c) && !lineBlack(r, c) && !COLOR_BY_ID.get(col(r, c))?.trans && !detail(col(r, c));

  // Thin parts (not body) decide their depth as a whole: a part that mostly sits
  // right of the face in the lower half (pipe, cigarette) goes to the front,
  // anything else (brim, ear, smoke, hair strands) to the middle.
  const thin = (r: number, c: number) => solid(r, c) && !body(r, c);
  const anchorOf = new Map<string, 'center' | 'front'>();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!thin(r, c) || anchorOf.has(`${r},${c}`)) continue;
    const part: [number, number][] = [[r, c]], seen = new Set([`${r},${c}`]);
    for (let i = 0; i < part.length; i++) for (const [dr, dc] of D4) {
      const rr = part[i][0] + dr, cc = part[i][1] + dc;
      if (thin(rr, cc) && !seen.has(`${rr},${cc}`)) { seen.add(`${rr},${cc}`); part.push([rr, cc]); }
    }
    const front = part.filter(([pr, pc]) => { const bc = bodyCols.get(pr); return pr >= 15 && !!bc && pc > bc[1]; }).length;
    const a: 'center' | 'front' = front * 2 >= part.length ? 'front' : 'center';
    for (const k of seen) anchorOf.set(k, a);
  }

  const px: (PixelInfo | null)[][] = [];
  for (let r = 0; r < N; r++) {
    const row: (PixelInfo | null)[] = [];
    const leftSkin = [...Array(N).keys()].find(c => col(r, c) === skin && solid(r, c)) ?? N;
    for (let c = 0; c < N; c++) {
      if (!attached[r][c]) { row.push(null); continue; }
      if (support[r][c]) {
        row.push({ color: TRANS_CLEAR, role: 'support', anchor: 'center', fromTop: 0, fill: TRANS_CLEAR, fillBack: TRANS_CLEAR, depthFrom: depthFrom.get(`${r},${c}`) });
        continue;
      }
      if (stalk.has(`${r},${c}`)) {
        const k = stalk.get(`${r},${c}`)!;
        row.push({ color: k, role: 'stalk', anchor: 'center', fromTop: 0, fill: k, fillBack: k, depthFrom: depthFrom.get(`${r},${c}`) });
        continue;
      }
      let fill = skin;
      if (fillable(r, c)) fill = col(r, c);
      else {
        for (let d = 1; d < N; d++) {
          const order = c < 12 ? [c + d, c - d] : [c - d, c + d];
          const hit = order.find(cc => inside(r, cc) && fillable(r, cc));
          if (hit !== undefined) { fill = col(r, hit); break; }
        }
      }
      const fillBack = fill !== skin && leftSkin < c && tally.has(fill) ? skin : fill;
      let fromTop = 0;
      while (r - fromTop - 1 >= 0 && solid(r - fromTop - 1, c)) fromTop++;
      const isBody = body(r, c);
      const anchor = isBody ? 'center' : anchorOf.get(`${r},${c}`) ?? 'center';
      row.push({ color: col(r, c), role: isBody ? 'body' : 'protrusion', anchor, fromTop, fill, fillBack, depthFrom: depthFrom.get(`${r},${c}`) });
    }
    px.push(row);
  }
  return { px, brickOf, skin, notes };
}

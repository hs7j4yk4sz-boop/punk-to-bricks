// Compare our XL build of John's Punk with the hand-tuned reference model.json.
import { readFileSync } from 'node:fs';
import { buildModel } from '../src/core/build';
import { detectPunk } from '../src/core/detect';
import { COLOR_BY_ID } from '../src/core/palette';
import type { Piece } from '../src/core/parts';
import { REFERENCE_PUNK } from '../src/examples/punks';
import { punkImage } from '../test/img';

const REF = JSON.parse(readFileSync('../cryptopunk-brick-bust/model/model.json', 'utf8'));
const REFNAME: Record<string, string> = { K: 'Black', S: 'Dark Tan', B: 'Medium Nougat', C: 'Dark Purple', L: 'Medium Lavender', G: 'Trans-Light Blue', T: 'Dark Bluish Gray' };
const m = buildModel(detectPunk(punkImage(REFERENCE_PUNK, 10)), 'xl');

function voxels(ps: { x: number; y: number; z: number; w: number; d: number; h: number }[], col: (i: number) => string) {
  const v = new Map<string, string>();
  ps.forEach((p, i) => { for (let a = 0; a < p.w; a++) for (let b = 0; b < p.d; b++) for (let y = p.y; y < p.y + p.h; y++) v.set(`${p.x + a},${y},${p.z + b}`, col(i)); });
  return v;
}
const A = voxels(REF.pieces, i => REFNAME[REF.pieces[i].c]);
const B = voxels(m.pieces, i => COLOR_BY_ID.get(m.pieces[i].c)!.name);
let inter = 0, same = 0;
for (const [k, c] of A) if (B.has(k)) { inter++; if (B.get(k) === c) same++; }
const union = A.size + B.size - inter;
const kinds = (ps: { kind: string }[]) => ps.reduce((o: Record<string, number>, p) => ((o[p.kind] = (o[p.kind] ?? 0) + 1), o), {});
// front view: colour of the first visible cell looking from the front, per (x, y)
function front(v: Map<string, string>) {
  const f = new Map<string, [number, string]>();
  for (const [k, c] of v) { const [x, y, z] = k.split(',').map(Number); const o = f.get(`${x},${y}`); if (!o || z < o[0]) f.set(`${x},${y}`, [z, c]); }
  return f;
}
const fa = front(A), fb = front(B);
let fs = 0, fn = 0; for (const [k, [, c]] of fa) { fn++; if (fb.get(k)?.[1] === c) fs++; }
console.log('reference :', REF.stats.parts, 'pieces', kinds(REF.pieces), REF.stats.steps, 'steps');
console.log('ours      :', m.checks.pieces, 'pieces', kinds(m.pieces as Piece[]), m.steps.length, 'steps', m.bom.length, 'lots', m.dims, 'cm');
console.log('colours   :', [...new Set(m.pieces.map(p => COLOR_BY_ID.get(p.c)!.name))].join(', '));
console.log(`volume overlap (IoU): ${(100 * inter / union).toFixed(1)}%   same colour where both have a brick: ${(100 * same / inter).toFixed(1)}%`);
console.log(`front view: ${(100 * fs / fn).toFixed(1)}% of the reference's front pixels match in colour`);

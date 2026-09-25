// Regenerate src/data/elements.json: LEGO Element IDs for every part × colour
// the generator can produce, from Rebrickable's free CSV exports.
//   1. download elements.csv.gz, parts.csv.gz, colors.csv.gz from https://rebrickable.com/downloads/
//   2. gunzip them into real/ (git-ignored)
//   3. npx tsx scripts/build-elements.ts
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { BRICK_COLORS } from '../src/core/palette';
import { PARTS } from '../src/core/parts';

const csv = (f: string) => readFileSync(`real/${f}.csv`, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const colors = csv('colors'), elements = csv('elements');
const partNums = new Set(csv('parts').map(r => r[0]));

// BrickLink colour → Rebrickable colour (same names, same RGB for all of ours)
const rbColor = new Map<number, number>();
for (const c of BRICK_COLORS) {
  const hit = colors.find(r => r[1].toLowerCase() === c.name.toLowerCase());
  if (!hit) throw new Error(`no Rebrickable colour named ${c.name}`);
  rbColor.set(c.id, +hit[0]);
}
// BrickLink part → Rebrickable part: same number, or the current mould ("3070" → "3070b")
const rbPart = (bl: string) => [bl, `${bl}b`, `${bl}a`].filter(p => partNums.has(p));

// Only elements whose design_id is filled: checked on Pick a Brick (Sept 2026),
// those are the ones LEGO sells (e.g. 300321 yes, 4103590 no, for Brick 2x2 Red).
const byPartColor = new Map<string, number[]>();
for (const [el, part, color, design] of elements) {
  if (!/^\d+$/.test(el) || !design) continue;
  const k = `${part}|${color}`;
  byPartColor.set(k, [...(byPartColor.get(k) ?? []), +el]);
}

const table: Record<string, string> = {};
let found = 0, missing = 0;
const allParts = [...new Set(Object.values(PARTS).flatMap(m => Object.values(m)))].sort();
for (const part of allParts) for (const c of BRICK_COLORS) {
  const ids = rbPart(part).flatMap(p => byPartColor.get(`${p}|${rbColor.get(c.id)}`) ?? []);
  // several sold IDs for one part and colour: keep the newest
  if (ids.length) { table[`${part}|${c.id}`] = String(Math.max(...ids)); found++; } else missing++;
}
const out = {
  source: 'Rebrickable (rebrickable.com/downloads), elements/parts/colors exports',
  exported: statSync('real/elements.csv').mtime.toISOString().slice(0, 10),
  note: 'key = "BrickLink part|BrickLink colour ID", value = LEGO Element ID. Missing key = no Element ID known: not available at LEGO.',
  elements: table,
};
writeFileSync('src/data/elements.json', JSON.stringify(out, null, 0) + '\n');
console.log(`${allParts.length} parts × ${BRICK_COLORS.length} colours: ${found} with an Element ID, ${missing} without · ${(statSync('src/data/elements.json').size / 1024).toFixed(1)} KB`);

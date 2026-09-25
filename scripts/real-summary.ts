import { readFileSync, readdirSync } from 'node:fs';
const rows = readdirSync('out/real').filter(f => f.endsWith('.jsonl')).flatMap(f => readFileSync('out/real/' + f, 'utf8').trim().split('\n').map(l => JSON.parse(l)));
rows.sort((a, b) => a.id - b.id);
const err = rows.filter(r => r.error);
console.log('punks', rows.length, 'detection/build errors', err.length, err.slice(0, 5).map(r => `#${r.id}: ${r.error}`));
for (const s of ['mini', 'xl']) {
  const ok = rows.filter(r => r[s]);
  const bad = ok.filter(r => r[s].floating || r[s].collisions || !r[s].com);
  const pcs = ok.map(r => r[s].pieces).sort((a, b) => a - b), ms = ok.map(r => r[s].ms).sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  console.log(`\n${s.toUpperCase()}: failing ${bad.length} (floating ${ok.filter(r => r[s].floating).length}, collisions ${ok.filter(r => r[s].collisions).length}, CoM out ${ok.filter(r => !r[s].com).length})`);
  console.log(`  pieces min ${pcs[0]} median ${q(pcs, .5)} p95 ${q(pcs, .95)} max ${pcs[pcs.length - 1]} · ms median ${q(ms, .5)} max ${ms[ms.length - 1]} · weak median ${q(ok.map(r => r[s].weak).sort((a, b) => a - b), .5)} max ${Math.max(...ok.map(r => r[s].weak))}`);
  console.log('  worst:', bad.slice(0, 12).map(r => `#${r.id}(f${r[s].floating},c${r[s].collisions}${r[s].com ? '' : ',CoM'})`).join(' '));
  const notes = new Map<string, number>();
  for (const r of ok) for (const n of r[s].notes) { const k = n.replace(/\d+/g, 'N').replace(/row N/g, 'row N'); notes.set(k, (notes.get(k) ?? 0) + 1); }
  console.log('  notes:', [...notes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${v}× ${k}`).join('\n         '));
}

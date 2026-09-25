// Build every real Punk in a shard, Mini and XL; write one JSON line per Punk.
import { appendFileSync, writeFileSync } from 'node:fs';
import { buildModel } from '../src/core/build';
import { detectPunk } from '../src/core/detect';
import { realPunk } from './real';

const [shard, of] = [+(process.argv[2] ?? 0), +(process.argv[3] ?? 1)];
const out = `out/real/shard-${shard}.jsonl`;
writeFileSync(out, '');
for (let id = shard; id < 10000; id += of) {
  const row: Record<string, unknown> = { id };
  try {
    const g = detectPunk(realPunk(id));
    row.colors = g.colors.length;
    for (const size of ['mini', 'xl'] as const) {
      const t = performance.now();
      const m = buildModel(g, size);
      const c = m.checks;
      row[size] = { ms: Math.round(performance.now() - t), pieces: c.pieces, lots: m.bom.length, floating: c.floating, collisions: c.collisions, weak: c.weak, com: c.com.inside, margin: c.com.margin, notes: m.notes, top: m.pieces.some(p => p.group === 'top') };
    }
  } catch (e) { row.error = (e as Error).message; }
  appendFileSync(out, JSON.stringify(row) + '\n');
}

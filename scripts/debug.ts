import { buildModel, type SizeId } from '../src/core/build';
import { detectPunk } from '../src/core/detect';
import { REFERENCE_PUNK, TEST_PUNKS } from '../test/fixtures/punks';
import { punkImage } from '../test/img';
const name = process.argv[2] ?? 'reference', size = (process.argv[3] ?? 'mini') as SizeId;
const p = [REFERENCE_PUNK, ...TEST_PUNKS].find(q => q.name === name)!;
const m = buildModel(detectPunk(punkImage(p, 10)), size);
console.log(m.checks, m.notes);
for (const i of m.checks.floatingIds) console.log(JSON.stringify(m.pieces[i]));

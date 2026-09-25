// A labelled catalogue page of real Punks (ids from..to), to pick test cases by eye.
import { writeFileSync } from 'node:fs';
import { realPunk } from './real';
import { toPNG } from '../test/img';
const [from, to, out] = [+(process.argv[2] ?? 0), +(process.argv[3] ?? 200), process.argv[4] ?? 'out/catalog.html'];
const ids = process.argv[5] ? process.argv[5].split(',').map(Number) : Array.from({ length: to - from }, (_, i) => from + i);
const cells = ids.map(id => `<figure><img src="data:image/png;base64,${toPNG(realPunk(id)).toString('base64')}"><figcaption>${id}</figcaption></figure>`).join('');
writeFileSync(out, `<style>body{margin:8px;display:flex;flex-wrap:wrap;gap:4px;font:11px system-ui;background:#fff}figure{margin:0;text-align:center}img{width:72px;height:72px;image-rendering:pixelated;display:block}</style>${cells}`);

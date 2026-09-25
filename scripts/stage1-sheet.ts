// Stage 1 review sheet: input -> detected grid -> brick colours -> Mini model (front and side views, every piece outlined) + checks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildModel } from '../src/core/build';
import { detectPunk } from '../src/core/detect';
import { COLOR_BY_ID } from '../src/core/palette';
import { REFERENCE_PUNK, TEST_PUNKS } from '../test/fixtures/punks';
import { punkImage, screenshot, toJPEG, toPNG } from '../test/img';
import { rgbToHex } from '../src/core/color';

mkdirSync('out', { recursive: true });
const size = (process.argv[2] ?? 'mini') as 'mini' | 'xl';
const cards = [REFERENCE_PUNK, ...TEST_PUNKS].map(p => {
  const input = punkImage(p, 6);
  const t = performance.now();
  const g = detectPunk(punkImage(p, 20));
  const m = buildModel(g, size);
  const ms = performance.now() - t;
  const used = new Map<number, number>();
  m.pieces.forEach(q => used.set(q.c, (used.get(q.c) ?? 0) + 1));
  return {
    name: p.name, ms: Math.round(ms), img: 'data:image/png;base64,' + toPNG(input).toString('base64'),
    colors: g.colors.map(c => rgbToHex(c.rgb)),
    bricks: [...used.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ name: COLOR_BY_ID.get(id)!.name, hex: COLOR_BY_ID.get(id)!.hex, n })),
    pieces: m.pieces.map(q => [q.x, q.y, q.z, q.w, q.h, q.d, q.c, q.kind === 'tile' ? 1 : q.kind === 'slope' ? 2 : 0, q.support ? 1 : 0]),
    hex: Object.fromEntries(Object.entries(m.colors)),
    checks: m.checks, notes: m.notes, steps: m.steps.length, lots: m.bom.length, dims: m.dims,
  };
});
const shot = screenshot(REFERENCE_PUNK, 517, 1170, 1600);
const found = detectPunk(shot);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stage 1 — ${size}</title>
<style>
body{font:14px/1.4 -apple-system,system-ui,sans-serif;margin:24px;background:#f5f7f9;color:#1d2b36}
h1{font-size:22px;margin:0 0 4px} .sub{color:#5b6b78;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:14px}
.card{background:#fff;border-radius:12px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card h3{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between}
.row{display:flex;gap:10px;align-items:flex-end}
.row figure{margin:0;text-align:center;font-size:11px;color:#6b7b88}
canvas,img{image-rendering:pixelated;display:block;background:#dfe9f1;border-radius:6px}
.ok{color:#18794e;font-weight:600}.bad{color:#c4320a;font-weight:700}
.sw{display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:11px}
.sw i{width:11px;height:11px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.2)}
.stats{font-size:12px;margin-top:6px}.notes{font-size:11px;color:#6b5b00;margin-top:4px}
.shot{display:flex;gap:16px;align-items:center;background:#fff;border-radius:12px;padding:12px;margin-bottom:18px}
</style></head><body>
<h1>Stage 1 — image → grid → ${size === 'mini' ? 'Mini' : 'XL'} model + checks</h1>
<div class="sub">${cards.length} Punks. Front and right-side views are drawn straight from the piece list: every outline is one real part. Clear parts are supports.</div>
<div class="shot"><canvas id="shot" width="293" height="400"></canvas><div>
<b>Screenshot test.</b> A fake 1170×1600 phone screenshot (JPEG) with the Punk scaled to 517 px.<br>
Found at x=${found.box.x}, y=${found.box.y}, size ${found.box.size} px (true: 120, 200, 517). Grid read exactly.</div></div>
<div class="grid" id="g"></div>
<script>
const cards = ${JSON.stringify(cards)};
const shotURL = 'data:image/jpeg;base64,${toJPEG(shot, 80).toString('base64')}';
const box = ${JSON.stringify(found.box)};
{ const c = document.getElementById('shot'), x = c.getContext('2d'), im = new Image(); im.onload = () => { const k = c.width / 1170; x.drawImage(im, 0, 0, c.width, c.height); x.strokeStyle = '#ff2d55'; x.lineWidth = 3; x.strokeRect(box.x*k, box.y*k, box.size*k, box.size*k); }; im.src = shotURL; }
function view(card, side) {
  // front: look along +z, keep nearest; side: look from the right (-x), keep largest x
  const S = 7, P = 2.8;
  const ps = card.pieces;
  const xs = ps.flatMap(p => side ? [p[2], p[2] + p[5]] : [p[0], p[0] + p[3]]), ys = ps.flatMap(p => [p[1], p[1] + p[4]]);
  const u0 = Math.min(...xs), u1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const c = document.createElement('canvas'); c.width = (u1 - u0) * S; c.height = Math.ceil((y1 - y0) * P);
  const x = c.getContext('2d');
  const depth = p => side ? -(p[0] + p[3]) : p[2];
  [...ps].sort((a, b) => depth(b) - depth(a)).forEach(p => {
    const u = side ? p[2] : p[0], w = side ? p[5] : p[3];
    const X = (u - u0) * S, Y = c.height - (p[1] + p[4] - y0) * P, W = w * S, H = p[4] * P;
    x.globalAlpha = p[8] ? 0.45 : 1;
    x.fillStyle = card.hex[p[6]]; x.fillRect(X, Y, W, H);
    x.globalAlpha = 1; x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 0.6; x.strokeRect(X + .3, Y + .3, W - .6, H - .6);
  });
  return c;
}
const g = document.getElementById('g');
for (const k of cards) {
  const d = document.createElement('div'); d.className = 'card';
  const c = k.checks, ok = c.floating === 0 && c.collisions === 0 && c.com.inside;
  d.innerHTML = '<h3><span>' + k.name + '</span><span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ solid' : '✗ check failed') + '</span></h3>';
  const row = document.createElement('div'); row.className = 'row';
  const fig = (el, cap) => { const f = document.createElement('figure'); f.append(el); const t = document.createElement('div'); t.textContent = cap; f.append(t); row.append(f); };
  const im = new Image(); im.src = k.img; im.width = 120; fig(im, 'input');
  fig(view(k, false), 'front'); fig(view(k, true), 'side (right)');
  d.append(row);
  const sw = document.createElement('div'); sw.style.marginTop = '6px';
  sw.innerHTML = k.bricks.map(b => '<span class="sw"><i style="background:' + b.hex + '"></i>' + b.name + ' ' + b.n + '</span>').join('');
  d.append(sw);
  const st = document.createElement('div'); st.className = 'stats';
  st.innerHTML = '<b>' + c.pieces + '</b> pieces · ' + k.lots + ' lots · ' + k.steps + ' steps · ' + c.connections + ' studs connected · <span class="' + (c.floating ? 'bad' : 'ok') + '">' + c.floating + ' floating</span> · <span class="' + (c.collisions ? 'bad' : 'ok') + '">' + c.collisions + ' collisions</span> · ' + c.weak + ' weak · centre of mass ' + (c.com.inside ? '<span class="ok">over base</span> (' + c.com.margin + ' studs in)' : '<span class="bad">OUTSIDE base</span>') + ' · ~' + k.dims.join('×') + ' cm · ' + k.ms + ' ms';
  d.append(st);
  if (k.notes.length) { const n = document.createElement('div'); n.className = 'notes'; n.textContent = k.notes.join(' · '); d.append(n); }
  g.append(d);
}
</script></body></html>`;
writeFileSync(`out/stage1-${size}.html`, html);
console.log(`out/stage1-${size}.html`);

// 3D contact sheet: real Punks rendered by the site (XL and Mini) with their checks.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const { execSync } = require('child_process');
const fs = require('fs');
(async () => {
  const ids = (process.argv[2] || '3,7,9').split(',').map(Number);
  const out = process.argv[3] || 'out/sheet3d.png';
  // 24×24 RGBA of each Punk, produced by the TS helper
  const punks = JSON.parse(execSync(`npx tsx -e "import { realPunk } from './scripts/real'; console.log(JSON.stringify(${JSON.stringify(ids)}.map(id => Array.from(realPunk(id).data))))"`, { maxBuffer: 1 << 26 }).toString());
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 700, height: 1000 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:5178/');
  const rows = [];
  for (let k = 0; k < ids.length; k++) {
    const row = { id: ids[k], img: null, xl: null, mini: null };
    for (const size of ['xl', 'mini']) {
      const r = await p.evaluate(async ([data, size]) => {
        await ptb.setSize(size);
        const t = performance.now();
        await ptb.start({ width: 24, height: 24, data: new Uint8ClampedArray(data) });
        const ms = performance.now() - t;
        const v = ptb.viewer; v.skip(); v.controls.autoRotate = false;
        v.pose(v.tl.end); v.setBuildCamera(v.tl.end); v.render();
        const m = v.model, c = m.checks;
        return { shot: v.renderer.domElement.toDataURL('image/jpeg', 0.85), pieces: c.pieces, lots: m.bom.length, floating: c.floating, collisions: c.collisions, weak: c.weak, com: c.com, notes: m.notes, dims: m.dims, ms: Math.round(ms), top: m.pieces.some(q => q.group === 'top') };
      }, [punks[k], size]);
      row[size] = r;
    }
    row.img = await p.evaluate(data => { const c = document.createElement('canvas'); c.width = c.height = 24; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), 24, 24), 0, 0); return c.toDataURL(); }, punks[k]);
    rows.push(row);
    process.stdout.write('.');
  }
  const stat = s => { const ok = s.floating === 0 && s.collisions === 0 && s.com.inside; return `<div class="${ok ? 'ok' : 'bad'}">${ok ? '✓ solid' : '✗ FAILED'}</div><b>${s.pieces}</b> pieces · ${s.lots} lots<br>${s.floating} floating · ${s.collisions} collisions<br>${s.weak} weak · CoM ${s.com.inside ? 'over base' : 'OUT'}<br>${s.dims.join('×')} cm · ${s.ms} ms`; };
  const html = `<style>body{margin:14px;font:12px/1.35 system-ui;background:#f4f7fa;color:#1d2b36}h1{font-size:18px;margin:0 0 10px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.c{background:#fff;border-radius:10px;padding:8px;display:grid;grid-template-columns:64px 1fr 1fr;gap:8px;align-items:start}.c img.p{width:64px;image-rendering:pixelated;border-radius:6px}.v img{width:100%;border-radius:6px;display:block}.s{font-size:11px;color:#44505a;margin-top:4px}.ok{color:#17794b;font-weight:700}.bad{color:#c0340c;font-weight:800}.n{grid-column:1/-1;font-size:10.5px;color:#7a6400}</style>
<h1>Stage 3 — ${rows.length} real CryptoPunks, rendered by the site (XL left, Mini right)</h1><div class="g">${rows.map(r => `<div class="c"><div><img class="p" src="${r.img}"><div>#${r.id}</div></div><div class="v"><img src="${r.xl.shot}"><div class="s">XL · ${stat(r.xl)}</div></div><div class="v"><img src="${r.mini.shot}"><div class="s">Mini · ${stat(r.mini)}</div></div><div class="n">${[...new Set([...r.xl.notes, ...r.mini.notes])].join(' · ')}</div></div>`).join('')}</div>`;
  fs.writeFileSync(out.replace(/\.\w+$/, '.html'), html);
  const q = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await q.setContent(html); await q.waitForTimeout(500);
  await q.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 85 });
  await b.close(); console.log('\n' + out);
})();

// Contact sheet of build-animation frames, rendered by the dev server in Chrome.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
(async () => {
  const [, , example = '0', size = 'xl', out = 'out/frames.png'] = process.argv;
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:5178/');
  await p.evaluate(async ([i, s]) => { await ptb.setSize(s); await ptb.start(ptb.punkToImage(ptb.examples[+i])); }, [example, size]);
  await p.waitForFunction(() => ptb.viewer.model !== null, null, { timeout: 60000 });
  const times = await p.evaluate(() => { const tl = ptb.viewer.tl; return [1.2, 3.5, 6, 8.5, 11.2, tl.capDown[0] + 0.8, tl.hero + 0.3, tl.end]; });
  const shots = [];
  for (const t of times) {
    shots.push(await p.evaluate(t => { const v = ptb.viewer; v.skip(); v.controls.enabled = false; v.controls.autoRotate = false; v.pose(t); v.setBuildCamera(t); v.render(); return v.renderer.domElement.toDataURL('image/jpeg', 0.85); }, t));
  }
  const html = `<body style="margin:0;display:grid;grid-template-columns:repeat(4,300px);background:#B4DBF1">${shots.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:300px;height:300px;object-fit:cover;display:block"><span style="position:absolute;left:8px;top:6px;font:12px system-ui;color:#1d3b5c">${times[i].toFixed(1)} s</span></div>`).join('')}</body>`;
  const q = await b.newPage({ viewport: { width: 1200, height: 600 } });
  await q.setContent(html); await q.waitForTimeout(300);
  await q.screenshot({ path: out, fullPage: true });
  await b.close(); console.log(out);
})();

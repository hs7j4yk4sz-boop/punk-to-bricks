// Page images rendered by the site itself: hero-xl.jpg, hero-mini.jpg, og.png (1200×630).
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 700, height: 1000 }, deviceScaleFactor: 1.6 });
  await p.goto('http://localhost:5178/');
  await p.waitForFunction(() => window.ptb && window.ptb.setSize);
  const shots = {};
  for (const size of ['xl', 'mini']) {
    shots[size] = await p.evaluate(async size => {
      await ptb.setSize(size); await ptb.start(await ptb.exampleImage(ptb.examples[0].file));
      const v = ptb.viewer; v.skip(); v.controls.autoRotate = false;
      v.pose(v.tl.end); v.setBuildCamera(v.tl.end); v.render();
      return v.renderer.domElement.toDataURL('image/jpeg', 0.9);
    }, size);
    fs.writeFileSync(`public/hero-${size}.jpg`, Buffer.from(shots[size].split(',')[1], 'base64'));
  }
  const q = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await q.setContent(`<body style="margin:0;width:1200px;height:630px;background:#B4DBF1;font-family:-apple-system,system-ui,sans-serif;color:#16242f;display:flex;align-items:center;overflow:hidden">
    <div style="padding:0 0 0 70px;width:610px"><div style="font-size:30px;font-weight:700;opacity:.7">Punk to Bricks</div>
    <div style="font-size:62px;font-weight:800;line-height:1.05;letter-spacing:-.02em;margin:14px 0 22px">Turn your Punk into a brick bust you can really build</div>
    <div style="font-size:26px;line-height:1.4;opacity:.8">3D build animation · PDF instructions<br>BrickLink parts list · free, in your browser</div></div>
    <img src="${shots.xl}" style="width:640px;height:640px;margin-left:-40px;object-fit:cover"></body>`);
  await q.waitForTimeout(300);
  await q.screenshot({ path: 'public/og.png' });
  await b.close();
  for (const f of ['public/hero-xl.jpg', 'public/hero-mini.jpg', 'public/og.png']) console.log(f, Math.round(fs.statSync(f).size / 1024) + ' KB');
})();

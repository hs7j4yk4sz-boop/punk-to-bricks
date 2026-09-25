// Generation time on a simulated mid-range phone: mobile viewport + CPU slowed down with Chrome's throttling.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const { execSync } = require('child_process');
(async () => {
  const ids = (process.argv[2] || '19,755').split(',').map(Number);
  const rates = (process.argv[3] || '1,4,6').split(',').map(Number);
  const punks = JSON.parse(execSync(`npx tsx -e "import { realPunk } from './scripts/real'; console.log(JSON.stringify(${JSON.stringify(ids)}.map(id => Array.from(realPunk(id).data))))"`, { maxBuffer: 1 << 26 }).toString());
  const b = await chromium.launch({ executablePath: exe() });
  const ctx = await b.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5178/');
  await p.waitForFunction(() => window.ptb && window.ptb.buildModel);
  const cdp = await ctx.newCDPSession(p);
  console.log('rate  punk   size   worker(s)  main-thread(s)  pieces');
  for (const rate of rates) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (let k = 0; k < ids.length; k++) for (const size of ['mini', 'xl']) {
      const r = await p.evaluate(async ([data, size]) => {
        const image = { width: 24, height: 24, data: new Uint8ClampedArray(data) };
        let t = performance.now();
        const w = await ptb.build({ size, image });
        const tw = performance.now() - t;
        t = performance.now();
        const m = ptb.buildModel(ptb.detectPunk(image), size);
        return { tw, tm: performance.now() - t, pieces: m.checks.pieces, ok: w.ok };
      }, [punks[k], size]);
      console.log(String(rate + '×').padEnd(6), ('#' + ids[k]).padEnd(7), size.padEnd(6), (r.tw / 1000).toFixed(2).padStart(9), (r.tm / 1000).toFixed(2).padStart(15), String(r.pieces).padStart(7));
    }
    // a big phone screenshot (1170×2532 JPEG): decode + find the Punk
    const s = await p.evaluate(async (data) => {
      const c = document.createElement('canvas'); c.width = 1170; c.height = 2532; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 1170, 2532); x.fillStyle = '#222'; for (let i = 0; i < 300; i++) x.fillRect((i * 97) % 1100, 1300 + ((i * 53) % 1100), 12, 18);
      const pc = document.createElement('canvas'); pc.width = pc.height = 24; pc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), 24, 24), 0, 0);
      x.imageSmoothingEnabled = true; x.drawImage(pc, 60, 200, 1050, 1050);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      const t = performance.now();
      const img = await ptb.fileToImage(blob);
      const r = await ptb.build({ size: 'mini', image: img });
      return { t: performance.now() - t, ok: r.ok, msg: r.ok ? '' : r.message };
    }, punks[0]);
    console.log(String(rate + '×').padEnd(6), 'screenshot 1170×2532 JPEG → Mini'.padEnd(20), (s.t / 1000).toFixed(2).padStart(9), s.ok ? 'found' : 'FAILED ' + s.msg);
  }
  await b.close();
})();

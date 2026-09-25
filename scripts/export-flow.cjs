// Visitor flow: pick an example, type a Punk number, click every export button, keep the downloads.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const fs = require('fs');
(async () => {
  const [, , example = '0', size = 'xl', which = 'pdf,csv,xml,square,story', mobile = ''] = process.argv;
  fs.mkdirSync('out/exports', { recursive: true });
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext(mobile ? { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('http://localhost:5178/');
  await p.locator('.example-row button').nth(+example).click();
  await p.locator(`.size[data-size="${size}"]`).click();
  await p.waitForFunction(() => window.ptb && window.ptb.viewer.model && document.getElementById('busy').hidden, null, { timeout: 60000 });
  await p.fill('#punkno', '1234');
  const ids = { pdf: '#dl-pdf', csv: '#dl-csv', xml: '#dl-xml', square: '#vid-square', story: '#vid-story' };
  for (const k of which.split(',')) {
    const t = Date.now();
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click(ids[k])]);
    const path = `out/exports/${dl.suggestedFilename()}`;
    await dl.saveAs(path);
    console.log(k.padEnd(7), path, (fs.statSync(path).size / 1024).toFixed(0) + ' KB', ((Date.now() - t) / 1000).toFixed(1) + ' s');
  }
  const err = await p.locator('#progress-text').textContent();
  if (err && err.includes('failed')) console.log('UI ERROR:', err);
  await b.close();
})();

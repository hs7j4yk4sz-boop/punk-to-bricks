// End-to-end visitor journey on the live site, desktop and mobile, with proof (screenshots, downloads, network log).
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const fs = require('fs');
const URL = process.argv[2] || 'https://hs7j4yk4sz-boop.github.io/punk-to-bricks/';
const OUT = 'out/flow';
(async () => {
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const dev of ['desktop', 'mobile']) {
    const ctx = await b.newContext(dev === 'mobile'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
      : { viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    const p = await ctx.newPage();
    const errors = [], requests = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('request', r => requests.push([r.method(), r.url()]));
    const shot = async (name) => { await p.screenshot({ path: `${OUT}/${dev}-${name}.jpg`, type: 'jpeg', quality: 72 }); console.log(`  📸 ${dev}-${name}.jpg`); };
    const log = (...a) => console.log(' ', ...a);
    console.log(`\n=== ${dev.toUpperCase()} ===`);
    // 1. arrive
    let t = Date.now();
    await p.goto(URL, { waitUntil: 'networkidle' });
    log(`1. page loaded in ${Date.now() - t} ms · title "${await p.title()}"`);
    await shot('01-home');
    // 2. choose an image: a real Punk PNG (desktop) or a phone screenshot (mobile)
    const file = dev === 'desktop' ? `${OUT}/punk-7804.png` : `${OUT}/screenshot-3100.jpg`;
    t = Date.now();
    await p.setInputFiles('#file', file);
    await p.waitForSelector('#result:not([hidden])');
    await p.waitForSelector('#busy[hidden]', { state: 'attached', timeout: 60000 });
    log(`2. uploaded ${file.split('/').pop()} · model ready in ${Date.now() - t} ms · read: "${await p.textContent('#read-text')}"`);
    await p.waitForTimeout(5000); await p.locator('.stage').scrollIntoViewIfNeeded(); await shot('02-building');
    await p.waitForSelector('#hint:not([hidden])', { timeout: 30000 });
    await shot('03-built');
    const checks = (await p.locator('#checks li b').allTextContents()).join(' | ');
    log(`3. animation finished · checks: ${checks}`);
    log(`   notes: ${(await p.locator('#notes li').allTextContents()).join(' / ')}`);
    // 4. rotate by dragging
    const box = await p.locator('#view').boundingBox();
    if (dev === 'desktop') { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 30, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(400); await shot('04-rotated'); log('4. dragged to rotate the bust'); }
    // 5. the other size
    const other = dev === 'desktop' ? 'mini' : 'xl';
    t = Date.now();
    await p.click(`.size[data-size="${other}"]`);
    await p.waitForSelector('#busy[hidden]', { state: 'attached', timeout: 60000 });
    await p.click('#skip'); await p.waitForTimeout(400);
    log(`5. switched to ${other} in ${Date.now() - t} ms · ${(await p.locator('#checks li b').allTextContents()).slice(0, 4).join(' | ')}`);
    await shot('05-' + other);
    // 6. Punk number on the plate
    await p.fill('#punkno', dev === 'desktop' ? '7804' : '3100');
    // 7. downloads
    await p.locator('.exports').scrollIntoViewIfNeeded();
    await shot('06-exports');
    const want = dev === 'desktop' ? ['#dl-pdf', '#dl-csv', '#dl-xml', '#vid-square'] : ['#dl-pdf', '#vid-story'];
    for (const id of want) {
      t = Date.now();
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click(id)]);
      const path = `${OUT}/${dev}-${dl.suggestedFilename()}`; await dl.saveAs(path);
      log(`7. ${id.replace('#', '')} → ${dl.suggestedFilename()} · ${(fs.statSync(path).size / 1024).toFixed(0)} KB · ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    // 8. share on X
    await p.locator('#share-x').dispatchEvent('pointerdown');
    const href = await p.getAttribute('#share-x', 'href');
    log(`8. Share on X → ${decodeURIComponent(href).slice(0, 190)}…`);
    // 9. wrong image
    await p.setInputFiles('#file', `${OUT}/not-a-punk.jpg`);
    await p.waitForSelector('#error:not([hidden])', { timeout: 30000 });
    await p.locator('#error').scrollIntoViewIfNeeded(); await shot('09-error');
    log(`9. not a Punk → "${await p.textContent('#error')}"`);
    // privacy: what left the browser?
    const origin = new globalThis.URL(URL).origin;
    const posts = requests.filter(([m]) => m !== 'GET');
    const foreign = requests.filter(([, u]) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    log(`privacy: ${requests.length} requests, ${posts.length} non-GET, ${foreign.length} to other sites ${foreign.map(r => r[1]).join(' ')}`);
    log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await ctx.close();
  }
  await b.close();
})();

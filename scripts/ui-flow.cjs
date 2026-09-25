// New result UI: key figures, More info, full kit ZIP, Order the bricks panel. Desktop and mobile, with screenshots.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const { execSync } = require('child_process');
const URL = process.argv[2] || 'http://localhost:5178/';
(async () => {
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu'] });
  for (const dev of ['desktop', 'mobile']) {
    const ctx = await b.newContext(dev === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = [], reqs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('request', r => reqs.push(r.method()));
    const shot = async n => { await p.screenshot({ path: `out/ui/${dev}-${n}.png` }); };
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.locator('.example-row button').first().click();
    await p.waitForFunction(() => document.getElementById('busy').hidden && document.querySelector('#stats .stat'), null, { timeout: 60000 });
    await p.click('#skip'); await p.waitForTimeout(500);
    console.log(`\n${dev}: figures → ${(await p.locator('#stats .stat').allInnerTexts()).map(t => t.replace('\n', ' ')).join(' | ')}`);
    console.log(`${dev}: status → ${(await p.textContent('#more summary')).trim()}`);
    await p.locator('#stats').scrollIntoViewIfNeeded(); await p.mouse.wheel(0, 120); await p.waitForTimeout(200);
    await shot('1-result');
    await p.click('#more summary'); await p.waitForTimeout(200); await p.locator('#more').scrollIntoViewIfNeeded(); await shot('2-more-info');
    console.log(`${dev}: more info → ${(await p.locator('#checks li b').allTextContents()).join(' | ')}`);
    await p.click('#more summary');
    // full kit
    let t = Date.now();
    const [kit] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#dl-kit')]);
    const zp = `out/ui/${dev}-${kit.suggestedFilename()}`; await kit.saveAs(zp);
    console.log(`${dev}: kit → ${kit.suggestedFilename()} in ${((Date.now() - t) / 1000).toFixed(1)} s · ${execSync(`unzip -l ${zp} | tail -n +4 | head -n -2 | awk '{print $4" ("$1" B)"}'`).toString().trim().split('\n').join(', ')} · unzip test: ${execSync(`unzip -tq ${zp}`).toString().trim()}`);
    // order: notice first, then the panel
    await p.click('#open-order');
    await p.waitForSelector('#before-order[open]');
    await p.check('#bo-ok'); await p.click('#bo-continue');
    await p.waitForSelector('#order-panel[open]');
    console.log(`${dev}: panel → ${await p.textContent('.legend')} · step 1: ${await p.textContent('#pab-note')}`);
    await shot('3-order-panel');
    await p.locator('#order-panel .toggle').click();
    await p.waitForFunction(() => /^Done/.test(document.getElementById('prefer-note').textContent), null, { timeout: 60000 });
    console.log(`${dev}: only LEGO parts → ${await p.textContent('.legend')} · ${await p.textContent('#prefer-note')}`);
    await shot('4-order-panel-lego');
    const [csv] = await Promise.all([p.waitForEvent('download'), p.click('#dl-pab')]);
    const [xml] = await Promise.all([p.waitForEvent('download'), p.click('#dl-xml')]);
    console.log(`${dev}: downloads → ${csv.suggestedFilename()}, ${xml.suggestedFilename()} (no second notice: ${await p.locator('#before-order[open]').count() === 0})`);
    await p.click('#op-close');
    console.log(`${dev}: chip on the button → ${await p.textContent('#order-chip')} · non-GET requests ${reqs.filter(m => m !== 'GET').length} · errors ${errs.length ? errs : 'none'}`);
    await ctx.close();
  }
  await b.close();
})();

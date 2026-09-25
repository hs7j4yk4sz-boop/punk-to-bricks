// Order flow check: summary, "Prefer parts available at LEGO", disclaimer dialog, downloads, footer.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:5178/';
(async () => {
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu'] });
  for (const dev of ['desktop', 'mobile']) {
    const ctx = await b.newContext(dev === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = [], reqs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('request', r => reqs.push(r.method() + ' ' + r.url()));
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.locator('.example-row button').first().click();
    await p.waitForFunction(() => document.getElementById('busy').hidden && document.getElementById('order-summary').textContent, null, { timeout: 60000 });
    console.log(`\n${dev}: summary → ${await p.textContent('#order-summary')}`);
    await p.check('#prefer-lego');
    await p.waitForFunction(() => document.getElementById('busy').hidden && /0 lots only via BrickLink/.test(document.getElementById('order-summary').textContent), null, { timeout: 60000 });
    console.log(`${dev}: prefer LEGO → ${await p.textContent('#order-summary')} · checks: ${(await p.locator('#checks li b').allTextContents()).slice(0, 4).join(' | ')}`);
    await p.locator('#order').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `out/order/${dev}-order-section.png` });
    // first order download opens the notice
    await p.click('#dl-pab');
    await p.waitForSelector('#before-order[open]');
    console.log(`${dev}: dialog open · Continue disabled: ${await p.isDisabled('#bo-continue')}`);
    await p.screenshot({ path: `out/order/${dev}-dialog.png` });
    await p.check('#bo-ok');
    console.log(`${dev}: after ticking "I understand" · Continue disabled: ${await p.isDisabled('#bo-continue')}`);
    await p.screenshot({ path: `out/order/${dev}-dialog-checked.png` });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bo-continue')]);
    const path = `out/order/${dev}-${dl.suggestedFilename()}`; await dl.saveAs(path);
    const csv = fs.readFileSync(path, 'utf8');
    console.log(`${dev}: downloaded ${dl.suggestedFilename()} · ${csv.split('\r\n').length - 1} lines · header ${JSON.stringify(csv.slice(0, 20))}`);
    // second order download: no dialog again
    const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#dl-xml')]);
    console.log(`${dev}: BrickLink list without asking again → ${dl2.suggestedFilename()} · dialog open: ${await p.locator('#before-order[open]').count() > 0}`);
    await p.locator('footer').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `out/order/${dev}-footer.png` });
    console.log(`${dev}: footer → ${(await p.textContent('footer')).replace(/\s+/g, ' ').trim()}`);
    console.log(`${dev}: requests other than GET: ${reqs.filter(r => !r.startsWith('GET')).length} · errors: ${errs.length ? errs : 'none'}`);
    await ctx.close();
  }
  await b.close();
})();

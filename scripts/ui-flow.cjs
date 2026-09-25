// Visitor journey through the three sections (bust, instructions, buy), desktop and mobile, with screenshots.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const { execSync } = require('child_process');
const URL = process.argv[2] || 'http://localhost:5178/';
(async () => {
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu'] });
  for (const dev of ['desktop', 'mobile']) {
    const ctx = await b.newContext({ ...(dev === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }), acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage(); const errs = [], hosts = new Set(), methods = new Set();
    p.on('pageerror', e => errs.push(e.message)); p.on('request', r => { hosts.add(new globalThis.URL(r.url()).host); methods.add(r.method()); });
    const shot = async (n, sel) => { if (sel) await p.locator(sel).screenshot({ path: `out/ui3/${dev}-${n}.png` }); else await p.screenshot({ path: `out/ui3/${dev}-${n}.png` }); };
    await p.goto(URL, { waitUntil: 'networkidle' });
    if (process.argv[3] === 'reference') await p.locator('.example-row button').first().click(); else { await p.fill('#punk-number', process.argv[3] || '1234'); await p.click('.go'); }
    await p.waitForFunction(() => document.getElementById('busy').hidden && document.querySelector('#stats .stat') && document.getElementById('pg-range').max > 1, null, { timeout: 60000 });
    await p.click('#skip'); await p.waitForTimeout(400);
    console.log(`\n${dev}: ① ${await p.textContent('#bust-sub')} · ${(await p.locator('#stats .stat b').allInnerTexts()).join(' / ')} · ${await p.textContent('#pill')}`);
    await shot('1-bust', '#sec-bust');
    // ② instructions
    await p.locator('#sec-manual').scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    console.log(`${dev}: menu while on ② → ${await p.locator('#secnav a.on').textContent()}`);
    await p.click('#pg-next'); await p.click('#pg-next');
    console.log(`${dev}: ② ${await p.textContent('#manual-sub')} · after 2 × next: ${await p.textContent('#pg-label')}`);
    await p.locator('#pg-range').fill('21'); await p.waitForTimeout(300);
    console.log(`${dev}: ② slider to page 21 → ${await p.textContent('#pg-label')}`);
    const drawn = await p.evaluate(() => [...document.querySelectorAll('#thumbs canvas')].filter(c => { const d = c.getContext('2d').getImageData(112, 40, 1, 1).data; return d[3] > 0; }).length);
    console.log(`${dev}: ② thumbnails drawn so far (lazy): ${drawn} of ${await p.locator('#thumbs button').count()}`);
    await shot('2-instructions', '#sec-manual');
    // ③ buy
    await p.locator('#sec-buy').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => /\(\+?-?\d+ pieces\)/.test(document.getElementById('prefer-text').textContent) || document.getElementById('lego-option').hidden, null, { timeout: 30000 });
    await p.waitForTimeout(500);
    console.log(`${dev}: menu while on ③ → ${await p.locator('#secnav a.on').textContent()}`);
    console.log(`${dev}: ③ ${await p.textContent('#shop-sum')} · lots drawn: ${await p.locator('.lot').count()} (${await p.locator('.lot .dot.bl').count()} BrickLink only) · LEGO ${await p.textContent('#lego-n')}${await p.textContent('#lego-total')} · BrickLink ${await p.textContent('#bl-n')}${await p.textContent('#bl-total')} · option: ${(await p.isHidden('#lego-option')) ? '(hidden)' : await p.textContent('#prefer-text')}`);
    await shot('3-buy', '#sec-buy');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), (async () => { await p.click('#buy-lego'); await p.waitForSelector('#before-order[open]'); await p.check('#bo-ok'); await p.click('#bo-continue'); })()]);
    const csv = await dl.path().then(f => require('fs').readFileSync(f, 'utf8'));
    console.log(`${dev}: Buy at LEGO → notice, then ${dl.suggestedFilename()} (${csv.split('\r\n').length - 1} lines) · ${await p.textContent('#lego-after')}`);
    await p.click('#buy-bl'); await p.waitForTimeout(300);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    console.log(`${dev}: Buy on BrickLink → ${(await p.textContent('#bl-after')).slice(0, 60)}… · clipboard ${[...clip.matchAll(/<ITEM>/g)].length} lots`);
    await shot('4-buy-after', '#sec-buy');
    if (!(await p.isHidden('#lego-option'))) {
      await p.locator('#lego-option').click();
      await p.waitForFunction(() => /on/.test(document.getElementById('prefer-text').textContent) && document.getElementById('busy').hidden, null, { timeout: 60000 }); await p.waitForTimeout(500);
      console.log(`${dev}: only LEGO parts → LEGO ${await p.textContent('#lego-n')}${await p.textContent('#lego-total')} · BrickLink ${await p.textContent('#bl-n')}${await p.textContent('#bl-total')} (${await p.textContent('#bl-sub')}) · ${await p.textContent('#prefer-text')} · pill ${await p.textContent('#pill')}`);
    }
    console.log(`${dev}: hosts ${[...hosts].join(', ')} · methods ${[...methods].join(',')} · errors ${errs.length ? errs : 'none'}`);
    await ctx.close();
  }
  await b.close();
})();

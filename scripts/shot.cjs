// Screenshot a local HTML page (full page) with an installed Chromium.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
function exe() {
  const c = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const dir = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir).filter(d => d.startsWith('chromium-')).sort().reverse())
    c.push(path.join(dir, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), path.join(dir, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'));
  return c.find(p => p && fs.existsSync(p));
}
module.exports = { exe };
if (require.main === module) (async () => {
  const [, , file, out, width = '1400'] = process.argv;
  const b = await chromium.launch({ executablePath: exe() });
  const p = await b.newPage({ viewport: { width: +width, height: 900 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(500);
  await p.screenshot({ path: out, fullPage: true, type: out.endsWith('.png') ? 'png' : 'jpeg', quality: out.endsWith('.png') ? undefined : 85 });
  await b.close(); console.log(out);
})();

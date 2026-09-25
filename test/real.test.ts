// Real CryptoPunks in the forms visitors upload. Runs only when real/punks.png is present (local, not in git).
import { describe, expect, it } from 'vitest';
import jpeg from 'jpeg-js';
import { deltaE, rgbToLab, type RGB } from '../src/core/color';
import { detectPunk, type PunkGrid, type RGBAImage } from '../src/core/detect';
import { buildModel } from '../src/core/build';
import { hasRealPunks, realPunk } from '../scripts/real';
import { blank, paste, rect, resize, toJPEG } from './img';

const SAMPLE = Array.from({ length: 120 }, (_, i) => (i * 8363 + 17) % 10000);

function upscale(img: RGBAImage, k: number): RGBAImage {
  const out = blank(img.width * k, img.height * k, [0, 0, 0, 0]);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const o = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
    out.data.set(img.data.subarray(o, o + 4), (y * out.width + x) * 4);
  }
  return out;
}
const jpegRoundTrip = (img: RGBAImage, q: number): RGBAImage => {
  const j = jpeg.decode(toJPEG(img, q), { useTArray: true, formatAsRGBA: true });
  return { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data) };
};
/** The detected grid splits pixels exactly like the source 24×24 (near-identical colours may merge). */
function expectSame(g: PunkGrid, truth: RGBAImage, mergeBelow = 5) {
  const bg = truth.data.slice(0, 4);
  const key = (r: number, c: number) => { const o = (r * 24 + c) * 4; return truth.data[o + 3] < 128 ? 'bg' : [0, 1, 2].map(k => truth.data[o + k]).join(','); };
  const bgKey = key(0, 0);
  const map = new Map<string, number>();
  for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) {
    const k = key(r, c), v = g.cells[r][c];
    if (k === bgKey) { expect(v, `bg ${r},${c}`).toBe(-1); continue; }
    expect(v, `pixel ${r},${c}`).toBeGreaterThanOrEqual(0);
    if (!map.has(k)) map.set(k, v);
    expect(v, `pixel ${r},${c}`).toBe(map.get(k));
  }
  const ks = [...map.keys()];
  for (const a of ks) for (const b of ks) if (a < b && map.get(a) === map.get(b)) {
    const la = rgbToLab(a.split(',').map(Number) as RGB), lb = rgbToLab(b.split(',').map(Number) as RGB);
    expect(deltaE(la, lb), `${a} merged with ${b}`).toBeLessThan(mergeBelow);
  }
  void bg;
}

describe.skipIf(!hasRealPunks())('real CryptoPunks, as visitors upload them', { timeout: 120_000 }, () => {
  it('24×24 PNG on the usual blue background', () => { for (const id of SAMPLE) expectSame(detectPunk(realPunk(id)), realPunk(id)); });
  it('upscaled ×20 PNG', () => { for (const id of SAMPLE.slice(0, 40)) expectSame(detectPunk(upscale(realPunk(id), 20)), realPunk(id)); });
  it('transparent background PNG', () => { for (const id of SAMPLE) expectSame(detectPunk(upscale(realPunk(id, null), 8)), realPunk(id, null)); });
  it('blurry JPEG at a non-integer size', () => {
    for (const id of SAMPLE.slice(0, 40)) expectSame(detectPunk(jpegRoundTrip(resize(upscale(realPunk(id), 24), 419, 419), 75)), realPunk(id), 6);
  });
  it('phone screenshot (JPEG) with a page around the Punk', () => {
    for (const id of SAMPLE.slice(0, 12)) {
      const shot = blank(1170, 1600, [255, 255, 255, 255]);
      rect(shot, 0, 0, 1170, 110, [30, 30, 36]);
      for (let i = 0; i < 300; i++) rect(shot, 60 + ((i * 97) % 1000), 1000 + ((i * 53) % 500), 10, 16, [40, 40, 40]);
      paste(shot, resize(upscale(realPunk(id), 24), 690, 690), 240, 180);
      const g = detectPunk(jpegRoundTrip(shot, 80));
      expectSame(g, realPunk(id), 6);
    }
  });
  it('builds solid in both sizes', () => {
    for (const id of SAMPLE.slice(0, 30)) for (const size of ['mini', 'xl'] as const) {
      const m = buildModel(detectPunk(realPunk(id)), size);
      expect(m.checks.floating, `#${id} ${size}`).toBe(0);
      expect(m.checks.collisions, `#${id} ${size}`).toBe(0);
      expect(m.checks.com.inside, `#${id} ${size}`).toBe(true);
    }
  });
});

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectPunk, DetectError, type PunkGrid, type RGBAImage } from '../src/core/detect';
import { REFERENCE_PUNK, TEST_PUNKS, type TestPunk } from './fixtures/punks';
import { blank, load, punkImage, resize, screenshot, toJPEG } from './img';
import jpeg from 'jpeg-js';
import { deltaE, hexToRgb, rgbToLab } from '../src/core/color';

/** The detected grid must split pixels into exactly the same colour classes as the drawing. */
function expectSameGrid(g: PunkGrid, p: TestPunk) {
  const map = new Map<string, number>();
  for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) {
    const ch = p.rows[r][c], v = g.cells[r][c];
    if (ch === '.') { expect(v, `bg at ${r},${c}`).toBe(-1); continue; }
    expect(v, `pixel ${r},${c}`).toBeGreaterThanOrEqual(0);
    if (!map.has(ch)) map.set(ch, v);
    expect(v, `pixel ${r},${c} '${ch}'`).toBe(map.get(ch));
  }
  // distinct drawing colours stay distinct, unless they are near-identical (ΔE < 5)
  const chars = [...map.keys()];
  for (const a of chars) for (const b of chars) {
    if (a >= b || map.get(a) !== map.get(b)) continue;
    expect(deltaE(rgbToLab(hexToRgb(p.palette[a])), rgbToLab(hexToRgb(p.palette[b]))), `'${a}' and '${b}' merged`).toBeLessThan(5);
  }
}
const jpegRoundTrip = (img: RGBAImage, q: number): RGBAImage => {
  const j = jpeg.decode(toJPEG(img, q), { useTArray: true, formatAsRGBA: true });
  return { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data) };
};

const ALL = [REFERENCE_PUNK, ...TEST_PUNKS];

describe('grid detection', () => {
  it.each(ALL.map(p => [p.name, p]))('original 24×24 PNG: %s', (_, p) => expectSameGrid(detectPunk(punkImage(p as TestPunk)), p as TestPunk));
  it.each(ALL.map(p => [p.name, p]))('upscaled ×20: %s', (_, p) => expectSameGrid(detectPunk(punkImage(p as TestPunk, 20)), p as TestPunk));
  it.each(ALL.map(p => [p.name, p]))('JPEG, blurry non-integer scale: %s', (_, p) => {
    const img = jpegRoundTrip(resize(punkImage(p as TestPunk, 24), 419, 419), 70);
    expectSameGrid(detectPunk(img), p as TestPunk);
  });
  it.each(ALL.slice(0, 6).map(p => [p.name, p]))('phone screenshot with page around it: %s', (_, p) => {
    const g = detectPunk(jpegRoundTrip(screenshot(p as TestPunk), 80));
    expectSameGrid(g, p as TestPunk);
    expect(Math.abs(g.box.x - 120)).toBeLessThanOrEqual(3);
    expect(Math.abs(g.box.size - 517)).toBeLessThanOrEqual(4);
  });
  it('transparent background PNG', () => {
    const g = detectPunk(punkImage(REFERENCE_PUNK, 10, true));
    expect(g.background).toBeNull();
    expectSameGrid(g, REFERENCE_PUNK);
  });
  it('reference booklet cover (a real rendered image with the Punk inside)', () => {
    const path = '../cryptopunk-brick-bust/images/cover.jpg';
    if (!existsSync(path)) return;
    expectSameGrid(detectPunk(load(path)), REFERENCE_PUNK);
  });

  it('rejects noise', () => {
    const img = blank(300, 300);
    let s = 1; for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : (s = (s * 48271) % 2147483647) & 255;
    expect(() => detectPunk(img)).toThrow(DetectError);
  });
  it('rejects a plain image', () => expect(() => detectPunk(blank(400, 400, [200, 30, 30, 255]))).toThrow(DetectError));
  it('rejects a tiny image', () => expect(() => detectPunk(blank(12, 12))).toThrow(DetectError));
  it('rejects a Punk that is cut off', () => {
    const full = punkImage(REFERENCE_PUNK, 10), crop = blank(160, 240);
    for (let y = 0; y < 240; y++) for (let x = 0; x < 160; x++) for (let k = 0; k < 4; k++) crop.data[(y * 160 + x) * 4 + k] = full.data[(y * 240 + x + 80) * 4 + k];
    expect(() => detectPunk(crop)).toThrow(DetectError);
  });
});

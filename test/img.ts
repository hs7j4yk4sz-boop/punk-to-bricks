// Node-only image helpers for tests and scripts (PNG/JPEG in and out).
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { hexToRgb } from '../src/core/color';
import type { RGBAImage } from '../src/core/detect';
import type { TestPunk } from './fixtures/punks';

export function blank(width: number, height: number, rgba: [number, number, number, number] = [255, 255, 255, 255]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

/** The Punk at `scale` pixels per cell. `transparentBg` leaves the background out. */
export function punkImage(p: TestPunk, scale = 1, transparentBg = false): RGBAImage {
  const img = blank(24 * scale, 24 * scale, [0, 0, 0, 0]);
  for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) {
    const ch = p.rows[r][c];
    if (ch === '.' && transparentBg) continue;
    const hex = p.palette[ch];
    if (!hex) throw new Error(`${p.name}: no colour for '${ch}'`);
    const [R, G, B] = hexToRgb(hex);
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) img.data.set([R, G, B, 255], ((r * scale + y) * img.width + c * scale + x) * 4);
  }
  return img;
}

/** Bilinear resize (blurs pixel edges like a browser or phone screenshot). */
export function resize(src: RGBAImage, w: number, h: number): RGBAImage {
  const out = blank(w, h, [0, 0, 0, 0]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.max(0, (x + 0.5) * src.width / w - 0.5), sy = Math.max(0, (y + 0.5) * src.height / h - 0.5);
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(src.width - 1, x0 + 1), y1 = Math.min(src.height - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    for (let k = 0; k < 4; k++) {
      const p = (xx: number, yy: number) => src.data[(yy * src.width + xx) * 4 + k];
      out.data[(y * w + x) * 4 + k] = (p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy;
    }
  }
  return out;
}

export function paste(dst: RGBAImage, src: RGBAImage, x0: number, y0: number) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const o = (y * src.width + x) * 4, a = src.data[o + 3] / 255;
    const d = ((y0 + y) * dst.width + x0 + x) * 4;
    for (let k = 0; k < 3; k++) dst.data[d + k] = src.data[o + k] * a + dst.data[d + k] * (1 - a);
    dst.data[d + 3] = 255;
  }
}

export function rect(img: RGBAImage, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set([...rgb, 255], (y * img.width + x) * 4);
}

/** A fake marketplace screenshot: page chrome, text-like noise, the Punk scaled by a non-integer factor. */
export function screenshot(p: TestPunk, size = 517, W = 1170, H = 1600): RGBAImage {
  const img = blank(W, H, [246, 247, 249, 255]);
  rect(img, 0, 0, W, 120, [32, 34, 40]);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) rect(img, 60 + Math.floor(rnd() * (W - 200)), 900 + Math.floor(rnd() * 600), 4 + Math.floor(rnd() * 14), 18, [40, 40, 40]);
  for (let i = 0; i < 40; i++) rect(img, 20 + Math.floor(rnd() * 1000), 30 + Math.floor(rnd() * 60), 10, 14, [220, 220, 220]);
  paste(img, resize(punkImage(p, 24), size, size), 120, 200);
  return img;
}

export function toPNG(img: RGBAImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}
export function toJPEG(img: RGBAImage, quality = 75): Buffer {
  return Buffer.from(jpeg.encode({ width: img.width, height: img.height, data: Buffer.from(img.data) }, quality).data);
}
export function load(path: string): RGBAImage {
  const buf = readFileSync(path);
  if (buf[0] === 0x89) { const p = PNG.sync.read(buf); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; }
  const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data) };
}
export const savePNG = (path: string, img: RGBAImage) => writeFileSync(path, toPNG(img));
export const saveJPEG = (path: string, img: RGBAImage, q = 80) => writeFileSync(path, toJPEG(img, q));

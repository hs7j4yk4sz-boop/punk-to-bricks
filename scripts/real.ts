// Helpers for the real CryptoPunks test set (real/punks.png, local only, never published).
import { existsSync } from 'node:fs';
import type { RGBAImage } from '../src/core/detect';
import { load } from '../test/img';

export const PUNKS_PNG = new URL('../real/punks.png', import.meta.url).pathname;
export const hasRealPunks = () => existsSync(PUNKS_PNG);
let sheet: RGBAImage | null = null;
export const OFFICIAL_BG: [number, number, number] = [0x63, 0x85, 0x96];

/** Punk #id as 24×24, on the usual blue background (or transparent). */
export function realPunk(id: number, bg: [number, number, number] | null = OFFICIAL_BG): RGBAImage {
  sheet ??= load(PUNKS_PNG);
  const X = (id % 100) * 24, Y = Math.floor(id / 100) * 24;
  const data = new Uint8ClampedArray(24 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const o = ((Y + y) * sheet.width + X + x) * 4, a = sheet.data[o + 3] / 255, d = (y * 24 + x) * 4;
    if (!bg) { data.set(sheet.data.subarray(o, o + 4), d); continue; }
    for (let k = 0; k < 3; k++) data[d + k] = Math.round(sheet.data[o + k] * a + bg[k] * (1 - a));
    data[d + 3] = 255;
  }
  return { width: 24, height: 24, data };
}

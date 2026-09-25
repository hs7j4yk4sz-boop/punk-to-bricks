// Find a CryptoPunk (24×24 pixel grid) inside any image: the original PNG,
// an upscaled copy, a JPEG, or a screenshot with other things around it.
import { deltaE, rgbDist, rgbToLab, type RGB } from './color';

export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export interface PunkGrid {
  /** 24 rows × 24 cols; -1 = background, otherwise index into `colors` */
  cells: number[][];
  colors: { rgb: RGB; count: number }[];
  background: RGB | null;
  /** where the Punk was found, in source image pixels */
  box: { x: number; y: number; size: number };
}

export class DetectError extends Error {
  constructor(public code: 'no-punk' | 'not-grid' | 'empty', message: string) { super(message); }
}

const N = 24;
const TOL = 28;           // max channel difference inside one flat region
const MAX_WORK = 3_000_000;

export function detectPunk(img: RGBAImage): PunkGrid {
  if (img.width === N && img.height === N) return sample(img, 0, 0, N, null);

  // Work on a nearest-neighbour downscale of very large images for the search.
  const f = Math.max(1, Math.ceil(Math.sqrt((img.width * img.height) / MAX_WORK)));
  const W = Math.floor(img.width / f), H = Math.floor(img.height / f);
  const px = (x: number, y: number) => ((y * f) * img.width + x * f) * 4;
  const d = img.data;
  const transparent = (o: number) => d[o + 3] < 128;
  const same = (o1: number, o2: number) => {
    const t1 = transparent(o1), t2 = transparent(o2);
    if (t1 || t2) return t1 && t2;
    return Math.abs(d[o1] - d[o2]) <= TOL && Math.abs(d[o1 + 1] - d[o2 + 1]) <= TOL && Math.abs(d[o1 + 2] - d[o2 + 2]) <= TOL;
  };

  // Flat-colour regions (flood fill, compared to the region's seed colour).
  const label = new Int32Array(W * H).fill(-1);
  const comps: { seed: number; count: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (label[s] >= 0) continue;
    const id = comps.length, so = px(s % W, (s / W) | 0);
    const c = { seed: so, count: 0, x0: W, y0: H, x1: -1, y1: -1 };
    let sp = 0; stack[sp++] = s; label[s] = id;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0;
      c.count++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) if (q >= 0 && label[q] < 0 && same(so, px(q % W, (q / W) | 0))) { label[q] = id; stack[sp++] = q; }
    }
    comps.push(c);
  }

  // A Punk background is one flat region whose bounding box is a square: it
  // covers the whole top row and both side columns, and wraps around the Punk.
  const cands: { x: number; y: number; size: number; area: number }[] = [];
  comps.forEach((c, id) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    if (w < N / f || Math.abs(w - h) > Math.max(2, 0.03 * Math.max(w, h))) return;
    const fill = c.count / (w * h);
    if (fill < 0.3 || fill > 0.93) return;
    const cover = (xa: number, ya: number, xb: number, yb: number) => {
      let n = 0, t = 0;
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { t++; if (label[y * W + x] === id) n++; }
      return n / t;
    };
    if (cover(c.x0, c.y0, c.x1, c.y0) < 0.9 || cover(c.x0, c.y0, c.x0, c.y1) < 0.85 || cover(c.x1, c.y0, c.x1, c.y1) < 0.85) return;
    cands.push({ x: c.x0 * f, y: c.y0 * f, size: Math.round(((w + h) / 2) * f), area: w * h });
  });
  // Also try the whole image when it is (nearly) square: covers Punks whose
  // background matches the page, or tight crops.
  if (Math.abs(img.width - img.height) <= Math.max(2, 0.03 * img.width)) cands.push({ x: 0, y: 0, size: Math.min(img.width, img.height), area: -1 });
  cands.sort((a, b) => b.area - a.area);

  let lastErr: DetectError | null = null;
  for (const c of cands.slice(0, 6)) {
    try { return sample(img, c.x, c.y, c.size, null); } catch (e) { if (e instanceof DetectError) lastErr = e; else throw e; }
  }
  throw lastErr ?? new DetectError('no-punk', "We couldn't find a CryptoPunk in this image. Use the Punk's own image (PNG or JPG), or a screenshot where the Punk and its plain background are fully visible.");
}

function sample(img: RGBAImage, x0: number, y0: number, size: number, _bg: RGB | null): PunkGrid {
  const s = size / N, d = img.data;
  if (s < 1) throw new DetectError('not-grid', 'This image is too small: a Punk needs at least 24×24 pixels.');
  const raw: (RGB | null)[][] = [];
  let uni = 0;
  for (let r = 0; r < N; r++) {
    const row: (RGB | null)[] = [];
    for (let c = 0; c < N; c++) {
      const xa = x0 + (c + 0.25) * s, xb = x0 + (c + 0.75) * s, ya = y0 + (r + 0.25) * s, yb = y0 + (r + 0.75) * s;
      const step = Math.max(1, (xb - xa) / 12);
      const pts: (RGB | null)[] = [];
      for (let y = ya; y <= yb + 1e-6; y += step) for (let x = xa; x <= xb + 1e-6; x += step) {
        const xi = Math.min(img.width - 1, Math.floor(x)), yi = Math.min(img.height - 1, Math.floor(y));
        const o = (yi * img.width + xi) * 4;
        pts.push(d[o + 3] < 128 ? null : [d[o], d[o + 1], d[o + 2]]);
      }
      const solid = pts.filter((p): p is RGB => p !== null);
      if (solid.length * 2 < pts.length) { row.push(null); uni += (pts.length - solid.length) / pts.length; continue; }
      const med: RGB = [0, 1, 2].map(k => solid.map(p => p[k]).sort((a, b) => a - b)[solid.length >> 1]) as RGB;
      uni += solid.filter(p => rgbDist(p, med) <= 36).length / pts.length;
      row.push(med);
    }
    raw.push(row);
  }
  if (uni / (N * N) < 0.8) throw new DetectError('not-grid', "We found a square, but it doesn't look like a clean 24×24 pixel grid. The image may be blurry, cropped or rotated. Try the original Punk image.");

  // Background: the colour of the top-left cell (Punks never touch it).
  const bg = raw[0][0];
  const isBg = (p: RGB | null) => (p === null ? bg === null : bg !== null && rgbDist(p, bg) <= TOL);
  const edgeBg = [...raw[0], ...raw.map(r => r[0]), ...raw.map(r => r[N - 1])].filter(isBg).length;
  if (edgeBg < 0.9 * (3 * N)) throw new DetectError('no-punk', "We found a pixel grid, but not a Punk: a Punk has a plain background along the top and both sides. Try a tighter crop or the original image.");

  // Cluster the cell colours (JPEG noise) into the Punk's own palette.
  const colors: { rgb: RGB; lab: ReturnType<typeof rgbToLab>; sum: RGB; count: number }[] = [];
  const cells: number[][] = raw.map(row => row.map(p => {
    if (isBg(p)) return -1;
    const rgb = p as RGB, lab = rgbToLab(rgb);
    let k = colors.findIndex(c => deltaE(c.lab, lab) < 5);
    if (k < 0) { k = colors.length; colors.push({ rgb, lab, sum: [0, 0, 0], count: 0 }); }
    const c = colors[k]; c.count++; c.sum = [c.sum[0] + rgb[0], c.sum[1] + rgb[1], c.sum[2] + rgb[2]];
    return k;
  }));
  const filled = colors.reduce((a, c) => a + c.count, 0);
  if (filled < 60) throw new DetectError('empty', "We found a pixel grid, but it's almost empty. Is this really a Punk?");
  if (filled > 480) throw new DetectError('no-punk', "We found a pixel grid, but it's almost full: we couldn't tell the Punk from its background.");
  return {
    cells,
    colors: colors.map(c => ({ rgb: c.sum.map(v => Math.round(v / c.count)) as RGB, count: c.count })),
    background: bg,
    box: { x: Math.round(x0), y: Math.round(y0), size: Math.round(size) },
  };
}

// Cut the Punks out of John's images (single Punk or a grid of Punks) into clean 24×24 PNGs.
import { load, savePNG, blank } from '../test/img';
import { rgbDist, type RGB } from '../src/core/color';
import { detectPunk } from '../src/core/detect';

const [src, prefix, forcedCell] = [process.argv[2], process.argv[3], process.argv[4]];
const img = load(src);
const W = img.width, H = img.height, d = img.data;
const px = (x: number, y: number): RGB => { const o = (y * W + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
const bg = px(2, 2);
const ink = (x: number, y: number) => rgbDist(px(x, y), bg) > 40;
// cell size: most common length of flat colour runs along rows (pixel-art blocks)
const runs = new Map<number, number>();
for (let y = 0; y < H; y += 3) { let s = 0; for (let x = 1; x <= W; x++) if (x === W || rgbDist(px(x, y), px(x - 1, y)) > 30) { const L = x - s; if (L >= 4 && ink(s, y)) runs.set(L, (runs.get(L) ?? 0) + 1); s = x; } }
const cand = [...runs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
const cell = forcedCell ? +forcedCell : Math.min(...cand.filter(c => cand.every(o => Math.abs(o / c - Math.round(o / c)) < 0.12)));
// split the image into Punks along empty bands wider than 2 cells
function bands(n: number, filled: (i: number) => boolean) {
  const out: [number, number][] = []; let s = -1, gap = 0;
  for (let i = 0; i <= n; i++) {
    const f = i < n && filled(i);
    if (f) { if (s < 0) s = i; gap = 0; } else if (s >= 0 && (++gap > cell * 2 || i === n)) { out.push([s, i - gap]); s = -1; gap = 0; }
  }
  return out;
}
try {
  if (!forcedCell && Math.abs(W - H) < 4) {
    const g = detectPunk(img);
    const out = blank(24, 24, [...(g.background ?? bg), 255] as [number, number, number, number]);
    g.cells.forEach((row, r) => row.forEach((v, c) => { if (v >= 0) out.data.set([...g.colors[v].rgb, 255], (r * 24 + c) * 4); }));
    savePNG(`public/examples/${prefix}-1.png`, out); console.log(prefix + '-1', 'whole image is one Punk: read by the site detector'); process.exit(0);
  }
} catch { /* not a single Punk: cut the grid */ }
const rowsB = bands(H, y => { for (let x = 0; x < W; x += 2) if (ink(x, y)) return true; return false; });
let n = 0;
for (const [y0, y1] of rowsB) {
  const colsB = bands(W, x => { for (let y = y0; y <= y1; y += 2) if (ink(x, y)) return true; return false; });
  for (const [x0, x1] of colsB) {
    // refine the pixel size for this Punk: the one that makes every cell flattest
    let best = cell, bestScore = Infinity;
    for (let f = 0.9; f <= 1.1; f += 0.002) {
      const s = cell * f, wc0 = Math.round((x1 - x0 + 1) / s), hc0 = Math.round((y1 + 1 - y0) / s);
      let bad = 0, tot = 0;
      for (let r = 0; r < hc0; r++) for (let c = 0; c < wc0; c++) {
        const cx = x0 + (c + 0.5) * s, cy = y1 + 1 - (hc0 - r - 0.5) * s, mid = px(Math.min(W - 1, Math.round(cx)), Math.min(H - 1, Math.round(cy)));
        for (const [dx, dy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
          const X = Math.min(W - 1, Math.max(0, Math.round(cx + dx * s))), Y = Math.min(H - 1, Math.max(0, Math.round(cy + dy * s)));
          tot++; if (rgbDist(px(X, Y), mid) > 30) bad++;
        }
      }
      if (bad / tot < bestScore) { bestScore = bad / tot; best = s; }
    }
    const S = best;
    const wc = Math.round((x1 - x0 + 1) / S), hc = Math.round((y1 + 1 - y0) / S);
    const out = blank(24, 24, [...bg, 255] as [number, number, number, number]);
    const c0 = Math.max(1, Math.floor((24 - wc) / 2)), r0 = 24 - hc;   // Punks sit on the bottom edge
    for (let r = 0; r < hc; r++) for (let c = 0; c < wc; c++) {
      const [R, G, B] = px(Math.min(W - 1, Math.round(x0 + (c + 0.5) * S)), Math.min(H - 1, Math.round(y1 + 1 - (hc - r - 0.5) * S)));
      if (r0 + r >= 0 && c0 + c < 24) out.data.set([R, G, B, 255], ((r0 + r) * 24 + c0 + c) * 4);
    }
    n++;
    const name = `${prefix}-${n}`;
    let ok = 'ok'; try { detectPunk(out); } catch (e) { ok = 'DETECT FAIL ' + (e as Error).message; }
    savePNG(`public/examples/${name}.png`, out);
    console.log(name, `cell ${S.toFixed(2)}px`, `${wc}×${hc} cells`, ok);
  }
}

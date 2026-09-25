// Instruction booklet: cover, one page per step, parts inventory. Pages are
// drawn on a canvas (1600×1131, A4 landscape) and packed into a PDF.
import type { Model } from '../core/build';
import { rgbToHex } from '../core/color';
import type { PunkGrid } from '../core/detect';
import { COLOR_BY_ID, renderHex } from '../core/palette';
import type { Kind } from '../core/parts';
import { StepRenderer } from './stepRenderer';

const PW = 1600, PH = 1131;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const INK = '#1d3b5c';
const BOM_PER = 42;

// ---------- isometric part icons ----------
const KH: Record<Kind, number> = { brick: 1.2, plate: 0.4, tile: 0.4, slope: 0.8 };
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`;
}
function isoPart(x: CanvasRenderingContext2D, X: number, Y: number, w: number, d: number, hex: string, s: number, kind: Kind) {
  const h = KH[kind], c30 = Math.cos(Math.PI / 6);
  const P = (a: number, y: number, z: number): [number, number] => [X + (a - z) * c30 * s, Y + (a + z) * 0.5 * s - y * s];
  const poly = (pts: [number, number][], fill: string) => {
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.closePath();
    x.fillStyle = fill; x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.stroke();
  };
  const dark = parseInt(hex.slice(1), 16) < 0x303030;
  const light = dark ? 2.2 : 1.12, side = dark ? 1.5 : 0.72;
  if (kind === 'slope') {
    poly([P(0, 0, d), P(w, 0, d), P(w, 0.1, d), P(0, h, d)], shade(hex, dark ? 1 : 0.9));
    poly([P(w, 0, 0), P(w, 0, d), P(w, 0.1, d), P(w, 0.1, 0)], shade(hex, side));
    poly([P(0, h, 0), P(0, h, d), P(w, 0.1, d), P(w, 0.1, 0)], shade(hex, light));
    return;
  }
  poly([P(0, h, 0), P(w, h, 0), P(w, h, d), P(0, h, d)], shade(hex, light));
  poly([P(0, 0, d), P(w, 0, d), P(w, h, d), P(0, h, d)], shade(hex, dark ? 1 : 0.9));
  poly([P(w, 0, 0), P(w, 0, d), P(w, h, d), P(w, h, 0)], shade(hex, side));
  if (kind !== 'tile') for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
    const [u, v] = P(i + 0.5, h, j + 0.5), rx = 0.3 * s * c30 * 1.41, ry = 0.3 * s * 0.5 * 1.41, sh = 0.17 * s;
    x.fillStyle = shade(hex, side); x.beginPath(); x.ellipse(u, v - sh, rx, ry, 0, 0, Math.PI * 2); x.rect(u - rx, v - sh, rx * 2, sh); x.fill();
    x.beginPath(); x.ellipse(u, v, rx, ry, 0, 0, Math.PI); x.fill();
    x.fillStyle = shade(hex, light * 1.08); x.beginPath(); x.ellipse(u, v - sh, rx, ry, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.3)'; x.stroke();
  }
}
function icon(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, d: number, hex: string, maxW: number, kind: Kind) {
  const c30 = Math.cos(Math.PI / 6);
  const s = Math.min(13, maxW / ((w + d) * c30));
  const width = (w + d) * c30 * s, height = ((w + d) * 0.5 + KH[kind]) * s;
  isoPart(x, cx - width / 2 + d * c30 * s, cy - height / 2 + KH[kind] * s, w, d, hex, s, kind);
}

// ---------- pages ----------
function blankPage(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, PW, PH);
  return [c, x];
}
function footer(x: CanvasRenderingContext2D, n: number, title: string) {
  x.fillStyle = '#E8F1F8'; x.fillRect(0, PH - 90, PW, 90);
  x.fillStyle = INK; x.font = `bold 26px ${FONT}`; x.textAlign = 'left';
  x.fillText(title, 60, PH - 36);
  x.textAlign = 'right'; x.fillText(String(n), PW - 60, PH - 36); x.textAlign = 'left';
}
function punkCanvas(g: PunkGrid, px: number) {
  const c = document.createElement('canvas'); c.width = c.height = 24 * px;
  const x = c.getContext('2d')!;
  x.fillStyle = g.background ? rgbToHex(g.background) : '#638596'; x.fillRect(0, 0, c.width, c.height);
  g.cells.forEach((row, r) => row.forEach((v, col) => { if (v >= 0) { x.fillStyle = rgbToHex(g.colors[v].rgb); x.fillRect(col * px, r * px, px, px); } }));
  return c;
}

export interface BookletOptions { label: string; onProgress?: (done: number, total: number) => void; renderSize?: number }

export async function makeInstructions(m: Model, grid: PunkGrid, o: BookletOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const title = `${o.label ? `Punk ${o.label}` : 'Your Punk'} · ${m.size === 'xl' ? 'XL' : 'Mini'} brick bust`;
  const NB = Math.ceil(m.bom.length / BOM_PER);
  const total = 1 + m.steps.length + NB;
  const r = new StepRenderer(m, o.renderSize ?? 1100, o.label);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [PW, PH], compress: true, hotfixes: ['px_scaling'] });
  pdf.setProperties({ title: `${title} — instructions`, creator: 'Punk to Bricks' });
  const add = (c: HTMLCanvasElement, first = false) => {
    if (!first) pdf.addPage([PW, PH], 'landscape');
    pdf.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, PW, PH, undefined, 'FAST');
  };
  const tick = async (n: number) => { o.onProgress?.(n, total); await new Promise(res => setTimeout(res, 0)); };
  const c = m.checks;

  // cover
  {
    const [pg, x] = blankPage();
    const grad = x.createLinearGradient(0, 0, 0, PH); grad.addColorStop(0, '#7C95A5'); grad.addColorStop(1, '#5A7282');
    x.fillStyle = grad; x.fillRect(0, 0, PW, PH);
    x.drawImage(r.cover(), 540, 30, 1080, 1080);
    x.drawImage(punkCanvas(grid, 15), 80, 330, 360, 360);
    x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(80, 330, 360, 360);
    x.fillStyle = '#fff'; x.font = `bold 84px ${FONT}`; x.fillText(o.label ? `PUNK ${o.label}` : 'YOUR PUNK', 70, 150);
    x.font = `44px ${FONT}`; x.fillText(`Brick edition · ${m.size === 'xl' ? 'XL' : 'Mini'} bust`, 74, 215);
    x.font = `bold 40px ${FONT}`; x.fillText(`${c.pieces.toLocaleString('en')} pieces`, 80, 800);
    x.font = `32px ${FONT}`;
    x.fillText(`${m.steps.length} steps · ${c.collisions} collisions · ${c.floating} floating`, 80, 850);
    x.fillText(`approx. ${m.dims[0]} × ${m.dims[1]} × ${m.dims[2]} cm`, 80, 895);
    x.font = `22px ${FONT}`; x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillText('Unofficial fan project · made with Punk to Bricks · not affiliated with the LEGO Group or the CryptoPunks project', 80, 1040);
    x.fillText('Computer-checked, not physically build-tested.', 80, 1072);
    add(pg, true);
    await tick(1);
  }

  // steps
  const colorsHex = (id: number) => renderHex(id);
  for (let si = 0; si < m.steps.length; si++) {
    const [pg, x] = blankPage();
    x.drawImage(r.stepView(si), 440, 0, 1100, 1100);
    const cnt = new Map<string, number>();
    for (const i of m.steps[si]) { const p = m.pieces[i]; const k = `${p.kind}|${p.c}|${Math.min(p.w, p.d)}|${Math.max(p.w, p.d)}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    const items = [...cnt.entries()];
    const cols = Math.max(2, Math.ceil(items.length / 10)), cw = cols > 3 ? 118 : 150, rowH = cols > 3 ? 70 : 82;
    const bw = cols * cw + 30, bh = 30 + Math.ceil(items.length / cols) * rowH;
    x.fillStyle = '#D6E8F5'; x.strokeStyle = '#9fbfd8'; x.lineWidth = 3;
    x.beginPath(); x.roundRect(40, 40, bw, bh, 18); x.fill(); x.stroke();
    items.forEach(([k, q], idx) => {
      const [kind, col, a, b] = k.split('|');
      const X0 = 55 + (idx % cols) * cw, Y0 = 55 + Math.floor(idx / cols) * rowH;
      icon(x, X0 + 38, Y0 + 32, +b, +a, colorsHex(+col), cols > 3 ? 58 : 70, kind as Kind);
      x.fillStyle = '#111'; x.font = `bold 24px ${FONT}`; x.fillText(`${q}x`, X0 + (cols > 3 ? 74 : 84), Y0 + 44);
    });
    x.fillStyle = INK; x.font = `bold 110px ${FONT}`;
    x.fillText(String(si + 1), 60, Math.min(PH - 120, 40 + bh + 120));
    footer(x, si + 2, title);
    add(pg);
    await tick(si + 2);
  }

  // parts inventory
  for (let bp = 0; bp < NB; bp++) {
    const [pg, x] = blankPage();
    x.fillStyle = INK; x.font = `bold 54px ${FONT}`; x.fillText('Parts inventory' + (NB > 1 ? ` (${bp + 1}/${NB})` : ''), 60, 90);
    x.font = `26px ${FONT}`; x.fillStyle = '#44607a';
    x.fillText(`${c.pieces.toLocaleString('en')} pieces · ${m.bom.length} lots · BrickLink part and colour numbers`, 60, 130);
    const cols = 7, cw = (PW - 120) / cols, rh = 130;
    m.bom.slice(bp * BOM_PER, (bp + 1) * BOM_PER).forEach((it, k) => {
      const X0 = 60 + (k % cols) * cw, Y0 = 165 + Math.floor(k / cols) * rh;
      icon(x, X0 + 45, Y0 + 40, it.d, it.w, renderHex(it.color), 80, it.kind);
      x.fillStyle = '#111'; x.font = `bold 24px ${FONT}`; x.fillText(`${it.qty}x`, X0 + 100, Y0 + 30);
      x.font = `16px ${FONT}`; x.fillStyle = '#44607a';
      x.fillText(it.part, X0 + 100, Y0 + 52);
      x.fillText(it.name, X0 + 100, Y0 + 72);
      x.fillText(COLOR_BY_ID.get(it.color)!.name, X0 + 100, Y0 + 92);
    });
    footer(x, m.steps.length + 2 + bp, title);
    add(pg);
    await tick(m.steps.length + 2 + bp);
  }
  r.dispose();
  return pdf.output('blob');
}

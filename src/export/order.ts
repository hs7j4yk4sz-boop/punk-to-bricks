// Order files: LEGO Pick a Brick upload list, and what's left for BrickLink.
import type { BomLine, Model } from '../core/build';
import { elementId } from '../core/lego';
import { brickLinkXML } from './parts';

/** Pick a Brick "Upload List" limits (stated on the upload dialog, Sept 2026). */
export const PAB_MAX_LINES = 400;
export const PAB_MAX_QTY = 999;

export interface OrderSummary {
  lego: (BomLine & { elementId: string })[];   // lots with a LEGO Element ID
  brickLinkOnly: BomLine[];                    // lots not available at LEGO
  legoPieces: number;
  brickLinkOnlyPieces: number;
}

export function orderSummary(m: Model): OrderSummary {
  const lego: OrderSummary['lego'] = [], brickLinkOnly: BomLine[] = [];
  for (const b of m.bom) {
    const id = elementId(b.part, b.color);
    if (id) lego.push({ ...b, elementId: id }); else brickLinkOnly.push(b);
  }
  return {
    lego, brickLinkOnly,
    legoPieces: lego.reduce((a, b) => a + b.qty, 0),
    brickLinkOnlyPieces: brickLinkOnly.reduce((a, b) => a + b.qty, 0),
  };
}

/**
 * Pick a Brick upload files, in the exact format of LEGO's own CSV template:
 * header "elementId,quantity", comma separated, CRLF line breaks, no trailing
 * line break. At most 400 references per file and 999 units per reference:
 * a reference needing more is split into 999-unit lines spread over files.
 */
export function pickABrickFiles(m: Model): string[] {
  const chunks: { id: string; qty: number }[] = [];
  for (const l of orderSummary(m).lego) for (let left = l.qty; left > 0; left -= PAB_MAX_QTY) chunks.push({ id: l.elementId, qty: Math.min(PAB_MAX_QTY, left) });
  const files: { id: string; qty: number }[][] = [];
  for (const c of chunks) {
    // first file with room that doesn't already list this element
    let f = files.find(f => f.length < PAB_MAX_LINES && !f.some(x => x.id === c.id));
    if (!f) files.push(f = []);
    f.push(c);
  }
  return files.map(f => ['elementId,quantity', ...f.map(c => `${c.id},${c.qty}`)].join('\r\n'));
}

/** BrickLink wanted list of only the lots LEGO doesn't sell. */
export function brickLinkRemainderXML(m: Model): string {
  const rest = new Set(orderSummary(m).brickLinkOnly.map(b => `${b.part}|${b.color}`));
  return brickLinkXML({ ...m, bom: m.bom.filter(b => rest.has(`${b.part}|${b.color}`)) });
}

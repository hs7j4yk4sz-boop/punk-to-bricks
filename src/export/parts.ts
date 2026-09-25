// Parts list exports: CSV for people, XML "wanted list" for BrickLink (Want → Upload).
import type { Model } from '../core/build';

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function partsCSV(m: Model): string {
  const rows = [['Qty', 'BrickLink part ID', 'Part', 'Colour', 'BrickLink colour ID']];
  for (const b of m.bom) rows.push([String(b.qty), b.part, b.name, b.colorName, String(b.color)]);
  rows.push([]);
  rows.push([String(m.checks.pieces), '', 'pieces in total', '', '']);
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** BrickLink wanted list: condition "any" (X), one item per part and colour. */
export function brickLinkXML(m: Model): string {
  const items = m.bom.map(b => `<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${b.part}</ITEMID><COLOR>${b.color}</COLOR><MINQTY>${b.qty}</MINQTY><CONDITION>X</CONDITION></ITEM>`);
  return `<INVENTORY>\n${items.join('\n')}\n</INVENTORY>\n`;
}

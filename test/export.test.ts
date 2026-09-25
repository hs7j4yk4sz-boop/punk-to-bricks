import { describe, expect, it } from 'vitest';
import { buildModel } from '../src/core/build';
import { detectPunk } from '../src/core/detect';
import { REFERENCE_PUNK } from './fixtures/punks';
import { brickLinkXML, partsCSV } from '../src/export/parts';
import { punkImage } from './img';

const m = buildModel(detectPunk(punkImage(REFERENCE_PUNK, 8)), 'xl');

describe('parts exports', () => {
  it('CSV lists every lot and adds up to the piece count', () => {
    const lines = partsCSV(m).trim().split('\n');
    expect(lines[0]).toBe('Qty,BrickLink part ID,Part,Colour,BrickLink colour ID');
    const lots = lines.slice(1).filter(l => /^\d+,\d/.test(l));
    expect(lots.length).toBe(m.bom.length);
    expect(lots.reduce((a, l) => a + +l.split(',')[0], 0)).toBe(m.checks.pieces);
  });
  it('BrickLink XML has one ITEM per lot with valid fields', () => {
    const x = brickLinkXML(m);
    expect(x.startsWith('<INVENTORY>')).toBe(true);
    expect(x.trim().endsWith('</INVENTORY>')).toBe(true);
    const items = [...x.matchAll(/<ITEM><ITEMTYPE>P<\/ITEMTYPE><ITEMID>(\w+)<\/ITEMID><COLOR>(\d+)<\/COLOR><MINQTY>(\d+)<\/MINQTY><CONDITION>X<\/CONDITION><\/ITEM>/g)];
    expect(items.length).toBe(m.bom.length);
    expect(items.reduce((a, i) => a + +i[3], 0)).toBe(m.checks.pieces);
    // part/colour pairs are unique
    expect(new Set(items.map(i => i[1] + '/' + i[2])).size).toBe(items.length);
  });
});

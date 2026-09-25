// Short list of common brick colours (BrickLink colour IDs and names) and the
// mapping from Punk colours to the closest real brick colour.
import { deltaE, hexToRgb, rgbToLab, type Lab, type RGB } from './color';

export interface BrickColor {
  id: number;          // BrickLink colour ID
  name: string;        // BrickLink colour name
  hex: string;         // display colour
  trans?: boolean;
}

export const BRICK_COLORS: BrickColor[] = [
  { id: 1, name: 'White', hex: '#F4F4F4' },
  { id: 11, name: 'Black', hex: '#1B1B1B' },
  { id: 86, name: 'Light Bluish Gray', hex: '#A0A5A9' },
  { id: 85, name: 'Dark Bluish Gray', hex: '#6C6E68' },
  { id: 5, name: 'Red', hex: '#C91A09' },
  { id: 59, name: 'Dark Red', hex: '#720E0F' },
  { id: 4, name: 'Orange', hex: '#FE8A18' },
  { id: 3, name: 'Yellow', hex: '#F2CD37' },
  { id: 103, name: 'Bright Light Yellow', hex: '#FFF03A' },
  { id: 2, name: 'Tan', hex: '#E4CD9E' },
  { id: 69, name: 'Dark Tan', hex: '#958A73' },
  { id: 90, name: 'Light Nougat', hex: '#F6D7B3' },
  { id: 28, name: 'Nougat', hex: '#D09168' },
  { id: 150, name: 'Medium Nougat', hex: '#AA7D55' },
  { id: 68, name: 'Dark Orange', hex: '#A95500' },
  { id: 88, name: 'Reddish Brown', hex: '#582A12' },
  { id: 120, name: 'Dark Brown', hex: '#352100' },
  { id: 34, name: 'Lime', hex: '#BBE90B' },
  { id: 36, name: 'Bright Green', hex: '#4B9F4A' },
  { id: 6, name: 'Green', hex: '#237841' },
  { id: 80, name: 'Dark Green', hex: '#184632' },
  { id: 155, name: 'Olive Green', hex: '#9B9A5A' },
  { id: 48, name: 'Sand Green', hex: '#A0BCAC' },
  { id: 152, name: 'Light Aqua', hex: '#ADC3C0' },
  { id: 156, name: 'Medium Azure', hex: '#36AEBF' },
  { id: 105, name: 'Bright Light Blue', hex: '#9FC3E9' },
  { id: 7, name: 'Blue', hex: '#0055BF' },
  { id: 63, name: 'Dark Blue', hex: '#0A3463' },
  { id: 55, name: 'Sand Blue', hex: '#6074A1' },
  { id: 104, name: 'Bright Pink', hex: '#E4ADC8' },
  { id: 47, name: 'Dark Pink', hex: '#C870A0' },
  { id: 71, name: 'Magenta', hex: '#923978' },
  { id: 89, name: 'Dark Purple', hex: '#4B2E8C' },
  { id: 157, name: 'Medium Lavender', hex: '#AC78BA' },
  { id: 154, name: 'Lavender', hex: '#E1D5ED' },
  { id: 12, name: 'Trans-Clear', hex: '#EEEEEE', trans: true },
  { id: 15, name: 'Trans-Light Blue', hex: '#AEEFEC', trans: true },
  { id: 17, name: 'Trans-Red', hex: '#C91A09', trans: true },
];

export const COLOR_BY_ID = new Map(BRICK_COLORS.map(c => [c.id, c]));
export const BLACK = 11, TRANS_CLEAR = 12, BASE_GRAY = 85;
const LAB = new Map<number, Lab>(BRICK_COLORS.map(c => [c.id, rgbToLab(hexToRgb(c.hex))]));
// Trans-Clear is reserved for support pieces; never matched from the image.
const MATCHABLE = BRICK_COLORS.filter(c => c.id !== TRANS_CLEAR);
/** A transparent colour is only used for small details (glasses lenses, etc.). */
const TRANS_MAX_PIXELS = 16;
const MAX_EXTRA = 8;

export interface PunkColor { rgb: RGB; count: number }

/**
 * Map each Punk colour to a brick colour. Starts with the nearest colour, then
 * resolves clashes: two clearly different Punk colours that touch each other
 * must not collapse into the same brick colour (e.g. skin vs. beard).
 */
export function mapColors(colors: PunkColor[], touching: Set<string>): number[] {
  const labs = colors.map(c => rgbToLab(c.rgb));
  const ranked = colors.map((c, i) => {
    const pure = c.rgb[0] < 8 && c.rgb[1] < 8 && c.rgb[2] < 8;
    const cands = MATCHABLE.filter(b => !b.trans || c.count <= TRANS_MAX_PIXELS)
      .map(b => ({ id: b.id, d: pure ? (b.id === BLACK ? 0 : 999) : deltaE(labs[i], LAB.get(b.id)!) }))
      .sort((a, b) => a.d - b.d);
    return cands;
  });
  const pick = ranked.map(() => 0);
  const key = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
      if (ranked[i][pick[i]].id !== ranked[j][pick[j]].id) continue;
      if (!touching.has(key(i, j)) || deltaE(labs[i], labs[j]) < 8) continue;
      // move whichever colour loses least by going to its next free choice
      const next = (k: number) => {
        for (let p = pick[k] + 1; p < ranked[k].length; p++) {
          const id = ranked[k][p].id;
          const clash = colors.some((_, m) => m !== k && touching.has(key(k, m)) && ranked[m][pick[m]].id === id && deltaE(labs[k], labs[m]) >= 8);
          if (!clash) return p;
        }
        return -1;
      };
      const ni = next(i), nj = next(j);
      // only move to a brick that is still a good match (at most 8 ΔE worse)
      const cost = (k: number, n: number) => (n < 0 || ranked[k][n].d - ranked[k][pick[k]].d > MAX_EXTRA ? Infinity : ranked[k][n].d - ranked[k][pick[k]].d);
      const ci = cost(i, ni), cj = cost(j, nj);
      if (ci === Infinity && cj === Infinity) continue;
      if (ci <= cj) pick[i] = ni; else pick[j] = nj;
      changed = true;
    }
    if (!changed) break;
  }
  return ranked.map((r, i) => r[pick[i]].id);
}

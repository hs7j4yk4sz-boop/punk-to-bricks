// Piece model and BrickLink part numbers.

export type Kind = 'brick' | 'plate' | 'tile' | 'slope';

/**
 * One piece. Units: x and z in studs (x to the right, z towards the back,
 * z = 0 is the front face), y and h in plates (a brick is 3 plates tall).
 * w is the size along x, d along z.
 */
export interface Piece {
  x: number; z: number; y: number; h: number; w: number; d: number;
  c: number;               // BrickLink colour ID
  kind: Kind;
  part: string;            // BrickLink part number
  dir?: 'N' | 'S' | 'E' | 'W';   // curved slope: which side goes down (N = front)
  group?: 'base' | 'body' | 'top';
  support?: boolean;       // added only to hold something up
  nameplate?: boolean;
}

export const SIZES: [number, number][] = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8]];
export const TILE_SIZES: [number, number][] = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6]];

const PARTS: Record<Kind, Record<string, string>> = {
  brick: { '1x1': '3005', '1x2': '3004', '1x3': '3622', '1x4': '3010', '1x6': '3009', '1x8': '3008', '2x2': '3003', '2x3': '3002', '2x4': '3001', '2x6': '2456', '2x8': '3007' },
  plate: { '1x1': '3024', '1x2': '3023', '1x3': '3623', '1x4': '3710', '1x6': '3666', '1x8': '3460', '2x2': '3022', '2x3': '3021', '2x4': '3020', '2x6': '3795', '2x8': '3034' },
  tile: { '1x1': '3070', '1x2': '3069', '1x3': '63864', '1x4': '2431', '1x6': '6636', '1x8': '4162', '2x2': '3068', '2x3': '26603', '2x4': '87079', '2x6': '69729' },
  slope: { '2x2': '15068' },
};

export function partId(kind: Kind, w: number, d: number): string {
  const id = PARTS[kind][`${Math.min(w, d)}x${Math.max(w, d)}`];
  if (!id) throw new Error(`no ${kind} ${w}x${d}`);
  return id;
}

export function partName(kind: Kind, w: number, d: number): string {
  const a = Math.min(w, d), b = Math.max(w, d);
  return kind === 'slope' ? `Slope, Curved ${a} x ${b}` : `${kind[0].toUpperCase()}${kind.slice(1)} ${a} x ${b}`;
}

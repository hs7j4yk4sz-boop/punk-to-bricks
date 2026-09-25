import { describe, expect, it } from 'vitest';
import { buildModel } from '../src/core/build';
import { checkModel } from '../src/core/check';
import { detectPunk } from '../src/core/detect';
import { partId, type Kind, type Piece } from '../src/core/parts';
import { REFERENCE_PUNK, TEST_PUNKS } from './fixtures/punks';
import { punkImage } from './img';

const P = (x: number, z: number, y: number, w: number, d: number, kind: Kind = 'brick', h = kind === 'brick' ? 3 : 1): Piece =>
  ({ x, z, y, w, d, h, kind, c: 11, part: partId(kind, w, d) });

describe('solidity checker', () => {
  it('two stacked bricks share their studs', () => {
    const c = checkModel([P(0, 0, 0, 2, 4), P(0, 0, 3, 2, 4)]);
    expect(c).toMatchObject({ connections: 8, floating: 0, collisions: 0, weak: 0 });
  });
  it('an offset brick connects through the overlap only', () => {
    const c = checkModel([P(0, 0, 0, 2, 4), P(1, 2, 3, 2, 4)]);
    expect(c.connections).toBe(2);
  });
  it('a brick with nothing under it is floating', () => {
    const c = checkModel([P(0, 0, 0, 2, 4), P(10, 0, 3, 2, 2)]);
    expect(c.floating).toBe(1);
    expect(c.floatingIds).toEqual([1]);
  });
  it('a brick one plate too high does not touch', () => {
    expect(checkModel([P(0, 0, 0, 2, 4), P(0, 0, 4, 2, 4)]).floating).toBe(1);
  });
  it('a piece hanging from above is held', () => {
    // base, a bridge on top of it, and a brick clipped under the bridge's overhang
    const c = checkModel([P(0, 0, 0, 2, 2), P(0, 0, 3, 2, 8), P(0, 5, 0, 2, 2)]);
    expect(c.floating).toBe(0);
  });
  it('nothing clicks onto a tile', () => {
    const c = checkModel([P(0, 0, 0, 2, 2), P(0, 0, 3, 2, 2, 'tile'), P(0, 0, 4, 2, 2, 'plate')]);
    expect(c.floating).toBe(1);
  });
  it('counts overlapping cells as collisions', () => {
    expect(checkModel([P(0, 0, 0, 2, 4), P(1, 1, 1, 2, 2)]).collisions).toBe(4);
  });
  it('flags a piece held by a single stud as weak', () => {
    expect(checkModel([P(0, 0, 0, 2, 2), P(1, 1, 3, 1, 4)]).weak).toBe(1);
  });
  it('finds a centre of mass outside the base', () => {
    const c = checkModel([P(0, 0, 0, 2, 2), P(1, 0, 3, 1, 8), P(1, 4, 6, 1, 8), P(1, 8, 9, 1, 8)]);
    expect(c.com.inside).toBe(false);
  });
});

describe('every test Punk builds solid', () => {
  for (const size of ['mini', 'xl'] as const) for (const p of [REFERENCE_PUNK, ...TEST_PUNKS]) {
    it(`${size}: ${p.name}`, () => {
      const m = buildModel(detectPunk(punkImage(p, 8)), size);
      expect(m.checks.floating, m.notes.join(' ')).toBe(0);
      expect(m.checks.collisions).toBe(0);
      expect(m.checks.com.inside).toBe(true);
      if (size === 'mini') expect(m.checks.pieces).toBeLessThanOrEqual(450);
      // every piece is a real part in a real colour, every step is non-empty
      expect(m.pieces.every(q => q.part && q.c > 0)).toBe(true);
      expect(m.steps.flat().sort((a, b) => a - b)).toEqual(m.pieces.map((_, i) => i));
    });
  }
});

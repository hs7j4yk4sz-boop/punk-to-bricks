// Build animation schedule, shared by the live viewer and the video export.
// Pure maths, no three.js: every time here is in seconds.
import type { Model } from '../core/build';

export const PL = 0.4;              // one plate, in stud units
export const DROP = 0.32;           // seconds a piece takes to land

export interface Timeline {
  start: Float32Array;              // when each piece starts falling
  isTop: Uint8Array;                // built in the air, then lowered onto the head
  hasTop: boolean;
  capUp: number;                    // how high the top sub-assembly waits (units)
  capDown: [number, number];        // lowering window
  hero: number;                     // build finished, camera settles
  end: number;                      // end of the build shot
  fall: number;                     // fall height (units)
  height: number;                   // model height (units)
  order: number[];                  // piece indices in build order
}

export function makeTimeline(m: Model): Timeline {
  const n = m.pieces.length;
  const order = m.steps.flat();
  const ys = m.pieces.flatMap(p => [p.y, p.y + p.h]);
  const height = (Math.max(...ys) - Math.min(...ys)) * PL;
  const s = height / 42;            // the reference XL bust is ~42 units tall
  const isTop = new Uint8Array(n);
  m.pieces.forEach((p, i) => { if (p.group === 'top') isTop[i] = 1; });
  const hasTop = isTop.some(v => v === 1) && m.pieces.filter(p => p.group === 'top').length < n * 0.45;
  if (!hasTop) isTop.fill(0);
  const win: Record<string, [number, number]> = { base: [0.2, 2.6], body: hasTop ? [2.0, 10.8] : [2.0, 11.4], top: [4.8, 11.4] };
  const groupOf = (i: number) => (isTop[i] ? 'top' : m.pieces[i].group === 'base' ? 'base' : 'body');
  const start = new Float32Array(n);
  for (const g of ['base', 'body', 'top']) {
    const ids = order.filter(i => groupOf(i) === g);
    const [a, b] = win[g];
    ids.forEach((i, r) => { start[i] = a + (b - a - DROP) * r / Math.max(1, ids.length - 1); });
  }
  const capDown: [number, number] = [11.7, 13.3];
  const hero = hasTop ? 13.3 : 11.8;
  return { start, isTop, hasTop, capUp: 13 * s, capDown, hero, end: hero + 3.3, fall: 7 * s, height, order };
}

export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeIO = (t: number) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Lift of the top sub-assembly at time t. */
export function capOffset(tl: Timeline, t: number): number {
  if (!tl.hasTop) return 0;
  const [a, b] = tl.capDown;
  return t < a ? tl.capUp : t > b ? 0 : tl.capUp * (1 - easeIO((t - a) / (b - a)));
}

/** Piece i at time t: visible?, extra height (falling), and fall speed for the motion trail. */
export function pieceState(tl: Timeline, i: number, t: number): { visible: boolean; dy: number; speed: number } {
  const p = (t - tl.start[i]) / DROP;
  if (p <= 0) return { visible: false, dy: 0, speed: 0 };
  if (p >= 1) return { visible: true, dy: tl.isTop[i] ? capOffset(tl, t) : 0, speed: 0 };
  const dy = tl.fall * (1 - ease(p)) + (tl.isTop[i] ? capOffset(tl, t) : 0);
  return { visible: true, dy, speed: tl.fall * 3 * Math.pow(1 - p, 2) / DROP };
}

/** Camera during the build: orbit angle, elevation, distance and look-at height (units). */
export function buildCamera(tl: Timeline, t: number): { az: number; el: number; dist: number; ty: number } {
  const s = tl.height / 42;
  if (t < tl.hero) {
    const u = t / tl.hero, k = easeIO(Math.min(1, t / 7));
    const drop = tl.hasTop && t > tl.capDown[0] ? 9 * s * easeIO((t - tl.capDown[0]) / (tl.capDown[1] - tl.capDown[0])) : 0;
    return { az: -38 + 55 * u, el: 32 - 10 * u, dist: lerp(95, 150, k) * s, ty: lerp(3, 29, k) * s - drop };
  }
  const u = Math.min(1, (t - tl.hero) / (tl.end - tl.hero));
  return { az: 17 + 28 * easeIO(u), el: 24 - 6 * easeIO(u), dist: (132 - 14 * easeIO(u)) * s, ty: 20 * s };
}

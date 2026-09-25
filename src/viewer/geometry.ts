// Geometry of one piece type (brick, plate, tile, curved slope), cached by shape.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Piece } from '../core/parts';
import { PL } from './timeline';

const cache = new Map<string, THREE.BufferGeometry>();

export const geoKey = (p: Piece) => `${p.kind}${p.w}x${p.d}${p.dir ?? ''}`;

export function pieceGeometry(p: Piece, lowPoly = false): THREE.BufferGeometry {
  const k = geoKey(p) + (lowPoly ? 'L' : '');
  const hit = cache.get(k);
  if (hit) return hit;
  let parts: THREE.BufferGeometry[];
  if (p.kind === 'slope') {
    // curved slope 2×2: flat at one side, rounding down to the open side
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(2, 0); sh.lineTo(2, 0.08); sh.quadraticCurveTo(1.95, 0.78, 0, 0.78); sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.97, bevelEnabled: false, curveSegments: lowPoly ? 6 : 10 });
    g.translate(-1, 0.001, -0.985);
    g.rotateY({ E: 0, W: Math.PI, N: -Math.PI / 2, S: Math.PI / 2 }[p.dir ?? 'E']);
    parts = [g];
  } else {
    const h = p.h * PL;
    const body = new RoundedBoxGeometry(p.w - 0.03, h - 0.02, p.d - 0.03, lowPoly ? 1 : 2, Math.min(0.035, h / 4));
    body.translate(0, h / 2, 0);
    parts = [body];
    if (p.kind !== 'tile') for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) {
      const c = new THREE.CylinderGeometry(0.3, 0.3, 0.17, lowPoly ? 8 : 12);
      c.translate(i - p.w / 2 + 0.5, h + 0.085, j - p.d / 2 + 0.5);
      parts.push(c);
    }
  }
  const g = mergeGeometries(parts.map(q => { const r = q.index ? q.toNonIndexed() : q; if (r.attributes.uv) r.deleteAttribute('uv'); return r; }))!;
  g.computeBoundingSphere();
  cache.set(k, g);
  return g;
}

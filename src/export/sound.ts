// Brick clicks synced to the build animation, synthesised in advance
// (port of tools/sound.py). Deterministic: same model, same soundtrack.
import type { Model } from '../core/build';
import { DROP, type Timeline } from '../viewer/timeline';

const SR = 48000;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Band-limited noise: white noise through a high-pass then a low-pass (RBJ biquads), peak 1. */
function bandNoise(n: number, lo: number, hi: number, rnd: () => number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1;
  const biquad = (f0: number, high: boolean) => {
    const w = (2 * Math.PI * f0) / SR, a = Math.sin(w) / (2 * 0.707), c = Math.cos(w);
    const b0 = high ? (1 + c) / 2 : (1 - c) / 2, b1 = high ? -(1 + c) : 1 - c, b2 = b0, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
    }
  };
  biquad(lo, true); biquad(hi, false);
  let m = 1e-9; for (const v of x) m = Math.max(m, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] /= m;
  return x;
}

function click(area: number, rnd: () => number): Float32Array {
  const n = Math.round(0.045 * SR), s = new Float32Array(n);
  const base = (2600 / Math.pow(Math.sqrt(Math.max(1, area)), 0.35)) * (0.85 + rnd() * 0.35);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const nz = bandNoise(n, 1500, 9000, rnd);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    s[i] = (Math.sin(2 * Math.PI * base * t + ph[0]) + 0.6 * Math.sin(2 * Math.PI * base * 1.73 * t + ph[1]) + 0.35 * Math.sin(2 * Math.PI * base * 2.9 * t + ph[2])) * Math.exp(-t * 170)
      + 0.9 * nz[i] * Math.exp(-t * 420);
  }
  // tiny double hit: the stud engaging
  const d = Math.round((0.006 + rnd() * 0.008) * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (s[i] + (i >= d ? 0.45 * s[i - d] : 0)) / 2.2;
  return out;
}

export function makeSoundtrack(m: Model, tl: Timeline, duration: number): AudioBuffer {
  const n = Math.ceil(duration * SR), out = new Float32Array(n), rnd = rng(7);
  const add = (sig: Float32Array, t: number, gain: number) => {
    const i0 = Math.round(t * SR);
    for (let i = 0; i < sig.length && i0 + i < n; i++) if (i0 + i >= 0) out[i0 + i] += gain * sig[i];
  };
  // piece landings, thinned to a readable rattle
  const lands = m.pieces.map((p, i) => ({ t: tl.start[i] + DROP, p })).sort((a, b) => a.t - b.t);
  let last = -1;
  for (const { t, p } of lands) {
    if (t - last < 0.05 + rnd() * 0.03) continue;
    last = t;
    add(click(p.w * p.d, rnd), t, (0.45 + rnd() * 0.45) * (p.kind === 'tile' ? 0.7 : 1));
  }
  // headwear lands on the head: a heavy clack
  if (tl.hasTop) {
    const tc = tl.capDown[1], len = Math.round(0.25 * SR), thud = new Float32Array(len), nz = bandNoise(len, 300, 5000, rnd);
    for (let i = 0; i < len; i++) { const t = i / SR; thud[i] = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 28) + 0.5 * Math.sin(2 * Math.PI * 310 * t) * Math.exp(-t * 40) + 0.6 * nz[i] * Math.exp(-t * 60); }
    add(thud, tc - 0.01, 1.3);
    for (let k = 0; k < 7; k++) add(click(4, rnd), tc + 0.004 * k + rnd() * 0.03, 0.8);
  }
  // small room: a few soft echoes
  const wet = new Float32Array(n);
  for (const [ms, g] of [[23, 0.12], [41, 0.08], [67, 0.05]]) { const d = Math.round((ms / 1000) * SR); for (let i = d; i < n; i++) wet[i] += g * out[i - d]; }
  for (let i = 0; i < n; i++) out[i] += wet[i];
  // fades, normalise
  const fi = Math.round(0.05 * SR), fo = Math.round(0.4 * SR);
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
  let peak = 1e-9; for (const v of out) peak = Math.max(peak, Math.abs(v));
  const buf = new AudioBuffer({ length: n, sampleRate: SR, numberOfChannels: 2 });
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { L[i] = (out[i] / peak) * 0.89; R[i] = i >= 30 ? (out[i - 30] / peak) * 0.89 : 0; }
  return buf;
}

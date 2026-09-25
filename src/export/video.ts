// Video of the build animation (square or 9:16) with synced brick clicks.
// Recorded in real time with MediaRecorder: MP4 when the browser can, else WebM.
import type { Model } from '../core/build';
import { SKY, Viewer } from '../viewer/scene';
import { makeSoundtrack } from './sound';

export type VideoFormat = 'square' | 'story';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const HOLD = 1.6;   // seconds on the finished bust

export function videoMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  return null;
}

export interface VideoOptions { format: VideoFormat; label: string; small?: boolean; onProgress?: (f: number) => void }

export async function recordVideo(m: Model, o: VideoOptions): Promise<{ blob: Blob; ext: string }> {
  const kind = videoMime();
  if (!kind) throw new Error('This browser can’t record video. Try Chrome, Edge, Firefox or Safari 14.1+.');
  const k = o.small ? 2 / 3 : 1;
  const W = Math.round(1080 * k), H = Math.round((o.format === 'story' ? 1920 : 1080) * k);
  // 3D frames off-screen, composed with titles on a 2D canvas that is recorded
  const glCanvas = document.createElement('canvas');
  const v = new Viewer(glCanvas, { fixedSize: [W, H], lowPoly: o.small, label: o.label });
  v.setModel(m);
  const tl = v.tl!;
  const duration = tl.end + HOLD;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const x = out.getContext('2d')!;
  const title = o.label ? `Punk ${o.label}` : 'My CryptoPunk';
  const sub = `${m.checks.pieces.toLocaleString('en')} pieces · ${m.size === 'xl' ? 'XL' : 'Mini'} brick bust`;

  const frame = (t: number) => {
    v.pose(Math.min(t, tl.end));
    v.setBuildCamera(Math.min(t, tl.end));
    if (t > tl.end) {   // keep turning slowly on the finished bust
      const e = t - tl.end, a = (e * 8 * Math.PI) / 180, c = v.camera.position;
      const r = Math.hypot(c.x, c.z), a0 = Math.atan2(c.x, c.z) + a;
      c.set(r * Math.sin(a0), c.y, r * Math.cos(a0)); v.camera.lookAt(0, v.controls.target.y, 0);
    }
    v.render();
    x.fillStyle = `#${SKY.getHexString()}`; x.fillRect(0, 0, W, H);
    x.drawImage(glCanvas, 0, 0, W, H);
    x.fillStyle = '#16242f'; x.textAlign = 'center';
    if (o.format === 'story') {
      x.font = `800 ${Math.round(72 * k)}px ${FONT}`; x.fillText(title, W / 2, 150 * k);
      x.font = `500 ${Math.round(40 * k)}px ${FONT}`; x.fillText(sub, W / 2, 215 * k);
      x.font = `600 ${Math.round(34 * k)}px ${FONT}`; x.globalAlpha = 0.75; x.fillText('Punk to Bricks', W / 2, H - 110 * k); x.globalAlpha = 1;
    } else {
      x.textAlign = 'left';
      x.font = `800 ${Math.round(44 * k)}px ${FONT}`; x.fillText(title, 44 * k, 76 * k);
      x.font = `500 ${Math.round(28 * k)}px ${FONT}`; x.fillText(sub, 44 * k, 118 * k);
      x.font = `600 ${Math.round(24 * k)}px ${FONT}`; x.globalAlpha = 0.7; x.fillText('Punk to Bricks', 44 * k, H - 40 * k); x.globalAlpha = 1;
    }
  };

  const ac = new AudioContext({ sampleRate: 48000 });
  const src = ac.createBufferSource();
  src.buffer = makeSoundtrack(m, tl, duration);
  const dest = ac.createMediaStreamDestination();
  src.connect(dest);
  frame(0);
  const stream = new MediaStream([...out.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: kind.mime, videoBitsPerSecond: o.small ? 5_000_000 : 9_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>(res => { rec.onstop = () => res(); });
  await ac.resume();
  rec.start(250);
  const t0 = ac.currentTime + 0.05;
  src.start(t0);
  // the audio clock drives the animation, so clicks stay on the pieces
  await new Promise<void>(res => {
    const step = () => {
      const t = ac.currentTime - t0;
      frame(Math.max(0, t));
      o.onProgress?.(Math.min(1, Math.max(0, t) / duration));
      if (t >= duration) return res();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await done;
  src.disconnect(); await ac.close();
  stream.getTracks().forEach(tr => tr.stop());
  v.dispose();
  return { blob: new Blob(chunks, { type: kind.mime.split(';')[0] }), ext: kind.ext };
}

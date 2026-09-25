// three.js scene: the bust, the build animation, then free rotation.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Model } from '../core/build';
import { COLOR_BY_ID, renderHex } from '../core/palette';
import { geoKey, pieceGeometry } from './geometry';
import { buildCamera, makeTimeline, pieceState, PL, type Timeline } from './timeline';

export const SKY = new THREE.Color('#B4DBF1');
const MAX_GHOSTS = 96;
const GHOST_ALPHA = [0.32, 0.18, 0.08];

interface Batch { mesh: THREE.InstancedMesh; ids: number[] }

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  readonly controls: OrbitControls;
  model: Model | null = null;
  tl: Timeline | null = null;
  private batches: Batch[] = [];
  private slot: [Batch, number][] = [];        // piece -> (batch, instance)
  private home: THREE.Vector3[] = [];
  private ghosts = new Map<number, THREE.InstancedMesh[]>();
  private root = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private floor: THREE.Mesh;
  private nameplate: THREE.Mesh | null = null;
  private nameplateIdx = -1;
  private t0 = 0;
  private playing = false;
  private dirty = true;
  onFinished: (() => void) | null = null;
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private canvas: HTMLCanvasElement, private opts: { lowPoly?: boolean; label?: string } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = SKY;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(opts.lowPoly ? 1024 : 2048, opts.lowPoly ? 1024 : 2048);
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.8); fill.position.set(-25, 12, 10); this.scene.add(fill);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.32, color: 0x1f4a6b }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true;
    this.scene.add(this.floor, this.root);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole bust in view on tall (phone) screens
    this.camera.fov = w / h < 0.8 ? 30 / Math.max(0.55, w / h / 0.8) : 30;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  setModel(m: Model) {
    this.clear();
    this.model = m;
    this.tl = makeTimeline(m);
    const xs = m.pieces.filter(p => p.group === 'base').flatMap(p => [p.x, p.x + p.w]);
    const zs = m.pieces.filter(p => p.group === 'base').flatMap(p => [p.z, p.z + p.d]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const yMin = Math.min(...m.pieces.map(p => p.y));
    this.home = m.pieces.map(p => new THREE.Vector3(p.x + p.w / 2 - cx, p.y * PL, -(p.z + p.d / 2) + cz));
    this.floor.position.y = yMin * PL;

    const mats = new Map<number, THREE.Material>();
    const mat = (c: number) => {
      let mm = mats.get(c);
      if (!mm) {
        const col = COLOR_BY_ID.get(c)!;
        mm = col.trans
          ? new THREE.MeshPhysicalMaterial({ color: renderHex(c), roughness: 0.05, transparent: true, opacity: c === 12 ? 0.35 : 0.8, depthWrite: c !== 12 })
          : new THREE.MeshStandardMaterial({ color: renderHex(c), roughness: 0.32, metalness: 0 });
        mats.set(c, mm);
      }
      return mm;
    };
    const byKey = new Map<string, number[]>();
    m.pieces.forEach((p, i) => { const k = geoKey(p) + '|' + p.c; byKey.set(k, [...(byKey.get(k) ?? []), i]); });
    for (const ids of byKey.values()) {
      const p0 = m.pieces[ids[0]];
      const mesh = new THREE.InstancedMesh(pieceGeometry(p0, this.opts.lowPoly), mat(p0.c), ids.length);
      mesh.castShadow = !COLOR_BY_ID.get(p0.c)!.trans; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const b = { mesh, ids };
      ids.forEach((i, j) => { this.slot[i] = [b, j]; });
      this.batches.push(b); this.root.add(mesh);
    }
    // motion-trail ghosts, one instanced box per colour and trail step
    for (const c of new Set(m.pieces.map(p => p.c))) {
      const hex = renderHex(c);
      this.ghosts.set(c, GHOST_ALPHA.map(o => {
        const g = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o, depthWrite: false }), MAX_GHOSTS);
        g.count = 0; g.frustumCulled = false; this.root.add(g); return g;
      }));
    }
    // name plate text
    this.nameplateIdx = m.pieces.findIndex(p => p.nameplate);
    if (this.nameplateIdx >= 0) {
      const p = m.pieces[this.nameplateIdx];
      this.nameplate = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 0.15, p.d - 0.15), new THREE.MeshStandardMaterial({ roughness: 0.3 }));
      this.nameplate.rotation.x = -Math.PI / 2;
      this.root.add(this.nameplate);
      this.setLabel(this.opts.label ?? '');
    }
    // shadows sized to the model
    const s = this.tl.height / 42;
    Object.assign(this.sun.shadow.camera, { left: -40 * s, right: 40 * s, top: 50 * s, bottom: -20 * s, near: 1, far: 260 * s });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(36 * s, 80 * s, 52 * s);
    this.pose(this.tl.end);
    this.dirty = true;
  }

  /** Text printed on the name plate (render only: the real part is a plain tile). Empty = no text. */
  setLabel(label: string) {
    this.opts.label = label;
    if (!this.nameplate || !this.model) return;
    const p = this.model.pieces[this.nameplateIdx];
    const mat = this.nameplate.material as THREE.MeshStandardMaterial;
    mat.map?.dispose(); mat.map = null; mat.color.set(COLOR_BY_ID.get(p.c)!.hex);
    this.nameplate.visible = !!label;
    if (label) {
      mat.color.set('#ffffff');
      mat.map = nameplateTexture(label, p.w, p.d, COLOR_BY_ID.get(p.c)!.hex);
    }
    mat.needsUpdate = true;
    this.dirty = true;
  }

  private clear() {
    this.root.clear();
    this.batches.forEach(b => { (b.mesh.material as THREE.Material).dispose(); b.mesh.dispose(); });
    this.ghosts.forEach(gs => gs.forEach(g => { g.geometry.dispose(); (g.material as THREE.Material).dispose(); }));
    this.batches = []; this.slot = []; this.ghosts.clear(); this.nameplate = null;
  }

  /** Put every piece where it is at time t of the build. */
  pose(t: number) {
    const m = this.model!, tl = this.tl!;
    const used = new Map<THREE.InstancedMesh, number>();
    for (const gs of this.ghosts.values()) for (const g of gs) used.set(g, 0);
    for (let i = 0; i < m.pieces.length; i++) {
      const [b, j] = this.slot[i];
      const st = pieceState(tl, i, t);
      if (!st.visible) { b.mesh.setMatrixAt(j, this.zero); continue; }
      this.v3.copy(this.home[i]); this.v3.y += st.dy;
      this.m4.makeTranslation(this.v3.x, this.v3.y, this.v3.z);
      b.mesh.setMatrixAt(j, this.m4);
      if (st.speed > 0) {
        const p = m.pieces[i], gs = this.ghosts.get(p.c)!;
        gs.forEach((g, k) => {
          const n = used.get(g)!; if (n >= MAX_GHOSTS) return;
          this.m4.makeScale(p.w - 0.03, p.h * PL, p.d - 0.03);
          this.m4.setPosition(this.v3.x, this.v3.y + (p.h * PL) / 2 + st.speed * (k + 1) * 0.018, this.v3.z);
          g.setMatrixAt(n, this.m4); used.set(g, n + 1);
        });
      }
    }
    for (const b of this.batches) b.mesh.instanceMatrix.needsUpdate = true;
    for (const [g, n] of used) { g.count = n; g.instanceMatrix.needsUpdate = true; }
    if (this.nameplate) {
      const st = pieceState(tl, this.nameplateIdx, t), p = m.pieces[this.nameplateIdx];
      this.nameplate.visible = st.visible && !!this.opts.label;
      this.nameplate.position.copy(this.home[this.nameplateIdx]); this.nameplate.position.y += st.dy + p.h * PL + 0.003;
    }
  }

  setBuildCamera(t: number) {
    const c = buildCamera(this.tl!, t);
    const a = (c.az * Math.PI) / 180, e = (c.el * Math.PI) / 180;
    this.camera.position.set(c.dist * Math.cos(e) * Math.sin(a), c.ty + c.dist * Math.sin(e), c.dist * Math.cos(e) * Math.cos(a));
    this.camera.lookAt(0, c.ty, 0);
    this.controls.target.set(0, c.ty, 0);
  }

  play() {
    if (!this.model) return;
    this.controls.enabled = false; this.controls.autoRotate = false;
    this.playing = true; this.t0 = performance.now();
  }

  skip() {
    if (!this.model) return;
    this.playing = false;
    this.pose(this.tl!.end); this.setBuildCamera(this.tl!.end);
    this.finish();
  }

  private finish() {
    this.controls.enabled = true;
    this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.8;
    const s = this.tl!.height / 42;
    this.controls.minDistance = 40 * s; this.controls.maxDistance = 320 * s;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.dirty = true;
    this.onFinished?.();
  }

  private frame() {
    if (!this.model) return;
    if (this.playing) {
      const t = (performance.now() - this.t0) / 1000;
      this.pose(Math.min(t, this.tl!.end)); this.setBuildCamera(Math.min(t, this.tl!.end));
      if (t >= this.tl!.end) { this.playing = false; this.finish(); }
      this.render();
      return;
    }
    if (this.controls.enabled) { this.controls.update(); if (this.controls.autoRotate) this.dirty = true; }
    if (this.dirty) this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  get isPlaying() { return this.playing; }
  get time() { return this.playing ? (performance.now() - this.t0) / 1000 : this.tl?.end ?? 0; }
}

export function nameplateTexture(label: string, w: number, d: number, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * d / w);
  const x = c.getContext('2d')!;
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#f2f2f2'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold ${Math.min(c.height * 0.62, (c.width * 1.5) / Math.max(4, label.length))}px system-ui, sans-serif`;
  x.fillText(label, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

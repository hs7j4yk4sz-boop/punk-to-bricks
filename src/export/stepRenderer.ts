// Off-screen renders of the model for the instruction booklet: the whole bust
// (cover) and each step (earlier pieces pale, this step's pieces in colour
// with a yellow outline, later pieces hidden).
import * as THREE from 'three';
import type { Model } from '../core/build';
import { COLOR_BY_ID, renderHex } from '../core/palette';
import { geoKey, pieceGeometry } from '../viewer/geometry';
import { nameplateTexture } from '../viewer/scene';
import { PL } from '../viewer/timeline';

const HIGHLIGHT = 0xF5B800;

export class StepRenderer {
  readonly canvas = document.createElement('canvas');
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  private full: { mesh: THREE.InstancedMesh; ids: number[] }[] = [];
  private pale: { mesh: THREE.InstancedMesh; ids: number[] }[] = [];
  private home: THREE.Vector3[];
  private step: number[] = [];
  private edges = new THREE.Group();
  private plate: THREE.Mesh | null = null;
  private plateIdx: number;
  readonly scale: number;

  constructor(private m: Model, size = 1100, label = '') {
    this.canvas.width = this.canvas.height = size;
    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(1); this.gl.setSize(size, size, false);
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping; this.gl.toneMappingExposure = 1.05;
    this.gl.setClearColor(0xffffff, 0);
    const ys = m.pieces.flatMap(p => [p.y, p.y + p.h]);
    this.scale = ((Math.max(...ys) - Math.min(...ys)) * PL) / 42;
    const s = this.scale;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(36 * s, 80 * s, 52 * s); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40 * s, right: 40 * s, top: 50 * s, bottom: -20 * s, near: 1, far: 260 * s });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.8); fill.position.set(-25, 12, 10); this.scene.add(fill);
    const base = m.pieces.filter(p => p.group === 'base');
    const cx = (Math.min(...base.map(p => p.x)) + Math.max(...base.map(p => p.x + p.w))) / 2;
    const cz = (Math.min(...base.map(p => p.z)) + Math.max(...base.map(p => p.z + p.d))) / 2;
    const yMin = Math.min(...m.pieces.map(p => p.y));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.25, color: 0x1f4a6b }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = yMin * PL; floor.receiveShadow = true; this.scene.add(floor);
    this.home = m.pieces.map(p => new THREE.Vector3(p.x + p.w / 2 - cx, p.y * PL, -(p.z + p.d / 2) + cz));
    const byKey = new Map<string, number[]>();
    m.pieces.forEach((p, i) => { const k = geoKey(p) + '|' + p.c; byKey.set(k, [...(byKey.get(k) ?? []), i]); });
    const white = new THREE.Color('#ffffff');
    for (const ids of byKey.values()) {
      const p0 = m.pieces[ids[0]], col = COLOR_BY_ID.get(p0.c)!;
      const mk = (pale: boolean) => {
        const c = new THREE.Color(renderHex(p0.c));
        if (pale) c.lerp(white, 0.4);
        const mat = col.trans ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, transparent: true, opacity: 0.7 })
          : new THREE.MeshStandardMaterial({ color: c, roughness: pale ? 0.6 : 0.32 });
        const mesh = new THREE.InstancedMesh(pieceGeometry(p0), mat, ids.length);
        mesh.castShadow = !col.trans; mesh.receiveShadow = true; mesh.frustumCulled = false;
        this.scene.add(mesh);
        return { mesh, ids };
      };
      this.full.push(mk(false)); this.pale.push(mk(true));
    }
    this.scene.add(this.edges);
    this.plateIdx = m.pieces.findIndex(p => p.nameplate);
    if (this.plateIdx >= 0 && label) {
      const p = m.pieces[this.plateIdx];
      this.plate = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 0.15, p.d - 0.15), new THREE.MeshStandardMaterial({ map: nameplateTexture(label, p.w, p.d, renderHex(p.c)), roughness: 0.3 }));
      this.plate.rotation.x = -Math.PI / 2;
      this.plate.position.copy(this.home[this.plateIdx]); this.plate.position.y += p.h * PL + 0.003;
      this.scene.add(this.plate);
    }
    m.steps.forEach((s2, si) => s2.forEach(i => { this.step[i] = si; }));
  }

  /** Show pieces by state: 0 hidden, 1 pale, 2 full colour. */
  private show(state: (i: number) => 0 | 1 | 2) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4();
    for (const [set, want] of [[this.full, 2], [this.pale, 1]] as const) for (const b of set) {
      b.ids.forEach((i, j) => b.mesh.setMatrixAt(j, state(i) === want ? m4.makeTranslation(this.home[i].x, this.home[i].y, this.home[i].z) : zero));
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.plate) this.plate.visible = state(this.plateIdx) !== 0;
  }

  private outline(ids: number[]) {
    this.edges.children.forEach(o => (o as THREE.LineSegments).geometry.dispose());
    this.edges.clear();
    const mat = new THREE.LineBasicMaterial({ color: HIGHLIGHT });
    for (const i of ids) {
      const p = this.m.pieces[i], h = p.h * PL;
      const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(p.w - 0.02, h - 0.01, p.d - 0.02));
      g.translate(this.home[i].x, this.home[i].y + h / 2, this.home[i].z);
      this.edges.add(new THREE.LineSegments(g, mat));
    }
  }

  private shoot(az: number, el: number, dist: number, ty: number): HTMLCanvasElement {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    this.camera.position.set(dist * Math.cos(e) * Math.sin(a), ty + dist * Math.sin(e), dist * Math.cos(e) * Math.cos(a));
    this.camera.lookAt(0, ty, 0);
    this.gl.render(this.scene, this.camera);
    return this.canvas;
  }

  cover(): HTMLCanvasElement {
    this.outline([]);
    this.show(() => 2);
    const s = this.scale;
    return this.shoot(28, 12, 140 * s, 19 * s);
  }

  stepView(si: number): HTMLCanvasElement {
    const ids = this.m.steps[si];
    this.show(i => (this.step[i] < si ? 1 : this.step[i] === si ? 2 : 0));
    this.outline(ids);
    const s = this.scale;
    const topY = Math.max(...ids.map(i => (this.m.pieces[i].y + this.m.pieces[i].h) * PL));
    return this.shoot(32, 32, 125 * s, Math.max(6 * s, Math.min(22 * s, topY - 4 * s)));
  }

  dispose() {
    this.gl.dispose();
    [...this.full, ...this.pale].forEach(b => { (b.mesh.material as THREE.Material).dispose(); b.mesh.dispose(); });
  }
}

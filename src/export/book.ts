// The instruction booklet as a 3D book whose pages flip, faster and faster
// (end of the video; port of the reference render.html).
import * as THREE from 'three';
import { easeIO, lerp } from '../viewer/timeline';
import { SKY } from '../viewer/scene';

const SEG = 28, LEAF = 0.012;

export class Book {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private tex: THREE.Texture[];
  private NL: number;
  private LAST: number;
  private PW = 21;
  private PH: number;
  private stackL: THREE.Mesh; private stackR: THREE.Mesh;
  private topL: THREE.Mesh; private topR: THREE.Mesh;
  private topMatL = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private topMatR = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private leaves: { f: THREE.Mesh; bk: THREE.Mesh; g: THREE.BufferGeometry; gb: THREE.BufferGeometry }[] = [];
  readonly sched: [number, number][] = [];

  /** pages: drawn page canvases; aspect = page height / width. */
  constructor(pages: HTMLCanvasElement[], aspect: number, cameraAspect: number) {
    this.PH = this.PW * aspect;
    this.camera = new THREE.PerspectiveCamera(cameraAspect >= 1 ? 34 : (2 * Math.atan(Math.tan((17 * Math.PI) / 180) / cameraAspect) * 180) / Math.PI, cameraAspect, 0.5, 400);
    this.tex = pages.map(pg => { const t = new THREE.CanvasTexture(pg); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
    this.NL = Math.ceil(pages.length / 2);
    this.LAST = Math.max(0, Math.min(this.NL - 1, Math.floor((pages.length - 2) / 2)));
    const sc = this.scene;
    sc.background = SKY;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x6b8fa8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-14, 40, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 1, far: 120 });
    sc.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.3, color: 0x1f4a6b }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.9 });
    const box = () => { const b = new THREE.Mesh(new THREE.BoxGeometry(this.PW, 1, this.PH), white); b.castShadow = b.receiveShadow = true; sc.add(b); return b; };
    this.stackR = box(); this.stackL = box();
    const top = (mat: THREE.Material) => { const t = new THREE.Mesh(new THREE.PlaneGeometry(this.PW, this.PH), mat); t.rotation.x = -Math.PI / 2; t.receiveShadow = true; sc.add(t); return t; };
    this.topR = top(this.topMatR); this.topL = top(this.topMatL);
    for (let i = 0; i < 10; i++) this.leaves.push(this.leaf());
    let s = 1.1;
    for (let j = 0; j < this.LAST; j++) { this.sched.push([s, Math.max(0.3, 1.05 * Math.pow(0.86, j))]); s += Math.max(0.075, 0.85 * Math.pow(0.78, j)); }
  }

  private leaf() {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((SEG + 1) * 2 * 3), uvF = new Float32Array((SEG + 1) * 4), uvB = new Float32Array((SEG + 1) * 4), idx: number[] = [];
    for (let i = 0; i <= SEG; i++) for (let j = 0; j < 2; j++) { const k = i * 2 + j; uvF[k * 2] = i / SEG; uvF[k * 2 + 1] = j ? 0 : 1; uvB[k * 2] = 1 - i / SEG; uvB[k * 2 + 1] = j ? 0 : 1; }
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvF, 2)); g.setIndex(idx);
    const gb = new THREE.BufferGeometry(); gb.setAttribute('position', g.getAttribute('position')); gb.setAttribute('uv', new THREE.BufferAttribute(uvB, 2)); gb.setIndex(idx);
    const f = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.FrontSide }));
    const bk = new THREE.Mesh(gb, new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.BackSide }));
    f.castShadow = bk.castShadow = true; f.frustumCulled = bk.frustumCulled = false;
    this.scene.add(f, bk);
    return { f, bk, g, gb };
  }

  private shape(L: (typeof this.leaves)[number], theta: number, y0: number) {
    const pos = L.g.getAttribute('position') as THREE.BufferAttribute, bend = -1.1 * Math.sin(theta), du = this.PW / SEG;
    let x = 0, y = y0;
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j < 2; j++) pos.setXYZ(i * 2 + j, x, y, j ? this.PH / 2 : -this.PH / 2);
      const a = theta + bend * (i / SEG);
      x += Math.cos(a) * du; y += Math.sin(a) * du;
    }
    pos.needsUpdate = true; L.g.computeVertexNormals(); L.gb.computeVertexNormals();
  }

  /** Pose the book at tb seconds into its sequence. */
  pose(tb: number) {
    const th = (j: number) => { if (j >= this.LAST) return 0; const [s, d] = this.sched[j]; return Math.PI * easeIO((tb - s) / d); };
    let turned = 0; while (turned < this.LAST && th(turned) >= Math.PI - 1e-4) turned++;
    let open = turned; while (open < this.LAST && th(open) > 1e-4) open++;
    const hL = 0.25 + turned * LEAF, hR = 0.25 + (this.NL - open) * LEAF;
    this.stackL.visible = turned > 0; this.stackL.scale.y = hL; this.stackL.position.set(-this.PW / 2, hL / 2, 0);
    this.stackR.scale.y = hR; this.stackR.position.set(this.PW / 2, hR / 2, 0);
    this.topR.position.set(this.PW / 2, hR + 0.01, 0);
    this.topMatR.map = this.tex[Math.min(this.tex.length - 1, 2 * open)]; this.topMatR.needsUpdate = true;
    this.topL.visible = turned > 0;
    if (turned > 0) { this.topL.position.set(-this.PW / 2, hL + 0.01, 0); this.topMatL.map = this.tex[2 * turned - 1]; this.topMatL.needsUpdate = true; }
    let li = 0;
    for (let j = turned; j < open && li < this.leaves.length; j++) {
      const L = this.leaves[li++], a = th(j);
      this.shape(L, a, lerp(hR, hL, a / Math.PI) + 0.03);
      (L.f.material as THREE.MeshStandardMaterial).map = this.tex[2 * j]; (L.f.material as THREE.MeshStandardMaterial).needsUpdate = true;
      (L.bk.material as THREE.MeshStandardMaterial).map = this.tex[2 * j + 1] ?? this.tex[2 * j]; (L.bk.material as THREE.MeshStandardMaterial).needsUpdate = true;
      L.f.visible = L.bk.visible = true;
    }
    for (; li < this.leaves.length; li++) this.leaves[li].f.visible = this.leaves[li].bk.visible = false;
    // close on the cover, then glide to the open spread with a slight drift
    const u = easeIO((tb - 0.3) / 1.8);
    const cx = lerp(this.PW / 2, 0, u);
    const az = lerp(-24, -12, Math.min(1, tb / 7)), el = lerp(58, 50, Math.min(1, tb / 7)), dist = lerp(36, 66, u) - 4 * Math.min(1, Math.max(0, (tb - 3) / 4));
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    this.camera.position.set(cx + dist * Math.cos(e) * Math.sin(a), dist * Math.sin(e), dist * Math.cos(e) * Math.cos(a));
    this.camera.lookAt(cx, 0, 0);
  }

  dispose() { this.tex.forEach(t => t.dispose()); }
}

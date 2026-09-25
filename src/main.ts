import type { Model, SizeId } from './core/build';
import { hexToRgb, rgbToHex } from './core/color';
import type { PunkGrid, RGBAImage } from './core/detect';
import { REFERENCE_PUNK, TEST_PUNKS, type TestPunk } from './examples/punks';
import { Viewer } from './viewer/scene';
import { brickLinkXML, partsCSV } from './export/parts';
import type { BuildReply, BuildRequest } from './worker/build.worker';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const worker = new Worker(new URL('./worker/build.worker.ts', import.meta.url), { type: 'module' });
let nextId = 1;
const pending = new Map<number, (r: BuildReply) => void>();
worker.onmessage = (e: MessageEvent<BuildReply>) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
const build = (req: Omit<BuildRequest, 'id'>) => new Promise<BuildReply>(res => { const id = nextId++; pending.set(id, res); worker.postMessage({ ...req, id }); });

const isPhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const viewer = new Viewer($('view'), { lowPoly: isPhone, label: '' });
viewer.onFinished = () => { $('hint').hidden = false; };

let grid: PunkGrid | null = null;
let size: SizeId = 'xl';
const models: Partial<Record<SizeId, Model>> = {};

// ---------- input ----------
async function fileToImage(blob: Blob): Promise<RGBAImage> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingEnabled = false;
  x.drawImage(bmp, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}
function punkToImage(p: TestPunk): RGBAImage {
  const data = new Uint8ClampedArray(24 * 24 * 4);
  p.rows.forEach((row, r) => [...row].forEach((ch, c) => { data.set([...hexToRgb(p.palette[ch]), 255], (r * 24 + c) * 4); }));
  return { width: 24, height: 24, data };
}

async function start(image: RGBAImage) {
  showError(null);
  $('result').hidden = false;
  busy('Reading your Punk…');
  const r = await build({ size, image });
  if (!r.ok) { busy(null); $('result').hidden = !grid; showError(r.message); return; }
  grid = r.grid;
  for (const k of Object.keys(models) as SizeId[]) delete models[k];
  models[size] = r.model;
  drawGrid(r.grid);
  show(r.model, r.ms);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function setSize(s: SizeId) {
  size = s;
  document.querySelectorAll<HTMLButtonElement>('.size').forEach(b => b.setAttribute('aria-checked', String(b.dataset.size === s)));
  if (!grid) return;
  if (!models[s]) {
    busy(`Building the ${s === 'xl' ? 'XL' : 'Mini'} model…`);
    const r = await build({ size: s, grid });
    if (!r.ok) { busy(null); showError(r.message); return; }
    models[s] = r.model;
    show(r.model, r.ms);
  } else show(models[s]!, 0);
}

function show(m: Model, ms: number) {
  busy(null);
  $('hint').hidden = true;
  viewer.setModel(m);
  viewer.play();
  renderChecks(m, ms);
}

// ---------- panels ----------
function busy(text: string | null) {
  $('busy').hidden = text === null;
  if (text) $('busy-text').textContent = text;
}
function showError(msg: string | null) {
  const e = $('error'); e.hidden = !msg; e.textContent = msg ?? '';
}
function drawGrid(g: PunkGrid) {
  const c = $<HTMLCanvasElement>('grid'), x = c.getContext('2d')!, k = c.width / 24;
  x.fillStyle = g.background ? rgbToHex(g.background) : '#638596'; x.fillRect(0, 0, c.width, c.height);
  g.cells.forEach((row, r) => row.forEach((v, col) => { if (v >= 0) { x.fillStyle = rgbToHex(g.colors[v].rgb); x.fillRect(col * k, r * k, k, k); } }));
  $('read-text').textContent = `24 × 24 pixels, ${g.colors.length} colours`;
}
function renderChecks(m: Model, ms: number) {
  const c = m.checks;
  const li = (cls: string, big: string, small: string) => `<li class="${cls}"><b>${big}</b>${small}</li>`;
  $('checks').innerHTML = [
    li('ok', `${c.pieces.toLocaleString('en')} pieces`, `${m.bom.length} lots · ${m.steps.length} steps · about ${m.dims[0]} × ${m.dims[1]} × ${m.dims[2]} cm`),
    li('ok', `${c.connections.toLocaleString('en')} studs`, 'connected between pieces'),
    c.collisions === 0 ? li('ok', '0 collisions', 'no two pieces overlap') : li('bad', `${c.collisions} collisions`, 'some pieces overlap: this model can’t be built as is'),
    c.floating === 0 ? li('ok', '0 floating', 'every piece is attached to the base') : li('bad', `${c.floating} floating`, 'pieces not attached to the base: this model can’t be built as is'),
    c.com.inside ? li('ok', 'Balanced', `centre of mass ${c.com.margin} studs inside the base`) : li('bad', 'Will tip over', 'the centre of mass is outside the base'),
    c.weak === 0 ? li('ok', '0 weak joints', 'no piece hangs on a single stud') : li('warn', `${c.weak} weak joint${c.weak > 1 ? 's' : ''}`, 'held by a single stud: fine for display, handle gently'),
  ].join('');
  $('notes').innerHTML = [...m.notes, `Computed in your browser${ms ? ` in ${(ms / 1000).toFixed(1)} s` : ''}. Computer-checked, not physically build-tested.`].map(n => `<li>${n}</li>`).join('');
}

// ---------- wiring ----------
const drop = $('drop'), file = $<HTMLInputElement>('file');
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
file.addEventListener('change', () => { const f = file.files?.[0]; if (f) fileToImage(f).then(start, () => showError('We couldn’t open this file. Use a PNG or JPG image.')); file.value = ''; });
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => {
  const f = [...((e as DragEvent).dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'));
  if (f) fileToImage(f).then(start, () => showError('We couldn’t open this file. Use a PNG or JPG image.'));
  else showError('That doesn’t look like an image. Drop a PNG or JPG of your Punk.');
});
window.addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
  if (f) fileToImage(f).then(start, () => showError('We couldn’t read the pasted image.'));
});
document.querySelectorAll<HTMLButtonElement>('.size').forEach(b => b.addEventListener('click', () => setSize(b.dataset.size as SizeId)));
$('replay').addEventListener('click', () => { $('hint').hidden = true; viewer.play(); });
$('skip').addEventListener('click', () => viewer.skip());
export const plateLabel = () => { const n = $<HTMLInputElement>('punkno').value.replace(/\D/g, '').slice(0, 5); return n ? `#${n}` : ''; };
$('punkno').addEventListener('input', () => viewer.setLabel(plateLabel()));

// ---------- exports ----------
const current = () => models[size] ?? null;
const baseName = () => `${plateLabel() ? 'punk-' + plateLabel().slice(1) : 'my-punk'}-${size}`;
function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
function progress(text: string | null, f = 0) {
  $('progress').hidden = text === null;
  if (text !== null) { $('progress-text').textContent = text; $('bar').style.width = `${Math.round(f * 100)}%`; }
}
let exporting = false;
async function run(label: string, job: () => Promise<void>) {
  if (exporting || !current()) return;
  exporting = true;
  document.querySelectorAll<HTMLButtonElement>('.dl button').forEach(b => { b.disabled = true; });
  try { await job(); progress(null); }
  catch (e) { progress(`${label} failed: ${(e as Error).message}`, 0); }
  finally { exporting = false; document.querySelectorAll<HTMLButtonElement>('.dl button').forEach(b => { b.disabled = false; }); }
}
$('dl-csv').addEventListener('click', () => { const m = current(); if (m) save(new Blob([partsCSV(m)], { type: 'text/csv' }), `${baseName()}-parts.csv`); });
$('dl-xml').addEventListener('click', () => { const m = current(); if (m) save(new Blob([brickLinkXML(m)], { type: 'application/xml' }), `${baseName()}-bricklink.xml`); });
$('dl-pdf').addEventListener('click', () => run('Instructions', async () => {
  const { makeInstructions } = await import('./export/pdf');
  progress('Drawing the instructions…', 0);
  const blob = await makeInstructions(current()!, grid!, { label: plateLabel(), renderSize: isPhone ? 800 : 1100, onProgress: (d, t) => progress(`Drawing page ${d} of ${t}…`, d / t) });
  save(blob, `${baseName()}-instructions.pdf`);
}));
for (const format of ['square', 'story'] as const) $(format === 'square' ? 'vid-square' : 'vid-story').addEventListener('click', () => run('Video', async () => {
  const { recordVideo } = await import('./export/video');
  progress('Recording the video… keep this tab open', 0);
  const { blob, ext } = await recordVideo(current()!, { format, label: plateLabel(), small: isPhone, onProgress: f => progress('Recording the video… keep this tab open', f) });
  save(blob, `${baseName()}-${format === 'story' ? '9x16' : 'square'}.${ext}`);
}));
function shareLink() {
  const m = current();
  const text = m
    ? `I turned my CryptoPunk into a ${m.checks.pieces.toLocaleString('en')}-piece brick bust you can really build 🧱\n\nMade with Punk to Bricks, inspired by @victormustar's Microduck.`
    : 'Turn your CryptoPunk into a brick bust you can really build 🧱';
  const url = location.origin + location.pathname;
  $<HTMLAnchorElement>('share-x').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
$('share-x').addEventListener('pointerdown', shareLink);
$('share-x').addEventListener('focus', shareLink);

const examples = [REFERENCE_PUNK, ...TEST_PUNKS.filter(p => ['cap', 'long-hair-woman', 'pipe', 'hoodie', 'alien-cap', 'ape-beanie', 'zombie', 'cowboy-hat', 'mohawk', 'vr'].includes(p.name))];
for (const p of examples) {
  const b = document.createElement('button');
  b.title = p.name === 'reference' ? 'The original brick bust' : p.name.replace(/-/g, ' ');
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const img = punkToImage(p);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), 24, 24), 0, 0);
  b.append(c);
  b.addEventListener('click', () => start(punkToImage(p)));
  $('examples').append(b);
}
setSize(size);

// dev/test hook: lets scripts drive the viewer frame by frame
if (import.meta.env.DEV) {
  Promise.all([import('./core/detect'), import('./core/build')]).then(([d, b]) =>
    Object.assign(window, { ptb: { viewer, start, punkToImage, examples, setSize, build, detectPunk: d.detectPunk, buildModel: b.buildModel, fileToImage } }));
}

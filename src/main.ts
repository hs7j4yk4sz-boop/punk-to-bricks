import type { Model, SizeId } from './core/build';
import { rgbToHex } from './core/color';
import type { PunkGrid, RGBAImage } from './core/detect';
import { Viewer } from './viewer/scene';
import { brickLinkXML, partsCSV } from './export/parts';
import { brickLinkRemainderXML, orderSummary, pickABrickFiles } from './export/order';
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
// one model per size and "prefer LEGO parts" choice
const models = new Map<string, Model>();
let preferLego = false;
const mkey = (s: SizeId) => `${s}|${preferLego}`;

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
/** An example Punk from public/examples (real Punks, used with permission). */
async function exampleImage(file: string): Promise<RGBAImage> {
  const res = await fetch(`./examples/${file}`);
  return fileToImage(await res.blob());
}

async function start(image: RGBAImage) {
  showError(null);
  $('result').hidden = false;
  busy('Reading your Punk…');
  const r = await build({ size, image, preferLego });
  if (!r.ok) { busy(null); $('result').hidden = !grid; showError(r.message); return; }
  grid = r.grid;
  models.clear();
  models.set(mkey(size), r.model);
  drawGrid(r.grid);
  show(r.model, r.ms);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function setSize(s: SizeId) {
  size = s;
  document.querySelectorAll<HTMLButtonElement>('.size').forEach(b => b.setAttribute('aria-checked', String(b.dataset.size === s)));
  if (!grid) return;
  const have = models.get(mkey(s));
  if (!have) {
    busy(`Building the ${s === 'xl' ? 'XL' : 'Mini'} model${preferLego ? ' with parts LEGO sells' : ''}…`);
    const r = await build({ size: s, grid, preferLego });
    if (!r.ok) { busy(null); showError(r.message); return; }
    models.set(mkey(s), r.model);
    show(r.model, r.ms);
  } else show(have, 0);
}

function show(m: Model, ms: number) {
  busy(null);
  $('hint').hidden = true;
  viewer.setModel(m);
  viewer.play();
  renderChecks(m, ms);
  renderOrder(m);
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
    li('ok', `${c.connections.toLocaleString('en')} studs`, 'connected between pieces'),
    c.collisions === 0 ? li('ok', '0 collisions', 'no two pieces overlap') : li('bad', `${c.collisions} collisions`, 'some pieces overlap: this model can’t be built as is'),
    c.floating === 0 ? li('ok', '0 floating', 'every piece is attached to the base') : li('bad', `${c.floating} floating`, 'pieces not attached to the base: this model can’t be built as is'),
    c.com.inside ? li('ok', 'Balanced', `centre of mass ${c.com.margin} studs inside the base`) : li('bad', 'Will tip over', 'the centre of mass is outside the base'),
    c.weak === 0 ? li('ok', '0 weak joints', 'no piece hangs on a single stud') : li('warn', `${c.weak} weak joint${c.weak > 1 ? 's' : ''}`, 'held by a single stud: fine for display, handle gently'),
  ].join('');
  $('notes').innerHTML = [...m.notes, `Computed in your browser${ms ? ` in ${(ms / 1000).toFixed(1)} s` : ''}. Computer-checked, not physically build-tested.`].map(n => `<li>${n}</li>`).join('');
  // the key figures, big; the rest folds under "More info"
  const stat = (v: string, l: string) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  $('stats').innerHTML = stat(c.pieces.toLocaleString('en'), 'pieces') + stat(String(m.steps.length), 'steps')
    + stat(String(m.bom.length), 'lots to buy') + stat(`${m.dims[0]}×${m.dims[1]}×${m.dims[2]}`, 'cm');
  const solid = c.floating === 0 && c.collisions === 0 && c.com.inside;
  const pill = $('pill');
  pill.className = solid ? 'pill' : 'pill bad';
  pill.textContent = solid ? '✓ Checked: solid' : '✗ Check failed';
  $('status-short').textContent = `${c.floating} floating · ${c.collisions} collisions · ${c.com.inside ? 'balanced' : 'will tip over'}`;
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
const current = () => models.get(mkey(size)) ?? null;
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
  document.querySelectorAll<HTMLButtonElement>('.act, .vid-btn').forEach(b => { b.disabled = true; });
  try { await job(); progress(null); }
  catch (e) { progress(`${label} failed: ${(e as Error).message}`, 0); }
  finally { exporting = false; document.querySelectorAll<HTMLButtonElement>('.act, .vid-btn').forEach(b => { b.disabled = false; }); }
}
// ---------- ordering ----------
function renderOrder(m: Model) {
  const s = orderSummary(m);
  const lots = (n: number) => `${n} lot${n === 1 ? '' : 's'}`;
  const all = s.lego.length + s.brickLinkOnly.length || 1;
  $('bar-lego').style.width = `${(100 * s.lego.length) / all}%`;
  $('bar-bl').style.width = `${(100 * s.brickLinkOnly.length) / all}%`;
  $('leg-lego').textContent = lots(s.lego.length);
  $('leg-bl').textContent = lots(s.brickLinkOnly.length);
  $('order-chip').textContent = `${s.lego.length} of ${all} lots at LEGO`;
  const files = pickABrickFiles(m).length;
  $('pab-note').textContent = `${files > 1 ? `${files} files (400 references each at most)` : '1 file'} · ${lots(s.lego.length)} · ${s.legoPieces.toLocaleString('en')} pieces`;
  $('dl-pab').textContent = files > 1 ? `⬇ ${files} CSV` : '⬇ CSV';
  $<HTMLButtonElement>('dl-pab').disabled = files === 0;
  $('bl-missing-row').hidden = s.brickLinkOnly.length === 0;
  $('rest-note').textContent = `${lots(s.brickLinkOnly.length)} · ${s.brickLinkOnlyPieces.toLocaleString('en')} pieces LEGO doesn’t sell`;
  $('all-note').textContent = `${lots(m.bom.length)} · ${m.checks.pieces.toLocaleString('en')} pieces · if you’d rather buy everything there`;
  const base = models.get(`${size}|false`);
  $('prefer-note').textContent = preferLego
    ? `Done: every check ran again (${m.checks.floating} floating, ${m.checks.collisions} collisions)${base ? `, ${m.checks.pieces - base.checks.pieces >= 0 ? '+' : ''}${m.checks.pieces - base.checks.pieces} pieces` : ''}.`
    : 'Rebuilds your bust with smaller pieces where needed. Every check runs again.';
  $<HTMLInputElement>('prefer-lego').checked = preferLego;
}
/** The "Before you order" notice, once per visit, before the first order file. */
let understood = false;
function beforeOrder(): Promise<boolean> {
  if (understood) return Promise.resolve(true);
  const d = $<HTMLDialogElement>('before-order'), ok = $<HTMLInputElement>('bo-ok'), go = $<HTMLButtonElement>('bo-continue');
  ok.checked = false; go.disabled = true;
  ok.onchange = () => { go.disabled = !ok.checked; };
  d.showModal();
  return new Promise(res => { d.onclose = () => { understood = d.returnValue === 'ok' && ok.checked; res(understood); }; });
}
async function orderDownload(make: (m: Model) => void) {
  const m = current();
  if (m && await beforeOrder()) make(m);
}
$('dl-pab').addEventListener('click', () => orderDownload(m => {
  const files = pickABrickFiles(m);
  files.forEach((f, i) => setTimeout(() => save(new Blob([f], { type: 'text/csv' }), `${baseName()}-pick-a-brick${files.length > 1 ? `-${i + 1}-of-${files.length}` : ''}.csv`), i * 400));
}));
$('dl-xml').addEventListener('click', () => orderDownload(m => save(new Blob([brickLinkXML(m)], { type: 'application/xml' }), `${baseName()}-bricklink.xml`)));
async function copyList(button: HTMLElement, text: string) {
  const label = button.textContent;
  try { await navigator.clipboard.writeText(text); button.textContent = 'Copied ✓'; }
  catch { button.textContent = 'Use ⬇ instead'; }
  setTimeout(() => { button.textContent = label; }, 1800);
}
$('copy-xml').addEventListener('click', () => orderDownload(m => copyList($('copy-xml'), brickLinkXML(m))));
$('copy-xml-rest').addEventListener('click', () => orderDownload(m => copyList($('copy-xml-rest'), brickLinkRemainderXML(m))));
$('dl-xml-rest').addEventListener('click', () => orderDownload(m => save(new Blob([brickLinkRemainderXML(m)], { type: 'application/xml' }), `${baseName()}-bricklink-not-at-lego.xml`)));
$('prefer-lego').addEventListener('change', e => {
  preferLego = (e.target as HTMLInputElement).checked;
  $('prefer-note').textContent = 'Rebuilding and checking…';
  setSize(size);
});
$('open-order').addEventListener('click', async () => { if (current() && await beforeOrder()) $<HTMLDialogElement>('order-panel').showModal(); });
$('op-close').addEventListener('click', () => $<HTMLDialogElement>('order-panel').close());
$<HTMLDialogElement>('order-panel').addEventListener('click', e => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });
$('dl-kit').addEventListener('click', () => run('Kit', async () => {
  const [{ makeInstructions }, { makeZip }] = await Promise.all([import('./export/pdf'), import('./export/zip')]);
  const m = current()!, name = baseName();
  progress('Drawing the instructions…', 0);
  const pdf = await makeInstructions(m, grid!, { label: plateLabel(), renderSize: isPhone ? 800 : 1100, onProgress: (d, t) => progress(`Drawing page ${d} of ${t}…`, d / t) });
  const readme = [`${name} — made with Punk to Bricks`, '', `${m.checks.pieces} pieces · ${m.steps.length} steps · ${m.bom.length} lots · about ${m.dims.join(' × ')} cm`, '',
    `${name}-instructions.pdf   step-by-step instructions, one page per layer`, `${name}-parts.csv   parts list (BrickLink part and colour numbers)`, '',
    'To order the bricks, use "Order the bricks" on the site: it makes your LEGO Pick a Brick and BrickLink files.', '',
    'Models are generated automatically and checked by software only. They have NOT been physically built. Provided "as is", without warranty of any kind.',
    'Unofficial fan project · Not affiliated with, sponsored or endorsed by the LEGO Group, BrickLink or the CryptoPunks project. LEGO® is a trademark of the LEGO Group. Parts data: Rebrickable.', ''].join('\r\n');
  save(await makeZip([{ name: `${name}-instructions.pdf`, data: pdf }, { name: `${name}-parts.csv`, data: partsCSV(m) }, { name: 'README.txt', data: readme }]), `${name}-kit.zip`);
}));
for (const format of ['square', 'story'] as const) $(format === 'square' ? 'vid-square' : 'vid-story').addEventListener('click', () => run('Video', async () => {
  const { recordVideo } = await import('./export/video');
  progress('Preparing the booklet pages…', 0);
  const { blob, ext } = await recordVideo(current()!, grid!, { format, label: plateLabel(), small: isPhone,
    onProgress: (stage, f) => progress(stage === 'pages' ? 'Preparing the booklet pages…' : 'Recording the video (24 s)… keep this tab open', f) });
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

const examples = [
  { file: 'reference.png', title: 'The original bust' },
  ...['a-1', 'b-1', 'b-2', 'b-3', 'b-4', 'b-5', 'b-6', 'c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8', 'c-9'].map(n => ({ file: `${n}.png`, title: 'Example Punk' })),
];
for (const ex of examples) {
  const b = document.createElement('button');
  b.title = ex.title;
  const img = document.createElement('img');
  img.src = `./examples/${ex.file}`; img.alt = ex.title; img.width = img.height = 24;
  b.append(img);
  b.addEventListener('click', () => exampleImage(ex.file).then(start, () => showError('We couldn’t load this example.')));
  $('examples').append(b);
}
setSize(size);

// dev/test hook: lets scripts drive the viewer frame by frame
if (import.meta.env.DEV) {
  Promise.all([import('./core/detect'), import('./core/build')]).then(([d, b]) =>
    Object.assign(window, { ptb: { viewer, start, exampleImage, examples, setSize, build, detectPunk: d.detectPunk, buildModel: b.buildModel, fileToImage } }));
}

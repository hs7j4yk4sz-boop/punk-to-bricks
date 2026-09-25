// Front views of the Mini proportion options, side by side.
import { writeFileSync } from 'node:fs';
import { buildModel } from '../src/core/build';
import { detectPunk } from '../src/core/detect';
import { REFERENCE_PUNK, TEST_PUNKS } from '../test/fixtures/punks';
import { punkImage, toPNG } from '../test/img';
const B = { kind: 'brick' as const, h: 3 }, P = { kind: 'plate' as const, h: 1 };
const opts: [string, object][] = [['A · 1 brick per pixel', { rowLayers: [B] }], ['B · 2 plates per pixel', { rowLayers: [P, P] }], ['C · brick / 2 plates, alternating', { rowLayers: [B], rowLayersAlt: [P, P] }]];
const punks = [REFERENCE_PUNK, ...['cap', 'long-hair-woman', 'cigarette'].map(n => TEST_PUNKS.find(p => p.name === n)!)];
const data = punks.map(p => ({ img: 'data:image/png;base64,' + toPNG(punkImage(p, 6)).toString('base64'),
  views: opts.map(([, o]) => { const m = buildModel(detectPunk(punkImage(p, 8)), 'mini', o as any); return { n: m.checks.pieces, dims: m.dims, hex: m.colors, ps: m.pieces.map(q => [q.x, q.y, q.z, q.w, q.h, q.support ? 1 : 0, q.c]) }; }) }));
writeFileSync('out/mini-options.html', `<!doctype html><meta charset=utf-8><style>body{font:14px system-ui;margin:20px;background:#f5f7f9}table{border-spacing:16px 8px}th{font-weight:600;text-align:center}td{text-align:center;vertical-align:bottom;font-size:12px;color:#556}canvas,img{display:block;margin:0 auto 4px;image-rendering:pixelated;border-radius:6px}</style>
<table><tr><th>input</th>${opts.map(o => `<th>${o[0]}</th>`).join('')}</tr><tbody id=b></tbody></table><script>
const D=${JSON.stringify(data)};
// true proportions: 1 stud = 8 mm wide, 1 plate = 3.2 mm tall
const MM=1.9;
for(const r of D){const tr=document.createElement('tr');const td=document.createElement('td');const im=new Image();im.src=r.img;im.width=144;td.append(im);td.append('Punk');tr.append(td);
for(const v of r.views){const ps=v.ps;const x0=Math.min(...ps.map(p=>p[0])),x1=Math.max(...ps.map(p=>p[0]+p[3])),y0=Math.min(...ps.map(p=>p[1])),y1=Math.max(...ps.map(p=>p[1]+p[4]));
const c=document.createElement('canvas');c.width=(x1-x0)*8*MM;c.height=(y1-y0)*3.2*MM;const x=c.getContext('2d');
[...ps].sort((a,b)=>b[2]-a[2]).forEach(p=>{const X=(p[0]-x0)*8*MM,Y=c.height-(p[1]+p[4]-y0)*3.2*MM,W=p[3]*8*MM,H=p[4]*3.2*MM;x.globalAlpha=p[5]?.45:1;x.fillStyle=v.hex[p[6]];x.fillRect(X,Y,W,H);x.globalAlpha=1;x.strokeStyle='rgba(0,0,0,.3)';x.strokeRect(X+.5,Y+.5,W-1,H-1);});
const t=document.createElement('td');t.append(c);t.append(v.n+' pieces · '+v.dims[0]+'×'+v.dims[2]+' cm (w×h)');tr.append(t);}
document.getElementById('b').append(tr);}
</script>`);

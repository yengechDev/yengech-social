#!/usr/bin/env node
// Karqen sosyal medya kartlarını üretir: node kart.js <spec.json> <çıktı_klasörü>
// spec.json: { "cards": [ { file, eyebrow, title, lead?, layout, items?, big?, text?, note? } ] }
// layout: sade | satirlar ([[etiket, metin]]) | sorular ([metin]) | kutular ([[başlık, açıklama]]) | sayi (big, text, note)
// title içinde *vurgu* ifadesi yeşil yazılır. Çıktı: 1080x1350 JPEG.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [specPath, outDir] = process.argv.slice(2);
if (!specPath || !outDir) {
  console.error('Kullanım: node kart.js <spec.json> <çıktı_klasörü>');
  process.exit(2);
}
const nm = (p) => 'file://' + path.resolve(__dirname, 'node_modules/@fontsource', p);
const face = (fam, w, base) => `
@font-face{font-family:'${fam}';font-weight:${w};src:url('${nm(`${base}-latin-${w}-normal.woff2`)}') format('woff2')}
@font-face{font-family:'${fam}';font-weight:${w};unicode-range:U+0100-02BA;src:url('${nm(`${base}-latin-ext-${w}-normal.woff2`)}') format('woff2')}`;
const fonts = face('Unbounded', 500, 'unbounded/files/unbounded') + face('IBM Plex Sans', 400, 'ibm-plex-sans/files/ibm-plex-sans') + face('IBM Plex Sans', 500, 'ibm-plex-sans/files/ibm-plex-sans') + face('IBM Plex Mono', 500, 'ibm-plex-mono/files/ibm-plex-mono');
const glyph = '<svg viewBox="0 0 24 24" width="46" height="46"><rect x="3" y="3" width="10.2" height="4.6" rx="2.3" fill="#6ee7b7"/><rect x="16.4" y="3" width="4.6" height="10.2" rx="2.3" fill="#34d399"/><rect x="10.8" y="16.4" width="10.2" height="4.6" rx="2.3" fill="#10b981"/><rect x="3" y="10.8" width="4.6" height="10.2" rx="2.3" fill="#059669"/><circle cx="12" cy="12" r="2.6" fill="#f4f4f5"/></svg>';
const css = `${fonts}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;background:#0b0c0a;color:#e9f0e6;font-family:'IBM Plex Sans';position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(#161914 1px,transparent 1px),linear-gradient(90deg,#161914 1px,transparent 1px);background-size:60px 60px;opacity:.55}
.wrap{position:absolute;inset:0;padding:76px 76px 70px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:16px;font-family:'Unbounded';font-weight:500;font-size:32px}
.eyebrow{font-family:'IBM Plex Mono';font-weight:500;font-size:22px;letter-spacing:.14em;color:#34d399}
h1{font-family:'Unbounded';font-weight:500;line-height:1.1;letter-spacing:-.015em;margin-top:92px}
h1 em{font-style:normal;color:#c4ff61}
.lead{font-size:36px;line-height:1.4;color:#a3b1a2;margin-top:36px;max-width:900px}
.main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:56px}
.foot{display:flex;justify-content:space-between;border-top:2px solid #33403a;padding-top:26px;font-family:'IBM Plex Mono';font-weight:500;font-size:24px;color:#a3b1a2}
.foot b{color:#c4ff61;font-weight:500}
.row{display:grid;grid-template-columns:270px 1fr;gap:28px;padding:34px 0;border-top:2px solid #232a24;align-items:baseline}
.row:last-child{border-bottom:2px solid #232a24}
.row .k{font-family:'IBM Plex Mono';font-weight:500;font-size:28px;color:#c4ff61}
.row .v{font-size:38px;line-height:1.3;font-weight:500}
.q{display:grid;grid-template-columns:92px 1fr;padding:30px 0;border-top:2px solid #232a24;align-items:baseline}
.q .n{font-family:'IBM Plex Mono';font-weight:500;font-size:34px;color:#c4ff61}
.q .v{font-size:42px;line-height:1.25;font-weight:500}
.st{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.box{background:#111310;border:2px solid #33403a;border-radius:14px;padding:34px 32px;height:228px}
.box .t{font-family:'Unbounded';font-weight:500;font-size:32px;color:#c4ff61}
.box .d{font-size:29px;line-height:1.35;color:#a3b1a2;margin-top:18px}
.big{font-family:'Unbounded';font-weight:500;font-size:190px;line-height:1;color:#c4ff61;letter-spacing:-.03em}
.bigl{font-size:40px;line-height:1.3;font-weight:500;margin-top:20px;max-width:860px}
.note{font-size:34px;line-height:1.35;color:#a3b1a2;border-top:2px solid #232a24;margin-top:44px;padding-top:32px}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const em = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
const body = (c) => {
  const it = c.items || [];
  if (c.layout === 'satirlar') return it.map(([k, v]) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('');
  if (c.layout === 'sorular') return it.map((v, i) => `<div class="q"><div class="n">${String(i + 1).padStart(2, '0')}</div><div class="v">${esc(v)}</div></div>`).join('');
  if (c.layout === 'kutular') return `<div class="st">${it.map(([t, d]) => `<div class="box"><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div>`).join('')}</div>`;
  if (c.layout === 'sayi') return `<div class="big">${esc(c.big)}</div><div class="bigl">${esc(c.text)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}`;
  return '';
};
const page = (c) => {
  const size = c.title.length > 44 ? 68 : 84;
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><style>${css}</style><body><div class="grid"></div><div class="wrap">
<div class="top"><div class="brand">${glyph}Karqen</div><div class="eyebrow">${esc(c.eyebrow)}</div></div>
<h1 style="font-size:${size}px">${em(c.title)}</h1>${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}
<div class="main">${body(c)}</div>
<div class="foot"><span>Yengech'in yazılım fabrikası</span><b>karqen.ai</b></div></div></body></html>`;
};

(async () => {
  const { cards } = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  let failed = 0;
  for (const c of cards) {
    const html = path.join(__dirname, `.tmp-${process.pid}.html`);
    fs.writeFileSync(html, page(c));
    await p.goto('file://' + html);
    await p.evaluate(() => document.fonts.ready);
    const fit = await p.evaluate(() => {
      const m = document.querySelector('.main');
      const h = document.querySelector('h1').getBoundingClientRect();
      const lead = document.querySelector('.lead')?.getBoundingClientRect();
      const first = m.firstElementChild?.getBoundingClientRect();
      const upper = lead ? lead.bottom : h.bottom;
      return { overflow: m.scrollHeight > m.clientHeight + 1, clash: !!first && first.top < upper + 20 };
    });
    fs.unlinkSync(html);
    if (fit.overflow || fit.clash) {
      console.error(`SIGMADI: ${c.file}: metni kısalt`);
      failed++;
      continue;
    }
    await p.screenshot({ path: path.join(outDir, `${c.file}.jpg`), type: 'jpeg', quality: 92 });
    console.log(path.join(outDir, `${c.file}.jpg`));
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();

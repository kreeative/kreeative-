// Sleigh the Season — ticket layout from Kee's live poster, event fonts and colours.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '.';
const PAPER = 'data:image/webp;base64,' + fs.readFileSync(__dirname + '/paper-ticket.webp').toString('base64');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(__dirname + '/asa-logo.png').toString('base64');
const RIB = 'data:image/webp;base64,' + fs.readFileSync(__dirname + '/ribbon-band.webp').toString('base64');
const page = (W, H, c) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#123b2c;--bg2:#0c2a1f;--card:#fff8ec;--ink:#1b211d;--muted:#5d6b62;--red:#b3122e;--gold:#c99a3b;--perf:#e9b9b9}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:radial-gradient(120% 90% at 50% 40%,var(--bg) 0%,var(--bg2) 100%);position:relative;font-family:Outfit,sans-serif;color:var(--ink)}
.snow{position:absolute;inset:0}
.card{overflow:hidden;background:var(--card) url(${PAPER}) center/cover no-repeat !important;position:absolute;left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:var(--card);border-radius:30px;box-shadow:0 18px 40px rgba(0,0,0,.28);display:flex}
.notch{position:absolute;left:${c.stub-26}px;width:52px;height:52px;border-radius:50%;background:var(--bg)}
.notch.t{top:-26px;background:${c.notchTop}}.notch.b{bottom:-26px;background:${c.notchBot}}
.perf{position:absolute;left:${c.stub-1.5}px;top:40px;bottom:40px;border-left:3px dashed var(--perf)}
.rib{position:absolute;left:${c.rx}px;top:${c.ry}px;width:${c.rw}px;mix-blend-mode:multiply;pointer-events:none;z-index:2}
.card::after{content:'';position:absolute;inset:0;border-radius:30px;box-shadow:inset 0 0 60px rgba(120,90,40,.10);pointer-events:none}
.main,.stub,.perf{mix-blend-mode:multiply}
.logo{position:absolute;left:${(c.stub-c.logo)/2}px;top:${c.logoTop}px;width:${c.logo}px;height:${c.logo}px;mix-blend-mode:multiply;z-index:1}
.stub{padding-top:${c.stubTop}px;width:${c.stub}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.stub .d{font:500 30px/1 'DM Mono';letter-spacing:.08em;color:var(--red)}
.stub .n{font:400 ${c.num}px/1 'DM Serif Display';color:var(--ink);margin:8px 0 4px}
.main{flex:1;padding:${c.padTop}px 56px 0 ${c.padLeft}px;display:flex;flex-direction:column}
.k{font:400 25px/1.2 'DM Mono';letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
h1{font:400 ${c.h1}px/.98 'DM Serif Display';letter-spacing:-.01em;margin-top:${c.gap1}px}
h1 em{color:var(--red);font-style:italic}
.when{font:400 27px/1.55 'DM Mono';margin-top:${c.gap2}px}
.theme{margin-top:${c.gap3}px;padding-left:28px;border-left:5px solid var(--gold)}
.theme .l{font:600 22px/1 Outfit;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.theme .t{font:italic 400 ${c.theme}px/1.05 'DM Serif Display';color:var(--ink);margin-top:14px}
.theme p.s{font:400 27px/1.4 Outfit;color:var(--muted);margin-top:14px}
.btn{align-self:flex-start;margin-top:${c.gap4}px;background:var(--red);color:#fff;font:600 34px/1 Outfit;padding:26px 40px;border-radius:18px;box-shadow:0 6px 16px rgba(179,18,46,.25)}
</style></head><body>
<svg class="snow" width="${W}" height="${H}">${c.snow}</svg>
<div class="card">
 <img class="rib" src="${RIB}" alt=""><img class="logo" src="${LOGO}" alt="African Student Association logo"><span class="notch t"></span><span class="notch b"></span><span class="perf"></span>
 <div class="stub"><span class="d">THU</span><span class="n">3</span><span class="d">DEC</span></div>
 <div class="main">
  <p class="k">African Student Association</p>
  <h1>Sleigh the<br><em>Season</em></h1>
  <p class="when">Thursday, Dec 3<br>Location and time<br>to be announced</p>
  <div class="theme"><p class="l">The theme</p><p class="t">The Gift<br>of Giving</p></div>
  <span class="btn">Save the date</span>
 </div>
</div></body></html>`;
// deterministic snow dots
function snow(W, H, n, seed){let s=seed,r=()=>((s=(s*16807)%2147483647)/2147483647),o='';
 for(let i=0;i<n;i++){o+=`<circle cx="${(r()*W).toFixed(0)}" cy="${(r()*H).toFixed(0)}" r="${(1.5+r()*3.5).toFixed(1)}" fill="#fff" opacity="${(.12+r()*.3).toFixed(2)}"/>`}return o;}
const post = {logo:160,logoTop:160,rx:-15,ry:26,rw:1150,stubTop:300,x:90,y:80,w:900,h:1190,stub:220,num:190,padTop:300,padLeft:60,h1:132,gap1:24,gap2:30,gap3:44,gap4:50,theme:64,snow:snow(1080,1350,90,7)};
const story= {logo:160,logoTop:166,rx:-15,ry:28,rw:1150,stubTop:300,x:90,y:250,w:900,h:1250,stub:220,num:200,padTop:306,padLeft:60,h1:130,gap1:26,gap2:32,gap3:48,gap4:54,theme:66,snow:snow(1080,1920,130,11)};
(async()=>{
 const b = await chromium.launch();
 for (const [name,W,H,c] of [['post',1080,1350,post],['story',1080,1920,story]]) {
  c.notchTop='var(--bg)';c.notchBot='var(--bg2)';
  const p = await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:2});
  const html = page(W,H,c); fs.writeFileSync(`${name}.html`, html);
  await p.setContent(html,{waitUntil:'networkidle'}); await p.evaluate(()=>document.fonts.ready);
  const qa = await p.evaluate(()=>{const m=document.querySelector('.main'),card=document.querySelector('.card').getBoundingClientRect();
   const out=[];for(const el of m.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.right>card.right-40||r.bottom>card.bottom-40)out.push(el.className||el.tagName,Math.round(r.right),Math.round(r.bottom))}
   const last=m.lastElementChild.getBoundingClientRect();return {overflow:out,cardBottom:card.bottom,lastBottom:Math.round(last.bottom),h1w:Math.round(document.querySelector('h1').scrollWidth),fonts:[...document.fonts].filter(f=>f.status=='loaded').map(f=>f.family).join(',')}});
  console.log(name, JSON.stringify(qa));
  await p.screenshot({path:`${OUT}/sleigh-the-season-${name}.png`});
 }
 await b.close();
})();

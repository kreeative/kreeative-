// Sleigh the Season (African Student Association) — Kee's ticket layout, event fonts and colours.
// Real paper (Adobe Stock 364394852), real satin ribbon (Adobe Stock 237135003), ASA lion logo.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '.';
const b64 = (f, t) => `data:${t};base64,` + fs.readFileSync(__dirname + '/' + f).toString('base64');
const PAPER = b64('paper-ticket.webp', 'image/webp'), RIB = b64('ribbon-alpha.webp', 'image/webp'), LOGO = b64('asa-logo.png', 'image/png');

// The ticket's shape: rounded card with the two notches and the perforation holes punched out, edges slightly torn.
function cardMask(w, h, stub, band) {
  let holes = `<circle cx="${stub}" cy="0" r="26"/><circle cx="${stub}" cy="${h}" r="26"/>`;
  for (let y = 46; y <= h - 46; y += 15) if (y < band[0] || y > band[1]) holes += `<circle cx="${stub}" cy="${y}" r="3.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<filter id="t" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>
<mask id="m"><rect width="${w}" height="${h}" rx="30" fill="#fff"/><g fill="#000" filter="url(#t)">${holes}</g></mask>
<rect width="${w}" height="${h}" rx="30" fill="#fff" mask="url(#m)"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
function snow(W, H, n, seed){let s=seed,r=()=>((s=(s*16807)%2147483647)/2147483647),o='';
 for(let i=0;i<n;i++){o+=`<circle cx="${(r()*W).toFixed(0)}" cy="${(r()*H).toFixed(0)}" r="${(1.5+r()*3.5).toFixed(1)}" fill="#fff" opacity="${(.12+r()*.3).toFixed(2)}"/>`}return o;}

const page = (W, H, c) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#123b2c;--bg2:#0c2a1f;--ink:#1b211d;--muted:#56645b;--red:#b3122e;--gold:#b98a2c}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:radial-gradient(120% 90% at 50% 40%,var(--bg) 0%,var(--bg2) 100%);position:relative;font-family:Outfit,sans-serif;color:var(--ink)}
.snow{position:absolute;inset:0}
.wrap{position:absolute;left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;filter:drop-shadow(0 10px 18px rgba(0,0,0,.30)) drop-shadow(0 1px 1px rgba(0,0,0,.25))}
.card{position:absolute;inset:0;overflow:hidden;background:#f6f0e2 url(${PAPER}) center/cover no-repeat;-webkit-mask:url(${cardMask(c.w,c.h,c.stub,[c.ry+16,c.ry+100])}) 0 0/100% 100%;mask:url(${cardMask(c.w,c.h,c.stub,[c.ry+16,c.ry+100])}) 0 0/100% 100%}
.card::after{content:'';position:absolute;inset:0;box-shadow:inset 0 0 60px rgba(120,90,40,.10);pointer-events:none;z-index:3}
.crease{position:absolute;left:${c.stub-1}px;top:0;bottom:0;width:2px;background:linear-gradient(90deg,rgba(90,70,40,.10),rgba(255,255,255,.35));mix-blend-mode:multiply}
.ribclip{position:absolute;inset:0;border-radius:30px;overflow:hidden;pointer-events:none}
.rib{position:absolute;left:${c.rx}px;top:${c.ry}px;width:${c.rw}px}
.logo{position:absolute;left:${(c.stub-c.logo)/2}px;top:${c.logoTop}px;width:${c.logo}px;height:${c.logo}px;mix-blend-mode:multiply;filter:url(#print)}
.date{position:absolute;left:0;width:${c.stub}px;top:${c.dateTop}px;display:flex;flex-direction:column;align-items:center;mix-blend-mode:multiply}
.date .d{font:500 ${c.dsz}px/1 'DM Mono';letter-spacing:.08em;color:var(--red);filter:url(#print)}
.date .n{font:400 ${c.num}px/1 'DM Serif Display';color:var(--ink);filter:url(#ink)}
.main{position:absolute;left:${c.stub}px;right:0;top:0;padding:${c.padTop}px 50px 0 ${c.padLeft}px;mix-blend-mode:multiply}
.k{font:400 ${c.ksz}px/1.2 'DM Mono';letter-spacing:.14em;text-transform:uppercase;color:var(--muted);filter:url(#print)}
h1{font:400 ${c.h1}px/.97 'DM Serif Display';letter-spacing:-.035em;margin-top:${c.gap1}px;filter:url(#ink)}
h1 em{color:var(--red);font-style:italic;letter-spacing:-.03em}
.when{font:400 ${c.wsz}px/1.55 'DM Mono';margin-top:${c.gap2}px;filter:url(#print)}
.theme{margin-top:${c.gap3}px;padding-left:28px;border-left:5px solid var(--gold)}
.theme .l{font:600 ${c.lsz}px/1 Outfit;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);filter:url(#print)}
.theme .t{font:italic 400 ${c.theme}px/1.05 'DM Serif Display';letter-spacing:-.02em;margin-top:14px;filter:url(#ink)}
.btn{position:absolute;left:50%;top:${c.btnTop}px;transform:translateX(-50%);background:var(--red);color:#fff;font:600 ${c.bsz}px/1 Outfit;letter-spacing:.01em;padding:${c.bpad}px ${c.bpad*1.6}px;border-radius:999px;box-shadow:0 8px 18px rgba(0,0,0,.28);white-space:nowrap}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
 <filter id="ink" x="-4%" y="-10%" width="108%" height="120%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="7" result="fib"/>
  <feDisplacementMap in="SourceGraphic" in2="fib" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
  <feGaussianBlur in="rough" stdDeviation="0.25" result="bleed"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="13" result="blot"/>
  <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.2 0 0 0 0.84" result="density"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="5" result="speck"/>
  <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 0.3" result="pores"/>
  <feComposite in="bleed" in2="density" operator="in" result="inked"/>
  <feComposite in="inked" in2="pores" operator="in"/>
 </filter>
 <filter id="print" x="-4%" y="-20%" width="108%" height="140%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3" result="fib"/>
  <feDisplacementMap in="SourceGraphic" in2="fib" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="rough"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="9" result="speck"/>
  <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -0.15" result="pores"/>
  <feComposite in="rough" in2="pores" operator="in"/>
 </filter>
</defs></svg>
<svg class="snow" width="${W}" height="${H}">${c.snow}</svg>
<div class="wrap"><div class="card">
 <span class="crease"></span>
 <img class="logo" src="${LOGO}" alt="African Student Association logo">
 <div class="date"><span class="d">THU</span><span class="n">3</span><span class="d">DEC</span></div>
 <div class="main">
  <p class="k">African Student Association</p>
  <h1>Sleigh the<br><em>Season</em></h1>
  <p class="when">Thursday, Dec 3<br>Location and time<br>to be announced</p>
  <div class="theme"><p class="l">The theme</p><p class="t">The Gift<br>of Giving</p></div>
 </div>
</div><div class="ribclip"><img class="rib" src="${RIB}" alt=""></div></div>
<span class="btn">Save the date</span>
</body></html>`;

const post  = {x:40,y:40,w:1000,h:1130,stub:230,rx:-17,ry:24,rw:1280,logo:170,logoTop:150,dateTop:640,dsz:32,num:210,
  padTop:330,padLeft:62,ksz:26,h1:152,wsz:29,lsz:23,theme:70,gap1:24,gap2:34,gap3:46,btnTop:1196,bsz:34,bpad:24,snow:snow(1080,1350,70,7)};
const story = {x:90,y:250,w:900,h:1130,stub:220,rx:-15,ry:24,rw:1150,logo:160,logoTop:150,dateTop:690,dsz:30,num:200,
  padTop:306,padLeft:60,ksz:25,h1:136,wsz:27,lsz:22,theme:66,gap1:24,gap2:30,gap3:44,btnTop:1418,bsz:32,bpad:22,snow:snow(1080,1920,130,11)};

(async()=>{
 const b = await chromium.launch();
 for (const [name,W,H,c] of [['post',1080,1350,post],['story',1080,1920,story]]) {
  const p = await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:2});
  const html = page(W,H,c); fs.writeFileSync(`${name}.html`, html);
  await p.setContent(html,{waitUntil:'networkidle'}); await p.evaluate(()=>document.fonts.ready);
  // Equal visual gaps in the stub: THU -> 3 and 3 -> DEC, measured on the letters' ink, not their line boxes.
  const gaps = await p.evaluate((G)=>{
   const cv=document.createElement('canvas').getContext('2d');
   const ink=el=>{const cs=getComputedStyle(el);cv.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;const m=cv.measureText(el.textContent);
     const s=document.createElement('span');s.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';el.appendChild(s);const base=s.getBoundingClientRect().top;s.remove();
     return {top:base-m.actualBoundingBoxAscent,bot:base+m.actualBoundingBoxDescent}};
   const [a,n,d]=document.querySelectorAll('.date>span');
   let A=ink(a),N=ink(n);n.style.marginTop=(G-(N.top-A.bot))+'px';
   N=ink(n);let D=ink(d);d.style.marginTop=(G-(D.top-N.bot))+'px';
   A=ink(a);N=ink(n);D=ink(d);return [Math.round(N.top-A.bot),Math.round(D.top-N.bot)];
  }, 34);
  const qa = await p.evaluate(()=>{const card=document.querySelector('.card').getBoundingClientRect();const out=[];
   for(const el of document.querySelectorAll('.main *, .date *')){const r=el.getBoundingClientRect();if(r.right>card.right-30||r.bottom>card.bottom-30)out.push(el.className||el.tagName)}
   const btn=document.querySelector('.btn').getBoundingClientRect();const h1=document.querySelector('h1');
   return {overflow:out,cardBottom:card.bottom,btn:[Math.round(btn.top),Math.round(btn.bottom)],h1fits:h1.scrollWidth<=h1.clientWidth,mainBottom:Math.round(document.querySelector('.theme').getBoundingClientRect().bottom)}});
  console.log(name, 'gaps', gaps, JSON.stringify(qa));
  await p.screenshot({path:`${OUT}/sleigh-the-season-${name}.png`});
 }
 await b.close();
})();

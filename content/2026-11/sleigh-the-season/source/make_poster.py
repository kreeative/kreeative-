import sys
A = '/home/user/kreeative-/aissakee'
def page(w, h, story):
    # ribbon positions
    vx = 900          # vertical ribbon x
    hy = 140 if not story else 230          # horizontal ribbon y
    title = 196 if not story else 228
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Fraunces;font-weight:300 400;src:url(file://{A}/fonts/fraunces-300-400-latin.woff2)}}
@font-face{{font-family:Fraunces;font-style:italic;font-weight:300 400;src:url(file://{A}/fonts/fraunces-italic-300-400-latin.woff2)}}
@font-face{{font-family:Poppins;font-weight:500;src:url(file://{A}/fonts/poppins-500-latin.woff2)}}
@font-face{{font-family:Poppins;font-weight:600;src:url(file://{A}/fonts/poppins-600-latin.woff2)}}
@font-face{{font-family:Script;src:url(file://{A}/fonts/mrs-saint-delafield-400-latin.woff2)}}
*{{margin:0;box-sizing:border-box}}
html,body{{width:{w}px;height:{h}px;overflow:hidden}}
.p{{position:relative;width:{w}px;height:{h}px;overflow:hidden;color:#fbf1e4;
  background:radial-gradient(120% 80% at 30% 20%, #8a1424 0%, #5c0c18 55%, #3a0610 100%)}}
.p::after{{content:"";position:absolute;inset:0;background:url(file://{A}/img/paper-grain-900.webp) 0 0/600px auto;mix-blend-mode:overlay;opacity:.9;pointer-events:none}}
.rib{{position:absolute;background:linear-gradient(90deg,#b98a4a,#f2d9a2 35%,#fff1cf 50%,#e8c27e 65%,#a77a3c);box-shadow:0 0 0 1px rgba(60,10,15,.25),0 10px 30px rgba(0,0,0,.25)}}
.rv{{left:{vx}px;top:0;width:64px;height:100%}}
.rh{{left:0;top:{hy}px;width:100%;height:64px;background:linear-gradient(180deg,#b98a4a,#f2d9a2 35%,#fff1cf 50%,#e8c27e 65%,#a77a3c)}}
.bow{{position:absolute;left:{vx+32-190}px;top:{hy+32-150}px;width:380px;height:300px;filter:drop-shadow(0 14px 18px rgba(0,0,0,.35))}}
.txt{{position:absolute;left:96px;width:{900-96-56}px;top:{hy+190}px}}
.k{{font:600 26px/1 Poppins;letter-spacing:.32em;text-transform:uppercase;color:#f2d9a2}}
h1{{font:300 {title}px/.86 Fraunces;letter-spacing:-.05em;margin-top:30px}}
h1 em{{font-style:italic;font-weight:300;color:#f6c9cf;display:block;margin-left:110px}}
.theme{{font:400 {104 if not story else 118}px/1 Script;color:#f2d9a2;margin:{26 if not story else 40}px 0 0 6px;transform:rotate(-4deg);transform-origin:left}}
.row{{display:grid;gap:22px;margin-top:{50 if not story else 80}px;padding-top:30px;border-top:2px solid rgba(242,217,162,.55)}}
.date b{{display:block;font:300 74px/1 Fraunces;letter-spacing:-.03em}}
.date span{{display:block;font:500 26px/1.3 Poppins;color:#f1d7c9;margin-top:12px}}
.tba{{font:500 26px/1.4 Poppins;color:#f1d7c9}}
.tba i{{font:italic 300 38px/1.1 Fraunces;color:#fbf1e4;display:block}}
</style></head><body><div class="p">
<div class="rib rv"></div><div class="rib rh"></div>
<svg class="bow" viewBox="0 0 380 300" aria-hidden="true">
 <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1cf"/><stop offset=".45" stop-color="#e8c27e"/><stop offset="1" stop-color="#a77a3c"/></linearGradient>
 <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1cf"/><stop offset=".45" stop-color="#e8c27e"/><stop offset="1" stop-color="#a77a3c"/></linearGradient></defs>
 <path d="M175 165 C150 230 130 270 105 298 L140 290 L150 300 C170 262 182 220 188 170 Z" fill="url(#g)"/>
 <path d="M205 165 C230 230 250 270 275 298 L240 290 L230 300 C210 262 198 220 192 170 Z" fill="url(#g2)"/>
 <path d="M190 150 C150 70 40 40 30 110 C22 165 120 175 190 152 Z" fill="url(#g)" stroke="#9c6f34" stroke-width="2"/>
 <path d="M190 150 C230 70 340 40 350 110 C358 165 260 175 190 152 Z" fill="url(#g2)" stroke="#9c6f34" stroke-width="2"/>
 <path d="M70 105 C100 95 140 115 175 145" fill="none" stroke="#a77a3c" stroke-width="3" opacity=".6"/>
 <path d="M310 105 C280 95 240 115 205 145" fill="none" stroke="#a77a3c" stroke-width="3" opacity=".6"/>
 <ellipse cx="190" cy="152" rx="30" ry="26" fill="url(#g)" stroke="#9c6f34" stroke-width="2"/>
</svg>
<div class="txt">
 <p class="k">Save the date</p>
 <h1>Sleigh <em>the Season</em></h1>
 <p class="theme">The Gift of Giving</p>
 <div class="row"><div class="date"><b>Thursday, Dec 3</b><span>End-of-year event</span></div>
 <div class="tba"><i>Location &amp; time to be announced</i></div></div>
</div></div></body></html>"""
open('post.html', 'w').write(page(1080, 1350, False))
open('story.html', 'w').write(page(1080, 1920, True))

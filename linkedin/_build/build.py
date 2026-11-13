#!/usr/bin/env python3
"""Builds every LinkedIn design: writes source.html and copy.md for each post,
and _build/jobs.json for the renderer.

    python3 linkedin/_build/build.py          # from the repo root
    node linkedin/_build/render-all.mjs       # renders PNG / PDF and the contact sheet

Slide text, alt text and placeholders live in this file. Captions come from CALENDAR.md.
All visual styling lives in _shared/kee.css.
"""
import json, os, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.dirname(HERE)
CAL = open(os.path.join(L, 'CALENDAR.md'), encoding='utf-8').read()
JOBS = []


# ----------------------------------------------------------------- helpers
def ph(t):
    return f'<span class="ph">[{t}]</span>'


def phbox(label, hint=''):
    h = f'<small>{hint}</small>' if hint else ''
    return f'<div class="phbox">[{label}]{h}</div>'


def strip(s):
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()


def caption(pid):
    m = re.search(r'### ' + re.escape(pid) + r' .*?```\n(.*?)```', CAL, re.S)
    return m.group(1).strip() if m else ''


class Doc:
    """One post. depth = folder levels below linkedin/ (1 for posts, 2 for profile)."""

    def __init__(self, pid, slug, kind, date, label, depth=1, w=1080, h=1350, lang='en'):
        self.pid, self.slug, self.kind, self.date, self.label = pid, slug, kind, date, label
        self.depth, self.w, self.h, self.lang = depth, w, h, lang
        up = '../' * depth
        self.A = up + '../assets/'       # repo assets
        self.S = up + '_shared/'          # shared css, fonts, logos
        self.pages = []                   # (html, text_dict)

    # --- frame
    def _frame(self, inner, theme='light'):
        n = len(self.pages) + 1
        return n, theme, inner

    def add(self, inner, theme, text):
        self.pages.append((inner, theme, text))

    def render_pages(self):
        total = len(self.pages)
        out = []
        for i, (inner, theme, _) in enumerate(self.pages, 1):
            right = f'{i:02d} / {total:02d}' if total > 1 else 'kreeative.xyz'
            cls = {'light': '', 'dark': ' dark', 'pink': ' pinkbg'}[theme]
            out.append(f'''<section class="page{cls}">
  <div class="vl"></div><div class="ht"></div><div class="hb"></div>
  <img class="mark" src="{self.A}img/logo-512.webp" alt="">
  <div class="sig">Kee · Kreeative</div>
{inner}
  <div class="foot"><span>{self.label}</span><span>{right}</span></div>
</section>''')
        return '\n'.join(out)

    # --- page types
    def hook(self, kicker, title, sub='', visual='', alt='', theme='dark'):
        v = f'<div class="visual">{visual}</div>' if visual else ''
        s = f'<p class="lead">{sub}</p>' if sub else ''
        cls = 'area hook withvisual' if visual else 'area hook'
        sw = '<p class="swipe">Swipe →</p>' if self.kind == 'CAROUSEL' else ''
        inner = f'''  <div class="{cls}">
    {v}
    <div style="display:flex;flex-direction:column;gap:30px">
      <p class="kicker">{kicker}</p>
      <h1 class="t-hook">{title}</h1>
      {s}
      {sw}
    </div>
  </div>'''
        self.add(inner, theme, dict(kicker=kicker, title=title, body=sub, alt=alt))

    def slide(self, kicker, title, body='', visual='', alt='', theme='light', size='t-1', extra=''):
        if isinstance(body, list):
            b = '<ul class="list">' + ''.join(f'<li>{x}</li>' for x in body) + '</ul>'
            btxt = ' / '.join(body)
        elif body:
            b = f'<p class="body">{body}</p>'
            btxt = body
        else:
            b, btxt = '', ''
        v = f'<div class="visual">{visual}</div>' if visual else ''
        inner = f'''  <div class="area">
    <p class="kicker">{kicker}</p>
    <h2 class="{size}">{title}</h2>
    {b}
    {extra}
    {v}
  </div>'''
        self.add(inner, theme, dict(kicker=kicker, title=title, body=btxt, alt=alt))

    def raw(self, inner, theme, text):
        self.add(inner, theme, text)

    def cta(self):
        inner = f'''  <div class="area cta">
    <img class="cta-mark" src="{self.A}img/logo-512.webp" alt="">
    <h2 class="t-1">Follow Kee for design, tech and <em>building in public.</em></h2>
    <p class="save">Save this <span>↓</span></p>
    <p class="url">kreeative.xyz</p>
  </div>'''
        self.add(inner, 'dark', dict(kicker='', title='Follow Kee for design, tech and building in public.', body='Save this. kreeative.xyz',
                                     alt='Closing page on deep brown: the Kreeative K mark, “Follow Kee for design, tech and building in public”, a pink “Save this” button and kreeative.xyz.'))

    # --- output
    def folder(self):
        if self.depth == 2:
            return os.path.join(L, 'profile', f'{self.pid}_{self.slug}')
        return os.path.join(L, f'{self.pid}_{self.slug}')

    def write(self, placeholders=None, caption_override=None, notes=''):
        d = self.folder()
        os.makedirs(d, exist_ok=True)
        page_css = f'@page {{ size: {self.w}px {self.h}px; margin: 0; }}'
        if (self.w, self.h) != (1080, 1350):
            page_css += f' .page {{ width: {self.w}px; height: {self.h}px; }}'
        doc = f'''<!doctype html>
<html lang="{self.lang}">
<head>
<meta charset="utf-8">
<title>{self.pid} · {strip(self.pages[0][2]['title'])}</title>
<link rel="stylesheet" href="{self.S}kee.css">
<style>{page_css}</style>
</head>
<body>
{self.render_pages()}
<script>
  // Scale each visual down to the space left under the text, so nothing runs into the footer.
  document.fonts.ready.then(() => document.querySelectorAll('.visual').forEach(v => {{
    const c = v.firstElementChild; if (!c) return;
    const s = Math.min(1, v.clientHeight / c.offsetHeight, v.clientWidth / c.offsetWidth);
    if (s < 1) c.style.transform = 'scale(' + s.toFixed(3) + ')';
  }}));
</script>
</body>
</html>
'''
        open(os.path.join(d, 'source.html'), 'w', encoding='utf-8').write(doc)
        ext = 'pdf' if self.kind == 'CAROUSEL' else 'png'
        out = os.path.join(d, f'{self.pid}_{self.slug}.{ext}')
        JOBS.append(dict(id=self.pid, src=os.path.relpath(os.path.join(d, 'source.html'), L), out=os.path.relpath(out, L), w=self.w, h=self.h, kind=ext, pages=len(self.pages)))
        # copy.md
        cap = caption_override if caption_override is not None else caption(self.pid)
        lines = [f'# {self.pid} · {strip(self.pages[0][2]["title"])}', '',
                 f'- Format: {self.kind}, {len(self.pages)} page{"s" if len(self.pages) > 1 else ""}, {self.w} × {self.h}, {ext.upper()}',
                 f'- Posting date: {self.date}', f'- File: `{os.path.basename(out)}`', '']
        if notes:
            lines += [notes, '']
        lines += ['## Slide text', '']
        for i, (_, _, t) in enumerate(self.pages, 1):
            lines.append(f'### Page {i}' if len(self.pages) > 1 else '### Image')
            if t.get('kicker'): lines.append(f'- Kicker: {strip(t["kicker"])}')
            if t.get('title'): lines.append(f'- Headline: {strip(t["title"])}')
            if t.get('body'): lines.append(f'- Body: {strip(t["body"])}')
            lines.append('')
        if cap:
            lines += ['## Caption', '', '```text', cap, '```', '']
        lines += ['## Alt text', '']
        for i, (_, _, t) in enumerate(self.pages, 1):
            pre = f'Page {i}: ' if len(self.pages) > 1 else ''
            lines.append(f'- {pre}{t.get("alt") or strip(t["title"])}')
        lines.append('')
        found = []
        alltext = cap + ' ' + ' '.join(strip(p[0]) for p in self.pages)
        for m in re.findall(r'\[([A-Z][A-Z0-9_]+)\]', alltext):
            if m not in found: found.append(m)
        if found:
            lines += ['## Placeholders to fill', '']
            desc = placeholders or {}
            for f in found:
                lines.append(f'- `[{f}]`' + (f': {desc[f]}' if f in desc else ''))
            lines.append('')
        open(os.path.join(d, 'copy.md'), 'w', encoding='utf-8').write('\n'.join(lines))


# ----------------------------------------------------------------- mock UI pieces
def phone(inner, w=300, h=620, cap='', capsub=''):
    c = f'<p class="phone-cap"><strong>{cap}</strong>{capsub}</p>' if cap else ''
    chrome = '<div class="sbar"><span>9:41</span><span class="sbi"><i></i><i></i><i></i><b></b></span></div><i class="island"></i><i class="homebar"></i>'
    return f'<div class="stack"><div class="phone" style="width:{w}px;height:{h}px"><div class="scr">{inner}</div>{chrome}</div>{c}</div>'


def shot(src, w, cap='', capsub='', bg='#fff'):
    """A real app screen (captured at 390 × 844) in the phone, under a status-bar band."""
    sh = round((w - 18) * 844 / 390)
    inner = f'<div style="height:100%;background:{bg};padding-top:50px"><img src="{src}" alt="" style="width:100%;display:block"></div>'
    return phone(inner, w, sh + 68, cap, capsub)


def storefront(S, w=400, cap='', capsub=''):
    """The real Chez Awa storefront from the JEERE home page (payment toast hidden)."""
    c = f'<p class="phone-cap"><strong>{cap}</strong>{capsub}</p>' if cap else ''
    return (f'<div class="stack"><div style="width:{w}px;background:#141110;border-radius:44px;padding:20px 18px 16px;'
            f'box-shadow:0 46px 84px -36px rgba(50,28,20,.55)"><img src="{S}img/jeere/storefront.webp" alt="" '
            f'style="width:100%;display:block;border-radius:30px"></div>{c}</div>')


def jr_wire_produits():
    row = ('<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #e4e4e4"><div class="wf-b" style="width:52px;height:52px;flex:none"></div>'
           '<div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="wf-l" style="width:75%"></div><div class="wf-l" style="width:40%"></div><div class="wf-l" style="width:30%;height:10px"></div></div></div>')
    nav = '<div style="margin-top:auto;display:flex;justify-content:space-around;padding-top:10px;border-top:1px solid #e4e4e4">' + '<div class="wf-b" style="width:26px;height:26px;border-radius:8px"></div>' * 5 + '</div>'
    return f'''<div class="scr wf" style="height:100%;gap:10px">
  <div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;gap:8px;align-items:center"><div class="wf-b" style="width:30px;height:30px"></div><div class="wf-l" style="width:90px"></div></div><div class="wf-b" style="width:30px;height:30px;border-radius:50%"></div></div>
  <div class="wf-l" style="width:45%;height:22px;margin-top:8px"></div><div class="wf-l" style="width:55%;height:10px"></div>
  <div class="wf-x" style="height:40px;width:70%">+ ajouter un produit</div>
  <div class="wf-b" style="height:38px;border-radius:19px"></div>
  <div style="display:flex;gap:8px"><div class="wf-b" style="width:110px;height:28px;border-radius:14px"></div><div class="wf-b" style="width:110px;height:28px;border-radius:14px"></div></div>
  {row * 4}{nav}</div>'''


RF_BG = '#fff5f7'


def rf_checkin():
    return '''<div class="scr rf" style="height:100%">
  <div class="rf-top"><span class="rf-logo">R&amp;F</span><span class="rf-pill">Today</span></div>
  <div class="rf-h">Today’s check-in</div>
  <div class="rf-sub">One window for the whole group</div>
  <div class="rf-goal"><b>Read 20 pages</b><div class="rf-chips"><span class="rf-chip on">Done</span><span class="rf-chip">Partly</span><span class="rf-chip">Not today</span></div></div>
  <div class="rf-goal"><b>Gym, 3× a week</b><div class="rf-chips"><span class="rf-chip">0</span><span class="rf-chip">1</span><span class="rf-chip on">2</span><span class="rf-chip">3</span></div></div>
  <div class="rf-swipe">Swipe to check in →</div>
</div>'''


def rf_board():
    rows = [('Y', 'You', 'in', 'Checked in'), ('A', 'Ama', 'in', 'Checked in'), ('M', 'Malik', 'in', 'Checked in'), ('S', 'Sara', 'wait', 'Not yet')]
    r = ''.join(f'<div class="rf-member"><span class="rf-av">{a}</span>{n}<span class="rf-state {c}">{s}</span></div>' for a, n, c, s in rows)
    return f'''<div class="scr rf" style="height:100%">
  <div class="rf-top"><span class="rf-logo">R&amp;F</span><span class="rf-pill">Group</span></div>
  <div class="rf-h">3 of 4 checked in</div>
  <div class="rf-sub">Who is in, not what they said</div>
  {r}
  <div class="rf-seal">Answers open when the window closes.</div>
</div>'''


def rf_history():
    sq = ['', '', 'miss', '', '', '', 'away', '', '', '', 'miss', '', '', '']
    s = ''.join(f'<i class="rf-sq {c}"></i>' for c in sq)
    return f'''<div class="scr rf" style="height:100%">
  <div class="rf-top"><span class="rf-logo">R&amp;F</span><span class="rf-pill">History</span></div>
  <div class="rf-h">A rate, not a streak</div>
  <div class="rf-rate">11<small> of the last 14</small></div>
  <div class="rf-strip">{s}</div>
  <div class="rf-legend"><span><i style="background:#FF007A"></i>Done</span><span><i style="border:3px solid #FF007A"></i>Missed</span><span><i style="background:repeating-linear-gradient(45deg,#ffb3d1 0 3px,#fff 3px 6px)"></i>Away</span></div>
  <div class="rf-seal" style="margin-top:auto">Nothing here resets to zero. A bad week costs a few points.</div>
</div>'''


JR_PRODUCTS = [('Corbeille tressée', '7 000 F', '#e9c9a0'), ('Bracelets perles', '4 500 F', '#cfd9c8'),
               ('Pochette Korhogo', '15 000 F', '#efd0b8'), ('Bol terre cuite', '6 500 F', '#e3c0aa')]


def jr_store(S, edit=True, cta='Commander'):
    e = '<div class="jr-edit">Couleurs de la boutique<span class="jr-dots"><i style="background:#E8467C"></i><i style="background:#F0C414"></i><i style="background:#22C97E"></i><i style="background:#1E9BE0"></i><i style="background:#6A4CFF"></i></span></div>' if edit else ''
    g = ''.join(f'<div class="jr-p"><div class="jr-img" style="background:{c}"><i></i></div><b>{n}</b><span>{p}</span></div>' for n, p, c in JR_PRODUCTS)
    return f'''<div class="scr jr" style="height:100%">
  <div class="jr-bar"><img src="{S}jeere-logo-rainbow.svg" alt=""><div><div class="jr-shop">Chez Awa</div><div class="jr-url">chezawa.jeere.shop</div></div></div>
  {e}
  <div class="jr-chips"><span class="jr-chip on">Tout</span><span class="jr-chip">Bijoux</span><span class="jr-chip">Vannerie</span><span class="jr-chip">Pagne</span></div>
  <div class="jr-grid">{g}</div>
  <div class="jr-cta">{cta}</div>
</div>'''


def jr_wire():
    cell = '<div style="display:flex;flex-direction:column;gap:6px"><div class="wf-b" style="aspect-ratio:1"></div><div class="wf-l" style="width:80%"></div><div class="wf-l" style="width:45%"></div></div>'
    return f'''<div class="scr wf" style="height:100%">
  <div style="display:flex;gap:10px;align-items:center"><div class="wf-b" style="width:40px;height:30px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="wf-l" style="width:60%"></div><div class="wf-l" style="width:40%;height:10px"></div></div></div>
  <div class="wf-x" style="height:44px">barre d’édition</div>
  <div style="display:flex;gap:6px"><div class="wf-b" style="width:52px;height:26px;border-radius:13px"></div><div class="wf-b" style="width:64px;height:26px;border-radius:13px"></div><div class="wf-b" style="width:72px;height:26px;border-radius:13px"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">{cell * 4}</div>
  <div class="wf-x" style="margin-top:auto;height:48px;border-radius:24px">bouton principal</div>
</div>'''


def chat():
    return '''<div class="scr chat" style="height:100%">
  <div class="chat-h"><i></i>Cliente · Cocody</div>
  <div class="chat-b">
    <div class="bub">Bonsoir, la corbeille tressée c’est combien ?<small>20:41</small></div>
    <div class="bub me"><div class="img"></div>7 000 F. Il reste deux.<small>21:03</small></div>
    <div class="bub">Vous avez en plus grand ?<small>21:05</small></div>
    <div class="bub me">Je regarde et je reviens vers vous.<small>21:30</small></div>
    <div class="bub">Et la livraison à Cocody ?<small>22:12</small></div>
    <div class="bub">Allô ??<small>23:40</small></div>
  </div>
</div>'''


def biz(content, sticky=False, menu='Accueil · Services · Tarifs · Contact · Réserver', ring=None):
    st = '<div class="biz-sticky">Réserver un rendez-vous</div>' if sticky else ''
    return f'''<div class="scr biz" style="height:100%">
  <div class="biz-nav"><span class="biz-logo">Atelier Coco</span><span class="cap" style="font-size:12px;letter-spacing:.1em">Concept</span></div>
  {content}
  {st}
</div>'''


def biz_hero(btn=True, ring=False, info=True, ring_info=False):
    b = f'<span class="biz-btn{" ring" if ring else ""}">Réserver un rendez-vous</span>' if btn else ''
    i = f'''<div class="biz-info{" ring" if ring_info else ""}"><div><b>Ouvert aujourd’hui</b>9 h à 18 h</div><div><b>Plateau</b>Voir l’itinéraire</div></div>''' if info else ''
    return f'''<div class="biz-hero"><h4>Tresses, soins et coupes, sans attente.</h4><p>Salon de coiffure · Concept</p>{b}</div>{i}'''


# ----------------------------------------------------------------- shared texts
PH_MERCH = 'number of merchants you talked to'

# =================================================================== PROFILE COVERS (1200 × 627)
def cover(pid, slug, kicker, title, sub, right_html, alt, theme='light', extra_css=''):
    d = Doc(pid, slug, 'COVER', 'Profile, featured section', 'Featured', depth=2, w=1200, h=627)
    cls = {'light': '', 'dark': ' dark'}[theme]
    inner = f'''<section class="page{cls}" style="width:1200px;height:627px">
  <img class="mark" src="{d.A}img/logo-512.webp" alt="" style="left:44px;top:40px">
  <div style="position:absolute;left:44px;top:120px;width:560px;display:flex;flex-direction:column;gap:22px">
    <p class="kicker" style="font-size:24px">{kicker}</p>
    <h1 class="t-2" style="font-size:68px">{title}</h1>
    <p class="body" style="font-size:30px">{sub}</p>
  </div>
  <div class="sig" style="left:44px;right:auto;top:auto;bottom:40px">kreeative.xyz</div>
  <div style="position:absolute;right:44px;top:44px;bottom:44px;width:520px;display:flex;align-items:center;justify-content:center">{right_html}</div>
</section>'''
    d.pages = []
    d.add(inner, theme, dict(kicker=kicker, title=title, body=sub, alt=alt))
    d.render_pages = lambda: d.pages[0][0]
    d.write(caption_override='')


def build_profile():
    A = '../../../assets/'
    cover('P-02', 'cover-portfolio-2026', 'Portfolio · 2026', 'Product &amp; brand design, <em>2026.</em>',
          'Case studies from the problem to the shipped product.',
          f'''<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:14px;width:100%;height:100%">
            <img class="photo" style="grid-row:span 2" src="{A}img/case-lyzma-1-1000.webp" alt="">
            <img class="photo" src="{A}img/project-bakery-1000.webp" alt="">
            <img class="photo" src="{A}img/project-glorywalk-1000.webp" alt=""></div>''',
          'Featured cover on ivory: “Product & brand design, 2026”, beside three project images: Lyzma Industries shopping bags, The Bakery wordmark on cookies, the GloryWalk wordmark on a denim pocket.')
    cover('P-03', 'cover-kreeative', 'Studio', 'Kreeative: design and build, <em>end to end.</em>',
          'Brands, websites and web apps, designed and coded by Kee.',
          f'<div class="card" style="width:100%;padding:12px;border-radius:22px"><img src="../../_shared/img/portfolio-v2-desktop.png" alt="" style="width:100%;border-radius:12px;display:block"></div>',
          'Featured cover on ivory: “Kreeative: design and build, end to end”, beside a screenshot of the kreeative.xyz home page in a white card.')
    # JEERE in its own look
    d = Doc('P-04', 'cover-jeere', 'COVER', 'Profile, featured section', 'Featured', depth=2, w=1200, h=627, lang='fr')
    inner = f'''<section class="page" style="width:1200px;height:627px;background:#fff;color:#111;font-family:Poppins,sans-serif">
  <div style="position:absolute;left:56px;top:56px;display:flex;align-items:center;gap:16px"><img src="{d.S}jeere-logo-rainbow.svg" alt="" style="width:84px"><img src="{d.S}jeere-wordmark.svg" alt="" style="height:52px"></div>
  <div style="position:absolute;left:56px;top:200px;width:600px;display:flex;flex-direction:column;gap:20px">
    <h1 style="font-weight:600;font-size:62px;line-height:1.05;letter-spacing:-.035em">Tout votre commerce, <span class="jr-rainbow-text">au même endroit.</span></h1>
    <p style="font-size:28px;line-height:1.4;color:#2A2A2A">La boutique en ligne des commerçants africains, à créer depuis son téléphone.</p>
  </div>
  <div class="jr-rainbow-bar" style="position:absolute;left:56px;bottom:92px;width:420px"></div>
  <div style="position:absolute;left:56px;bottom:44px;font:400 22px/1 'DM Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#5E5E5E">jeere.kreeative.xyz · En construction</div>
  <div style="position:absolute;right:60px;top:60px">{storefront(d.S, 400)}</div>
</section>'''
    d.add(inner, 'light', dict(kicker='JEERE', title='Tout votre commerce, au même endroit.', body='La boutique en ligne des commerçants africains, à créer depuis son téléphone.',
                               alt='Featured cover in the JEERE look, white with black Poppins type: the hand-drawn cloud logo in the rainbow beside the hand-lettered Jeere wordmark, “Tout votre commerce, au même endroit.” with the last words in the JEERE rainbow, a thin rainbow bar, and the real Chez Awa storefront from the JEERE prototype: a woven basket, bead bracelets and a printed pouch with their prices.'))
    d.render_pages = lambda: d.pages[0][0]
    d.write(caption_override='')
    cover('P-05', 'cover-lyzma', 'Case study · Brand identity', 'Lyzma Industries: a hand-lettered <em>identity.</em>',
          'Six decisions behind a jewellery brand made by hand.',
          f'<img class="photo" src="{A}img/case-lyzma-1-1000.webp" alt="">',
          'Featured cover on ivory: “Lyzma Industries: a hand-lettered identity”, beside the gold, white and navy Lyzma shopping bags with tags reading Hi and Bonjour.')


# =================================================================== MONTH 1
def m1_02():
    d = Doc('M1-02', 'lyzma-carousel', 'CAROUSEL', 'Wed Nov 18', 'Brand identity · Lyzma Industries')
    A = d.A
    d.hook('Brand identity · Lyzma Industries', 'A hand-lettered identity for a jewellery brand: <em>6 decisions</em> behind it.',
           visual=f'<div class="card" style="width:100%;height:100%;overflow:hidden"><img class="photo" src="{A}img/project-lyzma-1000.webp" alt="" style="object-fit:contain;background:#f6f6f6"></div>',
           alt='Deep brown cover: the gold hand-lettered Lyzma Industries logo with its concentric-circle mark on a white card, above the title “A hand-lettered identity for a jewellery brand: 6 decisions behind it.”')
    d.slide('01 · The brief', 'Handcrafted luxury, without losing <em>the hand.</em>',
            'Lyzma Industries makes handcrafted, African-inspired jewellery. Too polished and it loses its soul. Too raw and it loses its premium feel. The identity had to live in the middle.',
            visual='<div class="card" style="padding:44px 48px;width:100%"><p class="cap">The brief, in one sentence</p><p class="t-3" style="margin-top:18px">Refined enough for high-end jewellery, warm enough to honour the craft behind every piece.</p></div>',
            alt='Ivory slide: decision 1, the brief, with a white card quoting it in one sentence.')
    d.slide('02 · Lettering', 'Lettered, not <em>typed.</em>', 'The jewellery is made by hand, so the name is too. A signature, not a font.',
            visual=f'<div class="card" style="width:100%;height:100%;overflow:hidden"><img class="photo" src="{A}img/project-lyzma-1000.webp" alt="" style="object-fit:cover;object-position:58% 52%;transform:scale(1.3);background:#f6f6f6"></div>',
            alt='Ivory slide: decision 2, “Lettered, not typed”, with a close crop of the hand-lettered Lyzma wordmark.')
    d.slide('03 · The mark', 'Circles from textile and <em>beadwork.</em>', 'Concentric circles inspired by African craft traditions. Rooted in culture, without being literal.',
            visual=f'<div class="card" style="width:100%;height:100%;overflow:hidden"><img class="photo" src="{A}img/project-lyzma-1000.webp" alt="" style="object-fit:cover;object-position:28% 50%;transform:scale(1.5);background:#f6f6f6"></div>',
            alt='Ivory slide: decision 3, the mark, with a close crop of the gold concentric circles.')
    sw = lambda c, n, h: f'<div style="display:flex;flex-direction:column;gap:14px;flex:1"><div style="height:340px;border-radius:28px;background:{c};box-shadow:inset 0 0 0 2px rgba(50,28,20,.1)"></div><p class="body" style="font-size:32px"><strong>{n}</strong><br>{h}</p></div>'
    d.slide('04 · Colour', 'One colour: warm <em>gold.</em>', 'Gold on white lets the jewellery speak in photos, and it is easy to reproduce on tags and bags.',
            visual=f'<div style="display:flex;gap:28px;width:100%">{sw("#ebb64c", "Lyzma gold", "#EBB64C")}{sw("#ffffff", "White", "#FFFFFF")}</div>',
            alt='Ivory slide: decision 4, colour, with two large swatches: Lyzma gold #EBB64C and white.')
    d.slide('05 · Type', 'A script, and a quiet <em>partner.</em>', 'The lettered wordmark carries the voice. Everything around it stays quiet, so it never competes.',
            visual=f'<div class="card" style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:20px;padding:44px"><p class="cap">Wordmark · hand-lettered</p><img src="{A}img/project-lyzma-1000.webp" alt="" style="width:100%;height:230px;object-fit:cover;object-position:60% 52%;mix-blend-mode:multiply"></div>',
            alt='Ivory slide: decision 5, type, with a card showing the real hand-lettered Lyzma wordmark.')
    d.slide('06 · Applications', 'Where it <em>lives.</em>', 'Shopping bags, tags, stickers that say Hi and Bonjour, and the feed.',
            visual=f'<img class="photo" src="{A}img/case-lyzma-1-1000.webp" alt="">',
            alt='Ivory slide: decision 6, applications, with the Lyzma shopping bags in gold, white and navy, tags and round stickers reading Hi and Bonjour.')
    d.cta()
    d.write()


def m1_04():
    d = Doc('M1-04', 'bakery-before-after', 'IMAGE', 'Tue Nov 24', 'Logo · The Bakery')
    A = d.A
    vis = f'''<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%;height:100%">
      <div style="display:flex;flex-direction:column;gap:16px"><p class="cap">The wordmark</p><img class="photo" src="{A}img/project-bakery-1000.webp" alt="" style="object-position:40% 50%"></div>
      <div style="display:flex;flex-direction:column;gap:16px"><p class="cap">On the packaging</p><img class="photo" src="{A}img/case-bakery-2-1000.webp" alt=""></div></div>'''
    d.slide('Logo · The Bakery', 'The Bakery wordmark: <em>two details</em> that carry it.', 'A baguette for the B, a cupcake for the e.',
            visual=vis, size='t-2',
            alt='Two images on ivory. Left: The Bakery wordmark in cream and pink on a pile of chocolate chip cookies, with a baguette for the B and a cupcake in the e. Right: the identity on a row of pink pastry boxes.')
    cap = '''The Bakery wordmark, and the two details that carry it.

A baguette for the B. A cupcake for the e.
One rule I keep from this project: a good mark survives being shrunk to a sticker.

The identity became packaging, a pattern, and later a website and an ordering app.
Case study in the first comment.

#logodesign #branding #packaging #brandidentity'''
    d.write(caption_override=cap)
    return cap


def m1_06():
    d = Doc('M1-06', 'design-process', 'CAROUSEL', 'Thu Nov 26', 'My design process')
    A = d.A
    d.hook('Process · 6 steps', 'My design process in <em>6 steps,</em> from brief to launch.', 'With a real project behind each one.',
           alt='Deep brown cover: “My design process in 6 steps, from brief to launch. With a real project behind each one.”')
    d.slide('01 · Brief', 'One sentence the client <em>agrees with.</em>', 'Before I open anything. For Lyzma Industries: handcrafted luxury that keeps the feeling of the hand.',
            visual='<div class="card" style="padding:48px;width:100%"><p class="cap">Lyzma Industries · brief</p><p class="t-3" style="margin-top:18px">“Refined enough for high-end jewellery, warm enough to honour the craft.”</p></div>',
            alt='Step 1, brief: a white card with the one-sentence Lyzma Industries brief.')
    lens = [('10 in', 'Nape', 22), ('16 in', 'Armpit', 40), ('22 in', 'Mid-back', 58), ('30 in', 'Hip', 80)]
    bars = ''.join(f'<div style="display:flex;align-items:center;gap:24px"><span class="body" style="width:130px;font-size:32px"><strong>{a}</strong></span><div style="height:28px;width:{w}%;border-radius:14px;background:var(--baby)"></div><span class="body" style="font-size:32px">{b}</span></div>' for a, b, w in lens)
    d.slide('02 · Research', 'Learn the question customers <em>already ask.</em>', 'For The Ivory Sukundu it was always the same: where does this length land? The answer became the length guide.',
            visual=f'<div class="card" style="padding:44px;width:100%;display:flex;flex-direction:column;gap:24px">{bars}</div>',
            alt='Step 2, research: a simple length guide with four hair lengths and where each lands on the body: 10 inches nape, 16 armpit, 22 mid-back, 30 hip.')
    d.slide('03 · Moodboard', 'The <em>feeling,</em> before the screens.', 'For The Bakery: what does it feel like to bite into something you have craved all day? Hot pink and cream came from there.',
            visual=f'''<div style="display:grid;grid-template-columns:1.2fr 1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:18px;width:100%;height:100%">
              <img class="photo" style="grid-row:span 2" src="{A}img/case-bakery-1-1000.webp" alt="">
              <img class="photo" src="{A}img/case-bakery-2-1000.webp" alt="">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px"><div style="border-radius:28px;background:#ef7aaf"></div><div style="border-radius:28px;background:#fefadc;box-shadow:inset 0 0 0 2px var(--line)"></div></div></div>''',
            alt='Step 3, moodboard: The Bakery pastry bag with a croissant, a row of pink pastry boxes, and two swatches, hot pink and cream.')
    pal = [('#0f0f0f', '#ff0090', 'Black'), ('#f3ece6', '#321c14', 'Cream'), ('#faf6f0', '#5a3626', 'Ivory'), ('#fdfbf7', '#4a2a1a', 'Chocolate'), ('#fdfbf7', '#321c14', 'Darkest brown ✓')]
    cards = ''.join(f'<div style="display:flex;flex-direction:column;gap:12px"><div style="height:150px;border-radius:22px;background:{bg};box-shadow:inset 0 0 0 2px var(--line);display:flex;align-items:center;padding:0 22px;font-family:Fraunces;font-size:44px;letter-spacing:-.04em;color:{fg}">Aa <span style="margin-left:auto;width:40px;height:40px;border-radius:50%;background:{"#ffb3d1" if i==4 else "#ff0090"}"></span></div><p class="cap">{n}</p></div>' for i, (bg, fg, n) in enumerate(pal))
    d.slide('04 · Concepts', 'Two or three directions. <em>Never one.</em>', 'This week my LinkedIn banner went through five palettes before the darkest brown, ivory and baby pink stuck.',
            visual=f'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;width:100%">{cards}</div>',
            alt='Step 4, concepts: five palette cards for the LinkedIn banner, black, cream, ivory, chocolate and the chosen darkest brown with baby pink.')
    d.slide('05 · Refine', 'The version that survives being <em>used.</em>', 'Rich &amp; Friends v1 went quiet after nine days. v2 was rebuilt against the reasons people quit: one question a day, and a group that sees it land.',
            visual=f'<div style="display:flex;gap:40px;align-items:flex-end">{shot(d.S + "img/rf/goals.webp", 290, "v2 · Goals", "", RF_BG)}{shot(d.S + "img/rf/board.webp", 290, "v2 · Board", "", RF_BG)}</div>',
            alt='Step 5, refine: two real Rich & Friends v2 screens on phones. Goals asks “Did you reach your goals today?” with a pink card and a Mark today button. Board shows how much each person in the group got done this week.')
    d.slide('06 · Launch', 'Live, measured, and <em>written down.</em>', 'Tabouret’s whole ordering flow works in the browser, and every decision lives in a file, so the next version starts from reasons.',
            visual=f'<div class="card" style="padding:14px;width:100%"><img src="{A}img/sites/site-tabouret-desktop-1440.webp" alt="" style="width:100%;border-radius:16px;display:block"></div>',
            alt='Step 6, launch: the live Tabouret ordering app on desktop, a menu with a dish beside it.')
    d.cta()
    d.write()


M1_07_FINDINGS = [
    ('They already sell on <em>WhatsApp.</em>', '61% of women-owned sellers on Jumia in Côte d’Ivoire, Kenya and Nigeria also sell on WhatsApp. Source: IFC, Women and E-commerce in Africa, 2021.',
     'Orders and stock in one place, wherever the order comes from.'),
    ('Social media is the <em>shop window.</em>', '67% of small businesses surveyed promote themselves on social media, and 45% sell online. Source: Africa MSME Pulse, 2023.',
     'A shop link made to be shared, in a bio and in a DM.'),
    ('A marketplace does not <em>replace</em> social.', 'Over 90% of Kenyan micro-businesses that used a marketplace also sold through social media. Source: Mastercard Foundation and Caribou Digital, 2020.',
     'One stock for every channel, so nothing sells twice.'),
    ('The phone is the <em>computer.</em>', '416 million people used mobile internet in Africa in 2024. Source: GSMA, The Mobile Economy Africa 2025.',
     'The whole shop is set up and run from a phone.'),
    ('Signal is not the barrier. <em>Use</em> is.', '58% of unconnected Africans already live under mobile broadband coverage. Source: GSMA, The Mobile Economy Africa 2025.',
     'Short steps, in French first, that tick themselves.'),
]


def m1_07():
    d = Doc('M1-07', 'jeere-build-log-1', 'CAROUSEL', 'Tue Dec 1', 'JEERE · Build log #1')
    d.hook('JEERE · Build log #1', 'I talked to 5 merchants, then read <em>the research.</em>',
           '5 things I learned, and what JEERE does about each.',
           visual=f'<img src="{d.S}jeere-logo-rainbow.svg" alt="" style="width:300px">',
           alt='Deep brown cover with the JEERE cloud logo in the rainbow: “I talked to 5 merchants, then read the research. 5 things I learned, and what JEERE does about each.”')
    for i, (t, b, c) in enumerate(M1_07_FINDINGS, 1):
        d.slide(f'Finding 0{i}', t, b,
                visual=f'<div class="card" style="width:100%;padding:44px;display:flex;flex-direction:column;gap:18px"><p class="cap">What JEERE does about it</p><p class="t-3">{c}</p></div>',
                alt=f'Ivory slide: finding {i} of 5, “{strip(t)}” {strip(b)} A white card on what JEERE does about it: {strip(c)}', size='t-2')
    d.cta()
    ph_desc = {}
    d.write(ph_desc)


def m1_09():
    d = Doc('M1-09', 'rich-and-friends-screens', 'IMAGE', 'Thu Dec 3', 'Product design · Rich & Friends')
    vis = f'''<div style="display:flex;gap:26px;align-items:flex-start;justify-content:center;width:100%">
      {shot(d.S + 'img/rf/goals.webp', 290, 'Goals', 'one question a day', RF_BG)}
      {shot(d.S + 'img/rf/home.webp', 290, 'Home', 'your day in one place', RF_BG)}
      {shot(d.S + 'img/rf/board.webp', 290, 'Board', 'the group, side by side', RF_BG)}</div>'''
    d.slide('Product design · Rich &amp; Friends', 'Designing a web app people want to <em>open every day.</em>', '',
            visual=vis, size='t-2',
            alt='Three real Rich & Friends screens on phones, in pink. Goals: “Did you reach your goals today?” with a goal card, “Shower twice a day”, and a Mark today button. Home: a week calendar, today’s classes and a recap where each goal is marked Did it, Got part of the way or Not recorded, and a water tracker. Board: how much each of five friends got done this week, with a progress bar each.')
    cap = '''Designing a web app people want to open every day. Three real screens from Rich & Friends.

Rich & Friends is a small-group accountability app.
You set the things you said you would do. Three or four friends see it land.

What the screens show:
→ Goals: one question a day, “Did you reach your goals today?”, answered in one tap
→ Home: your day in one place, the calendar, today’s recap and the small habits
→ Board: the group side by side, how much each person got done this week

The first version of this app went quiet after nine days. The second one was built against the exact reasons people quit.

Case study in the first comment.

#productdesign #UX #webapp #habits #buildinpublic'''
    d.write(caption_override=cap, notes='Screens captured from the app’s own App Store screenshot script (scripts/shoot-store.mjs in the Friends-App repo) with its demo data. The Budget and Course screens are left out on purpose.')


def m1_11():
    d = Doc('M1-11', 'ux-fixes-small-business', 'CAROUSEL', 'Wed Dec 9', '7 UX fixes · Small business')
    d.hook('UX · Small business websites', '7 UX fixes that get a small business more <em>bookings.</em>', 'No redesign needed. Each fix shown on an original concept site.',
           alt='Deep brown cover: “7 UX fixes that get a small business more bookings. No redesign needed.”')
    P = lambda inner, cap='': phone(inner, 330, 640)
    fixes = [
        ('One clear call to action, <em>repeated.</em>', 'One button, one verb, on every screen. Here it follows you down the page.',
         biz(biz_hero(ring=True), sticky=True), 'A concept salon site on a phone with one “Réserver un rendez-vous” button in the hero, ringed in pink, repeated as a sticky bar at the bottom.'),
        ('Hours and location <em>above the fold.</em>', 'The two things people check first, before they scroll.',
         biz(biz_hero(btn=True, ring_info=True)), 'The concept salon site with an info block for today’s hours and the neighbourhood, ringed in pink, right under the hero.'),
        ('Online booking, not <em>“call us”.</em>', 'Let people pick a time at 23:00, when they actually decide.',
         biz('<div class="biz-sec ring" style="margin-top:6px"><h5>Choisir un créneau · jeudi</h5><div class="biz-slots"><span>9:00</span><span>10:30</span><span class="on">12:00</span><span>14:00</span><span>15:30</span><span>17:00</span></div></div><div class="biz-sec"><h5>Service</h5><div class="biz-info" style="margin:0"><div><b>Tresses</b>2 h</div><div><b>Soin</b>45 min</div></div></div>', sticky=True),
         'The concept salon site showing a time-slot picker for Thursday with 12:00 selected, ringed in pink.'),
        ('Fast on a <em>phone.</em>', 'That is where your clients are. Compress images, self-host fonts, cut scripts you do not need.',
         biz(biz_hero() + '<div class="biz-sec ring"><h5>Avant de mettre en ligne</h5><div class="biz-review">✓ Images compressées<br>✓ Polices hébergées sur le site<br>✓ Un seul script<br>✓ Testé sur un vrai téléphone</div></div>'),
         'The concept salon site with a pink-ringed checklist: images compressed, fonts self-hosted, one script, tested on a real phone.'),
        ('Real photos, not <em>stock.</em>', 'Your space, your work, your team. People book the place they can picture.',
         biz('<div class="biz-sec"><div class="biz-photo ring">Vos vraies photos :<br>le salon, vos réalisations</div><div class="biz-info" style="margin:0"><div class="biz-photo" style="height:110px">Avant / après</div><div class="biz-photo" style="height:110px">L’équipe</div></div></div>', sticky=True),
         'The concept salon site with photo frames labelled for real photos of the salon, the work and the team.'),
        ('Reviews where people <em>decide.</em>', 'Next to the booking button, not on a page nobody opens.',
         biz(biz_hero(info=False) + f'<div class="biz-sec ring"><div class="biz-review"><span class="biz-stars">★★★★★</span><br><i>Un vrai avis de cliente ici, mot pour mot, avec son prénom.</i></div></div>'),
         'The concept salon site with a review card placed right under the booking button, ringed in pink. The review card is labelled as the slot for a real customer review.'),
        ('A simple menu: <em>five links.</em>', 'Not fifteen. If it does not help someone book, it goes in the footer.',
         '<div class="scr biz" style="height:100%"><div class="biz-nav"><span class="biz-logo">Atelier Coco</span></div><div class="biz-sec ring" style="gap:0"><div class="biz-review" style="font-size:20px;line-height:2.1">Services<br>Tarifs<br>Réalisations<br>Contact<br><b>Réserver</b></div></div></div>',
         'The concept salon site menu open with only five links: Services, Tarifs, Réalisations, Contact and Réserver, ringed in pink.'),
    ]
    for i, (t, b, scr, alt) in enumerate(fixes, 1):
        d.slide(f'Fix 0{i} · Concept', t, b, visual=P(scr), size='t-2', alt=f'Fix {i}: {strip(t).rstrip(".")}. {alt}')
    d.cta()
    cap = caption('M1-11').replace('#UX #smallbusiness #webdesign #conversion #ux', '#UX #smallbusiness #webdesign #conversion')
    d.write(caption_override=cap)
    return cap


def m1_12():
    d = Doc('M1-12', 'jeere-build-log-2', 'IMAGE', 'Thu Dec 10', 'JEERE · Build log #2')
    vis = f'''<div style="display:flex;gap:34px;align-items:center;justify-content:center;width:100%">
      {phone(jr_wire_produits(), 330, 743, 'Wireframe')}
      <span style="font-family:Fraunces;font-size:90px;color:var(--pink)">→</span>
      {shot(d.S + 'img/jeere/produits.webp', 330, 'High fidelity', 'in the prototype today')}</div>'''
    d.slide('JEERE · Build log #2', 'One screen, from <em>wireframe</em> to high fidelity.', 'What stayed: one main action, and a list she can scan on her phone.',
            visual=vis, size='t-2', extra='<span class="tag pink">Prototype</span>',
            alt='Two phones on ivory. Left: a grey wireframe of the products screen, with a title, an add-product button, a search field, two filters, four list rows and a bottom bar. Right: the real JEERE products screen for the demo shop Awa Beauté: “Produits, 6 produits”, an “Ajouter un produit” button with a rainbow edge, a search field, and products such as Beurre de karité brut and Savon noir au karité with their prices.')
    cap = '''JEERE build log #2. One screen, from wireframe to high fidelity.

Left: the wireframe. Boxes, labels, the order of things.
Right: the products screen as it is in the prototype today.

What stayed the same: one main action, add a product, and a list a merchant can scan on her phone.
What came after: the colour, the type and real products, once the order of things was settled.

The wireframe decided more.

#JEERE #buildinpublic #productdesign #wireframe #UI'''
    d.write(caption_override=cap,
            notes='The high-fidelity screen is the real Produits screen from the JEERE demo dashboard. The wireframe on the left is redrawn from it: swap in your real wireframe if you have one.')


def m1_14():
    d = Doc('M1-14', '2026-what-i-built', 'CAROUSEL', 'Thu Dec 17', '2026 · What I built')
    A = d.A
    d.hook('Year in review', '2026: what I <em>built.</em>', 'One slide each.', alt='Deep brown cover: “2026: what I built. One slide each.”')
    d.slide('01 · Portfolio', 'A portfolio I <em>own.</em>', 'Rebuilt by hand from a template: case studies written like product design, no subscription.',
            visual='<div class="card" style="padding:14px;width:100%"><img src="../_shared/img/portfolio-v2-desktop.png" alt="" style="width:100%;border-radius:16px;display:block"></div>',
            alt='The kreeative.xyz home page on desktop in a white card.')
    d.slide('02 · Kreeative clients', 'Brands designed and built <em>end to end.</em>', 'Lyzma Industries, GloryWalk, The Bakery, The Ivory Sukundu.',
            visual=f'''<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:18px;width:100%;height:100%"><img class="photo" style="grid-column:span 2;object-position:50% 45%" src="{A}img/project-bakery-1000.webp" alt=""><img class="photo" src="{A}img/case-lyzma-1-1000.webp" alt=""><img class="photo" src="{A}img/project-glorywalk-1000.webp" alt=""></div>''',
            alt='Three client brand images: The Bakery wordmark on cookies across the top, the Lyzma Industries shopping bags and the GloryWalk wordmark on denim below.')
    d.slide('03 · JEERE', 'From an idea to a working <em>editor.</em>', 'An e-commerce platform for African merchants. A working prototype, and the first 50 shops offered free for 3 months.',
            visual=f'<div style="display:flex;gap:40px;align-items:center"><img src="{d.S}jeere-logo-rainbow.svg" alt="" style="width:260px">{shot(d.S + "img/jeere/produits.webp", 300)}</div>',
            alt='The JEERE cloud logo in the rainbow beside a phone showing the real products screen of the JEERE prototype.')
    d.slide('04 · New role', 'Close to the people product teams <em>design for.</em>', 'A new role in customer experience at a tech company. Every day: what is broken, what is confusing, what people are actually trying to do.',
            visual='<div class="card" style="padding:48px;width:100%"><p class="cap">What it changed</p><p class="t-3" style="margin-top:18px">I start from the problem people have, not the feature I want to build.</p></div>',
            alt='New role slide with a card: “I start from the problem people have, not the feature I want to build.”')
    d.cta()
    d.write()


# =================================================================== MONTH 2
def m2_02():
    d = Doc('M2-02', 'glorywalk-before-after', 'IMAGE', 'Wed Dec 23', 'Brand identity · GloryWalk')
    A = d.A
    vis = f'<div class="card" style="width:100%;height:100%;overflow:hidden"><img class="photo" src="{A}img/project-glorywalk-1000.webp" alt=""></div>'
    d.slide('Brand identity · GloryWalk', 'Make belief look <em>undeniable.</em>', 'A gold graffiti wordmark, a W monogram for the hoodie back, navy, gold and sage.', visual=vis, size='t-2',
            alt='Ivory slide: the gold graffiti-style GloryWalk wordmark on a black denim pocket, under the title “Make belief look undeniable.”')
    cap = '''GloryWalk, a Christian streetwear brand. The identity in one image.

A gold graffiti wordmark, a W monogram that lives on a hoodie back, navy, gold and sage.

The brief in one line: make belief look undeniable.
The decision that mattered: the monogram, because apparel needs a mark that works embroidered on a chest and printed on a back.

Case study in the first comment.

#branding #streetwear #logodesign #brandidentity'''
    d.write(caption_override=cap)
    return cap


def m2_03():
    d = Doc('M2-03', 'creative-toolkit-2027', 'CAROUSEL', 'Tue Dec 29', 'Creative toolkit · 2027')
    d.hook('Toolkit · 2027', 'My 2027 creative <em>toolkit.</em>', 'Design, build, video, AI. Every tool has to remove a step, not add one.',
           alt='Deep brown cover: “My 2027 creative toolkit. Design, build, video, AI.”')
    cats = [('Design', [('Figma', 'layouts, prototypes, shared files'), ('Adobe Illustrator', 'logos and lettering'), ('Canva', 'the media kits I sell')]),
            ('Build', [('GitHub', 'every project, every version'), ('Supabase', 'accounts and data'), ('Vercel', 'every site, live')]),
            ('Video', [('CapCut', 'editing my videos'), ('vidIQ', 'research before I film')]),
            ('AI', [('Claude', 'building and checking code with me'), ('Higgsfield', 'images and video drafts'), ('Wispr Flow', 'talking instead of typing')])]
    for i, (n, tools) in enumerate(cats, 1):
        rows = ''.join(f'<div class="card" style="padding:30px 36px;display:flex;justify-content:space-between;align-items:center;gap:24px"><span class="t-3">{t}</span><span class="body" style="font-size:32px;text-align:right">{w}</span></div>' for t, w in tools)
        d.slide(f'0{i} · {n}', f'{n} <em>tools.</em>', '', visual=f'<div style="display:flex;flex-direction:column;gap:20px;width:100%">{rows}</div>',
                alt=f'{n} tools: ' + '; '.join(f'{t}, {w}' for t, w in tools) + '.')
    d.cta()
    cap = '''My creative toolkit for 2027. Design, build, video, AI.

Design: Figma, Adobe Illustrator, Canva
Build: GitHub, Supabase, Vercel
Video: CapCut, vidIQ
AI: Claude, Higgsfield, Wispr Flow

The rule that keeps the list short: every tool has to earn a slot by removing a step, not adding one.

What is in yours that I am missing?

#tools #designtools #productdesign #creativeprocess #2027'''
    d.write(caption_override=cap, notes='Tools taken from your repos, your site and the apps connected to your account. Remove any you do not use any more.')
    return cap


def m2_05():
    d = Doc('M2-05', 'website-case-study', 'CAROUSEL', 'Mon Jan 5', 'Case study · The Ivory Sukundu')
    S = d.S
    d.hook('Case study · Website', 'The Ivory Sukundu: a website, from <em>problem</em> to launch.',
           'A luxury hair-extensions brand, and a store that answers the questions customers ask.',
           alt='Deep brown cover: “The Ivory Sukundu: a website, from problem to launch.”')
    d.slide('01 · Problem', 'Bought on trust, and on a <em>number.</em>', 'Which length, how many bundles, which texture. A standard store template answered none of it.',
            visual='<div class="card" style="padding:44px;width:100%;display:flex;flex-direction:column;gap:22px"><p class="cap">What customers kept asking</p><p class="t-3">Where does 24 inches land on me?</p><p class="t-3">How many bundles for a full look?</p><p class="t-3">Straight or curly, for my routine?</p></div>',
            alt='Problem slide: three questions customers kept asking, where a length lands, how many bundles for a full look, and which texture for their routine.')
    lens = [('10 in', 'Nape', 22), ('16 in', 'Armpit', 40), ('22 in', 'Mid-back', 58), ('30 in', 'Hip', 80), ('40 in', 'Mid-thigh', 100)]
    bars = ''.join(f'<div style="display:flex;align-items:center;gap:24px"><span class="body" style="width:130px;font-size:32px"><strong>{a}</strong></span><div style="height:28px;width:{w}%;max-width:440px;border-radius:14px;background:var(--baby)"></div><span class="body" style="font-size:32px">{b}</span></div>' for a, b, w in lens)
    d.slide('02 · Research', 'Turn each question into a <em>tool.</em>', 'Length became a guide: sixteen lengths from 10 to 40 inches, where each lands and how many bundles it takes. Texture became a quiz.',
            visual=f'<div class="card" style="padding:44px;width:100%;display:flex;flex-direction:column;gap:22px">{bars}</div>',
            alt='Research slide: the length guide, five of its sixteen lengths with where each lands: 10 inches nape, 16 armpit, 22 mid-back, 30 hip, 40 mid-thigh.')
    wire = '''<div class="card" style="width:100%;height:100%;padding:36px;display:grid;grid-template-rows:60px 1.4fr 1fr 1fr 70px;gap:18px">
      <div style="display:flex;justify-content:space-between;align-items:center"><div class="wf-b" style="width:160px;height:36px"></div><div style="display:flex;gap:12px"><div class="wf-l" style="width:70px"></div><div class="wf-l" style="width:70px"></div><div class="wf-l" style="width:70px"></div></div></div>
      <div class="wf-x" style="font-size:24px">Hero · one promise · shop now</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px"><div class="wf-x" style="font-size:22px">Texture</div><div class="wf-x" style="font-size:22px">Texture</div><div class="wf-x" style="font-size:22px">Texture</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div class="wf-x" style="font-size:22px">Find your length</div><div class="wf-x" style="font-size:22px">Take the quiz</div></div>
      <div class="wf-x" style="font-size:22px">The Circle · reviews · contact</div></div>'''
    d.slide('03 · Wireframe', 'The order of things, before any <em>colour.</em>', 'Shop, then decide, then belong. This is where the site was actually decided.', visual=wire,
            alt='Wireframe slide: a grey page layout with a header, a hero with one promise, three texture blocks, the length guide and the quiz side by side, and the loyalty circle, reviews and contact at the bottom.')
    d.slide('04 · Design', 'Quiet luxury, on a <em>phone.</em>', 'Ivory, espresso and a little gold, an editorial serif, and nothing that looks like a discount store.',
            visual=f'<div style="display:flex;gap:34px">{shot(S + "img/sukundu/quiz.webp", 320, "The quiz", "one question at a time")}{shot(S + "img/sukundu/circle.webp", 320, "The Circle", "loyalty, in three steps")}</div>',
            alt='Design slide: two real screens of theivorysukundu.com on phones. The 60-second quiz asks “How much time do you give your hair in the morning?” with three answers. The Sukundu Circle page explains loyalty in three steps: join free, earn strands, rise in tiers.')
    steps = [('July 2026', 'theivorysukundu.com goes live'), ('October 2026', 'The store leaves Shopify: its own catalogue, bag and checkout'), ('November 2026', 'The owner edits her site in place, from her dashboard')]
    tl = ''.join(f'<div class="card" style="padding:28px 34px;display:flex;flex-direction:column;gap:6px"><p class="cap">{a}</p><p class="t-3">{b}</p></div>' for a, b in steps)
    d.slide('05 · Launch', 'Live, then a store of <em>its own.</em>', '', visual=f'<div style="display:flex;flex-direction:column;gap:18px;width:100%">{tl}</div>',
            alt='Launch slide: a timeline. July 2026, the site goes live. October 2026, the store leaves Shopify for its own catalogue, bag and checkout. November 2026, the owner edits her site in place from her dashboard.')
    d.slide('06 · What it does', 'Every question became a <em>tool.</em>', '', visual=f'<div class="card" style="padding:56px;width:100%;display:flex;flex-direction:column;gap:22px"><p class="cap">On the site today</p><p class="t-3">A length guide: where each length lands on the body</p><p class="t-3">A 60-second quiz, one question at a time</p></div>',
            alt='Slide 6: a white card listing what the site does today: a length guide showing where each length lands on the body, and a 60-second quiz, one question at a time.')
    d.cta()
    cap = '''A website case study, start to finish: The Ivory Sukundu.

Problem: hair extensions are bought on trust and on a number. Which length, how many bundles, which texture. A standard store template answered none of it.
Research: the questions customers kept asking
Wireframe: shop, then decide, then belong
Design: quiet luxury on a phone, ivory, espresso and a little gold
Launch: live in July 2026, then a store of its own in October
What it does: a length guide and a 60-second quiz answer the questions customers kept asking

The slide I am proudest of is the research one. Every question became a tool: a length guide and a quiz.

Full case study in the first comment.

#webdesign #casestudy #smallbusiness #UX #branding'''
    d.write({'RESULT_METRIC_OR_FEEDBACK': 'a real number or a sentence from the owner, with her permission'}, caption_override=cap,
            notes='Facts from the site’s own repository (TISHE-) and the live site. Screens chosen without photos of people. Ask the owner before naming results.')
    return cap


def m2_07():
    d = Doc('M2-07', 'jeere-dms-to-store', 'IMAGE', 'Wed Jan 7', 'JEERE · Concept')
    vis = f'''<div style="display:flex;gap:30px;align-items:center;justify-content:center;width:100%">
      {phone(chat(), 330, 640, 'Today', 'in the DMs')}
      <span style="font-family:Fraunces;font-size:90px;color:var(--pink)">→</span>
      {storefront(d.S, 400, 'With JEERE', 'a real store')}</div>'''
    d.slide('JEERE · Concept', 'From WhatsApp DMs to a <em>real store.</em>', 'Same merchant, same products, same customers. The difference is the tool.',
            visual=vis, size='t-2', extra='<span class="tag pink">Concept</span>',
            alt='Two phones on ivory. Left, labelled Today: a generic chat where a customer asks the price of a woven basket at 20:41, the seller answers 7 000 F twenty minutes later, then questions about size and delivery to Cocody go unanswered until “Allô ??” at 23:40. Right, labelled With JEERE: the real Chez Awa storefront from the JEERE prototype, “Nouveautés de la semaine” with category pills and the woven basket, bead bracelets and printed pouch, each with its price and an add button. Labelled Concept.')
    d.write()


def m2_09():
    d = Doc('M2-09', 'cx-to-product-design', 'CAROUSEL', 'Tue Jan 13', 'From CX to product design')
    d.hook('Career · Skills that transfer', 'From customer experience to product design: <em>6 skills</em> that transfer.',
           alt='Deep brown cover: “From customer experience to product design: 6 skills that transfer.”')
    skills = [('Empathy, the practical kind', 'You know what the person is actually trying to do.'),
              ('Spotting friction', 'You have heard where things break, a thousand times.'),
              ('Clear writing', 'Every unclear sentence becomes the next support ticket.'),
              ('Patterns in feedback', 'One complaint is noise. Fifty is a roadmap.'),
              ('Calm under pressure', 'A frustrated person is information, not a threat.'),
              ('Cross-team communication', 'You already translate between customers and builders.')]
    for i, (t, b) in enumerate(skills, 1):
        inner = f'''  <div class="area" style="justify-content:space-between">
    <p class="kicker">Skill 0{i} of 06</p>
    <div class="bignum">0{i}</div>
    <div style="display:flex;flex-direction:column;gap:28px">
      <h2 class="t-1">{t.split(", ")[0]}{"<em>, " + t.split(", ")[1] + "</em>" if ", " in t else ""}</h2>
      <p class="lead">{b}</p>
    </div>
  </div>'''
        d.raw(inner, 'light' if i % 2 else 'pink', dict(kicker=f'Skill 0{i} of 06', title=t, body=b, alt=f'Skill {i} of 6, large numeral 0{i}: “{t}. {b}”'))
    d.cta()
    d.write()


def m2_11():
    d = Doc('M2-11', 'jeere-brand-identity', 'IMAGE', 'Thu Jan 15', 'JEERE · Brand identity')
    sw = [('#111111', 'Black'), ('#FFFFFF', 'White'), ('#E8467C', 'Pink-red'), ('#F08A3C', 'Orange'), ('#F0C414', 'Yellow'), ('#22C97E', 'Green'), ('#1E9BE0', 'Blue'), ('#6A4CFF', 'Violet'), ('#C13CE0', 'Magenta')]
    sws = ''.join(f'<div style="display:flex;flex-direction:column;gap:8px"><div style="height:96px;border-radius:16px;background:{c};box-shadow:inset 0 0 0 2px rgba(17,17,17,.1)"></div><span style="font:500 20px/1.2 Poppins">{n}</span><span style="font:400 18px/1 \'DM Mono\';color:#5E5E5E">{c}</span></div>' for c, n in sw)
    vis = f'''<div style="width:100%;height:100%;background:#fff;border-radius:28px;padding:40px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto 1fr;gap:28px;font-family:Poppins;color:#111;box-shadow:0 24px 48px -28px rgba(50,28,20,.35)">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#111;border-radius:22px;padding:30px"><div style="display:flex;align-items:center;gap:18px"><img src="{d.S}jeere-logo-rainbow.svg" alt="" style="width:170px"><img src="{d.S}jeere-wordmark-white.svg" alt="" style="height:78px"></div><span style="font:400 20px/1 'DM Mono';letter-spacing:.14em;text-transform:uppercase;color:#bbb">Logo</span></div>
      <div style="display:flex;flex-direction:column;justify-content:center;gap:8px;border:2px solid #EBEBE8;border-radius:22px;padding:30px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:end"><div><span style="display:block;font-weight:600;font-size:96px;line-height:1;letter-spacing:-.04em">Aa</span><span style="display:block;font-weight:600;font-size:26px;margin-top:8px">Poppins</span><span style="font-size:19px;color:#5E5E5E">the site</span></div><div><img src="{d.S}img/jeere/outfit-aa.png" alt="" style="height:116px;display:block;margin:-10px 0 -10px -20px"><span style="display:block;font:600 26px/1.2 Poppins;margin-top:8px">Outfit</span><span style="font-size:19px;color:#5E5E5E">the dashboard</span></div></div></div>
      <div style="grid-column:span 2;display:flex;align-items:center;gap:24px"><span style="flex:none;border-radius:999px;padding:16px 30px;font-weight:600;font-size:24px;border:2px solid transparent;background-image:var(--jr-words),linear-gradient(#fff,#fff),var(--jr-edge);background-size:90px 100%,100% 100%,100% 100%;background-repeat:repeat-x,no-repeat,no-repeat;background-origin:border-box;-webkit-background-clip:text,padding-box,border-box;background-clip:text,padding-box,border-box;-webkit-text-fill-color:transparent">Créer ma boutique</span><span style="font-size:22px;line-height:1.35;color:#2A2A2A">Black and white everywhere. The rainbow only on the buttons and the logo.</span></div>
      <div style="grid-column:span 2;display:grid;grid-template-columns:repeat(9,1fr);gap:12px">{sws}</div></div>'''
    d.slide('JEERE · Brand identity', 'JEERE has a <em>face.</em>', 'A hand-drawn cloud and a hand-lettered name, black and white everywhere, and a rainbow for what you press.', visual=vis, size='t-2',
            alt='The JEERE brand on one white board: the hand-drawn cloud logo in a seven-colour rainbow and the hand-lettered Jeere wordmark in white on black, two type specimens, Poppins for the site and Outfit for the dashboard, a white button “Créer ma boutique” with a rainbow edge and rainbow letters, and nine swatches: black, white, pink-red #E8467C, orange #F08A3C, yellow #F0C414, green #22C97E, blue #1E9BE0, violet #6A4CFF, magenta #C13CE0.')
    cap = '''JEERE has a face. Logo, colours, type.

The brief I gave myself: a brand a merchant would be proud to put on her shop sign, and that works on a phone first.

→ Logo: a hand-drawn cloud with two eyes, and the name lettered by hand
→ Colours: black and white everywhere, and a seven-colour rainbow only where it matters: the buttons and the logo
→ Type: Poppins on the site, Outfit in the merchant’s dashboard

What I kept out: anything that looks corporate, and anything that only works on a laptop.

More of the system in the onboarding case study next week.

#JEERE #branding #brandidentity #logodesign #buildinpublic'''
    d.write(caption_override=cap,
            notes='Taken from the live JEERE site (jeere.kreeative.xyz and its rainbow.css): the cloud logo, the lettered wordmark, Poppins on the site, Outfit in the dashboard, black and white, and the seven rainbow colours on buttons and the logo. Confirm before posting.')
    return cap


# =================================================================== MONTH 3
def m3_02():
    d = Doc('M3-02', 'jeere-onboarding', 'CAROUSEL', 'Tue Jan 20', 'JEERE · Onboarding')
    d.hook('JEERE · Case study', 'JEERE onboarding, from research to <em>prototype.</em>',
           visual=f'<img src="{d.S}jeere-logo-rainbow.svg" alt="" style="width:300px">',
           alt='Deep brown cover with the JEERE cloud logo in ivory: “JEERE onboarding, from research to prototype.”')
    d.slide('01 · Research', '5 merchants. Where it <em>breaks</em> today.', '',
            visual='<div style="width:100%"><ul class="list"><li>Answering “c’est combien ?” all day</li><li>Copying every order into a notebook</li><li>Calling the delivery driver, working out the fee</li><li>Losing a parcel when the client stops answering</li></ul></div>',
            size='t-2', alt='Research slide: four ways selling breaks today, answering prices all day, copying orders into a notebook, calling the delivery driver, losing parcels.')
    steps = [('1', 'Créer un compte', 'Prénom, e-mail, un code. Pas de mot de passe.'), ('2', 'Partir d’un modèle', 'Quatre boutiques prêtes à remplir.'),
             ('3', 'Ajouter ses produits', 'Une vraie photo par produit.'), ('4', 'Premiers pas', '10 étapes qui se cochent toutes seules.')]
    flow = ''.join(f'<div class="card" style="padding:24px 32px;display:flex;align-items:center;gap:26px"><span class="bignum" style="font-size:90px">{n}</span><div><p class="t-3">{t}</p><p class="body" style="font-size:30px;margin-top:6px">{s}</p></div></div>' + ('<div style="height:22px;width:3px;background:var(--pink);margin-left:66px"></div>' if n != '4' else '') for n, t, s in steps)
    d.slide('02 · User flow', 'No password, and a shop <em>ready to fill.</em>', '',
            visual=f'<div style="display:flex;flex-direction:column;width:100%">{flow}</div>', size='t-2',
            alt='User flow in four steps, in French: create an account with a first name, an email and a code, no password; start from one of four templates; add products with a real photo; then ten first steps that tick themselves.')
    w = lambda lines: f'<div class="scr wf" style="height:100%"><div class="wf-l" style="width:50%;height:22px"></div>{lines}<div class="wf-x" style="margin-top:auto;height:48px;border-radius:24px">Continuer</div></div>'
    s1 = w('<div class="wf-l" style="width:40%;height:10px"></div><div class="wf-l" style="width:30%"></div><div class="wf-b" style="height:46px"></div><div class="wf-l" style="width:40%"></div><div class="wf-b" style="height:46px"></div><div class="wf-l" style="width:55%"></div><div class="wf-b" style="height:46px"></div>')
    s2 = w('<div class="wf-l" style="width:75%"></div>' + '<div style="display:flex;gap:8px;border:2px solid #e4e4e4;border-radius:12px;padding:8px"><div class="wf-x" style="width:80px;height:90px;flex:none">modèle</div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="wf-l" style="width:60%"></div><div class="wf-b" style="height:26px;width:70%;border-radius:13px"></div></div></div>' * 2)
    s3 = w('<div class="wf-x" style="height:40px;width:70%">+ ajouter</div><div class="wf-b" style="height:36px;border-radius:18px"></div>' + '<div style="display:flex;gap:8px;align-items:center"><div class="wf-b" style="width:48px;height:48px;flex:none"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="wf-l" style="width:70%"></div><div class="wf-l" style="width:40%"></div></div></div>' * 3)
    d.slide('03 · Wireframes', 'Every step on a phone, <em>French first.</em>', '',
            visual=f'<div style="display:flex;gap:24px">{phone(s1, 270, 540, "Compte")}{phone(s2, 270, 540, "Modèle")}{phone(s3, 270, 540, "Produits")}</div>', size='t-2',
            alt='Three grey phone wireframes for the onboarding steps: the account form with three fields, the template picker with two template cards, and the products list with an add button, a search field and three rows.')
    d.slide('04 · Prototype', 'The prototype, <em>live today.</em>', '',
            visual=f'<div style="display:flex;gap:34px">{shot(d.S + "img/jeere/signup.webp", 320, "Créer un compte", "étape 1 sur 4")}{shot(d.S + "img/jeere/produits.webp", 320, "Produits", "la boutique se remplit")}</div>', size='t-2',
            alt='Two real JEERE prototype screens on phones. Left: “Créez votre compte, étape 1 sur 4, pas de mot de passe”, with fields for first name, email and an optional WhatsApp number. Right: the products screen of the demo shop with an “Ajouter un produit” button and products with their prices.')
    d.slide('05 · What’s next', 'What I am <em>building next.</em>', 'Opening the first 50 shops, free for 3 months.',
            visual='<div class="card" style="padding:48px;width:100%"><p class="cap">The first 50 shops</p><p class="t-3" style="margin-top:18px">Free for 3 months, in exchange for honest feedback.</p></div>',
            alt='What’s next slide: opening the first 50 shops, free for 3 months, in exchange for honest feedback.')
    d.cta()
    cap = '''JEERE onboarding, as a case study. From research to prototype.

Research: 5 merchants, what they do today, where it breaks
User flow: an account with a first name, an email and a code, then a template, then products, then ten first steps that tick themselves
Wireframes: every step on a phone, in French first
Prototype: live today, sign-up and products
What is next: opening the first 50 shops, free for 3 months

The one decision I would defend: no password. A code by email, and WhatsApp only if she wants it.

#JEERE #onboarding #UX #casestudy #productdesign'''
    d.write(caption_override=cap,
            notes='Screens are from the live JEERE prototype. The order of steps 2 to 4 (template, products, first steps) is read from the prototype’s pages: confirm it before posting.')
    return cap


def m3_03():
    d = Doc('M3-03', 'how-merchants-sell', 'IMAGE', 'Wed Jan 21', 'African e-commerce')
    icon = {'chat': '<path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Z"/>',
            'cam': '<path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm-80,124a40,40,0,1,1,40-40A40,40,0,0,1,128,180Z"/>',
            'shop': '<path d="M232,96a7.89,7.89,0,0,0-.3-2.2L217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.8A7.89,7.89,0,0,0,24,96v16a40,40,0,0,0,16,32v64a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V144a40,40,0,0,0,16-32Z"/>'}
    rows = [('chat', 'WhatsApp', '61%', 'of women-owned sellers on Jumia also sell on WhatsApp', 'IFC, 2021'),
            ('cam', 'Instagram', '36%', 'of them also sell on Instagram', 'IFC, 2021'),
            ('shop', 'Marketplaces', '27%', 'of Kenyan micro-businesses used one. Over 90% of those also sold on social media', 'Caribou Digital, 2020')]
    r = ''.join(f'''<div class="card" style="padding:26px 32px;display:grid;grid-template-columns:84px 1fr;gap:24px;align-items:center">
        <div style="width:84px;height:84px;border-radius:50%;background:var(--baby);display:grid;place-items:center"><svg viewBox="0 0 256 256" width="46" fill="#321c14">{icon[k]}</svg></div>
        <div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:baseline;gap:18px"><span class="t-2" style="color:var(--pink)">{s}</span><span class="t-3">{n}</span></div><span class="body" style="font-size:32px;line-height:1.3">{c}</span><span class="cap">Source: {src}</span></div></div>''' for k, n, s, c, src in rows)
    d.slide('Data · Côte d’Ivoire, Kenya, Nigeria', 'How African merchants sell online <em>today.</em>', '', visual=f'<div style="display:flex;flex-direction:column;gap:20px;width:100%">{r}</div>', size='t-2',
            alt='Infographic on ivory, three cards. WhatsApp: 61% of women-owned sellers on Jumia in Côte d’Ivoire, Kenya and Nigeria also sell on WhatsApp. Instagram: 36% also sell on Instagram. Source: IFC, Women and E-commerce in Africa, 2021. Marketplaces: 27% of Kenyan micro-businesses used a marketplace, and over 90% of those also sold through social media. Source: Mastercard Foundation and Caribou Digital, 2020.')
    cap = '''How African merchants sell online today. One image, three numbers.

→ WhatsApp: 61% of women-owned sellers on Jumia also sell on WhatsApp
→ Instagram: 36% of them also sell on Instagram
→ Marketplaces: in Kenya, 27% of micro-businesses used a marketplace like Jumia, and over 90% of those also sold through Facebook, Instagram or WhatsApp

The pattern: the selling already happens in chat. The missing piece is everything around it: the catalogue, the orders, the deliveries.

That is the gap JEERE is built for.

Sources in the first comment.

#ecommerce #africa #JEERE #smallbusiness #data'''
    d.write(caption_override=cap, notes='''**First comment (sources):**
- IFC, Women and E-commerce in Africa, 2021 (Jumia sellers in Côte d’Ivoire, Kenya and Nigeria; 61% of women-owned and 51% of men-owned businesses sell on WhatsApp, 36% and 32% on Instagram, Figure 3.4): https://www.ifc.org/content/dam/ifc/doc/mgrt/202105-digital2equal-women-and-e-commerce-africa.pdf
- Mastercard Foundation and Caribou Digital, 2020, as cited in the same IFC report (Kenya: 27% of microenterprises used marketplace platforms like Jumia; over 90% of them also used Facebook, Instagram and WhatsApp).''')
    return cap


def m3_05():
    d = Doc('M3-05', 'booking-form-before-after', 'IMAGE', 'Tue Jan 27', 'Before / after · Booking form')
    fields = ''.join(f'<span class="f-l">{n}</span><div class="f-i"></div>' for n in ['Prénom', 'Nom', 'Courriel', 'Téléphone', 'Adresse', 'Ville', 'Code postal', 'Service', 'Date (JJ/MM/AAAA)', 'Heure', 'Commentaires'])
    before = f'<div class="scr form" style="height:100%;gap:5px">{fields}<div class="f-i" style="background:#bbb;border:0;margin-top:4px;height:30px;display:grid;place-items:center;color:#fff;font-size:13px">ENVOYER</div></div>'
    after = '''<div class="scr form" style="height:100%;gap:14px;padding-top:66px">
      <div class="f-prog"><i class="on"></i><i></i><i></i></div>
      <span class="f-l" style="font-size:15px">Étape 1 sur 3</span>
      <div style="font:600 26px/1.2 Inter;letter-spacing:-.02em">Que voulez-vous réserver ?</div>
      <div class="f-big on">Tresses <span>2 h</span></div>
      <div class="f-big">Soin <span>45 min</span></div>
      <div class="f-big">Coupe <span>30 min</span></div>
      <div class="f-btn">Suivant : choisir l’heure</div></div>'''
    vis = f'''<div style="display:flex;gap:34px;align-items:center;justify-content:center;width:100%">
      {phone(before, 330, 640, 'Before', 'eleven fields, one page')}
      <span style="font-family:Fraunces;font-size:90px;color:var(--pink)">→</span>
      {phone(after, 330, 640, 'After', 'three steps, one question each')}</div>'''
    d.slide('Before / after · Concept', 'A booking form: fewer fields, <em>better order.</em>', 'Nothing new was invented. Fields removed, order changed, copy rewritten.',
            visual=vis, size='t-2', extra='<span class="tag pink">Concept</span>',
            alt='Before and after, concept. Left: a booking form on a phone with eleven small fields on one page and a grey Envoyer button. Right: step 1 of 3, “Que voulez-vous réserver ?”, with three large options, Tresses selected, and a dark button “Suivant : choisir l’heure”.')
    d.write()


def m3_08():
    d = Doc('M3-08', 'black-designers-founders', 'CAROUSEL', 'Tue Feb 3', 'Black History Month')
    d.hook('Black History Month', '5 Black designers and founders who shaped <em>how I work.</em>', 'Typography only, on purpose. Their work speaks.',
           alt='Deep brown cover: “5 Black designers and founders who shaped how I work. Typography only, on purpose.”')
    people = [
        ('Cheryl D. Miller', 'Graphic designer and design historian', 'Her 1985 Pratt thesis on Black designers became “Black Designers Missing in Action”, published by Print in 1987.', 'Writing down who is missing is design work too.'),
        ('Emory Douglas', 'Artist, Minister of Culture of the Black Panther Party', 'He shaped the look of The Black Panther newspaper from 1967. AIGA Medal, 2015.', 'Design can speak for a community, in its own visual language.'),
        ('Gail Anderson', 'Graphic designer, writer and educator', 'Senior art director at Rolling Stone from 1987 to 2002. AIGA Lifetime Achievement Medal, 2008.', 'Lettering can carry a whole voice.'),
        ('Virgil Abloh', 'Designer, founder of Off-White', 'Founded Off-White in 2013. Named artistic director of Louis Vuitton menswear in 2018.', 'You do not need permission to work across disciplines.'),
        ('Rebecca Enonchong', 'Cameroonian tech entrepreneur', 'Founded AppsTech in 1999. Chairs ActivSpaces, a tech hub in Buea.', 'You can build from Africa and be taken seriously everywhere.'),
    ]
    for i, (n, role, fact, line) in enumerate(people, 1):
        inner = f'''  <div class="area" style="justify-content:space-between">
    <p class="kicker">0{i} of 05</p>
    <div style="display:flex;flex-direction:column;gap:24px">
      <h2 class="t-hook" style="font-size:112px">{n}</h2>
      <p class="lead">{role}</p>
      <p class="body">{fact}</p>
    </div>
    <div class="card" style="padding:44px"><p class="cap">What I took from their work</p><p class="t-3" style="margin-top:18px">{line}</p></div>
  </div>'''
        d.raw(inner, 'light' if i % 2 else 'pink', dict(kicker=f'0{i} of 05', title=n, body=f'{role}. {fact} What I took from their work: {line}',
                                                       alt=f'Typography-only slide {i} of 5: {n}, {role}. {fact} What Kee took from their work: “{line}”'))
    d.cta()
    cap = '''5 Black designers and founders who shaped how I work.

1. Cheryl D. Miller: writing down who is missing is design work too
2. Emory Douglas: design can speak for a community, in its own visual language
3. Gail Anderson: lettering can carry a whole voice
4. Virgil Abloh: you do not need permission to work across disciplines
5. Rebecca Enonchong: you can build from Africa and be taken seriously everywhere

Typography only, on purpose. Their work speaks; I did not want to put my frame on their faces.

Who would be on your list?

#BlackHistoryMonth #designers #founders #inspiration #design'''
    d.write(caption_override=cap, notes='''Facts checked on Wikipedia (Cheryl D. Miller, Emory Douglas, The Black Panther (newspaper), Gail Anderson (graphic designer), Virgil Abloh, Rebecca Enonchong). **The “what I took from their work” lines are drafts in your voice: change them, or swap a person, before posting.** Alternative checked: Tope Awotona, Nigerian-born founder of Calendly (debut 2013).''')
    return cap


def m3_09():
    d = Doc('M3-09', 'african-ecommerce-6-slides', 'CAROUSEL', 'Wed Feb 4', 'African e-commerce')
    d.hook('Data · African e-commerce', 'African e-commerce in <em>6 slides.</em>', 'Every number with its source.',
           alt='Deep brown cover: “African e-commerce in 6 slides. Every number with its source.”')
    items = [('Market size', '$115B', 'Africa’s internet economy in 2020, about 4.5% of GDP.', 'Google and IFC, e-Conomy Africa 2020'),
             ('Where it happens', '45%', 'of small businesses surveyed sell online, and 67% promote themselves on social media.', 'GeoPoll, Africa 118, African Talent Company, Africa MSME Pulse 2023'),
             ('Mobile first', '416M', 'mobile internet users in Africa in 2024, 28% of the population.', 'GSMA, The Mobile Economy Africa 2025'),
             ('The merchants', '61%', 'of women-owned sellers on Jumia also sell on WhatsApp.', 'IFC, Women and E-commerce in Africa, 2021'),
             ('The gap', '58%', 'of unconnected Africans already live under mobile broadband coverage. The barrier is use, not signal.', 'GSMA, The Mobile Economy Africa 2025'),
             ('Why now', '576M', 'mobile internet users expected in Africa by 2030.', 'GSMA, The Mobile Economy Africa 2025')]
    for i, (t, s, c, src) in enumerate(items, 1):
        inner = f'''  <div class="area" style="justify-content:space-between">
    <p class="kicker">0{i} · {t}</p>
    <h2 class="t-hook" style="font-size:250px;line-height:.9;color:var(--pink)">{s}</h2>
    <div style="display:flex;flex-direction:column;gap:22px"><p class="lead">{c}</p><p class="cap">Source: {src}</p></div>
  </div>'''
        d.raw(inner, 'light' if i % 2 else 'pink', dict(kicker=f'0{i} · {t}', title=s, body=f'{c} Source: {src}', alt=f'Data slide {i} of 6, {t}: {s} {c} Source: {src}.'))
    d.cta()
    cap = '''African e-commerce in 6 slides. The numbers, with sources.

1. Market size: Africa’s internet economy was about $115 billion in 2020, 4.5% of GDP
2. Where it happens: 45% of small businesses surveyed sell online, and 67% promote on social media
3. Mobile first: 416 million mobile internet users in Africa in 2024
4. The merchants: 61% of women-owned sellers on Jumia also sell on WhatsApp
5. The gap: 58% of unconnected Africans already live under mobile broadband coverage
6. Why now: 576 million mobile internet users expected by 2030

Every number has its source in the first comment. If one is wrong, tell me and I will fix the slide.

#ecommerce #africa #JEERE #data #startup'''
    d.write(caption_override=cap, notes='''**First comment (sources):**
1. Google and IFC, e-Conomy Africa 2020: https://www.ifc.org/en/pressroom/2020/new-google-ifc-report-estimates-africas-internet-economy-could-b
2. GeoPoll, Africa 118 and African Talent Company, Africa MSME Pulse 2023 (440 businesses in Nigeria, Kenya, South Africa, Ethiopia): https://www.geopoll.com/blog/africa-msme-pulse-2023/
3, 5, 6. GSMA, The Mobile Economy Africa 2025 (2024 data and 2030 forecast): https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-economy/wp-content/uploads/2025/10/GSMA_AFRICA_ME2025_R_Web-3.pdf
4. IFC, Women and E-commerce in Africa, 2021, Figure 3.4: https://www.ifc.org/content/dam/ifc/doc/mgrt/202105-digital2equal-women-and-e-commerce-africa.pdf

Checked: Google/IFC, GSMA and IFC figures read in the primary documents; GeoPoll figures from GeoPoll’s own summary page.''')
    return cap


def m3_10():
    d = Doc('M3-10', 'portfolio-v2-reveal', 'IMAGE', 'Mon Feb 9', 'Portfolio v2')
    vis = f'''<div style="position:relative;width:100%;height:100%">
      <div class="card" style="position:absolute;left:0;top:20px;width:760px;padding:14px"><img src="../_shared/img/portfolio-v2-desktop.png" alt="" style="width:100%;border-radius:16px;display:block"></div>
      <div style="position:absolute;right:0;bottom:0">{phone('<img src="../_shared/img/portfolio-v2-phone.png" alt="" style="width:100%;display:block;margin-top:54px">', 290, 600)}</div></div>'''
    d.slide('Portfolio · v2', 'Portfolio v2 is <em>live.</em>', 'Case studies written like product design: the problem, who it is for, the constraints, the decisions, the outcome.',
            visual=vis, size='t-1',
            alt='Portfolio v2 reveal on ivory: the kreeative.xyz home page on desktop in a white card, overlapped by the same page on a phone, with the headline “Hello, I’m Kee and I am a product & brand designer”.')
    d.write()


# =================================================================== run
build_profile()
m1_02(); m1_04(); m1_06(); m1_07(); m1_09(); m1_11(); m1_12(); m1_14()
m2_02(); m2_03(); m2_05(); m2_07(); m2_09(); m2_11()
m3_02(); m3_03(); m3_05(); m3_08(); m3_09(); m3_10()
JOBS.insert(0, dict(id='P-01', src='profile/P-01_banner/source.html', out='profile/P-01_banner/P-01_banner.png', w=1584, h=396, kind='png', pages=1))
json.dump(JOBS, open(os.path.join(HERE, 'jobs.json'), 'w'), indent=1)
print(len(JOBS), 'jobs')

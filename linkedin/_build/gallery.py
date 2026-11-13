#!/usr/bin/env python3
"""One page to browse every LinkedIn post: visuals, captions, EN and FR.

    python3 linkedin/_build/gallery.py      # writes linkedin/_build/gallery/ (index.html + img/*.webp)

Reads CALENDAR.md, CALENDAR_FR.md and the rendered previews in _build/previews/
(run render-all.mjs first if they are missing). The output is not committed.
"""
import html, json, os, re
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'gallery')
IMG = os.path.join(OUT, 'img')
os.makedirs(IMG, exist_ok=True)
PREV = os.path.join(HERE, 'previews')


def parse_calendar(path):
    text = open(path, encoding='utf-8').read()
    months, posts, month = [], [], None
    for block in re.split(r'\n(?=## |### )', text):
        m = re.match(r'## ((?:MONTH|MOIS) \d.*)', block)
        if m:
            month = m.group(1).strip()
            months.append(month)
            continue
        m = re.match(r'### ((?:M\d-\d+)) · (.*?) · (\w+) · (EN|FR)\n(.*)', block, re.S)
        if not m:
            continue
        pid, date, fmt, _, rest = m.groups()
        cap = re.search(r'```(?:text)?\n(.*?)```', rest, re.S)
        desc = rest[:cap.start()].strip() if cap else rest.strip()
        posts.append({'id': pid, 'date': date, 'format': fmt, 'desc': desc, 'caption': cap.group(1).strip() if cap else '', 'month': month})
    return months, posts


def images_for(pid, fr):
    key = pid + ('-FR' if fr else '')
    files = sorted(f for f in os.listdir(PREV) if re.fullmatch(re.escape(key) + r'_\d+\.png', f))
    out = []
    for f in files:
        dest = f[:-4] + '.webp'
        im = Image.open(os.path.join(PREV, f)).convert('RGB')
        w = 1200 if im.width > im.height * 2 else 900
        if im.width > w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(IMG, dest), 'WEBP', quality=82, method=5)
        out.append({'src': 'img/' + dest, 'w': im.width, 'h': im.height})
    return out


PROFILE = [
    ('P-01', 'Banner', 'Bannière', 'Profile banner, 1584 × 396', 'Bannière du profil, 1584 × 396'),
    ('P-02', 'Featured: Portfolio 2026', 'Sélection : Portfolio 2026', 'Featured cover, 1200 × 627', 'Couverture de la section Sélection, 1200 × 627'),
    ('P-03', 'Featured: Kreeative', 'Sélection : Kreeative', 'Featured cover, 1200 × 627', 'Couverture de la section Sélection, 1200 × 627'),
    ('P-04', 'Featured: JEERE', 'Sélection : JEERE', 'Featured cover, 1200 × 627', 'Couverture de la section Sélection, 1200 × 627'),
    ('P-05', 'Featured: Lyzma Industries', 'Sélection : Lyzma Industries', 'Featured cover, 1200 × 627', 'Couverture de la section Sélection, 1200 × 627'),
]


def build():
    data = {}
    for lang, cal in (('en', 'CALENDAR.md'), ('fr', 'CALENDAR_FR.md')):
        months, posts = parse_calendar(os.path.join(L, cal))
        for p in posts:
            p['images'] = images_for(p['id'], lang == 'fr')
        prof = [{'id': pid, 'title': (en_t if lang == 'en' else fr_t), 'desc': (en_d if lang == 'en' else fr_d),
                 'images': images_for(pid, lang == 'fr')} for pid, en_t, fr_t, en_d, fr_d in PROFILE]
        data[lang] = {'months': months, 'posts': posts, 'profile': prof}
    page = open(os.path.join(HERE, 'gallery_template.html'), encoding='utf-8').read()
    page = page.replace('/*DATA*/null', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
    n_img = len(os.listdir(IMG))
    print(len(data['en']['posts']), 'posts EN,', len(data['fr']['posts']), 'posts FR,', n_img, 'images')


if __name__ == '__main__':
    build()

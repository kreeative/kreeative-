#!/usr/bin/env python3
"""French versions of every LinkedIn design.

    python3 linkedin/_build/i18n.py extract   # lists every English text unit still missing from fr.json
    python3 linkedin/_build/i18n.py build     # writes source_fr.html + copy_fr.md for every post, adds FR jobs

A "unit" is the inner HTML of the smallest block that holds text (a headline with its <em>,
a paragraph, a list item, a label). Translations live in _build/fr.json as {english: french},
so a wording change in English shows up as a missing unit, never as a silent mix of languages.
"""
import json, os, re, sys
from bs4 import BeautifulSoup, NavigableString

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.dirname(HERE)
INLINE = {'em', 'span', 'strong', 'b', 'i', 'br', 'a', 'small', 'sup'}
SKIP_CLASSES = {'sbar', 'sbi'}            # phone status bar: no words to translate


def units_of(soup):
    out = []
    def walk(el):
        for c in el.children:
            if isinstance(c, NavigableString) or c.name in ('script', 'style'):
                continue
            if set(c.get('class') or []) & SKIP_CLASSES:
                continue
            has_text = c.get_text(strip=True) != ''
            only_inline = all(isinstance(x, NavigableString) or x.name in INLINE for x in c.descendants)
            if has_text and only_inline and c.name not in INLINE:
                out.append(c)
            elif has_text and only_inline and c.name in INLINE and c.parent is not None and not all(
                    isinstance(x, NavigableString) or x.name in INLINE for x in c.parent.descendants):
                out.append(c)          # an inline label sitting directly in a layout block
            else:
                walk(c)
    walk(soup.body)
    return out


def key(el):
    return re.sub(r'\s+', ' ', el.decode_contents()).strip()


def sources():
    jobs = json.load(open(os.path.join(HERE, 'jobs.json')))
    return [os.path.join(L, j['src']) for j in jobs]


import html as _html
sys.path.insert(0, HERE)
from fr_strings import FR, PHRASES, NOTES


def plain(s):
    return _html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def load_fr():
    fr = dict(FR)
    for k, v in FR.items():                      # the copy.md lines are the same texts without tags
        fr.setdefault(plain(k), plain(v))
    return fr


SUBS = None
def substitute(text, fr):
    """Translate a string that is not a whole unit: footers, rows, combined alt texts."""
    global SUBS
    if SUBS is None:
        pairs = dict(PHRASES)
        for k, v in fr.items():
            if len(k) > 14 and '<' not in k:
                pairs.setdefault(k, v)
        SUBS = sorted(pairs.items(), key=lambda kv: len(kv[0]), reverse=True)
    out = text
    for k, v in SUBS:
        if k in out:
            out = out.replace(k, v)
    return out


def french_typo(s):
    """Non-breaking spaces where French typography wants them (never inside tags)."""
    parts = re.split(r'(<[^>]+>)', s)
    for i, p in enumerate(parts):
        if p.startswith('<'):
            continue
        p = re.sub(r' ([:;?!»])', '\u00a0\\1', p)
        p = p.replace('« ', '«\u00a0')
        p = re.sub(r'(\d) %', '\\1\u00a0%', p)
        parts[i] = p
    return ''.join(parts)


def copy_texts(md):
    """English strings from a copy.md that need translating: slide text lines and alt text."""
    keys = []
    for line in md.splitlines():
        m = re.match(r'- (?:Kicker|Headline|Body): (.*)', line) or re.match(r'- (?:Page \d+: )?(.*)', line)
        if m and line.startswith('- ') and not line.startswith(('- Format', '- Posting', '- File', '- `[')):
            keys.append(m.group(1).strip())
    return keys


def extract():
    fr = load_fr()
    missing = []
    for src in sources():
        soup = BeautifulSoup(open(src, encoding='utf-8').read(), 'html.parser')
        for el in units_of(soup):
            k = key(el)
            if k not in fr and k not in missing:
                missing.append(k)
        md = os.path.join(os.path.dirname(src), 'copy.md')
        if os.path.exists(md):
            for k in copy_texts(open(md, encoding='utf-8').read()):
                if k not in fr and k not in missing:
                    missing.append(k)
    json.dump(missing, open(os.path.join(HERE, 'fr_missing.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(missing), 'missing units -> _build/fr_missing.json')


DAYS = {'Mon': 'lun.', 'Tue': 'mar.', 'Wed': 'mer.', 'Thu': 'jeu.', 'Fri': 'ven.', 'Sat': 'sam.', 'Sun': 'dim.'}
MONTHS = {'Nov': 'nov.', 'Dec': 'déc.', 'Jan': 'janv.', 'Feb': 'févr.'}


def fr_date(s):
    s = s.replace('Week of ', 'Semaine du ').replace('Profile, featured section', 'Profil, section Sélection')
    m = re.match(r'(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?(Nov|Dec|Jan|Feb) (\d+)', s)
    if m:
        d = (DAYS[m.group(1)] + ' ') if m.group(1) else ''
        return s[:m.start()] + d + m.group(3) + ' ' + MONTHS[m.group(2)] + s[m.end():]
    m = re.search(r'(Nov|Dec|Jan|Feb) (\d+)', s)
    return s[:m.start()] + m.group(2) + ' ' + MONTHS[m.group(1)] + s[m.end():] if m else s


def fr_caption(pid):
    cal = open(os.path.join(L, 'CALENDAR_FR.md'), encoding='utf-8').read()
    m = re.search(r'### ' + re.escape(pid) + r' .*?```\n(.*?)```', cal, re.S)
    return m.group(1).strip() if m else ''


def build():
    fr = load_fr()
    jobs = json.load(open(os.path.join(HERE, 'jobs.json')))
    missing = set()
    new_jobs = [j for j in jobs if not j['id'].endswith('-FR')]
    for j in list(new_jobs):
        src = os.path.join(L, j['src'])
        d = os.path.dirname(src)
        html = open(src, encoding='utf-8').read()
        soup = BeautifulSoup(html, 'html.parser')
        for el in units_of(soup):
            k = key(el)
            v = fr.get(k)
            if v is None:
                v2 = substitute(k, fr)
                if v2 != k:
                    v = v2
            if v is None:
                missing.add(k)
                continue
            el.clear()
            el.append(BeautifulSoup(french_typo(v), 'html.parser'))
        if soup.html:
            soup.html['lang'] = 'fr'
        out = str(soup)
        # Rich & Friends speaks French too: use its French screens
        out = out.replace('img/rf/goals.webp', 'img/rf/fr-goals.webp').replace('img/rf/home.webp', 'img/rf/fr-home.webp').replace('img/rf/board.webp', 'img/rf/fr-board.webp')
        open(os.path.join(d, 'source_fr.html'), 'w', encoding='utf-8').write(out)
        base, ext = os.path.splitext(j['out'])
        new_jobs.append(dict(j, id=j['id'] + '-FR', src=os.path.relpath(os.path.join(d, 'source_fr.html'), L), out=base + '_FR' + ext))
        # copy_fr.md
        md_p = os.path.join(d, 'copy.md')
        if os.path.exists(md_p):
            md = open(md_p, encoding='utf-8').read()
            for k in sorted(copy_texts(md), key=len, reverse=True):
                v = fr.get(k) or (substitute(k, fr) if substitute(k, fr) != k else None)
                if v:
                    md = md.replace(k, french_typo(v))
                else:
                    missing.add(k)
            pid = j['id']
            cap = fr_caption(pid)
            md = re.sub(r'(## Caption\n\n```text\n).*?(```)', lambda m: m.group(1) + cap + '\n' + m.group(2), md, flags=re.S) if cap else md
            md = (md.replace('## Slide text', '## Texte des pages').replace('## Caption', '## Légende').replace('## Alt text', '## Texte alternatif')
                    .replace('## Placeholders to fill', '## À remplir').replace('- Format:', '- Format :').replace('- Posting date:', '- Date de publication :')
                    .replace('- File:', '- Fichier :').replace('### Page ', '### Page ').replace('### Image', '### Image')
                    .replace('- Kicker:', '- Surtitre :').replace('- Headline:', '- Titre :').replace('- Body:', '- Texte :'))
            md = re.sub(r'`([^`]+)\.(pdf|png)`', r'`\1_FR.\2`', md, count=1)
            for k, v in sorted(NOTES.items(), key=lambda kv: len(kv[0]), reverse=True):
                md = md.replace(k, v)
            md = re.sub(r'(- Date de publication : )(.*)', lambda m: m.group(1) + fr_date(m.group(2)), md)
            open(os.path.join(d, 'copy_fr.md'), 'w', encoding='utf-8').write(md)
    json.dump(new_jobs, open(os.path.join(HERE, 'jobs.json'), 'w'), indent=1)
    print(len(new_jobs), 'jobs;', len(missing), 'units without a translation')
    real = [m for m in sorted(missing) if re.search(r'\b(the|and|of|to|your|with|what|is|in)\b', plain(m))]
    print(len(real), 'of them look English:')
    for m in real[:40]:
        print('  MISSING:', m[:110])


if __name__ == '__main__':
    {'extract': extract, 'build': build}[sys.argv[1]]()

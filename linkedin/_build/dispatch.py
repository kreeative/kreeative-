#!/usr/bin/env python3
"""Self-contained bundle so another Claude (e.g. Dispatch on Kee's computer) can schedule every post.

    python3 linkedin/_build/dispatch.py    # -> linkedin/_build/Kee-LinkedIn-Dispatch.zip (not committed)
"""
import csv, datetime as dt, json, os, re, shutil, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.dirname(HERE)
NAME = 'Kee-LinkedIn-Dispatch'
OUT = os.path.join(HERE, 'dispatch', NAME)
MONTHS = {'Nov': (2026, 11), 'Dec': (2026, 12), 'Jan': (2027, 1), 'Feb': (2027, 2)}
PH = re.compile(r'\[[A-Z][A-Z0-9_]+\]')


def parse_calendar(path):
    text = open(path, encoding='utf-8').read()
    posts = {}
    for block in re.split(r'\n(?=### )', text):
        m = re.match(r'### (M\d-\d+) · (.*?) · (\w+) · (EN|FR)\n(.*)', block, re.S)
        if not m:
            continue
        pid, date, fmt, lang, rest = m.groups()
        cap = re.search(r'```(?:text)?\n(.*?)```', rest, re.S)
        posts[pid] = {'date_label': date, 'format': fmt, 'title': rest[:cap.start()].strip() if cap else '',
                      'caption': cap.group(1).strip() if cap else ''}
    links = {}
    sec = text.split('## Links for the first comment')[-1] if 'Links for the first comment' in text else ''
    for line in sec.splitlines():
        if line.startswith('- ') and ':' in line:
            head, val = line[2:].split(':', 1)
            for pid in re.findall(r'M\d-\d+', head):
                links[pid] = val.strip()
    return posts, links


def iso_date(label):
    """'Mon Nov 17' -> 2026-11-17. 'Week of Dec 21' -> (None, '2026-12-21')."""
    m = re.search(r'(Nov|Dec|Jan|Feb) (\d+)', label)
    y, mo = MONTHS[m.group(1)]
    d = dt.date(y, mo, int(m.group(2))).isoformat()
    return (None, d) if label.startswith('Week of') else (d, None)


def copy_md_parts(path, fr):
    if not os.path.exists(path):
        return [], []
    md = open(path, encoding='utf-8').read()
    alt_h = '## Texte alternatif' if fr else '## Alt text'
    ph_h = '## À remplir' if fr else '## Placeholders to fill'
    alt = []
    if alt_h in md:
        sec = md.split(alt_h, 1)[1].split('\n## ', 1)[0]
        alt = [re.sub(r'^- (?:Page \d+ ?: |Image ?: )?', '', l).strip() for l in sec.splitlines() if l.startswith('- ')]
    phs = []
    if ph_h in md:
        sec = md.split(ph_h, 1)[1].split('\n## ', 1)[0]
        phs = sorted(set(PH.findall(sec)))
    return alt, phs


def build():
    shutil.rmtree(os.path.join(HERE, 'dispatch'), ignore_errors=True)
    os.makedirs(OUT)
    jobs = {j['id']: j for j in json.load(open(os.path.join(HERE, 'jobs.json')))}
    en, links = parse_calendar(os.path.join(L, 'CALENDAR.md'))
    fr, _ = parse_calendar(os.path.join(L, 'CALENDAR_FR.md'))
    rows = []
    for pid in en:
        date, week = iso_date(en[pid]['date_label'])
        for lang, cal in (('EN', en), ('FR', fr)):
            p = cal[pid]
            job = jobs.get(pid + ('-FR' if lang == 'FR' else ''))
            media, alt, vis_ph = [], [], []
            if job:
                src = os.path.join(L, job['out'])
                dest = f'media/{lang}/{pid}_{lang}{os.path.splitext(src)[1]}'
                os.makedirs(os.path.join(OUT, 'media', lang), exist_ok=True)
                shutil.copy(src, os.path.join(OUT, dest))
                media.append(dest)
                alt, vis_ph = copy_md_parts(os.path.join(os.path.dirname(src), 'copy_fr.md' if lang == 'FR' else 'copy.md'), lang == 'FR')
            cap_ph = sorted(set(PH.findall(p['caption'])))
            os.makedirs(os.path.join(OUT, 'captions', lang), exist_ok=True)
            cap_file = f'captions/{lang}/{pid}_{lang}.txt'
            open(os.path.join(OUT, cap_file), 'w', encoding='utf-8').write(p['caption'] + '\n')
            fmt = en[pid]['format']
            blocked = []
            if cap_ph or vis_ph:
                blocked.append('placeholders')
            if fmt == 'PHOTO':
                blocked.append('needs_kee_photo')
            if week:
                blocked.append('needs_exact_date')
            note = None
            wd = re.match(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ', en[pid]['date_label'])
            if date and wd:
                real = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dt.date.fromisoformat(date).weekday()]
                if real != wd.group(1):
                    blocked.append('date_conflict')
                    note = f"The calendar says {en[pid]['date_label']}, but {date} is a {real}. Ask Kee which one she wants."
            rows.append({
                'id': pid, 'lang': lang, 'date': date, 'week_of': week, 'date_label': p['date_label'],
                'format': fmt, 'linkedin_post_type': {'TEXT': 'text', 'PHOTO': 'image or video from Kee',
                                                      'IMAGE': 'image', 'CAROUSEL': 'document (PDF)'}[fmt],
                'title': p['title'], 'caption_file': cap_file, 'caption': p['caption'],
                'media': media, 'alt_text': alt, 'document_title': p['title'] if fmt == 'CAROUSEL' else None,
                'first_comment': links.get(pid), 'placeholders_in_caption': cap_ph, 'placeholders_in_visual': vis_ph,
                'ready_to_schedule': not blocked, 'blocked_by': blocked, 'date_note': note,
            })
    # profile assets
    os.makedirs(os.path.join(OUT, 'profile'), exist_ok=True)
    for pid in ['P-01', 'P-02', 'P-03', 'P-04', 'P-05']:
        for suffix, lang in (('', 'EN'), ('-FR', 'FR')):
            src = os.path.join(L, jobs[pid + suffix]['out'])
            shutil.copy(src, os.path.join(OUT, 'profile', os.path.basename(src)))
    json.dump({'timezone': 'America/Toronto', 'posting_time': None, 'posts': rows},
              open(os.path.join(OUT, 'posts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'posts.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['id', 'lang', 'date', 'week_of', 'format', 'title', 'caption_file', 'media', 'first_comment', 'ready_to_schedule', 'blocked_by', 'placeholders'])
        for r in rows:
            w.writerow([r['id'], r['lang'], r['date'] or '', r['week_of'] or '', r['format'], r['title'], r['caption_file'],
                        ' '.join(r['media']), r['first_comment'] or '', 'yes' if r['ready_to_schedule'] else 'no',
                        ' '.join(r['blocked_by']), ' '.join(r['placeholders_in_caption'] + r['placeholders_in_visual'])])
    shutil.copy(os.path.join(HERE, 'DISPATCH_README.md'), os.path.join(OUT, 'LIS-MOI_POUR_CLAUDE.md'))
    zp = os.path.join(HERE, NAME + '.zip')
    if os.path.exists(zp):
        os.remove(zp)
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(OUT):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                z.write(full, os.path.relpath(full, os.path.dirname(OUT)))
    ready = [r for r in rows if r['ready_to_schedule']]
    print(len(rows), 'post versions;', len(ready), 'ready;', zp, round(os.path.getsize(zp) / 1e6, 1), 'MB')
    for r in rows:
        if r['lang'] == 'EN':
            print(f"  {r['id']} {r['date'] or 'week ' + r['week_of']} {r['format']:8} {'READY' if r['ready_to_schedule'] else 'blocked: ' + ', '.join(r['blocked_by'])} {' '.join(r['placeholders_in_caption'] + r['placeholders_in_visual'])}")


if __name__ == '__main__':
    build()

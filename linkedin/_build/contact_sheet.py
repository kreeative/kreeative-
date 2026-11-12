#!/usr/bin/env python3
"""Builds ../CONTACT_SHEET.png from _build/previews: one row per design, every page as a thumbnail."""
import glob, json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.dirname(HERE)
jobs = json.load(open(os.path.join(HERE, 'jobs.json')))
TH, PAD, LABEL_W, GAP = 300, 28, 300, 12
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
    Fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
except OSError:
    F = Fs = ImageFont.load_default()

rows = []
for j in jobs:
    thumbs = []
    for f in sorted(glob.glob(os.path.join(HERE, 'previews', f"{j['id']}_*.png"))):
        im = Image.open(f).convert('RGB')
        thumbs.append(im.resize((round(im.width * TH / im.height), TH), Image.LANCZOS))
    rows.append((j, thumbs))

W = min(max(LABEL_W + sum(t.width + GAP for t in th) for _, th in rows) + PAD * 2, 4300)
H = PAD + 60 + len(rows) * (TH + PAD)
sheet = Image.new('RGB', (W, H), (253, 251, 247))
d = ImageDraw.Draw(sheet)
d.text((PAD, PAD), 'Kee · LinkedIn designs · contact sheet', fill=(50, 28, 20), font=F)
y = PAD + 60
for j, th in rows:
    name = os.path.basename(j['out'])[len(j['id']) + 1:].rsplit('.', 1)[0]
    d.text((PAD, y + 10), j['id'], fill=(255, 0, 144), font=F)
    d.text((PAD, y + 50), name[:24], fill=(50, 28, 20), font=Fs)
    d.text((PAD, y + 80), f"{j['kind'].upper()} · {len(th)} p.", fill=(120, 100, 90), font=Fs)
    x = PAD + LABEL_W
    for t in th:
        if x + t.width > W - PAD:
            break
        sheet.paste(t, (x, y))
        d.rectangle([x, y, x + t.width - 1, y + TH - 1], outline=(220, 210, 200))
        x += t.width + GAP
    y += TH + PAD
sheet.save(os.path.join(L, 'CONTACT_SHEET.png'), optimize=True)
print('contact sheet', sheet.size)

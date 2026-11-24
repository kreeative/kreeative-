'use client';

import { ColorField } from '@/components/ui/ColorField';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { LinkPicker } from './Extras';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { bandOf, categoriesOf, hiddenItems, hiddenLabel, imageFrame, linkLabel, linkOk, sectionHidden, sectionSource, withBand, withSectionHidden, withSectionSource, sectionLook, siteValue, textLook, withImageFrame, withSectionLook, withSiteEdit, withSlot, withTextLook, type SiteMap, type SiteSection, type TextLook, photoTarget } from '@/lib/models';
import type { Fiche } from '@/lib/stores';
import styles from './mobile.module.css';

/* The editor on a phone, in the manner of a touch editor: a thin bar on top, HER site on the whole screen, and one
   bar of tools at the bottom. Nothing is chosen: the bar offers the site's tools (sections, pages, style, model,
   add). She touches a text, a picture or a button: the site frames it in blue and the bar becomes the tools of
   that element, ending with ✓. A tool that needs room opens a small drawer just above the bar; the site stays
   visible. The bar is fixed to the bottom and rises with the keyboard. */

export interface MobileEditorProps {
  published: boolean;
  pages: { path: string; name: string }[];
  path: string;
  goPage: (p: string) => void;
  canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void;
  busy: boolean; dirty: boolean; save: (publish: boolean) => void;
  /** leaves the editor: asks first when changes are not saved */
  onLeave: (href: string) => void;
  site: string;
  frame: RefObject<HTMLIFrameElement | null>;
  map: SiteMap | null;
  sections: SiteSection[];
  draft: Fiche;
  change: (f: (d: Fiche) => Fiche, tag?: string) => void;
  moveSection: (n: number, to: number) => void;
  sel: string; setSel: (key: string) => void;
  onHelp: () => void;
  hideHint?: boolean;
  userId: string;
  modelName: string;
  booking: boolean;
  children?: ReactNode;
}

type Tool = '' | 'sections' | 'pages' | 'style' | 'theme' | 'add' | 'edit' | 'font' | 'size' | 'color' | 'align' | 'link' | 'frame' | 'bg' | 'space' | 'product' | 'band' | 'bandLook' | 'imgLink' | 'source';
const FONTS: [TextLook['font'] | undefined, string][] = [[undefined, 'Modèle'], ['serif', 'Classique'], ['sans', 'Moderne'], ['mono', 'Machine']];
const ALIGN: ['left' | 'center' | 'right' | undefined, string][] = [[undefined, 'Modèle'], ['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']];
const SPOTS = [0, 50, 100];
// the words under the icons stay short, so every tool is read whole; the full name is what a screen reader says
const SHORT: Record<string, string> = { 'Modifier le texte': 'Modifier', 'Remplacer la photo': 'Remplacer', 'Ajuster / Cadre': 'Cadrer', Alignement: 'Aligner' };
const px = (v: string, max: number): number | undefined => (v.trim() === '' ? undefined : Math.min(max, Number(v.replace(/\D/g, '')) || 0));

export function MobileEditor(p: MobileEditorProps) {
  const { draft, map, sections, sel, setSel, change } = p;
  const [tool, setTool] = useState<Tool>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const item = sel && map ? map.items.find((x) => x.key === sel) : undefined;
  const section = sel && !item ? sections.find((s) => s.key === sel) : undefined;
  const isButton = !!item && item.kind === 't' && (item.tag === 'a' || item.tag === 'button');
  const mode = item ? (item.kind === 'm' ? 'band' : item.kind === 'i' ? 'image' : item.kind === 'p' ? 'product' : item.kind === 's' ? 'services' : isButton ? 'button' : 'text') : section ? 'section' : 'site';
  // another element, or none: the drawer of the one before is put away
  useEffect(() => { setTool(''); setError(''); }, [sel]);

  // the keyboard: the bar and its drawer rise by what it covers, so they are never hidden under it
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => root.current?.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    on(); vv.addEventListener('resize', on); vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);

  const flip = (t: Tool) => setTool((now) => (now === t ? '' : t));
  const done = () => { setTool(''); setSel(''); };

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !item) return;
    setUploading(true); setError('');
    const r = await uploadPhoto(f, p.userId);
    setUploading(false);
    if (!r.ok) { setError(UPLOAD_ERROR[r.error]); return; }
    change((d) => withSiteEdit(d, 'i', item.key, r.url));
  }

  // the product a case shows (hers, chosen for the case, or the one of the same number); none: the model's demo
  const slotsNow = ((draft.store?.slots ?? {}) as Record<string, string>);
  const productsNow = Array.isArray(draft.products) ? draft.products : [];
  const shown = item && item.kind === 'p' ? productsNow.find((x) => x.id === (slotsNow[item.ref] ?? item.ref)) : undefined;
  const linkOf = item ? (item.kind === 'i' ? siteValue(draft, 'l', item.key.replace('|i|', '|l|')) : siteValue(draft, 'k', item.key)) ?? '' : '';
  const linked = item && linkOf ? (item.kind === 'i' ? (linkOf.startsWith('c:') ? `Catégorie ${linkOf.slice(2)}` : linkLabel(linkOf, draft, p.pages)) : linkLabel(linkOf, draft, p.pages)) : '';
  const cases = section && map ? map.items.filter((x) => x.kind === 'p' && x.sec === section.n) : [];

  /* ---------------------------------------------------------------- the tools of what is chosen */
  const tools: { id: string; label: string; icon: IconName; on?: boolean; open?: Tool; act?: () => void }[] = [];
  if (mode === 'site') {
    tools.push({ id: 'sections', label: 'Sections', icon: 'layers', open: 'sections' }, { id: 'pages', label: 'Pages', icon: 'pages', open: 'pages' },
      { id: 'style', label: 'Style', icon: 'brush', open: 'style' }, { id: 'theme', label: 'Thème', icon: 'template', open: 'theme' }, { id: 'add', label: 'Ajouter', icon: 'plus', open: 'add' });
  } else if (item && (mode === 'text' || mode === 'button')) {
    const kind = item.kind === 'c' ? 'c' : 't', look = textLook(draft, item.key);
    const set = (patch: TextLook, tag: string) => change((d) => withTextLook(d, item.key, patch), `x:${item.key}:${tag}`);
    tools.push({ id: 'edit', label: mode === 'button' ? 'Texte' : 'Modifier le texte', icon: 'edit', open: 'edit' });
    if (item.tag === 'a' && kind === 't') tools.push({ id: 'link', label: 'Lier à…', icon: 'link', open: 'link' });
    if (mode === 'text') tools.push({ id: 'font', label: 'Police', icon: 'text', open: 'font' }, { id: 'size', label: 'Taille', icon: 'textSize', open: 'size' });
    tools.push({ id: 'color', label: 'Couleur', icon: 'drop', open: 'color' });
    if (mode === 'text') tools.push({ id: 'bold', label: 'Gras', icon: 'bold', on: look.bold === true, act: () => set({ bold: look.bold ? undefined : true }, 'bold') }, { id: 'align', label: 'Alignement', icon: 'alignText', open: 'align' });
    tools.push({ id: 'hide', label: look.hide ? 'Afficher' : 'Masquer', icon: look.hide ? 'eye' : 'eyeOff', on: look.hide === true, act: () => { set({ hide: look.hide ? undefined : true }, 'hide'); if (!look.hide) done(); } });
  } else if (item && mode === 'image') {
    const fr = imageFrame(draft, item.key);
    tools.push({ id: 'replace', label: 'Remplacer la photo', icon: 'image', act: () => file.current?.click() }, { id: 'frame', label: 'Ajuster / Cadre', icon: 'crop', open: 'frame' },
      { id: 'hide', label: fr.hide ? 'Remettre' : 'Supprimer', icon: fr.hide ? 'eye' : 'trash', on: fr.hide === true, act: () => { change((d) => withImageFrame(d, item.key, { hide: fr.hide ? undefined : true })); if (!fr.hide) done(); } });
    if (item.link) tools.splice(1, 0, { id: 'imgLink', label: 'Associer', icon: 'link', open: 'imgLink' });
  } else if (item && mode === 'band') {
    const b = bandOf(draft, item.key);
    tools.push({ id: 'band', label: 'Modifier le texte', icon: 'edit', open: 'band' }, { id: 'bandLook', label: 'Couleurs', icon: 'drop', open: 'bandLook' },
      { id: 'speed', label: b.speed === 'slow' ? 'Lente' : b.speed === 'fast' ? 'Rapide' : 'Vitesse', icon: 'chart', act: () => change((d) => withBand(d, item.key, { speed: b.speed === undefined ? 'fast' : b.speed === 'fast' ? 'slow' : undefined })) },
      { id: 'hide', label: 'Masquer', icon: 'eyeOff', act: () => { change((d) => withBand(d, item.key, { hide: true })); done(); } });
  } else if (item && mode === 'product') {
    tools.push({ id: 'product', label: 'Produit', icon: 'tag', open: 'product' });
    tools.push({ id: 'hide', label: 'Masquer', icon: 'eyeOff', act: () => { change((d) => withSlot(d, item.ref, '-')); done(); } });
  } else if (section) {
    const off = sectionHidden(draft, section);
    const movable = sections.filter((s) => !s.fixed), at = movable.findIndex((s) => s.n === section.n);
    if (cases.length) tools.push({ id: 'source', label: 'Produits', icon: 'tag', open: 'source' });
    tools.push({ id: 'bg', label: 'Couleur', icon: 'drop', open: 'bg' }, { id: 'space', label: 'Espaces', icon: 'alignText', open: 'space' });
    if (!section.fixed) {
      tools.push({ id: 'hide', label: off ? 'Afficher' : 'Masquer', icon: off ? 'eye' : 'eyeOff', on: off, act: () => { change((d) => withSectionHidden(d, section, !off)); if (!off) done(); } });
      if (at > 0) tools.push({ id: 'up', label: 'Monter', icon: 'up', act: () => p.moveSection(section.n, at - 1) });
      if (at >= 0 && at < movable.length - 1) tools.push({ id: 'down', label: 'Descendre', icon: 'downArrow', act: () => p.moveSection(section.n, at + 1) });
    }
  }

  /* ---------------------------------------------------------------- the drawer of the open tool */
  let drawer: { title: string; body: ReactNode } | null = null;
  if (tool === 'sections') {
    const movable = sections.filter((s) => !s.fixed);
    drawer = { title: 'Sections', body: map ? (
      <ol className={styles.rows}>
        {sections.map((s) => {
          const off = sectionHidden(draft, s), at = movable.findIndex((x) => x.n === s.n);
          return (
            <li key={s.key} className={styles.row} data-off={off ? '' : undefined}>
              <button type="button" className={styles.rowMain} onClick={() => setSel(s.key)}>{s.name}</button>
              {s.fixed ? null : <>
                <button type="button" className={styles.mini} disabled={at <= 0} onClick={() => p.moveSection(s.n, at - 1)} aria-label={`Monter ${s.name}`}><Icon name="up" size={16} /></button>
                <button type="button" className={styles.mini} disabled={at >= movable.length - 1} onClick={() => p.moveSection(s.n, at + 1)} aria-label={`Descendre ${s.name}`}><Icon name="downArrow" size={16} /></button>
                <button type="button" className={styles.mini} aria-pressed={!off} onClick={() => change((d) => withSectionHidden(d, s, !off))} aria-label={off ? `Afficher ${s.name}` : `Masquer ${s.name}`}><Icon name={off ? 'eyeOff' : 'eye'} size={16} /></button>
              </>}
            </li>
          );
        })}
      </ol>
    ) : <CloudLoader label="Chargement de votre modèle…" /> };
  } else if (tool === 'pages') {
    drawer = { title: 'Pages', body: (
      <ol className={styles.rows}>
        {p.pages.map((pg) => <li key={pg.path} className={styles.row}><button type="button" className={styles.rowMain} aria-current={pg.path === p.path ? 'page' : undefined} onClick={() => { p.goPage(pg.path); setTool(''); }}>{pg.name}</button>{pg.path === p.path ? <Icon name="check" size={16} /> : null}</li>)}
      </ol>
    ) };
  } else if (tool === 'style') {
    const font = ((draft.store?.site as { g?: { font?: string } } | undefined)?.g?.font) as TextLook['font'] | undefined;
    const setFont = (f: TextLook['font'] | undefined) => change((d) => {
      const st = { ...(d.store ?? {}) } as Record<string, unknown>, site = { ...((st.site as Record<string, unknown> | undefined) ?? {}) };
      if (f) site.g = { font: f }; else delete site.g;
      if (Object.keys(site).length) st.site = site; else delete st.site;
      return { ...d, store: st };
    });
    drawer = { title: 'Style du site', body: <>
      <span className={styles.caption} id="m-font">Police des textes</span>
      <div className={styles.segments} role="group" aria-labelledby="m-font">{FONTS.map(([v, label]) => <button key={label} type="button" aria-pressed={font === v} onClick={() => setFont(v)}>{label}</button>)}</div>
      <p className={styles.hint}>Pour le fond ou les espaces d’une partie du site, ouvrez <b>Sections</b> et choisissez-la.</p>
      <a className={styles.linkRow} href="/admin/branding/"><Icon name="brush" size={18} /><span>Logo, couleurs et boutons de la marque</span><Icon name="chevron" size={14} /></a>
    </> };
  } else if (tool === 'theme') {
    drawer = { title: 'Thème', body: <>
      <p className={styles.hint}>Votre site utilise le modèle <b>{p.modelName}</b>. Vos textes et vos photos sont gardés pour chaque modèle.</p>
      <a className={styles.linkRow} href="/admin/branding/"><Icon name="brush" size={18} /><span>Logo, couleurs et boutons de la marque</span><Icon name="chevron" size={14} /></a>
      <a className={styles.linkRow} href="/admin/modeles/"><Icon name="template" size={18} /><span>Changer de modèle</span><Icon name="chevron" size={14} /></a>
    </> };
  } else if (tool === 'add') {
    const hiddenSecs = sections.filter((s) => sectionHidden(draft, s)), hiddenBits = hiddenItems(draft, map);
    drawer = { title: 'Ajouter', body: <>
      <a className={styles.linkRow} href={p.booking ? '/admin/prestations/' : '/admin/produits/'}><Icon name={p.booking ? 'receipt' : 'tag'} size={18} /><span>{p.booking ? 'Une prestation' : 'Un produit'}</span><Icon name="chevron" size={14} /></a>
      {hiddenSecs.map((s) => <button key={s.key} type="button" className={styles.linkRow} onClick={() => change((d) => withSectionHidden(d, s, false))}><Icon name="eye" size={18} /><span>Remettre « {s.name} »</span></button>)}
      {hiddenBits.map((x) => <button key={x.key} type="button" className={styles.linkRow} onClick={() => change((d) => (x.kind === 'm' ? withBand(d, x.key, { hide: undefined }) : x.kind === 'i' ? withImageFrame(d, x.key, { hide: undefined }) : withTextLook(d, x.key, { hide: undefined })))}><Icon name="eye" size={18} /><span>Remettre {hiddenLabel(x)}</span></button>)}
      <p className={styles.hint}>Les sections viennent de votre modèle : vous pouvez les masquer, les remettre et changer leur ordre.</p>
    </> };
  } else if (item && tool === 'band') {
    const b = bandOf(draft, item.key);
    drawer = { title: 'Bandeau défilant', body: <>
      <TextArea label="Texte qui défile" rows={3} maxLength={600} value={b.text ?? item.text} autoFocus onChange={(e) => change((d) => withBand(d, item.key, { text: e.target.value.trim() ? e.target.value : undefined }), `m:${item.key}`)} />
      <p className={styles.hint}>Écrivez tout le texte une seule fois. Séparez vos messages par <b>•</b> : il défile en boucle.</p>
      {b.text !== undefined ? <button type="button" className={styles.reset} onClick={() => change((d) => withBand(d, item.key, { text: undefined }))}>Remettre le texte du modèle</button> : null}
    </> };
  } else if (item && tool === 'bandLook') {
    const b = bandOf(draft, item.key);
    drawer = { title: 'Couleurs du bandeau', body: <>
      <ColorField label="Couleur du bandeau" value={b.bg ?? ''} onChange={(v) => change((d) => withBand(d, item.key, { bg: v }))} />
      <ColorField label="Couleur du texte du bandeau" value={b.color ?? ''} onChange={(v) => change((d) => withBand(d, item.key, { color: v }))} />
    </> };
  } else if (item && tool === 'edit') {
    const kind = item.kind === 'c' ? 'c' : 't', own = siteValue(draft, kind, item.key), value = own ?? item.text;
    const set = (v: string) => change((d) => withSiteEdit(d, kind, item.key, v.trim() ? v : null), `${kind}:${item.key}`);
    drawer = { title: item.role, body: <>
      {item.long ? <TextArea label="Texte" rows={3} maxLength={800} value={value} onChange={(e) => set(e.target.value)} autoFocus />
        : <Field label="Texte" maxLength={200} value={value} onChange={(e) => set(e.target.value)} autoFocus />}
      {own !== undefined ? <button type="button" className={styles.reset} onClick={() => change((d) => withSiteEdit(d, kind, item.key, null))}>Remettre le texte du modèle</button> : null}
    </> };
  } else if (item && tool === 'link') {
    const own = siteValue(draft, 'k', item.key), value = own ?? '';
    drawer = { title: 'Lier à…', body: <>
      {linked ? <p className={styles.badge}><Icon name="link" size={14} />Lié à : {linked}</p> : null}
      <LinkPicker key={item.key} value={value} fiche={draft} pages={p.pages} onChange={(v) => change((d) => withSiteEdit(d, 'k', item.key, v), `k:${item.key}`)} />
    </> };
  } else if (item && tool === 'imgLink') {
    const lk = item.key.replace('|i|', '|l|'), now = siteValue(draft, 'l', lk) ?? '', cats = categoriesOf(draft), prods = productsNow;
    const opts = ['Lien du modèle', ...cats.map((c) => `Catégorie ${c}`), ...prods.map((x) => `Produit ${x.name || x.id}`)];
    const cur = now.startsWith('c:') ? `Catégorie ${now.slice(2)}` : now.startsWith('p:') ? `Produit ${prods.find((x) => x.id === now.slice(2))?.name ?? ''}` : 'Lien du modèle';
    const tg = p.map ? photoTarget(draft, item, p.map.items) : null;
    drawer = { title: 'Associer à une catégorie / un produit', body: <>
      {tg ? <p className={styles.badge}><Icon name="link" size={14} />{tg.who} → {tg.to}{tg.own ? '' : ' (modèle)'}</p> : null}
      <Select label="Associer à" options={opts} value={cur} onChange={(e) => { const v = e.target.value; const c = cats.find((x) => `Catégorie ${x}` === v), pr = prods.find((x) => `Produit ${x.name || x.id}` === v); change((d) => withSiteEdit(d, 'l', lk, c ? `c:${c}` : pr ? `p:${pr.id}` : null)); }} />
      {!cats.length && !prods.length ? <p className={styles.hint}>Ajoutez des produits avec une catégorie pour les lier ici.</p> : null}
    </> };
  } else if (section && tool === 'source') {
    const cats = categoriesOf(draft), now = sectionSource(draft, section.key);
    drawer = { title: 'Produits de cette section', body: <>
      {now ? <p className={styles.badge}><Icon name="link" size={14} />Lié à : Catégorie {now}</p> : null}
      <Select label="Afficher" options={['Ma sélection, case par case', ...cats.map((c) => `Catégorie ${c}`)]} value={now ? `Catégorie ${now}` : 'Ma sélection, case par case'}
        onChange={(e) => change((d) => withSectionSource(d, section.key, cats.find((c) => `Catégorie ${c}` === e.target.value) ?? ''))} />
      <p className={styles.hint}>{now ? 'Les produits de cette catégorie s’affichent d’eux-mêmes, et les nouveaux aussi.' : 'Touchez une case pour choisir son produit.'}</p>
    </> };
  } else if (item && tool === 'font') {
    const look = textLook(draft, item.key);
    drawer = { title: 'Police', body: <div className={styles.segments} role="group" aria-label="Police">{FONTS.map(([v, label]) => <button key={label} type="button" aria-pressed={look.font === v} onClick={() => change((d) => withTextLook(d, item.key, { font: v }))}>{label}</button>)}</div> };
  } else if (item && tool === 'size') {
    const look = textLook(draft, item.key), now = look.size ?? (item.size || 16);
    const set = (n: number | undefined) => change((d) => withTextLook(d, item.key, { size: n }), `x:${item.key}:size`);
    drawer = { title: 'Taille', body: <>
      <div className={styles.stepper} role="group" aria-label="Taille du texte">
        <button type="button" className={styles.step} disabled={now <= 8} onClick={() => set(Math.max(8, now - 2))} aria-label="Plus petit"><span aria-hidden="true">−</span></button>
        <output className={styles.stepValue} aria-live="polite">{now} px</output>
        <button type="button" className={styles.step} disabled={now >= 160} onClick={() => set(Math.min(160, now + 2))} aria-label="Plus grand"><span aria-hidden="true">+</span></button>
      </div>
      {look.size !== undefined ? <button type="button" className={styles.reset} onClick={() => set(undefined)}>Remettre la taille du modèle</button> : null}
    </> };
  } else if (item && tool === 'color') {
    const look = textLook(draft, item.key);
    drawer = { title: 'Couleur', body: <ColorField label="Couleur du texte" value={look.color ?? ''} onChange={(v) => change((d) => withTextLook(d, item.key, { color: v }))} /> };
  } else if (item && tool === 'align') {
    const look = textLook(draft, item.key);
    drawer = { title: 'Alignement', body: <div className={styles.segments} role="group" aria-label="Alignement">{ALIGN.map(([v, label]) => <button key={label} type="button" aria-pressed={look.align === v} onClick={() => change((d) => withTextLook(d, item.key, { align: v }))}>{label}</button>)}</div> };
  } else if (item && tool === 'frame') {
    const fr = imageFrame(draft, item.key);
    drawer = { title: 'Ajuster / Cadre', body: <>
      <div className={styles.segments} role="group" aria-label="Cadre">
        {([[undefined, 'Modèle'], ['cover', 'Remplir'], ['contain', 'Entière']] as const).map(([v, label]) => <button key={label} type="button" aria-pressed={fr.fit === v} onClick={() => change((d) => withImageFrame(d, item.key, { fit: v }))}>{label}</button>)}
      </div>
      <span className={styles.caption} id="m-spot">Partie de la photo gardée en vue</span>
      <div className={styles.spots} role="group" aria-labelledby="m-spot">
        {SPOTS.map((y) => SPOTS.map((x) => <button key={`${x}-${y}`} type="button" aria-pressed={(fr.x ?? 50) === x && (fr.y ?? 50) === y && (fr.x !== undefined || fr.y !== undefined)}
          onClick={() => change((d) => withImageFrame(d, item.key, { x, y }))} aria-label={`${['Haut', 'Milieu', 'Bas'][SPOTS.indexOf(y)]} ${['gauche', 'centre', 'droite'][SPOTS.indexOf(x)]}`} />))}
      </div>
      {fr.fit !== undefined || fr.x !== undefined || fr.y !== undefined ? <button type="button" className={styles.reset} onClick={() => change((d) => withImageFrame(d, item.key, { fit: undefined, x: undefined, y: undefined }))}>Remettre le cadre du modèle</button> : null}
    </> };
  } else if (item && tool === 'product') {
    const products = Array.isArray(draft.products) ? draft.products : [], slots = ((draft.store?.slots ?? {}) as Record<string, string>);
    const none = 'Masquer cette case', keep = 'Produit du modèle', now = slots[item.ref] ?? item.ref, mine = products.find((x) => x.id === now);
    drawer = { title: 'Produit de cette case', body: <>
      <p className={styles.badge}><Icon name="tag" size={14} />Cette carte → {now === '-' ? 'masquée' : mine ? `Produit ${mine.name || mine.id}` : 'Produit du modèle'}</p>
      <Select label="Produit" options={[...products.map((x) => x.name || x.id), ...(mine || now === '-' ? [] : [keep]), none]} value={now === '-' ? none : mine ? mine.name || mine.id : keep}
        onChange={(e) => change((d) => withSlot(d, item.ref, e.target.value === none ? '-' : products.find((x) => (x.name || x.id) === e.target.value)?.id ?? item.ref))} />
      <p className={styles.hint}>Vos produits se gèrent et se modifient dans <a href={mine ? `/admin/produits/?produit=${encodeURIComponent(mine.id)}` : '/admin/produits/'}><b>Produits</b></a>.</p>
    </> };
  } else if (section && tool === 'bg') {
    const look = sectionLook(draft, section.key);
    drawer = { title: 'Couleur du fond', body: <ColorField label="Fond de la section" value={look.bg ?? ''} onChange={(v) => change((d) => withSectionLook(d, section.key, { bg: v }))} /> };
  } else if (section && tool === 'space') {
    const look = sectionLook(draft, section.key);
    const set = (patch: Parameters<typeof withSectionLook>[2], tag: string) => change((d) => withSectionLook(d, section.key, patch), `look:${section.key}:${tag}`);
    drawer = { title: 'Espaces', body: <>
      <div className={styles.pair}>
        <Field label="Au-dessus (px)" inputMode="numeric" placeholder="Modèle" value={look.pt === undefined ? '' : String(look.pt)} onChange={(e) => set({ pt: px(e.target.value, 400) }, 'pt')} />
        <Field label="En dessous (px)" inputMode="numeric" placeholder="Modèle" value={look.pb === undefined ? '' : String(look.pb)} onChange={(e) => set({ pb: px(e.target.value, 400) }, 'pb')} />
      </div>
      <span className={styles.caption} id="m-salign">Alignement des textes</span>
      <div className={styles.segments} role="group" aria-labelledby="m-salign">{ALIGN.map(([v, label]) => <button key={label} type="button" aria-pressed={look.align === v} onClick={() => set({ align: v }, 'align')}>{label}</button>)}</div>
    </> };
  }

  const pageName = p.pages.find((x) => x.path === p.path)?.name ?? 'Accueil';
  const what = item ? (item.kind === 'm' ? 'Bandeau défilant' : item.kind === 'i' ? 'Photo' : item.kind === 'p' ? 'Produit' : item.kind === 's' ? 'Prestations' : isButton ? 'Bouton' : item.role) : section ? section.name : '';
  return (
    <div className={styles.editor} ref={root}>
      <header className={styles.top}>
        <div className={styles.side}>
          <a className={styles.icon} href="/admin/" aria-label="Retour au tableau de bord" onClick={(e) => { e.preventDefault(); p.onLeave('/admin/'); }}><Icon name="back" size={20} /></a>
          <button type="button" className={styles.icon} disabled={!p.canUndo} onClick={p.undo} aria-label="Annuler"><Icon name="undo" size={20} /></button>
          <button type="button" className={styles.icon} disabled={!p.canRedo} onClick={p.redo} aria-label="Rétablir" data-tour="history"><Icon name="redo" size={20} /></button>
          <button type="button" className={styles.icon} onClick={p.onHelp} aria-label="Revoir la visite de l’éditeur"><Icon name="info" size={20} /></button>
        </div>
        <div className={styles.side}>
          {p.pages.length > 1 ? <Menu label="Page" options={p.pages.map((x) => ({ value: x.path, label: x.name }))} value={p.path} onChange={p.goPage} /> : <span className={styles.onePage}>{pageName}</span>}
          <span data-tour="publish" style={{ display: 'inline-flex' }}><Button className={styles.publish} busy={p.busy} disabled={p.published && !p.dirty} onClick={() => p.save(true)}>Publier</Button></span>
        </div>
      </header>

      <div className={styles.stage}>
        <div className={styles.frame} data-tour="site"><iframe ref={p.frame} key={p.path} title="Votre site" src={p.site + p.path} /></div>
      </div>

      {!item && !section && !drawer && !p.hideHint ? <p className={styles.hint0} role="note">Touchez un texte, une image ou un bouton pour le modifier</p> : null}
      {linked && !drawer ? <p className={styles.chip}><Icon name="link" size={12} />Lié à : {linked}</p> : null}
      {drawer ? (
        <section className={styles.drawer} role="dialog" aria-label={drawer.title} key={tool}>
          <header className={styles.drawerHead}><h2>{drawer.title}</h2><button type="button" className={styles.icon} onClick={() => setTool('')} aria-label="Fermer"><Icon name="close" size={18} /></button></header>
          <div className={styles.drawerBody}>{drawer.body}</div>
        </section>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <nav className={styles.bar} data-tour="bar" aria-label={mode === 'site' ? 'Outils du site' : `Outils : ${what}`}>
        <div className={styles.tools} key={mode + (item?.key ?? section?.key ?? '')} data-context={mode === 'site' ? undefined : ''}>
          {mode === 'services' ? <p className={styles.barNote}>Vos prestations se gèrent dans <a href="/admin/prestations/"><b>Prestations</b></a>.</p> : null}
          {tools.map((t) => (
            <button key={t.id} type="button" className={styles.tool} aria-pressed={t.open ? tool === t.open : t.on} disabled={t.id === 'replace' && uploading}
              aria-label={t.label} onClick={() => { if (t.open) flip(t.open); else t.act?.(); }}>
              <Icon name={t.icon} size={18} /><span>{t.id === 'replace' && uploading ? 'Envoi…' : SHORT[t.label] ?? t.label}</span>
            </button>
          ))}
        </div>
        {mode === 'site' ? null : <button type="button" className={styles.ok} onClick={done} aria-label="Terminer"><Icon name="check" size={18} /></button>}
      </nav>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} aria-label="Choisir une photo" />
      {p.children}
    </div>
  );
}

/** A row of colours: the model's own first, then a few plain ones. */
/** Where a button of the site leads: an https address, an e-mail or a phone number. A wrong one is not kept. */
function LinkField({ value, model, onSet }: { value: string; model: string; onSet: (v: string | null) => void }) {
  const [text, setText] = useState(value);
  const bad = text.trim() !== '' && !linkOk(text.trim());
  return (
    <>
      <Field label="Adresse du lien" type="url" inputMode="url" autoCapitalize="none" placeholder="https://…" value={text} error={bad ? 'Une adresse qui commence par https://, mailto: ou tel:' : undefined}
        onChange={(e) => { const v = e.target.value; setText(v); if (v.trim() === '') onSet(null); else if (linkOk(v.trim())) onSet(v.trim()); }} />
      <p className={styles.hint}>{value ? 'Votre lien est en place.' : model && !model.startsWith('#') ? 'Ce bouton garde le lien du modèle.' : 'Ce bouton garde le lien du modèle (une partie de la page).'}</p>
      {value ? <button type="button" className={styles.reset} onClick={() => { setText(''); onSet(null); }}>Remettre le lien du modèle</button> : null}
    </>
  );
}

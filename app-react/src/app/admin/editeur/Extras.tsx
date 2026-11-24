'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { addedName, bandOf, categorySlug, linkLabel, linkOk, textLook, type Added, type Band, type SiteItem, type TextLook } from '@/lib/models';
import type { Fiche } from '@/lib/stores';
import styles from './editeur.module.css';

/* The parts of the inspector that several panels share: where a link goes, a colour (the theme's and a free one),
   a picture to import, the look of one text or button, and the content of a section she added herself. */

const HEX = /^#[0-9a-fA-F]{6}$/;
export const THEME: [string, string][] = [['', 'Modèle'], ['#111111', 'Noir'], ['#FFFFFF', 'Blanc'], ['#F5F5F3', 'Gris clair'], ['#FAF6EF', 'Crème'], ['#E8467C', 'Rose'], ['#1F9D62', 'Vert'], ['#1E6FE0', 'Bleu']];

/** A colour: the theme's swatches, then any colour by its code (#RRGGBB). */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string | undefined) => void }) {
  const [text, setText] = useState(value);
  const shown = value && !THEME.some(([v]) => v.toLowerCase() === value.toLowerCase()) ? value : '';
  return (
    <div className={styles.control}>
      <span className={styles.caption}>{label}</span>
      <div className={styles.swatches} role="group" aria-label={label}>
        {THEME.map(([v, name]) => <button key={name} type="button" aria-pressed={value.toLowerCase() === v.toLowerCase()} onClick={() => { setText(v); onChange(v || undefined); }} aria-label={name} title={name}><i style={v ? { background: v } : undefined} data-none={v ? undefined : ''} /></button>)}
      </div>
      <div className={styles.hex}>
        <i style={{ background: HEX.test(text) ? text : shown || 'transparent' }} aria-hidden="true" />
        <input aria-label={`${label} : code couleur`} placeholder="#RRGGBB" maxLength={7} value={text} spellCheck={false} autoCapitalize="none"
          onChange={(e) => { const v = e.target.value.trim(); setText(v); if (v === '') onChange(undefined); else if (HEX.test(v)) onChange(v.toUpperCase()); }} />
      </div>
    </div>
  );
}

type Dest = 'model' | 'page' | 'cat' | 'product' | 'out';
const DEST: [Dest, string][] = [['model', 'Lien du modèle'], ['page', 'Page'], ['cat', 'Collection'], ['product', 'Produit'], ['out', 'Lien externe']];
/** Where a button or a link leads: a page of her site, one of her categories, one of her products, or an address. */
export function LinkPicker({ value, fiche, pages, onChange }: { value: string; fiche: Fiche; pages: { path: string; name: string }[]; onChange: (v: string | null) => void }) {
  const products = Array.isArray(fiche.products) ? fiche.products : [];
  const cats = [...new Set(products.map((p) => String(p.category ?? '').trim()).filter(Boolean))];
  const shop = pages.find((p) => /boutique|catalogue/i.test(p.name))?.path ?? '';
  const kind: Dest = value.startsWith('p:') ? 'product' : value.startsWith('page:') ? (value.includes('#') ? 'cat' : 'page') : value ? 'out' : 'model';
  const [mode, setMode] = useState<Dest>(kind);
  const [out, setOut] = useState(kind === 'out' ? value : '');
  const pick = (m: Dest) => {
    setMode(m);
    if (m === 'model') onChange(null);
    else if (m === 'page') onChange(`page:${pages[0]?.path ?? ''}`);
    else if (m === 'cat') { if (cats[0]) onChange(`page:${shop}#${categorySlug(cats[0])}`); }
    else if (m === 'product') { if (products[0]) onChange(`p:${products[0].id}`); }
    else if (linkOk(out.trim())) onChange(out.trim());
  };
  const bad = mode === 'out' && out.trim() !== '' && !linkOk(out.trim());
  return (
    <div className={styles.link}>
      <Select label="Destination" options={DEST.map(([, l]) => l)} value={DEST.find(([m]) => m === mode)![1]} onChange={(e) => pick(DEST.find(([, l]) => l === e.target.value)![0])} />
      {mode === 'page' ? <Select label="Page" options={pages.map((p) => p.name)} value={pages.find((p) => `page:${p.path}` === value)?.name ?? pages[0]?.name ?? ''} onChange={(e) => onChange(`page:${pages.find((p) => p.name === e.target.value)?.path ?? ''}`)} /> : null}
      {mode === 'cat' ? (cats.length ? <Select label="Collection" options={cats} value={cats.find((c) => value.endsWith(`#${categorySlug(c)}`)) ?? cats[0]!} onChange={(e) => onChange(`page:${shop}#${categorySlug(e.target.value)}`)} /> : <p className={styles.hint}>Donnez une catégorie à vos produits pour en choisir une ici.</p>) : null}
      {mode === 'product' ? (products.length ? <Select label="Produit" options={products.map((p) => p.name || p.id)} value={(products.find((p) => `p:${p.id}` === value) ?? products[0]!).name || products[0]!.id} onChange={(e) => onChange(`p:${products.find((p) => (p.name || p.id) === e.target.value)?.id ?? ''}`)} /> : <p className={styles.hint}>Ajoutez d’abord un produit.</p>) : null}
      {mode === 'out' ? <Field label="Adresse" type="url" inputMode="url" autoCapitalize="none" placeholder="https://…" value={out} error={bad ? 'Commence par https://, mailto: ou tel:' : undefined}
        onChange={(e) => { const v = e.target.value; setOut(v); if (linkOk(v.trim())) onChange(v.trim()); else if (v.trim() === '') onChange(null); }} /> : null}
    </div>
  );
}

/** A picture to import or replace: its miniature, a plain name, « Importer » / « Remplacer », and a way back. */
export function PhotoField({ name, src, own, userId, onChange }: { name: string; src: string; own: boolean; userId: string; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    const r = await uploadPhoto(file, userId);
    setBusy(false);
    if (r.ok) onChange(r.url); else setError(UPLOAD_ERROR[r.error]);
  }
  return (
    <div className={styles.media}>
      <span className={styles.thumb}>{src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" /> : <Icon name="image" size={20} />}</span>
      <div className={styles.mediaBody}>
        <b>{name}</b>
        <div className={styles.mediaActs}>
          <Button className={styles.small} variant="secondary" busy={busy} onClick={() => input.current?.click()} aria-label={`${src ? 'Remplacer' : 'Importer'} : ${name}`}>{src ? 'Remplacer' : 'Importer'}</Button>
          {own ? <button type="button" className={styles.reset} onClick={() => onChange(null)} aria-label={`Retirer : ${name}`}>Retirer</button> : null}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} aria-label={`Choisir une image : ${name}`} />
      {error ? <p className={styles.mediaError} role="alert">{error}</p> : null}
    </div>
  );
}

/** The look of the text she is on: its colour, its size, bold, and for a button its shape and its destination. */
export function TextStyle({ item, fiche, pages, link, onLook, onLink }: {
  item: SiteItem; fiche: Fiche; pages: { path: string; name: string }[]; link: string;
  onLook: (patch: TextLook, tag: string) => void; onLink: (v: string | null) => void;
}) {
  const look = textLook(fiche, item.key), button = item.tag === 'a' || item.tag === 'button';
  const size = look.size ?? (item.size || 16);
  return (
    <section className={styles.block} aria-label="Style du texte choisi">
      <h3>{button ? 'Bouton choisi' : 'Texte choisi'}</h3>
      {item.tag === 'a' && link ? <p className={styles.linked}><Icon name="link" size={12} />Lié à : {linkLabel(link, fiche, pages)}</p> : null}
      {item.tag === 'a' ? <LinkPicker key={item.key} value={link} fiche={fiche} pages={pages} onChange={onLink} /> : null}
      <ColorField key={`c${item.key}`} label="Couleur du texte" value={look.color ?? ''} onChange={(v) => onLook({ color: v }, 'color')} />
      <div className={styles.pair}>
        <Field label={button ? 'Taille (px)' : 'Taille du titre (px)'} inputMode="numeric" value={String(size)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); onLook({ size: n >= 8 && n <= 160 ? n : undefined }, 'size'); }} />
        <div className={styles.control}>
          <span className={styles.caption}>Gras</span>
          <button type="button" role="switch" aria-checked={look.bold === true} aria-label="Texte en gras" className={styles.toggle} onClick={() => onLook({ bold: look.bold ? undefined : true }, 'bold')} />
        </div>
      </div>
      {button ? <>
        <div className={styles.control}>
          <span className={styles.caption} id="btn-style">Style du bouton</span>
          <div className={styles.segments} role="group" aria-labelledby="btn-style">
            {([[undefined, 'Modèle'], ['fill', 'Plein'], ['outline', 'Contour']] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={look.btn === v} onClick={() => onLook({ btn: v }, 'btn')}>{l}</button>)}
          </div>
        </div>
        <div className={styles.pair}>
          <div className={styles.control}>
            <span className={styles.caption}>Arrondi</span>
            <button type="button" role="switch" aria-checked={look.round === true} aria-label="Bouton arrondi" className={styles.toggle} onClick={() => onLook({ round: look.round ? undefined : true }, 'round')} />
          </div>
        </div>
        {look.btn === 'fill' ? <ColorField key={`f${item.key}`} label="Couleur du bouton" value={look.fill ?? ''} onChange={(v) => onLook({ fill: v }, 'fill')} /> : null}
      </> : null}
    </section>
  );
}

/** A section she added: its words, its picture, its button, its lines (reviews, questions). */
export function AddedInspector({ added, fiche, pages, userId, onChange }: { added: Added; fiche: Fiche; pages: { path: string; name: string }[]; userId: string; onChange: (patch: Partial<Added>, tag?: string) => void }) {
  const items = added.items ?? [];
  const setItem = (i: number, patch: Partial<{ a: string; b: string }>) => onChange({ items: items.map((x, n) => (n === i ? { ...x, ...patch } : x)) }, `items${i}`);
  const two = added.type === 'reviews' ? ['Prénom', 'Avis'] : ['Question', 'Réponse'];
  return (
    <div className={styles.inspector}>
      <h3 className={styles.group3}>{addedName(added)}</h3>
      <section className={styles.block} aria-label="Contenu">
        <Field label="Titre" maxLength={200} value={added.title ?? ''} onChange={(e) => onChange({ title: e.target.value }, 'title')} />
        {added.type === 'text' || added.type === 'image' || added.type === 'banner' ? <TextArea label="Texte" rows={4} maxLength={1200} value={added.body ?? ''} onChange={(e) => onChange({ body: e.target.value }, 'body')} /> : null}
        {added.type === 'image' || added.type === 'banner' ? <PhotoField name={added.type === 'banner' ? 'Image de fond' : 'Image'} src={added.img ?? ''} own={!!added.img} userId={userId} onChange={(v) => onChange({ img: v ?? undefined })} /> : null}
        {added.type === 'banner' ? <>
          <Field label="Texte du bouton" maxLength={60} value={added.cta ?? ''} onChange={(e) => onChange({ cta: e.target.value }, 'cta')} />
          <LinkPicker key={added.id} value={added.href ?? ''} fiche={fiche} pages={pages} onChange={(v) => onChange({ href: v ?? undefined })} />
        </> : null}
        {added.type === 'products' ? <p className={styles.hint}>Vos huit premiers produits s’affichent ici. Ils se gèrent dans <a href="/admin/produits/"><b>Produits</b></a>.</p> : null}
        {added.type === 'reviews' || added.type === 'faq' ? <>
          {items.map((it, i) => (
            <div key={i} className={styles.line}>
              <Field label={`${two[0]} ${i + 1}`} maxLength={160} value={it.a} onChange={(e) => setItem(i, { a: e.target.value })} />
              <TextArea label={`${two[1]} ${i + 1}`} rows={2} maxLength={800} value={it.b} onChange={(e) => setItem(i, { b: e.target.value })} />
              <button type="button" className={styles.reset} onClick={() => onChange({ items: items.filter((_, n) => n !== i) })}>Retirer cette ligne</button>
            </div>
          ))}
          {items.length < 8 ? <button type="button" className={styles.more} onClick={() => onChange({ items: [...items, { a: '', b: '' }] })}>Ajouter une ligne</button> : null}
        </> : null}
      </section>
    </div>
  );
}

const SPEED: [Band['speed'] | undefined, string][] = [['slow', 'Lente'], [undefined, 'Normale'], ['fast', 'Rapide']];
/** The scrolling band: ONE field for everything it says (messages separated by « • »), then its colours and speed. */
export function BandInspector({ item, fiche, onChange, focus }: { item: SiteItem; fiche: Fiche; onChange: (patch: Band, tag?: string) => void; focus?: boolean }) {
  const b = bandOf(fiche, item.key);
  return (
    <div className={styles.inspector}>
      <section className={styles.block} aria-label="Texte du bandeau">
        <TextArea label="Texte qui défile" rows={3} maxLength={600} value={b.text ?? item.text} autoFocus={focus} onChange={(e) => onChange({ text: e.target.value.trim() ? e.target.value : undefined }, 'text')} />
        <p className={styles.hint}>Écrivez tout le texte une seule fois. Séparez vos messages par <b>•</b> : il défile en boucle.</p>
        {b.text !== undefined ? <button type="button" className={styles.reset} onClick={() => onChange({ text: undefined })}>Remettre le texte du modèle</button> : null}
      </section>
      <section className={styles.block} aria-label="Apparence du bandeau">
        <ColorField key={`bg${item.key}`} label="Couleur du bandeau" value={b.bg ?? ''} onChange={(v) => onChange({ bg: v })} />
        <ColorField key={`fg${item.key}`} label="Couleur du texte" value={b.color ?? ''} onChange={(v) => onChange({ color: v })} />
        <div className={styles.control}>
          <span className={styles.caption} id="band-speed">Vitesse</span>
          <div className={styles.segments} role="group" aria-labelledby="band-speed">{SPEED.map(([v, l]) => <button key={l} type="button" aria-pressed={b.speed === v} onClick={() => onChange({ speed: v })}>{l}</button>)}</div>
        </div>
      </section>
    </div>
  );
}

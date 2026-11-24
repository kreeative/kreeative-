'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Check, Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { dollars, TISHE, tisheCall, tisheImg } from '@/lib/tishe';
import { TisheError, TisheGate, tisheSet, useTisheData } from './useTishe';
import styles from './tishe.module.css';

/* The catalogue of The Ivory Sukundu, kept on its site (action « store »: { doc: { products, discounts, … }, usage }).
   Every change is sent there and the site answers with the whole catalogue as it now is. */
export interface TxMedia { type?: string; url: string; previewUrl?: string; altText?: string | null }
export interface TxVariant { id: string; availableForSale?: boolean; price?: { CAD?: number | string; USD?: number | string }; compareAtPrice?: { CAD?: number | string; USD?: number | string } | null; selectedOptions?: { name: string; value: string }[] }
export interface TxProduct { id: string; handle: string; title: string; supplier?: string; descriptionHtml?: string; hidden?: boolean; media?: TxMedia[]; featuredImage?: { url: string; thumb?: string } | null; options?: { name: string; values?: string[] }[]; variants?: TxVariant[] }
export interface TxCode { code: string; kind: 'percent' | 'amount' | 'free_shipping'; percent?: number; amount?: { CAD: number; USD: number }; minSubtotal?: { CAD: number; USD: number }; label?: string; active?: boolean; startsAt?: string; endsAt?: string; firstOrderOnly?: boolean; returningOnly?: boolean; oncePerCustomer?: boolean }
export interface TxStore { doc: { products?: TxProduct[]; discounts?: TxCode[]; announcements?: string[]; sale?: { name?: string; banner?: string; endsAt?: string; handles?: string[] } | null; shipping?: Record<string, number>; [k: string]: unknown }; usage?: Record<string, number> }

export const useTxStore = () => useTisheData<TxStore>('store', 'store');
/** A change to the catalogue: sent to the site, the page then shows the site's answer. */
export async function saveTx(action: string, body: Record<string, unknown>, userId: string, now: TxStore | null): Promise<TxStore['doc']> {
  const j = await tisheCall<{ doc?: TxStore['doc'] }>(action, body, userId);
  if (j.doc && now) tisheSet('store', { ...now, doc: j.doc });
  return j.doc ?? now?.doc ?? {};
}

const num = (v: unknown) => { const x = Number(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
function priceRange(p: TxProduct): string {
  const v = (p.variants ?? []).map((x) => num(x.price?.CAD)).filter(Boolean);
  if (!v.length) return '';
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? dollars(lo) : `${dollars(lo)} – ${dollars(hi)}`;
}

/** Produits of The Ivory Sukundu: its hair, in the order of the shop (up / down); one opens in the side panel. */
export function TisheProducts() { return <TisheGate title="Produits"><Products /></TisheGate>; }
function Products() {
  const { account } = useAdmin();
  const { data, error, reload } = useTxStore();
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [moving, setMoving] = useState('');
  if (error && !data) return <TisheError title="Produits" error={error} retry={reload} />;
  if (!data) return <><PageHead title="Produits" /><CloudLoader /></>;
  const list = data.doc.products ?? [];
  async function move(id: string, dir: 'up' | 'down') {
    setMoving(id + dir);
    try { await saveTx('moveProduct', { id, direction: dir }, account.userId, data); setToast('Ordre enregistré.'); } catch (e) { setToast((e as Error).message); }
    setMoving('');
  }
  return (
    <>
      <PageHead title="Produits" sub={`${plural(list.length, 'produit', 'produits')}. Prix en dollars canadiens ; chaque produit a aussi son prix en dollars américains.`}
        action={<Button icon="plus" onClick={() => setOpen('nouveau')}>Nouveau produit</Button>} />
      <div className={styles.page}>
        <section className={styles.card}>
          <ul className={styles.plist}>
            {list.map((p, i) => (
              <li key={p.id}>
                <button type="button" className={styles.prow} onClick={() => setOpen(p.handle)}>
                  <span className={styles.pthumb}>{p.featuredImage ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={tisheImg(p.featuredImage.thumb || p.featuredImage.url)} alt="" /> : <Icon name="image" size={18} />}</span>
                  <span className={styles.pmain}><b>{p.title}</b><small>{plural((p.variants ?? []).length, 'option', 'options')}{p.hidden ? ' · Masqué' : ''}</small></span>
                  <span className={styles.amount}>{priceRange(p)}</span>
                </button>
                <span className={styles.updown}>
                  <button type="button" aria-label={`Monter ${p.title}`} disabled={!i || !!moving} onClick={() => void move(p.id, 'up')}><Icon name="up" size={16} /></button>
                  <button type="button" aria-label={`Descendre ${p.title}`} disabled={i === list.length - 1 || !!moving} onClick={() => void move(p.id, 'down')}><Icon name="downArrow" size={16} /></button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {open ? <ProductSheet key={open} handle={open} store={data} onClose={() => setOpen(null)} onSaved={(msg, h) => { setToast(msg); setOpen(h); }} /> : null}
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </>
  );
}

interface Row { id: string; opt: string; cad: string; usd: string; was: string; on: boolean }
const SUPPLIERS: [string, string][] = [['nine', 'Nine ISEE (Inde)'], ['evelyn', 'Evelyn Thanh An Hair (Vietnam)']];
// a phone photo becomes a 1600 px copy and a 640 px one before it leaves (as the store's own dashboard does)
function toJpeg(img: ImageBitmap, w: number, q: number): string {
  const s = Math.min(1, w / img.width), c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
const plain = (html: string) => String(html || '').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<\/li>\s*<li>/g, '\n• ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function ProductSheet({ handle, store, onClose, onSaved }: { handle: string; store: TxStore; onClose: () => void; onSaved: (msg: string, handle: string | null) => void }) {
  const { account } = useAdmin();
  const isNew = handle === 'nouveau';
  const p: TxProduct | undefined = isNew ? { id: '', handle: '', title: '', supplier: 'nine', descriptionHtml: '', media: [], options: [{ name: 'Length' }], variants: [] } : (store.doc.products ?? []).find((x) => x.handle === handle || x.id === handle);
  const names0 = (p?.options ?? []).map((o) => o.name).filter((n) => n !== 'Title');
  const [title, setTitle] = useState(p?.title ?? '');
  const desc0 = plain(p?.descriptionHtml ?? '');
  const [desc, setDesc] = useState(desc0);
  const [supplier, setSupplier] = useState(p?.supplier ?? 'nine');
  const [optNames, setOptNames] = useState(names0.join(' / ') || 'Length');
  const [visible, setVisible] = useState(!p?.hidden);
  const [media, setMedia] = useState<TxMedia[]>(p?.media ?? []);
  const [rows, setRows] = useState<Row[]>(() => ((p?.variants ?? []).length ? p!.variants! : [{ id: '', selectedOptions: [], price: { CAD: '', USD: '' }, compareAtPrice: null, availableForSale: true }]).map((v) => ({
    id: v.id, opt: (v.selectedOptions ?? []).filter((o) => o.name !== 'Title').map((o) => o.value).join(' / '), cad: String(v.price?.CAD ?? ''), usd: String(v.price?.USD ?? ''), was: v.compareAtPrice ? String(v.compareAtPrice.CAD ?? '') : '', on: v.availableForSale !== false,
  })));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [up, setUp] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setError(''); }, [title]);
  if (!p) return <Sheet title="Produit introuvable" onClose={onClose}><p className={styles.muted}>Il n’existe plus sur la boutique.</p></Sheet>;
  const setRow = (i: number, patch: Partial<Row>) => setRows((l) => l.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  async function addPhotos(files: FileList | null) {
    const list = Array.from(files ?? []);
    const h = (title || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    for (let i = 0; i < list.length; i++) {
      setUp(`Envoi de la photo… (${list.length - i})`);
      try {
        const img = await createImageBitmap(list[i]!, { imageOrientation: 'from-image' });
        const full = toJpeg(img, 1600, 0.84), thumb = toJpeg(img, 640, 0.8); img.close();
        const j = await tisheCall<{ url: string; thumb: string }>('upload', { handle: h, full, thumb }, account.userId);
        setMedia((m) => [...m, { type: 'image', url: j.url, previewUrl: j.thumb, altText: title || null }]);
      } catch (e) { setError((e as Error).message); }
    }
    setUp('');
  }
  async function save() {
    if (!title.trim()) { setError('Le produit a besoin d’un nom.'); return; }
    let names = optNames.split('/').map((s) => s.trim()).filter(Boolean);
    if (!names.length) names = ['Title'];
    const variants = rows.map((r) => {
      const vals = r.opt.split('/').map((s) => s.trim()), cad = num(r.cad), usd = num(r.usd), was = num(r.was);
      return {
        id: r.id, availableForSale: r.on, price: { CAD: cad, USD: usd || Math.round(cad * 0.73 * 100) / 100 },
        compareAtPrice: was > 0 ? { CAD: was, USD: Math.round(was * (usd && cad ? usd / cad : 0.73) * 100) / 100 } : null,
        selectedOptions: names[0] === 'Title' ? [{ name: 'Title', value: 'Default Title' }] : names.map((n, i) => ({ name: n, value: vals[i] || '' })),
      };
    });
    // the description keeps its own formatting until she changes its words
    const descriptionHtml = desc.trim() === desc0 && p!.descriptionHtml ? p!.descriptionHtml : desc.trim() ? desc.trim().split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('') : '';
    setBusy('save'); setError('');
    try {
      const doc = await saveTx('saveProduct', { product: { id: p!.id, title, supplier, hidden: !visible, descriptionHtml, media, variants } }, account.userId, store);
      const made = isNew ? (doc.products ?? [])[(doc.products ?? []).length - 1] : null;
      onSaved('Produit enregistré sur la boutique.', made ? made.handle : handle);
    } catch (e) { setError((e as Error).message); }
    setBusy('');
  }
  async function remove() {
    if (!window.confirm('Supprimer ce produit ? Il disparaît de theivorysukundu.com.')) return;
    setBusy('del');
    try { await saveTx('deleteProduct', { id: p!.id }, account.userId, store); onSaved('Produit supprimé.', null); } catch (e) { setError((e as Error).message); setBusy(''); }
  }
  const optLabel = optNames.split('/').map((s) => s.trim()).filter(Boolean).join(' / ') || 'Option';
  return (
    <Sheet title={isNew ? 'Nouveau produit' : p.title} sub={isNew ? undefined : TISHE.url} onClose={onClose} expandable>
      {!isNew ? <ButtonLink variant="quiet" icon="external" href={`${TISHE.site}/#/product/${p.handle}`} target="_blank" rel="noopener">Voir sur la boutique</ButtonLink> : null}
      <div className={styles.block}>
        <Field label="Nom" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextArea label="Description" rows={7} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <p className={styles.muted}>Une ligne vide fait un nouveau paragraphe.</p>
        <div className={styles.two}>
          <Select label="Fournisseur" options={SUPPLIERS.map(([, l]) => l)} value={SUPPLIERS.find(([k]) => k === supplier)?.[1] ?? SUPPLIERS[0]![1]} onChange={(e) => setSupplier(SUPPLIERS.find(([, l]) => l === e.target.value)?.[0] ?? 'nine')} />
          <Field label="Nom de l’option" value={optNames} onChange={(e) => setOptNames(e.target.value)} hint="« Length » ou « Length / Texture »." />
        </div>
        <Check checked={visible} onChange={(e) => setVisible(e.target.checked)}>Visible sur la boutique</Check>
      </div>
      <div className={styles.block}>
        <h3>Photos</h3>
        <ul className={styles.medias}>
          {media.map((m, i) => (
            <li key={m.url + i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tisheImg(m.previewUrl || m.url)} alt="" />
              {i === 0 ? <span className={styles.mainTag}>Principale</span> : null}
              <span className={styles.mediaActs}>
                <button type="button" aria-label="Avant" disabled={!i} onClick={() => setMedia((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i - 1, 0, x!); return n; })}><Icon name="back" size={14} /></button>
                <button type="button" aria-label="Retirer la photo" onClick={() => setMedia((l) => l.filter((_, k) => k !== i))}><Icon name="trash" size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.acts}><Button variant="secondary" icon="image" onClick={() => file.current?.click()}>Ajouter des photos</Button>{up ? <span className={styles.muted}>{up}</span> : null}</div>
        <input ref={file} type="file" accept="image/*" multiple hidden aria-label="Choisir des photos" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
      </div>
      <div className={styles.block}>
        <h3>Options et prix</h3>
        <div className={styles.vtable} role="table" aria-label="Options et prix">
          <div className={styles.vhead} role="row"><span role="columnheader">{optLabel}</span><span role="columnheader">Prix CAD</span><span role="columnheader">Prix USD</span><span role="columnheader">Prix barré CAD</span><span role="columnheader">En vente</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} className={styles.vrow} role="row">
              <input aria-label={`Option ${i + 1}`} placeholder={optLabel} value={r.opt} onChange={(e) => setRow(i, { opt: e.target.value })} />
              <input aria-label={`Prix CAD ${i + 1}`} inputMode="decimal" value={r.cad} onChange={(e) => setRow(i, { cad: e.target.value })} />
              <input aria-label={`Prix USD ${i + 1}`} inputMode="decimal" placeholder="Auto" value={r.usd} onChange={(e) => setRow(i, { usd: e.target.value })} />
              <input aria-label={`Prix barré CAD ${i + 1}`} inputMode="decimal" value={r.was} onChange={(e) => setRow(i, { was: e.target.value })} />
              <input type="checkbox" aria-label={`En vente ${i + 1}`} checked={r.on} onChange={(e) => setRow(i, { on: e.target.checked })} />
              <button type="button" aria-label={`Retirer l’option ${i + 1}`} disabled={rows.length < 2} onClick={() => setRows((l) => l.filter((_, k) => k !== i))}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>
        <div className={styles.acts}><Button variant="secondary" icon="plus" onClick={() => setRows((l) => [...l, { id: '', opt: '', cad: '', usd: '', was: '', on: true }])}>Ajouter une option</Button></div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.acts}>
        <Button busy={busy === 'save'} icon="check" onClick={() => void save()}>Enregistrer sur la boutique</Button>
        {!isNew ? <Button variant="quiet" icon="trash" busy={busy === 'del'} onClick={() => void remove()}>Supprimer le produit</Button> : null}
      </div>
    </Sheet>
  );
}

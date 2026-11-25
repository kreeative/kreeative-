'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { TisheProducts } from '@/components/tishe/TisheProducts';
import { useAdmin } from '@/components/admin/AdminContext';
import { zprice, useZone } from '@/lib/zone';
import { SHOP_OPTION_CAD, SHOP_OPTION_PRICE, buyShopOption, modelBySlug, shopOptionStores, isBooking } from '@/lib/models';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { clip } from '@/lib/account';
import { money, plural } from '@/lib/format';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { newProductId, productPhoto, productsOf, saveProducts, type Product } from '@/lib/stores';
import styles from '../admin.module.css';

const BADGES: { id: string; label: string }[] = [{ id: '', label: 'Aucune' }, { id: 'best', label: 'Meilleure vente' }, { id: 'new', label: 'Nouveau' }, { id: 'promo', label: 'Promo' }];

/** A product has up to 8 photos: the first is the main one (on the cards), the others show on its page.
 *  `photos`: what the sheet shows; `changed`: her photos are saved (images, and image = the first) */
const MAX_PHOTOS = 8;
interface Draft { id: string | null; name: string; price: string; category: string; description: string; badge: string; photos: string[]; changed?: boolean }
const photosOf = (p: Product): string[] => {
  const list = Array.isArray(p.images) ? (p.images as unknown[]).filter((v): v is string => typeof v === 'string' && /^https:\/\//.test(v)) : [];
  if (list.length) return list.slice(0, MAX_PHOTOS);
  const one = productPhoto(p);
  return one ? [one] : [];
};
const draftOf = (p?: Product): Draft => ({ id: p?.id ?? null, name: p?.name ?? '', price: p ? String(p.price ?? '') : '', category: p?.category ?? '', description: p?.description ?? '', badge: typeof p?.badge === 'string' ? p.badge : '', photos: p ? photosOf(p) : [] });

/** The Ivory Sukundu in view: its own page (its data stays on its site). */
export default function ProductsPageSwitch() {
  const { tishe } = useAdmin();
  return tishe.on ? <TisheProducts /> : <ProductsPage />;
}

function ProductsPage() {
  const z = useZone();
  const { account, store, replaceStore, reload, model } = useAdmin();
  // a booking site sells products only with the option (+25 000 F), bought for this store
  const booking = isBooking(store?.slug, model);
  const [optionOk, setOptionOk] = useState<boolean | null>(null);
  const [optBusy, setOptBusy] = useState(false);
  const [optError, setOptError] = useState('');
  useEffect(() => { if (!booking || !store?.id) { setOptionOk(true); return; } let on = true; void shopOptionStores().then((ids) => { if (on) setOptionOk(ids.includes(store.id)); }); return () => { on = false; }; }, [booking, store?.id]);
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'' | 'network' | 'conflict'>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const products = useMemo(() => (store ? productsOf(store) : []), [store]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q)) : products;
  }, [products, query]);

  // from the editor (« Modifier dans Produits »): the product of that card opens at once
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !products.length || !store || !['owner', 'agency', 'editor'].includes(String(store.role))) return;
    const id = new URLSearchParams(window.location.search).get('produit');
    const p = id ? products.find((x) => x.id === id) : undefined;
    if (p) { asked.current = true; setDraft(draftOf(p)); }
  }, [products, store]);   // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => { setDraft(null); setErrors({}); setProblem(''); setConfirmDelete(false); setPhotoError(''); }, []);
  // another shop chosen: nothing of the previous one stays on screen (an open form, a search)
  const storeId = store?.id ?? '';
  const lastStore = useRef(storeId);
  useEffect(() => {
    if (lastStore.current === storeId) return;
    lastStore.current = storeId;
    close(); setQuery('');
  }, [storeId, close]);

  if (store && booking && optionOk === false) return (<><PageHead title="Produits" /><Empty icon="tag" title="Vendre aussi des produits" action={store.role === 'owner' ? <Button busy={optBusy} onClick={async () => { setOptBusy(true); setOptError(''); const r = await buyShopOption(store.id); if (!r.ok) { setOptBusy(false); setOptError(r.message); } }}>Activer pour {zprice(z, SHOP_OPTION_PRICE, SHOP_OPTION_CAD)}</Button> : undefined}>Votre site de réservation peut aussi vendre des produits, avec panier et paiement. C’est une option à {zprice(z, SHOP_OPTION_PRICE, SHOP_OPTION_CAD)}, payée une seule fois.</Empty>{optError ? <Notice tone="error">{optError}</Notice> : null}</>);
  if (!store) return (<><PageHead title="Produits" /><Empty icon="tag" title="Pas encore de boutique">Créez votre boutique pour y ajouter vos produits.</Empty></>);
  const canEdit = store.role === 'owner' || store.role === 'agency' || store.role === 'editor';

  async function write(next: Product[]) {
    if (!store) return false;
    setBusy(true); setProblem('');
    const r = await saveProducts(store, next);
    setBusy(false);
    if (r.ok) { replaceStore(r.store); return true; }
    setProblem(r.conflict ? 'conflict' : 'network');
    return false;
  }

  // one photo or several at once, added after the others (8 at most)
  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length || !draft) return;
    const room = MAX_PHOTOS - draft.photos.length;
    setPhotoError(room < files.length ? `${MAX_PHOTOS} photos au plus par produit.` : '');
    setUploading(true);
    for (const f of files.slice(0, Math.max(0, room))) {
      const r = await uploadPhoto(f, account.userId);
      if (!r.ok) { setPhotoError(UPLOAD_ERROR[r.error]); break; }
      setDraft((d) => (d ? { ...d, photos: [...d.photos, r.url].slice(0, MAX_PHOTOS), changed: true } : d));
    }
    setUploading(false);
  }
  const setPhotos = (f: (list: string[]) => string[]) => setDraft((d) => (d ? { ...d, photos: f(d.photos), changed: true } : d));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy || uploading) return;
    const name = clip(draft.name, 80);
    const price = Number(draft.price.replace(/[^\d]/g, ''));
    const errs: Record<string, string> = {};
    if (!name) errs.name = 'Donnez un nom au produit.';
    if (!draft.price.trim() || !Number.isFinite(price) || price < 0) errs.price = 'Indiquez un prix, en chiffres.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const fields = { name, price, category: clip(draft.category, 40), description: draft.description.trim().slice(0, 2000), badge: draft.badge, ...(draft.changed ? { images: draft.photos, image: draft.photos[0] ?? null, ...(draft.photos.length ? {} : { photo: null }) } : {}) };
    const next = draft.id
      ? products.map((p) => (p.id === draft.id ? { ...p, ...fields } : p))          // every other field of the product is kept
      : [...products, { id: newProductId(products), image: null, photo: null, ...fields }];
    if (await write(next)) close();
  }

  async function remove() {
    if (!draft?.id || busy) return;
    if (await write(products.filter((p) => p.id !== draft.id))) close();
  }

  return (
    <>
      <PageHead title="Produits" sub={plural(products.length, 'produit', 'produits')}
        action={canEdit ? <Button icon="plus" onClick={() => setDraft(draftOf())}>Ajouter un produit</Button> : null} />

      {products.length === 0
        ? <Empty icon="tag" title="Aucun produit pour le moment" action={canEdit ? <Button icon="plus" onClick={() => setDraft(draftOf())}>Ajouter un produit</Button> : null}>Ajoutez votre premier produit : son nom, son prix, sa catégorie.</Empty>
        : <>
            {products.length > 6 ? <input className={styles.search} type="search" placeholder="Nom, catégorie" aria-label="Chercher un produit" value={query} onChange={(e) => setQuery(e.target.value)} /> : null}
            {shown.length === 0 ? <p className={styles.muted}>Aucun produit ne correspond.</p>
              : <ul className={styles.products}>
                  {shown.map((p) => {
                    const photo = productPhoto(p);
                    return (
                      <li key={p.id}>
                        <button type="button" className={styles.product} onClick={() => canEdit && setDraft(draftOf(p))} disabled={!canEdit}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <span className={styles.thumb}>{photo ? <img src={photo} alt="" loading="lazy" /> : <Icon name="image" size={22} />}</span>
                          <span className={styles.rowMain}><b>{p.name}</b><small>{p.category || 'Sans catégorie'}</small></span>
                          <span className={styles.amount}>{money(Number(p.price) || 0)}</span>
                          <Icon name="chevron" size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>}
          </>}

      {draft ? (
        <Sheet title={draft.id ? 'Modifier le produit' : 'Nouveau produit'} sub={store.published ? 'Visible dans votre boutique dès l’enregistrement.' : 'Visible quand votre boutique sera en ligne.'} onClose={close} expandable>
            <form className={styles.block} style={{ gap: 'var(--sp-4)' }} onSubmit={save} noValidate>
              <div className={styles.block}>
                <span className={styles.label}>Photos <span className={styles.muted}>· {draft.photos.length} sur {MAX_PHOTOS}</span></span>
                <ul className={styles.photos} aria-label="Photos du produit">
                  {draft.photos.map((src, i) => (
                    <li key={src + i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Photo ${i + 1}`} />
                      {i === 0 ? <span className={styles.mainTag}>Principale</span> : <button type="button" className={styles.photoBtn} data-pos="left" onClick={() => setPhotos((l) => [l[i]!, ...l.filter((_, k) => k !== i)])} aria-label={`Mettre la photo ${i + 1} en principale`}><Icon name="up" size={14} /></button>}
                      <button type="button" className={styles.photoBtn} onClick={() => setPhotos((l) => l.filter((_, k) => k !== i))} aria-label={`Retirer la photo ${i + 1}`}><Icon name="close" size={14} /></button>
                    </li>
                  ))}
                  {draft.photos.length < MAX_PHOTOS ? (
                    <li><button type="button" className={styles.addPhoto} disabled={uploading} aria-busy={uploading || undefined} onClick={() => file.current?.click()}>{uploading ? <span className={styles.spin} aria-hidden="true" /> : <Icon name="plus" size={20} />}<span>{uploading ? 'Envoi…' : 'Ajouter'}</span></button></li>
                  ) : null}
                </ul>
                <span className={styles.muted}>La première est la photo principale. Les autres s’affichent sur la page du produit.</span>
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void pickPhoto(e)} aria-label="Choisir des photos" />
              </div>
              {photoError ? <Notice tone="error">{photoError}</Notice> : null}
              <Field label="Nom du produit" name="name" maxLength={80} autoFocus value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setErrors(({ name: _n, ...rest }) => rest); }} error={errors.name} />
              <Field label="Prix (FCFA)" name="price" inputMode="numeric" placeholder="15 000" value={draft.price} onChange={(e) => { setDraft({ ...draft, price: e.target.value }); setErrors(({ price: _p, ...rest }) => rest); }} error={errors.price} />
              <Field label="Catégorie" optional name="category" maxLength={40} list="product-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} hint={categories.length ? `Vos catégories : ${categories.slice(0, 5).join(', ')}` : undefined} />
              <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              <div className={styles.block}>
                <label className={styles.label} htmlFor="product-desc">Description <span className={styles.muted}>(facultatif)</span></label>
                <textarea id="product-desc" className={styles.textarea} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className={styles.block}>
                <span className={styles.label} id="badge-label">Étiquette</span>
                <div className={styles.statusPick} role="group" aria-labelledby="badge-label">
                  {BADGES.map((b) => <button key={b.id} type="button" className={styles.filter} aria-pressed={draft.badge === b.id} onClick={() => setDraft({ ...draft, badge: b.id })}>{b.label}</button>)}
                </div>
              </div>
              {problem === 'conflict' ? <Notice tone="warn" title="Votre boutique a changé entre-temps" action={<Button variant="secondary" onClick={() => void reload().then(close)}>Recharger</Button>}>Elle a été modifiée ailleurs (un autre onglet, une associée). Rechargez, puis refaites votre modification.</Notice> : null}
              {problem === 'network' ? <Notice tone="error">Le produit n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.</Notice> : null}
              <Button type="submit" block busy={busy}>{draft.id ? 'Enregistrer' : 'Ajouter le produit'}</Button>
              {draft.id ? (confirmDelete
                ? <div className={styles.sheetActions}><Button variant="secondary" icon="trash" disabled={busy} onClick={() => void remove()}>Oui, supprimer</Button><Button variant="quiet" onClick={() => setConfirmDelete(false)}>Annuler</Button></div>
                : <Button variant="quiet" block icon="trash" disabled={busy} onClick={() => setConfirmDelete(true)}>Supprimer ce produit</Button>) : null}
            </form>
        </Sheet>
      ) : null}
    </>
  );
}

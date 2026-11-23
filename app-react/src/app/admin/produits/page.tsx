'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { clip } from '@/lib/account';
import { money, plural } from '@/lib/format';
import { newProductId, productsOf, saveProducts, type Product } from '@/lib/stores';
import styles from '../admin.module.css';

const BADGES: { id: string; label: string }[] = [{ id: '', label: 'Aucune' }, { id: 'best', label: 'Meilleure vente' }, { id: 'new', label: 'Nouveau' }, { id: 'promo', label: 'Promo' }];
const photoOf = (p: Product): string | null => [p.photo, p.image].find((u): u is string => typeof u === 'string' && /^https:\/\//.test(u)) ?? null;

interface Draft { id: string | null; name: string; price: string; category: string; description: string; badge: string }
const draftOf = (p?: Product): Draft => ({ id: p?.id ?? null, name: p?.name ?? '', price: p ? String(p.price ?? '') : '', category: p?.category ?? '', description: p?.description ?? '', badge: typeof p?.badge === 'string' ? p.badge : '' });

export default function ProductsPage() {
  const { store, replaceStore, reload } = useAdmin();
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

  const close = () => { setDraft(null); setErrors({}); setProblem(''); setConfirmDelete(false); };
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft]);

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

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    const name = clip(draft.name, 80);
    const price = Number(draft.price.replace(/[^\d]/g, ''));
    const errs: Record<string, string> = {};
    if (!name) errs.name = 'Donnez un nom au produit.';
    if (!draft.price.trim() || !Number.isFinite(price) || price < 0) errs.price = 'Indiquez un prix, en chiffres.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const fields = { name, price, category: clip(draft.category, 40), description: draft.description.trim().slice(0, 2000), badge: draft.badge };
    const next = draft.id
      ? products.map((p) => (p.id === draft.id ? { ...p, ...fields } : p))          // every other field of the product is kept
      : [...products, { id: newProductId(products), ...fields, image: null, photo: null }];
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
        ? <Empty icon="tag" title="Aucun produit pour l’instant" action={canEdit ? <Button icon="plus" onClick={() => setDraft(draftOf())}>Ajouter un produit</Button> : null}>Ajoutez votre premier produit : son nom, son prix, sa catégorie.</Empty>
        : <>
            {products.length > 6 ? <input className={styles.search} type="search" placeholder="Nom, catégorie" aria-label="Chercher un produit" value={query} onChange={(e) => setQuery(e.target.value)} /> : null}
            {shown.length === 0 ? <p className={styles.muted}>Aucun produit ne correspond.</p>
              : <ul className={styles.products}>
                  {shown.map((p) => {
                    const photo = photoOf(p);
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
        <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <aside className={styles.sheet} role="dialog" aria-modal="true" aria-label={draft.id ? 'Modifier le produit' : 'Nouveau produit'}>
            <div className={styles.sheetHead}>
              <div><h2>{draft.id ? 'Modifier le produit' : 'Nouveau produit'}</h2><p>{store.published ? 'Visible dans votre boutique dès l’enregistrement.' : 'Visible quand votre boutique sera en ligne.'}</p></div>
              <button type="button" className={styles.close} aria-label="Fermer" onClick={close}><Icon name="close" size={18} /></button>
            </div>
            <form className={styles.block} style={{ gap: 'var(--sp-4)' }} onSubmit={save} noValidate>
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
          </aside>
        </div>
      ) : null}
    </>
  );
}

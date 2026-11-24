'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { TisheSettings } from '@/components/tishe/TisheMore';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { SaveBar } from '@/components/admin/SaveBar';
import { useSave } from '@/components/admin/useSave';
import { Check, Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { listOrders, productsOf } from '@/lib/stores';
import { CURRENCIES } from '@/lib/stores';
import { clip } from '@/lib/account';
import { storeUrl } from '@/lib/stores';
import styles from '../admin.module.css';

interface Form { name: string; tagline: string; city: string; whatsapp: string; currency: string; waButton: boolean; pixel: string; ga4: string }

/* a file she downloads: her data are hers (orders, clients, products, the whole store) */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((v) => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[";,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(';')).join('\n');

/** What her store is called and how to reach her: fiche.store (name, tagline, city, WhatsApp). */
/** The Ivory Sukundu in view: its own page (its data stays on its site). */
export default function SettingsPageSwitch() {
  const { tishe } = useAdmin();
  return tishe.on ? <TisheSettings /> : <SettingsPage />;
}

function SettingsPage() {
  const { store } = useAdmin();
  const { busy, problem, saved, write } = useSave();
  const [form, setForm] = useState<Form>({ name: '', tagline: '', city: '', whatsapp: '', currency: 'XOF', waButton: true, pixel: '', ga4: '' });
  const [exporting, setExporting] = useState('');
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const s = store?.fiche.store ?? {};
    setForm({ name: s.name ?? '', tagline: s.tagline ?? '', city: s.city ?? '', whatsapp: s.whatsapp ?? '', currency: typeof s.currency === 'string' && CURRENCIES.some(([c]) => c === s.currency) ? s.currency : 'XOF' , waButton: (s as Record<string, unknown>).waButton !== false, pixel: String(((s as Record<string, unknown>).tracking as Record<string, unknown> | undefined)?.metaPixel ?? ''), ga4: String(((s as Record<string, unknown>).tracking as Record<string, unknown> | undefined)?.ga4 ?? '') });
    setErrors({}); setDirty(false);
  }, [store]);

  if (!store) return (<><PageHead title="Paramètres" /><Empty icon="gear" title="Pas encore de boutique">Créez votre boutique pour régler son nom et vos coordonnées.</Empty></>);

  const set = (k: keyof Form, v: string | boolean) => { setForm((f) => ({ ...f, [k]: v })); setErrors(({ [k]: _x, ...rest }) => rest); setDirty(true); };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const errs: Record<string, string> = {};
    const name = clip(form.name, 40);
    const wa = form.whatsapp.replace(/[^\d+]/g, '');
    if (!name) errs.name = 'Donnez un nom à votre boutique.';
    const pixel = form.pixel.replace(/\D/g, ''), ga4 = form.ga4.trim().toUpperCase();
    if (pixel && !/^\d{8,20}$/.test(pixel)) errs.pixel = 'L’identifiant du Pixel est une suite de chiffres (Meta › Gestionnaire d’événements).';
    if (ga4 && !/^G-[A-Z0-9]{4,15}$/.test(ga4)) errs.ga4 = 'L’identifiant commence par G- (Google Analytics › Flux de données).';
    if (wa && !/^\+?\d{8,15}$/.test(wa)) errs.whatsapp = 'Ce numéro ne semble pas complet (avec l’indicatif, par exemple +225 07 07 12 34 56).';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const next: Record<string, unknown> = { ...(store.fiche.store ?? {}), name, tagline: clip(form.tagline, 80), city: clip(form.city, 40), whatsapp: wa, currency: form.currency };
    if (form.waButton) delete next.waButton; else next.waButton = false;
    if (pixel || ga4) next.tracking = { ...(pixel ? { metaPixel: pixel } : {}), ...(ga4 ? { ga4 } : {}) }; else delete next.tracking;
    if (await write({ ...store.fiche, store: next })) setDirty(false);
  }

  return (
    <>
      <PageHead title="Paramètres" sub={storeUrl(store).replace(/^https:\/\//, '')} />
      <form onSubmit={save} noValidate className={styles.wideForm}>
        <section className={styles.card} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div className={styles.cardHead} style={{ marginBottom: 0 }}><h2>Votre boutique</h2><span className={styles.status} data-s={store.published ? 'livree' : undefined}>{store.published ? 'En ligne' : 'Pas en ligne'}</span></div>
          <div className={styles.fields}>
          <Field label="Nom de la boutique" maxLength={40} value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <Field label="Phrase d’accroche" optional maxLength={80} placeholder="Soins naturels faits main" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          </div>
          <div className={styles.fields}>
          <Select label="Monnaie de la boutique" options={CURRENCIES.map(([, l]) => l)} value={CURRENCIES.find(([c]) => c === form.currency)?.[1] ?? CURRENCIES[0]![1]}
            onChange={(e) => set('currency', CURRENCIES.find(([, l]) => l === e.target.value)?.[0] ?? 'XOF')} />
          <Field label="Ville" optional maxLength={40} placeholder="Abidjan" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <Field label="Numéro WhatsApp" optional type="tel" inputMode="tel" placeholder="+225 07 07 12 34 56" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} error={errors.whatsapp}
            hint="Celui où vos clientes vous écrivent et où arrivent vos commandes." />
        </section>
        <section className={styles.card} style={{ display: 'grid', gap: 'var(--sp-4)' }} aria-label="WhatsApp et publicité">
          <div className={styles.cardHead} style={{ marginBottom: 0 }}><h2>WhatsApp et publicité</h2></div>
          <Check checked={form.waButton} onChange={(e) => set('waButton', e.target.checked)}>Bouton WhatsApp rond en bas de votre site (avec votre numéro ci-dessus).</Check>
          <div className={styles.fields}>
          <Field label="Pixel Meta (Facebook, Instagram)" optional inputMode="numeric" placeholder="123456789012345" value={form.pixel} onChange={(e) => set('pixel', e.target.value)} error={errors.pixel} hint="Les visites, ajouts au panier et achats arrivent dans votre Gestionnaire d’événements." />
          <Field label="Google Analytics 4" optional autoCapitalize="characters" placeholder="G-XXXXXXXXXX" value={form.ga4} onChange={(e) => set('ga4', e.target.value)} error={errors.ga4} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ font: '500 var(--fs-sm)/1.3 var(--font)' }}>Catalogue Facebook et Instagram</span>
            <p className={styles.muted} style={{ margin: 0 }}>Collez cette adresse dans Meta Commerce Manager › Catalogue › Sources de données › Flux programmé. Seuls les produits avec photo y figurent.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--grey-1)', fontSize: 'var(--fs-sm)', overflowWrap: 'anywhere' }}>{`https://${store.slug}.store.jehre.com/catalogue.csv`}</code>
              <Button variant="secondary" icon="copy" onClick={() => { void navigator.clipboard?.writeText(`https://${store.slug}.store.jehre.com/catalogue.csv`); setCopied(true); }}>{copied ? 'Copiée' : 'Copier'}</Button>
            </div>
          </div>
        </section>
        <SaveBar busy={busy} problem={problem} saved={saved} dirty={dirty} />
      </form>
      <section className={styles.card} style={{ display: 'grid', gap: 'var(--sp-3)', maxWidth: 1440, marginTop: 'var(--sp-5)' }} aria-label="Vos données">
        <div className={styles.cardHead} style={{ marginBottom: 0 }}><h2>Vos données</h2></div>
        <p className={styles.muted} style={{ margin: 0 }}>Elles vous appartiennent : téléchargez-les quand vous voulez.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" icon="down" busy={exporting === 'orders'} onClick={async () => {
            setExporting('orders'); const o = await listOrders(store.id); setExporting('');
            download(`commandes-${store.slug}.csv`, csv([['Numéro', 'Date', 'Statut', 'Cliente', 'Téléphone', 'E-mail', 'Commune', 'Adresse', 'Articles', 'Sous-total', 'Livraison', 'Total', 'Paiement'],
              ...o.map((x) => { const c = (x.customer ?? {}) as Record<string, string>; return [x.number, x.created_at.slice(0, 10), x.status, c.name ?? '', c.phone ?? '', c.email ?? '', c.commune ?? '', c.address ?? '', (Array.isArray(x.lines) ? x.lines : []).map((l) => `${(l as { qty?: number }).qty ?? 1} x ${(l as { name?: string }).name ?? ''}`).join(' + '), x.subtotal, x.delivery_fee, x.total, x.payment ?? '']; })]), 'text/csv;charset=utf-8');
          }}>Commandes (CSV)</Button>
          <Button variant="secondary" icon="down" busy={exporting === 'clients'} onClick={async () => {
            setExporting('clients'); const o = await listOrders(store.id); setExporting('');
            const by = new Map<string, { name: string; phone: string; email: string; commune: string; n: number; spent: number; last: string }>();
            o.forEach((x) => { const c = (x.customer ?? {}) as Record<string, string>; const k = (c.phone ?? '').replace(/\D/g, '').slice(-8) || c.email || c.name || x.id; const e = by.get(k) ?? { name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '', commune: c.commune ?? '', n: 0, spent: 0, last: '' }; e.n++; e.spent += x.total || 0; if (x.created_at > e.last) e.last = x.created_at; by.set(k, e); });
            download(`clients-${store.slug}.csv`, csv([['Nom', 'Téléphone', 'E-mail', 'Commune', 'Commandes', 'Total dépensé', 'Dernière commande'], ...[...by.values()].map((c) => [c.name, c.phone, c.email, c.commune, c.n, c.spent, c.last.slice(0, 10)])]), 'text/csv;charset=utf-8');
          }}>Clients (CSV)</Button>
          <Button variant="secondary" icon="down" onClick={() => download(`produits-${store.slug}.csv`, csv([['Identifiant', 'Nom', 'Prix', 'Catégorie', 'Description', 'Photo'], ...productsOf(store).map((p) => [p.id, p.name, p.price, p.category ?? '', p.description ?? '', p.image ?? ''])]), 'text/csv;charset=utf-8')}>Produits (CSV)</Button>
          <Button variant="secondary" icon="down" onClick={() => download(`boutique-${store.slug}.json`, JSON.stringify(store.fiche, null, 2), 'application/json')}>Toute la boutique (JSON)</Button>
        </div>
      </section>
    </>
  );
}

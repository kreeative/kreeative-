'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { SaveBar } from '@/components/admin/SaveBar';
import { useSave } from '@/components/admin/useSave';
import { Field, Select } from '@/components/ui/Field';
import { CURRENCIES } from '@/lib/stores';
import { clip } from '@/lib/account';
import { storeUrl } from '@/lib/stores';
import styles from '../admin.module.css';

interface Form { name: string; tagline: string; city: string; whatsapp: string; currency: string }

/** What her store is called and how to reach her: fiche.store (name, tagline, city, WhatsApp). */
export default function SettingsPage() {
  const { store } = useAdmin();
  const { busy, problem, saved, write } = useSave();
  const [form, setForm] = useState<Form>({ name: '', tagline: '', city: '', whatsapp: '', currency: 'XOF' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const s = store?.fiche.store ?? {};
    setForm({ name: s.name ?? '', tagline: s.tagline ?? '', city: s.city ?? '', whatsapp: s.whatsapp ?? '', currency: typeof s.currency === 'string' && CURRENCIES.some(([c]) => c === s.currency) ? s.currency : 'XOF' });
    setErrors({}); setDirty(false);
  }, [store]);

  if (!store) return (<><PageHead title="Paramètres" /><Empty icon="gear" title="Pas encore de boutique">Créez votre boutique pour régler son nom et vos coordonnées.</Empty></>);

  const set = (k: keyof Form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors(({ [k]: _x, ...rest }) => rest); setDirty(true); };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const errs: Record<string, string> = {};
    const name = clip(form.name, 40);
    const wa = form.whatsapp.replace(/[^\d+]/g, '');
    if (!name) errs.name = 'Donnez un nom à votre boutique.';
    if (wa && !/^\+?\d{8,15}$/.test(wa)) errs.whatsapp = 'Ce numéro ne semble pas complet (avec l’indicatif, par exemple +225 07 07 12 34 56).';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const next = { ...(store.fiche.store ?? {}), name, tagline: clip(form.tagline, 80), city: clip(form.city, 40), whatsapp: wa, currency: form.currency };
    if (await write({ ...store.fiche, store: next })) setDirty(false);
  }

  return (
    <>
      <PageHead title="Paramètres" sub={storeUrl(store).replace(/^https:\/\//, '')} />
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: 'var(--sp-4)', maxWidth: 640 }}>
        <section className={styles.card} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div className={styles.cardHead} style={{ marginBottom: 0 }}><h2>Votre boutique</h2><span className={styles.status} data-s={store.published ? 'livree' : undefined}>{store.published ? 'En ligne' : 'Pas en ligne'}</span></div>
          <Field label="Nom de la boutique" maxLength={40} value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <Field label="Phrase d’accroche" optional maxLength={80} placeholder="Soins naturels faits main" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          <Select label="Monnaie de la boutique" options={CURRENCIES.map(([, l]) => l)} value={CURRENCIES.find(([c]) => c === form.currency)?.[1] ?? CURRENCIES[0]![1]}
            onChange={(e) => set('currency', CURRENCIES.find(([, l]) => l === e.target.value)?.[0] ?? 'XOF')} />
          <Field label="Ville" optional maxLength={40} placeholder="Abidjan" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Field label="Numéro WhatsApp" optional type="tel" inputMode="tel" placeholder="+225 07 07 12 34 56" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} error={errors.whatsapp}
            hint="Celui où vos clientes vous écrivent et où arrivent vos commandes." />
        </section>
        <SaveBar busy={busy} problem={problem} saved={saved} dirty={dirty} />
      </form>
    </>
  );
}

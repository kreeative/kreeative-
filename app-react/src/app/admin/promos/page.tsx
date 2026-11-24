'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import styles from '../admin.module.css';

interface Promo { id: string; code: string; kind: 'percent' | 'amount'; value: number; min_total: number; max_uses: number | null; uses: number; ends_at: string | null; active: boolean }
const KINDS: [Promo['kind'], string][] = [['percent', 'Pourcentage (%)'], ['amount', 'Montant (FCFA)']];

/** « Codes promo »: the codes her buyers type at the checkout. The server (`orders`) checks them and applies them;
 *  they never appear in the public store. */
export default function PromosPage() {
  const { store } = useAdmin();
  const [list, setList] = useState<Promo[] | null>(null);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<Promo['kind']>('percent');
  const [value, setValue] = useState('10');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [ends, setEnds] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const sid = store?.id ?? '';

  const load = useCallback(async () => {
    if (!sid) return;
    const { data } = await supabase().from('store_promos').select('*').eq('store_id', sid).order('created_at', { ascending: false });
    setList((data ?? []) as Promo[]);
  }, [sid]);
  useEffect(() => { setList(null); void load(); }, [load]);

  if (!store) return <><PageHead title="Codes promo" /><Empty icon="sparkle" title="Pas encore de boutique">Créez votre boutique pour offrir des réductions.</Empty></>;
  const canEdit = ['owner', 'agency', 'editor'].includes(String(store.role));

  async function create() {
    if (!store || busy) return;
    const c = code.trim().toUpperCase().replace(/\s+/g, '');
    const v = Number(value.replace(/\D/g, ''));
    const e: Record<string, string> = {};
    if (!/^[A-Z0-9-]{3,24}$/.test(c)) e.code = 'De 3 à 24 lettres ou chiffres, sans espace (ex. BIENVENUE10).';
    if (!v || (kind === 'percent' && v > 100)) e.value = kind === 'percent' ? 'Entre 1 et 100 %.' : 'Un montant en FCFA.';
    setErrors(e); setProblem('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await supabase().from('store_promos').insert({ store_id: store.id, code: c, kind, value: v, min_total: Number(min.replace(/\D/g, '')) || 0, max_uses: Number(max.replace(/\D/g, '')) || null, ends_at: ends ? new Date(`${ends}T23:59:59`).toISOString() : null });
    setBusy(false);
    if (error) { setProblem(error.code === '23505' ? 'Ce code existe déjà dans votre boutique.' : 'Le code n’a pas pu être créé. Réessayez.'); return; }
    setCode(''); setMin(''); setMax(''); setEnds('');
    await load();
  }
  async function toggle(p: Promo) { await supabase().from('store_promos').update({ active: !p.active }).eq('id', p.id); await load(); }
  async function remove(p: Promo) { if (!window.confirm(`Supprimer le code ${p.code} ?`)) return; await supabase().from('store_promos').delete().eq('id', p.id); await load(); }

  const said = (p: Promo) => [p.kind === 'percent' ? `-${p.value} %` : `-${money(p.value)}`, p.min_total ? `dès ${money(p.min_total)}` : '', p.max_uses ? `${p.uses} / ${p.max_uses} utilisations` : `${p.uses} utilisation${p.uses > 1 ? 's' : ''}`, p.ends_at ? `jusqu’au ${new Date(p.ends_at).toLocaleDateString('fr-FR')}` : ''].filter(Boolean).join(' · ');

  return (
    <>
      <PageHead title="Codes promo" sub="Vos clientes tapent le code au moment de commander." />
      <div style={{ display: 'grid', gap: 'var(--sp-4)', maxWidth: 1440 }}>
        {canEdit ? (
          <section className={styles.card} style={{ display: 'grid', gap: 'var(--sp-3)' }} aria-label="Nouveau code">
            <div className={styles.cardHead} style={{ marginBottom: 0 }}><h2>Nouveau code</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--sp-3)' }}>
              <Field label="Code" autoCapitalize="characters" maxLength={24} placeholder="BIENVENUE10" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={errors.code} />
              <Select label="Réduction" options={KINDS.map(([, l]) => l)} value={KINDS.find(([k]) => k === kind)![1]} onChange={(e) => setKind(KINDS.find(([, l]) => l === e.target.value)![0])} />
              <Field label={kind === 'percent' ? 'Valeur (%)' : 'Valeur (FCFA)'} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} />
              <Field label="Panier minimum (FCFA)" optional inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
              <Field label="Nombre d’utilisations" optional inputMode="numeric" placeholder="Illimité" value={max} onChange={(e) => setMax(e.target.value)} />
              <Field label="Valable jusqu’au" optional type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
            {problem ? <Notice tone="error">{problem}</Notice> : null}
            <div><Button icon="plus" busy={busy} onClick={() => void create()}>Créer le code</Button></div>
          </section>
        ) : null}
        <section className={styles.card} aria-label="Vos codes">
          <div className={styles.cardHead}><h2>Vos codes</h2><span className={styles.muted}>{list ? list.filter((p) => p.active).length : '…'} actif{list && list.filter((p) => p.active).length > 1 ? 's' : ''}</span></div>
          {list && !list.length ? <p className={styles.muted}>Aucun code pour l’instant.</p> : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {(list ?? []).map((p) => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, boxShadow: '0 0 0 1px var(--line)', opacity: p.active ? 1 : 0.55 }}>
                <span style={{ flex: 1, minWidth: 0, display: 'grid' }}><b style={{ letterSpacing: '.04em' }}>{p.code}</b><small className={styles.muted}>{said(p)}{p.active ? '' : ' · en pause'}</small></span>
                {canEdit ? <>
                  <Button variant="secondary" onClick={() => void toggle(p)}>{p.active ? 'Mettre en pause' : 'Réactiver'}</Button>
                  <button type="button" className={styles.close} aria-label={`Supprimer le code ${p.code}`} onClick={() => void remove(p)}><Icon name="trash" size={18} /></button>
                </> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

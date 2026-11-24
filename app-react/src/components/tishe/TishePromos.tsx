'use client';

import { useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Check, Field, Select } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { dollars } from '@/lib/tishe';
import { saveTx, useTxStore, type TxCode, type TxStore } from './TisheProducts';
import { TisheError, TisheGate } from './useTishe';
import styles from './tishe.module.css';

const KIND: [TxCode['kind'], string][] = [['percent', 'Pourcentage'], ['amount', 'Montant'], ['free_shipping', 'Livraison offerte']];
const day = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };
function codeDesc(c: TxCode): string {
  const bits = [c.kind === 'percent' ? `−${c.percent} %` : c.kind === 'amount' ? `−${dollars(c.amount?.CAD ?? 0)}` : 'Livraison offerte'];
  if (c.minSubtotal?.CAD) bits.push(`dès ${dollars(c.minSubtotal.CAD)}`);
  if (c.firstOrderOnly) bits.push('première commande');
  if (c.returningOnly) bits.push('clientes fidèles');
  if (c.oncePerCustomer) bits.push('une fois par cliente');
  if (c.endsAt) bits.push(`jusqu’au ${day(c.endsAt)}`);
  return bits.join(' · ');
}

/** Codes promo of The Ivory Sukundu: on the hair only, never on the delivery nor the taxes. */
export function TishePromos() { return <TisheGate title="Codes promo"><Promos /></TisheGate>; }
function Promos() {
  const { data, error, reload } = useTxStore();
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  if (error && !data) return <TisheError title="Codes promo" error={error} retry={reload} />;
  if (!data) return <><PageHead title="Codes promo" /><CloudLoader /></>;
  const codes = data.doc.discounts ?? [], usage = data.usage ?? {};
  return (
    <>
      <PageHead title="Codes promo" sub="Ils s’appliquent aux cheveux, jamais à la livraison ni aux taxes." action={<Button icon="plus" onClick={() => setOpen('nouveau')}>Nouveau code</Button>} />
      <div className={styles.page}>
        <section className={styles.card}>
          {codes.length ? (
            <ul className={styles.orows}>
              {codes.map((c) => (
                <li key={c.code}><button type="button" className={styles.orow} onClick={() => setOpen(c.code)}>
                  <span className={styles.otop}><b>{c.code}</b>{c.active ? <span className={styles.pill} data-tone="ok">Actif</span> : <span className={styles.pill} data-tone="muted">Désactivé</span>}</span>
                  <span className={styles.oline}><span>{codeDesc(c)}</span><span>{plural(usage[c.code] || 0, 'utilisation', 'utilisations')}</span></span>
                </button></li>
              ))}
            </ul>
          ) : <p className={styles.muted}>Aucun code pour l’instant.</p>}
        </section>
      </div>
      {open ? <CodeSheet key={open} code={open} store={data} onClose={() => setOpen(null)} onDone={(msg) => { setToast(msg); setOpen(null); }} /> : null}
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </>
  );
}

function CodeSheet({ code, store, onClose, onDone }: { code: string; store: TxStore; onClose: () => void; onDone: (msg: string) => void }) {
  const { account } = useAdmin();
  const isNew = code === 'nouveau';
  const c: TxCode | undefined = isNew ? { code: '', kind: 'percent', percent: 10, active: true, label: '' } : (store.doc.discounts ?? []).find((x) => x.code === code);
  const d = (iso?: string) => (iso ? String(iso).slice(0, 10) : '');
  const [f, setF] = useState(() => ({
    code: c?.code ?? '', kind: c?.kind ?? 'percent', percent: String(c?.percent ?? ''), amountCAD: String(c?.amount?.CAD ?? ''), amountUSD: String(c?.amount?.USD ?? ''),
    minCAD: String(c?.minSubtotal?.CAD ?? ''), minUSD: String(c?.minSubtotal?.USD ?? ''), label: c?.label ?? '', startsAt: d(c?.startsAt), endsAt: d(c?.endsAt),
    active: c?.active !== false, firstOrderOnly: !!c?.firstOrderOnly, returningOnly: !!c?.returningOnly, oncePerCustomer: !!c?.oncePerCustomer,
  }));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!c) return <Sheet title="Code introuvable" onClose={onClose}><p className={styles.muted}>Il n’existe plus sur la boutique.</p></Sheet>;
  const set = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setError(''); };
  const n = (v: string) => { const x = Number(String(v).replace(',', '.')); return isFinite(x) && x > 0 ? x : 0; };
  async function save() {
    const r: TxCode = { code: f.code.trim().toUpperCase(), kind: f.kind as TxCode['kind'], active: f.active, label: f.label.trim(), firstOrderOnly: f.firstOrderOnly || undefined, returningOnly: f.returningOnly || undefined, oncePerCustomer: f.oncePerCustomer || undefined };
    if (!r.code) { setError('Écrivez le code.'); return; }
    if (r.kind === 'percent') r.percent = n(f.percent);
    if (r.kind === 'amount') r.amount = { CAD: n(f.amountCAD), USD: n(f.amountUSD) || n(f.amountCAD) };
    if (n(f.minCAD)) r.minSubtotal = { CAD: n(f.minCAD), USD: n(f.minUSD) || n(f.minCAD) };
    if (f.startsAt) r.startsAt = new Date(`${f.startsAt}T00:00:00`).toISOString();
    if (f.endsAt) r.endsAt = new Date(`${f.endsAt}T23:59:59`).toISOString();
    setBusy('save');
    try { await saveTx('saveCode', { rule: r, previousCode: isNew ? '' : c!.code }, account.userId, store); onDone('Code enregistré.'); } catch (e) { setError((e as Error).message); setBusy(''); }
  }
  async function remove() {
    if (!window.confirm('Supprimer ce code ? Il disparaît de theivorysukundu.com.')) return;
    setBusy('del');
    try { await saveTx('deleteCode', { code: c!.code }, account.userId, store); onDone('Code supprimé.'); } catch (e) { setError((e as Error).message); setBusy(''); }
  }
  return (
    <Sheet title={isNew ? 'Nouveau code' : c.code} onClose={onClose} expandable>
      <div className={styles.block}>
        <div className={styles.two}>
          <Field label="Code" maxLength={40} value={f.code} style={{ textTransform: 'uppercase' }} onChange={(e) => set({ code: e.target.value })} />
          <Select label="Type" options={KIND.map(([, l]) => l)} value={KIND.find(([k]) => k === f.kind)?.[1] ?? 'Pourcentage'} onChange={(e) => set({ kind: KIND.find(([, l]) => l === e.target.value)?.[0] ?? 'percent' })} />
        </div>
        {f.kind === 'percent' ? <Field label="Pourcentage" inputMode="numeric" value={f.percent} onChange={(e) => set({ percent: e.target.value })} /> : null}
        {f.kind === 'amount' ? <div className={styles.two}><Field label="Montant en CAD" inputMode="decimal" value={f.amountCAD} onChange={(e) => set({ amountCAD: e.target.value })} /><Field label="Montant en USD" inputMode="decimal" value={f.amountUSD} onChange={(e) => set({ amountUSD: e.target.value })} /></div> : null}
        <div className={styles.two}>
          <Field label="Panier minimum en CAD" optional inputMode="decimal" value={f.minCAD} onChange={(e) => set({ minCAD: e.target.value })} />
          <Field label="Panier minimum en USD" optional inputMode="decimal" value={f.minUSD} onChange={(e) => set({ minUSD: e.target.value })} />
        </div>
        <Field label="Texte affiché dans le panier" maxLength={80} placeholder="10% off" value={f.label} onChange={(e) => set({ label: e.target.value })} hint="En anglais, comme la boutique." />
        <div className={styles.two}>
          <Field label="Début" optional type="date" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          <Field label="Fin" optional type="date" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
        </div>
        <Check checked={f.active} onChange={(e) => set({ active: e.target.checked })}>Actif</Check>
        <Check checked={f.firstOrderOnly} onChange={(e) => set({ firstOrderOnly: e.target.checked })}>Première commande seulement</Check>
        <Check checked={f.returningOnly} onChange={(e) => set({ returningOnly: e.target.checked })}>Clientes qui ont déjà commandé</Check>
        <Check checked={f.oncePerCustomer} onChange={(e) => set({ oncePerCustomer: e.target.checked })}>Une fois par cliente</Check>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.acts}>
        <Button busy={busy === 'save'} icon="check" onClick={() => void save()}>Enregistrer</Button>
        {!isNew ? <Button variant="quiet" icon="trash" busy={busy === 'del'} onClick={() => void remove()}>Supprimer le code</Button> : null}
      </div>
    </Sheet>
  );
}


'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { SaveBar } from '@/components/admin/SaveBar';
import { useSave } from '@/components/admin/useSave';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { clip } from '@/lib/account';
import { withZones, zonesOf } from '@/lib/stores';
import styles from '../admin.module.css';

interface Row { name: string; fee: string }
const MAX_ZONES = 30;

/** Her delivery zones and their fees, commune by commune: the « Livraison » section of her store's page. */
export default function DeliveryPage() {
  const { store } = useAdmin();
  const { busy, problem, saved, write } = useSave();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setRows(store ? zonesOf(store).map((z) => ({ name: z.name, fee: String(z.fee) })) : []); setError(''); setDirty(false); }, [store]);

  if (!store) return (<><PageHead title="Livraison" /><Empty icon="truck" title="Pas encore de boutique">Créez votre boutique pour régler vos zones de livraison.</Empty></>);

  const edit = (i: number, patch: Partial<Row>) => { setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x))); setError(''); setDirty(true); };
  const remove = (i: number) => { setRows((r) => r.filter((_, k) => k !== i)); setDirty(true); };
  const add = () => { setRows((r) => [...r, { name: '', fee: '1500' }]); setDirty(true); };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const filled = rows.filter((r) => r.name.trim() || r.fee.trim());
    if (filled.some((r) => !r.name.trim())) { setError('Donnez un nom à chaque zone, ou retirez la ligne vide.'); return; }
    const zones = filled.map((r) => ({ name: clip(r.name, 40), fee: Math.min(100000, Math.max(0, Number(r.fee.replace(/[^\d]/g, '')) || 0)) }));
    if (await write(withZones(store.fiche, zones))) setDirty(false);
  }

  return (
    <>
      <PageHead title="Livraison" sub="Les frais de la commune de la cliente s’ajoutent à sa commande." />
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: 'var(--sp-4)', maxWidth: 640 }}>
        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Zones de livraison</h2><span className={styles.muted}>{rows.length} / {MAX_ZONES}</span></div>
          {rows.length === 0 ? <p className={styles.muted}>Aucune zone pour l’instant. Ajoutez les communes où vous livrez.</p> : (
            <ul className={styles.zones}>
              {rows.map((r, i) => (
                <li key={i}>
                  <input className={styles.cell} aria-label={`Zone ${i + 1} : commune ou zone`} placeholder="Cocody" maxLength={40} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
                  <span className={styles.fee}><input className={styles.cell} aria-label={`Zone ${i + 1} : frais de livraison en FCFA`} inputMode="numeric" placeholder="1500" value={r.fee} onChange={(e) => edit(i, { fee: e.target.value })} /><span>FCFA</span></span>
                  <button type="button" className={styles.close} aria-label={`Retirer la zone ${r.name || i + 1}`} onClick={() => remove(i)}><Icon name="trash" size={18} /></button>
                </li>
              ))}
            </ul>
          )}
          {error ? <p className={styles.fieldError} role="alert">{error}</p> : null}
          <div style={{ marginTop: 'var(--sp-3)' }}><Button variant="secondary" icon="plus" disabled={rows.length >= MAX_ZONES} onClick={add}>Ajouter une zone</Button></div>
        </section>
        <SaveBar busy={busy} problem={problem} saved={saved} dirty={dirty} />
      </form>
    </>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { money } from '@/lib/format';
import { storeName, storeUrl } from '@/lib/stores';
import { supabase } from '@/lib/supabase';
import styles from '../admin.module.css';

interface Cart { id: string; name: string; phone: string; email: string; cart: { name: string; qty: number }[]; total: number; currency: string; updated_at: string; relaunched_at: string | null }

/** « Paniers abandonnés »: buyers who typed their phone at the checkout and did not order (kept by the `orders`
 *  function). She calls them back on WhatsApp with one tap; a cart that becomes an order leaves the list by itself. */
export default function CartsPage() {
  const { store } = useAdmin();
  const [list, setList] = useState<Cart[] | null>(null);
  const sid = store?.id ?? '';
  const load = useCallback(async () => {
    if (!sid) return;
    const since = new Date(Date.now() - 30 * 86400000).toISOString(), before = new Date(Date.now() - 30 * 60000).toISOString();
    const { data } = await supabase().from('abandoned_carts').select('id,name,phone,email,cart,total,currency,updated_at,relaunched_at')
      .eq('store_id', sid).is('recovered_at', null).gte('updated_at', since).lte('updated_at', before).order('updated_at', { ascending: false }).limit(200);
    setList((data ?? []) as Cart[]);
  }, [sid]);
  useEffect(() => { setList(null); void load(); }, [load]);

  if (!store) return <><PageHead title="Paniers abandonnés" /><Empty icon="bag" title="Pas encore de boutique">Créez votre boutique pour voir les paniers laissés en route.</Empty></>;

  const link = (c: Cart) => {
    const d = c.phone.replace(/\D/g, ''), n = d.length === 10 && d.startsWith('0') ? `225${d}` : d;
    const items = c.cart.map((x) => `${x.qty} × ${x.name}`).join(', ');
    const text = `Bonjour ${c.name || ''}, c’est ${storeName(store)}. Vous aviez choisi ${items} sur notre boutique. Voulez-vous qu’on finalise votre commande ensemble ? ${storeUrl(store)}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(text.replace(/\s+/g, ' ').trim())}`;
  };
  async function relaunched(c: Cart) { await supabase().from('abandoned_carts').update({ relaunched_at: new Date().toISOString() }).eq('id', c.id); await load(); }
  async function done(c: Cart) { await supabase().from('abandoned_carts').update({ recovered_at: new Date().toISOString() }).eq('id', c.id); await load(); }

  return (
    <>
      <PageHead title="Paniers abandonnés" sub="Les clientes qui ont donné leur numéro sans finir leur commande. Relancez-les en un geste." />
      <section className={styles.card} style={{ maxWidth: 1440 }} aria-label="Paniers">
        {list === null ? <p className={styles.muted}>Chargement…</p> : null}
        {list && !list.length ? <p className={styles.muted}>Aucun panier abandonné ces 30 derniers jours.</p> : null}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {(list ?? []).map((c) => (
            <li key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, boxShadow: '0 0 0 1px var(--line)' }}>
              <span style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 2 }}>
                <b>{c.name || 'Cliente'} · {c.phone}</b>
                <small className={styles.muted}>{c.cart.map((x) => `${x.qty} × ${x.name}`).join(', ')} · {money(c.total, c.currency)}</small>
                <small className={styles.muted}>{new Date(c.updated_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}{c.relaunched_at ? ' · relancée' : ''}</small>
              </span>
              <ButtonLink variant={c.relaunched_at ? 'secondary' : 'primary'} href={link(c)} target="_blank" rel="noopener" onClick={() => void relaunched(c)}>Relancer sur WhatsApp</ButtonLink>
              <Button variant="secondary" onClick={() => void done(c)}>Traité</Button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

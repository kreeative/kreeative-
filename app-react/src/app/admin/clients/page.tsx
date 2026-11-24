'use client';

import { CloudLoader } from '@/components/ui/CloudLoader';
import { useMemo } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { useOrders } from '@/components/admin/useOrders';
import { Icon } from '@/components/ui/Icon';
import { modelBySlug } from '@/lib/models';
import { BookingClients } from './BookingClients';
import { money, plural, waLink, when } from '@/lib/format';
import styles from '../admin.module.css';

interface Client { key: string; name: string; phone: string; commune: string; orders: number; total: number; last: string; currency: string }

/** Her customers, made from her orders: one line per phone number (or per name when there is no number). */
export default function ClientsPage() {
  const { store, model } = useAdmin();
  const { orders } = useOrders(store?.id ?? null);

  const clients = useMemo<Client[]>(() => {
    const map = new Map<string, Client>();
    for (const o of orders ?? []) {
      if (o.status === 'annulee') continue;
      const phone = (o.customer.phone ?? '').replace(/[^\d+]/g, '');
      const key = phone || (o.customer.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const c = map.get(key) ?? { key, name: o.customer.name ?? '', phone: o.customer.phone ?? '', commune: o.customer.commune ?? '', orders: 0, total: 0, last: o.created_at, currency: o.currency };
      c.orders += 1; c.total += o.total;
      if (o.created_at > c.last) c.last = o.created_at;
      if (!c.name && o.customer.name) c.name = o.customer.name;
      map.set(key, c);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [orders]);

  // a booking store: her clients come from her appointments
  if (store && modelBySlug(model)?.rdv) return <BookingClients storeId={store.id} />;
  if (!store) return (<><PageHead title="Clients" /><Empty icon="users" title="Pas encore de boutique">Vos clientes apparaîtront ici après leurs premières commandes.</Empty></>);

  return (
    <>
      <PageHead title="Clients" sub={orders ? plural(clients.length, 'cliente', 'clientes') : 'Chargement…'} />
      {orders === null ? <CloudLoader />
        : clients.length === 0 ? <Empty icon="users" title="Aucune cliente pour l’instant">Chaque personne qui commande dans votre boutique est ajoutée ici, avec ses achats.</Empty>
        : <section className={styles.card}>
            <ul className={styles.rows}>
              {clients.map((c) => {
                const wa = c.phone ? waLink(c.phone) : '';
                const inner = (<>
                  <span className={styles.rowMain}><b>{c.name || 'Sans nom'}</b><small>{[c.phone, c.commune].filter(Boolean).join(' · ') || 'Pas de numéro'}</small></span>
                  <span className={styles.rowMain} style={{ flex: 'none', textAlign: 'right' }}><b>{money(c.total, c.currency)}</b><small>{plural(c.orders, 'commande', 'commandes')} · {when(c.last)}</small></span>
                  {wa ? <Icon name="call" size={18} /> : <span style={{ width: 18 }} />}
                </>);
                return <li key={c.key}>{wa ? <a className={styles.row} href={wa} target="_blank" rel="noopener" aria-label={`Écrire à ${c.name || 'cette cliente'} sur WhatsApp`}>{inner}</a> : <div className={styles.row} style={{ cursor: 'default' }}>{inner}</div>}</li>;
              })}
            </ul>
          </section>}
    </>
  );
}

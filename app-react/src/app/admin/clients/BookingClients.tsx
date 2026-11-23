'use client';

import { useEffect, useState } from 'react';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { bookingClients, type BookingClient } from '@/lib/bookings';
import { plural, price, waLink } from '@/lib/format';
import styles from '../admin.module.css';

/** The clients of a booking store, made by the server from her appointments: visits, what is coming, no-shows. */
export function BookingClients({ storeId }: { storeId: string }) {
  const [list, setList] = useState<BookingClient[] | null>(null);
  const [currency, setCurrency] = useState('XOF');
  const [error, setError] = useState('');
  useEffect(() => {
    let on = true;
    setList(null);
    void bookingClients(storeId).then((r) => {
      if (!on) return;
      if (!r.ok) { setError(r.message); return; }
      setError(''); setCurrency(r.currency);
      setList([...r.clients].sort((a, b) => (b.visits + b.upcoming) - (a.visits + a.upcoming)));
    });
    return () => { on = false; };
  }, [storeId]);

  return (
    <>
      <PageHead title="Clientes" sub={list ? plural(list.length, 'cliente', 'clientes') : error ? undefined : 'Chargement…'} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {list === null ? null
        : list.length === 0 ? <Empty icon="users" title="Pas encore de cliente">Elles apparaissent ici dès leur premier rendez-vous.</Empty>
        : <section className={styles.card}>
            <ul className={styles.rows}>
              {list.map((c, i) => {
                const wa = c.phone ? waLink(c.phone) : '';
                const bits = [plural(c.visits, 'visite', 'visites'), c.upcoming ? plural(c.upcoming, 'à venir', 'à venir') : '', c.noShows ? plural(c.noShows, 'absence', 'absences') : ''].filter(Boolean).join(' · ');
                const inner = (<>
                  <span className={styles.rowMain}><b>{c.name || 'Sans nom'}</b><small>{c.phone || c.email || 'Pas de numéro'}{c.lastService ? ` · ${c.lastService}` : ''}</small></span>
                  <span className={styles.rowMain} style={{ flex: 'none', textAlign: 'right' }}><b>{price(c.spent, currency)}</b><small>{bits}</small></span>
                  {wa ? <Icon name="call" size={18} /> : <span style={{ width: 18 }} />}
                </>);
                return <li key={`${c.phone}${c.email}${c.name}${i}`}>{wa ? <a className={styles.row} href={wa} target="_blank" rel="noopener" aria-label={`Écrire à ${c.name || 'cette cliente'} sur WhatsApp`}>{inner}</a> : <div className={styles.row} style={{ cursor: 'default' }}>{inner}</div>}</li>;
              })}
            </ul>
          </section>}
    </>
  );
}

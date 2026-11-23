'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { useOrders } from '@/components/admin/useOrders';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { money, plural, waLink, when } from '@/lib/format';
import { ORDER_STATUSES, PAYMENT_LABEL, setOrderStatus, statusLabel, type Order, type OrderStatus } from '@/lib/stores';
import styles from '../admin.module.css';

type Filter = 'toutes' | 'a-traiter' | 'en-cours' | 'terminees';
const FILTERS: { id: Filter; label: string; match: (o: Order) => boolean }[] = [
  { id: 'toutes', label: 'Toutes', match: () => true },
  { id: 'a-traiter', label: 'À traiter', match: (o) => o.status === 'nouvelle' },
  { id: 'en-cours', label: 'En cours', match: (o) => ['confirmee', 'preparee', 'expediee'].includes(o.status) },
  { id: 'terminees', label: 'Terminées', match: (o) => o.status === 'livree' || o.status === 'annulee' },
];

export default function OrdersPage() {
  const { store } = useAdmin();
  const { orders, setOrders } = useOrders(store?.id ?? null);
  const [filter, setFilter] = useState<Filter>('toutes');
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<OrderStatus | null>(null);
  const [failed, setFailed] = useState(false);

  // /admin/commandes/?c=12 opens order n° 12 (the link of the home page)
  useEffect(() => {
    if (!orders) return;
    const n = Number(new URLSearchParams(window.location.search).get('c'));
    const hit = n ? orders.find((o) => o.number === n) : undefined;
    if (hit) setOpenId(hit.id);
  }, [orders]);

  const shown = useMemo(() => (orders ?? []).filter(FILTERS.find((f) => f.id === filter)!.match), [orders, filter]);
  const open = (orders ?? []).find((o) => o.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function change(order: Order, status: OrderStatus) {
    if (saving || order.status === status) return;
    setSaving(status); setFailed(false);
    const ok = await setOrderStatus(order, status);
    setSaving(null);
    if (!ok) { setFailed(true); return; }
    setOrders((list) => (list ?? []).map((o) => (o.id === order.id ? { ...o, status } : o)));
  }

  if (!store) return (<><PageHead title="Commandes" /><Empty icon="receipt" title="Pas encore de boutique">Vos commandes apparaîtront ici dès que votre boutique sera en ligne.</Empty></>);

  return (
    <>
      <PageHead title="Commandes" sub={orders ? plural(orders.length, 'commande', 'commandes') : 'Chargement…'} />
      <div className={styles.filters} role="group" aria-label="Filtrer les commandes">
        {FILTERS.map((f) => <button key={f.id} type="button" className={styles.filter} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}{orders ? ` · ${orders.filter(f.match).length}` : ''}</button>)}
      </div>

      {orders === null ? <p className={styles.muted}>Chargement…</p>
        : orders.length === 0 ? <Empty icon="receipt" title="Aucune commande pour l’instant">Partagez le lien de votre boutique : chaque commande passée par une cliente arrive ici.</Empty>
        : shown.length === 0 ? <p className={styles.muted}>Aucune commande dans ce filtre.</p>
        : <section className={styles.card}>
            <ul className={styles.rows}>
              {shown.map((o) => (
                <li key={o.id}>
                  <button type="button" className={styles.row} onClick={() => { setFailed(false); setOpenId(o.id); }}>
                    <span className={styles.rowMain}><b>N° {o.number} · {o.customer.name || 'Cliente'}</b><small>{when(o.created_at)} · {plural(o.lines.reduce((n, l) => n + (l.qty || 1), 0), 'article', 'articles')}</small></span>
                    <span className={styles.status} data-s={o.status}>{statusLabel(o.status)}</span>
                    <span className={styles.amount}>{money(o.total, o.currency)}</span>
                    <Icon name="chevron" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>}

      {open ? (
        <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <aside className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Commande n° ${open.number}`}>
            <div className={styles.sheetHead}>
              <div><h2>Commande n° {open.number}</h2><p>{when(open.created_at)} · {PAYMENT_LABEL[open.payment_status] ?? open.payment_status}{open.payment ? ` · ${open.payment}` : ''}</p></div>
              <button type="button" className={styles.close} aria-label="Fermer" onClick={() => setOpenId(null)}><Icon name="close" size={18} /></button>
            </div>

            <div className={styles.block}>
              <h3>Statut</h3>
              <div className={styles.statusPick} role="group" aria-label="Statut de la commande">
                {ORDER_STATUSES.map((s) => <button key={s.id} type="button" className={styles.filter} aria-pressed={open.status === s.id} disabled={saving !== null} onClick={() => void change(open, s.id)}>{saving === s.id ? '…' : s.label}</button>)}
              </div>
              {failed ? <Notice tone="error">Le statut n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.</Notice> : null}
            </div>

            <div className={styles.block}>
              <h3>Cliente</h3>
              <p><b>{open.customer.name || 'Sans nom'}</b></p>
              {open.customer.phone ? <p>{open.customer.phone}</p> : null}
              {open.customer.commune || open.customer.address ? <p className={styles.muted}>{[open.customer.commune, open.customer.address].filter(Boolean).join(' · ')}</p> : null}
              <div className={styles.sheetActions}>
                {open.customer.phone && waLink(open.customer.phone) ? <ButtonLink href={waLink(open.customer.phone)} target="_blank" rel="noopener" variant="secondary" icon="call">Écrire sur WhatsApp</ButtonLink> : null}
              </div>
            </div>

            <div className={styles.block}>
              <h3>Articles</h3>
              <ul className={styles.lines}>
                {open.lines.map((l, i) => <li key={i}><span>{l.qty} × {l.name}</span><span className={styles.amount}>{money(l.amount ?? l.price * l.qty, open.currency)}</span></li>)}
                {open.delivery_fee > 0 ? <li><span>Livraison</span><span className={styles.amount}>{money(open.delivery_fee, open.currency)}</span></li> : null}
              </ul>
              <p className={styles.total}><span>Total</span><span>{money(open.total, open.currency)}</span></p>
            </div>

            {open.note ? <div className={styles.block}><h3>Note de la cliente</h3><p>{open.note}</p></div> : null}
            <Button variant="quiet" onClick={() => setOpenId(null)}>Fermer</Button>
          </aside>
        </div>
      ) : null}
    </>
  );
}

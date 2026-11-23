'use client';

import Link from 'next/link';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { useOrders } from '@/components/admin/useOrders';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { money, plural, when } from '@/lib/format';
import { productsOf, statusLabel, storeName, storeUrl } from '@/lib/stores';
import styles from './admin.module.css';

export default function AdminHome() {
  const { account, store } = useAdmin();
  const { orders } = useOrders(store?.id ?? null);
  const hello = account.firstName ? `Bonjour ${account.firstName}` : 'Bonjour';

  if (!store) {
    return (
      <>
        <PageHead title={hello} sub="Votre compte est prêt. Il vous reste à créer votre boutique." />
        <Empty icon="store" title="Pas encore de boutique"
          action={<div className={styles.actions}><ButtonLink href="/admin/#boutique" icon="template">Choisir un modèle</ButtonLink><ButtonLink href="/creer/" variant="secondary" icon="edit">Ouvrir l’éditeur</ButtonLink></div>}>
          Partez d’un modèle déjà dessiné ou composez votre boutique vous-même. Vos commandes et vos produits apparaîtront ici.
        </Empty>
      </>
    );
  }

  const list = orders ?? [];
  const live = list.filter((o) => o.status !== 'annulee');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const week = new Date(today.getTime() - 6 * 864e5);
  const since = (d: Date) => live.filter((o) => new Date(o.created_at) >= d);
  const sum = (xs: typeof live) => xs.reduce((n, o) => n + o.total, 0);
  const currency = list[0]?.currency ?? 'XOF';
  const todo = list.filter((o) => o.status === 'nouvelle');
  const products = productsOf(store);

  return (
    <>
      <PageHead title={hello} sub={storeName(store)}
        action={<ButtonLink href={storeUrl(store)} target="_blank" rel="noopener" variant="secondary" icon="eye">Voir la boutique</ButtonLink>} />

      {!store.published ? <p className={styles.banner}><Icon name="info" size={18} />Votre boutique n’est pas encore en ligne : vos clientes ne la voient pas.</p> : null}

      <dl className={styles.kpis} aria-busy={orders === null || undefined}>
        <div><dt>Ventes aujourd’hui</dt><dd>{money(sum(since(today)), currency)}</dd><small>{plural(since(today).length, 'commande', 'commandes')}</small></div>
        <div><dt>Ventes sur 7 jours</dt><dd>{money(sum(since(week)), currency)}</dd><small>{plural(since(week).length, 'commande', 'commandes')}</small></div>
        <div><dt>À traiter</dt><dd>{todo.length}</dd><small>{todo.length ? 'nouvelles commandes' : 'tout est à jour'}</small></div>
        <div><dt>Produits</dt><dd>{products.length}</dd><small>dans votre boutique</small></div>
      </dl>

      <section className={styles.card}>
        <div className={styles.cardHead}><h2>Dernières commandes</h2>{list.length ? <Link href="/admin/commandes/">Tout voir</Link> : null}</div>
        {orders === null ? <p className={styles.muted}>Chargement…</p>
          : list.length === 0 ? <p className={styles.muted}>Aucune commande pour l’instant. Partagez le lien de votre boutique pour recevoir la première.</p>
          : <ul className={styles.rows}>
              {list.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/commandes/?c=${o.number}`} className={styles.row}>
                    <span className={styles.rowMain}><b>N° {o.number} · {o.customer.name || 'Cliente'}</b><small>{when(o.created_at)} · {statusLabel(o.status)}</small></span>
                    <span className={styles.amount}>{money(o.total, o.currency)}</span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              ))}
            </ul>}
      </section>
    </>
  );
}

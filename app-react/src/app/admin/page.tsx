'use client';

import { CloudLoader } from '@/components/ui/CloudLoader';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { useOrders } from '@/components/admin/useOrders';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { money, plural, when } from '@/lib/format';
import { modelBySlug } from '@/lib/models';
import { productsOf, statusLabel, storeName, storeUrl, zonesOf } from '@/lib/stores';
import styles from './admin.module.css';
import home from './home.module.css';

const TONE: Record<string, string> = { nouvelle: 'new', confirmee: 'go', preparee: 'go', expediee: 'go', livree: 'ok', annulee: 'off' };
const STEPS_KEY = 'jehre-steps-hidden';

export default function AdminHome() {
  const { account, store, model } = useAdmin();
  const [stepsOff, setStepsOff] = useState(true);
  const [allSteps, setAllSteps] = useState(false);
  useEffect(() => { try { setStepsOff(window.localStorage.getItem(STEPS_KEY) === '1'); } catch { setStepsOff(false); } }, []);
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

  // « Premiers pas »: every step ticks itself from what is really set in her store; each one opens where it is done
  const st = (store.fiche.store ?? {}) as Record<string, unknown>;
  const pay = (st.pay ?? {}) as Record<string, unknown>;
  const booking = !!modelBySlug(model)?.rdv;
  const steps: { id: string; title: string; href: string; done: boolean }[] = [
    ...(booking ? [{ id: 'services', title: 'Ajoutez vos prestations', href: '/admin/prestations/', done: false }]
      : [{ id: 'products', title: 'Ajoutez 3 produits avec une vraie photo', href: '/admin/produits/', done: products.filter((p) => p.image || p.photo).length >= 3 }]),
    ...(booking ? [] : [{ id: 'categories', title: 'Rangez vos produits en catégories', href: '/admin/produits/', done: new Set(products.map((p) => String(p.category ?? '').trim()).filter(Boolean)).size >= 2 }]),
    { id: 'wave', title: 'Connectez Wave et le mobile money', href: '/admin/paiements/', done: Object.values(pay).some((v) => typeof v === 'string' && v.trim() !== '') },
    { id: 'whatsapp', title: 'Ajoutez votre numéro WhatsApp', href: '/admin/parametres/', done: typeof st.whatsapp === 'string' && st.whatsapp.trim() !== '' },
    ...(booking ? [] : [{ id: 'delivery', title: 'Choisissez vos communes de livraison', href: '/admin/livraison/', done: zonesOf(store).length > 0 }]),
    { id: 'site', title: booking ? 'Mettez vos photos et vos textes' : 'Personnalisez votre boutique', href: '/admin/editeur/', done: !!st.site },
    { id: 'logo', title: 'Ajoutez votre logo', href: '/admin/editeur/', done: typeof st.logo === 'string' && st.logo !== '' },
    { id: 'live', title: 'Mettez votre site en ligne', href: '/admin/editeur/', done: store.published },
    { id: 'address', title: 'Choisissez l’adresse de votre site', href: '/admin/domaine/', done: !!store.custom_domain },
  ].filter((x) => !(booking && x.id === 'services'));
  const doneN = steps.filter((x) => x.done).length, next = steps.filter((x) => !x.done).slice(0, 3);
  const shownSteps = allSteps ? steps : next;
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <>
      <p className={home.date}>{day}</p>
      <PageHead title={hello} sub={storeName(store)}
        action={<ButtonLink href={storeUrl(store, model)} target="_blank" rel="noopener" variant="secondary" icon="eye">Voir la boutique</ButtonLink>} />

      {!store.published ? <p className={styles.banner}><Icon name="info" size={18} />Votre boutique n’est pas encore en ligne : vos clientes ne la voient pas.</p> : null}

      <section className={home.today} aria-label="Aujourd’hui">
        <Link className={home.todayMain} href="/admin/commandes/"><span><small>Aujourd’hui</small><b>{todo.length ? `${plural(todo.length, 'commande', 'commandes')} à préparer` : 'Rien à préparer'}</b></span><Icon name="chevron" size={18} /></Link>
        {todo.length ? <Link className={home.todayBtn} href="/admin/commandes/"><Icon name="receipt" size={18} />Voir les commandes</Link>
          : <Link className={home.todayBtn} href={booking ? '/admin/rendez-vous/' : '/admin/produits/'}><Icon name="plus" size={18} />{booking ? 'Voir l’agenda' : 'Ajouter un produit'}</Link>}
      </section>

      {stepsOff ? null : (
        <section className={home.steps} aria-labelledby="h-steps">
          <div className={home.stepsHead}>
            <h2 id="h-steps">{doneN === steps.length ? 'Votre boutique est prête' : 'Premiers pas'}</h2>
            <button type="button" className={home.close} onClick={() => { setStepsOff(true); try { window.localStorage.setItem(STEPS_KEY, '1'); } catch { /* shown again next time */ } }} aria-label="Masquer les premiers pas"><Icon name="close" size={18} /></button>
          </div>
          <div className={home.progress}>
            <div className={home.bar} role="progressbar" aria-label="Étapes faites" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneN}><div className={home.fill} style={{ width: `${Math.round((doneN / steps.length) * 100)}%`, ['--p' as string]: Math.max(1, Math.round((doneN / steps.length) * 100)) }} /></div>
            <span>{doneN} sur {steps.length}</span>
          </div>
          {doneN === steps.length ? <p className={home.ready}>Tout est en place. Partagez le lien de votre boutique.</p> : null}
          <ul className={home.stepList}>
            {shownSteps.map((x) => <li key={x.id}><Link className={home.step} href={x.href} data-done={x.done ? '' : undefined}><span className={home.ring}>{x.done ? <Icon name="check" size={14} /> : null}</span><span>{x.title}</span><Icon name="chevron" size={16} /></Link></li>)}
          </ul>
          <button type="button" className={home.more} aria-expanded={allSteps} onClick={() => setAllSteps((v) => !v)}><Icon name="down" size={14} />{allSteps ? 'Voir moins' : `Voir les ${steps.length} étapes (${plural(doneN, 'faite', 'faites')})`}</button>
        </section>
      )}

      <h2 className={home.section}>Vos ventes</h2>
      <dl className={styles.kpis} aria-busy={orders === null || undefined}>
        <div><span className={home.chip} data-tone="green" aria-hidden="true"><Icon name="wallet" size={18} /></span><dt>Ventes aujourd’hui</dt><dd>{money(sum(since(today)), currency)}</dd><small>{plural(since(today).length, 'commande', 'commandes')}</small></div>
        <div><span className={home.chip} data-tone="violet" aria-hidden="true"><Icon name="chart" size={18} /></span><dt>Ventes sur 7 jours</dt><dd>{money(sum(since(week)), currency)}</dd><small>{plural(since(week).length, 'commande', 'commandes')}</small></div>
        <div><span className={home.chip} data-tone="orange" aria-hidden="true"><Icon name="receipt" size={18} /></span><dt>À traiter</dt><dd>{todo.length}</dd><small>{todo.length ? 'nouvelles commandes' : 'tout est à jour'}</small></div>
        <div><span className={home.chip} data-tone="blue" aria-hidden="true"><Icon name="tag" size={18} /></span><dt>Produits</dt><dd>{products.length}</dd><small>dans votre boutique</small></div>
      </dl>

      <section className={styles.card}>
        <div className={styles.cardHead}><h2>Dernières commandes</h2>{list.length ? <Link href="/admin/commandes/">Tout voir</Link> : null}</div>
        {orders === null ? <CloudLoader />
          : list.length === 0 ? <p className={styles.muted}>Aucune commande pour l’instant. Partagez le lien de votre boutique pour recevoir la première.</p>
          : <ul className={styles.rows}>
              {list.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/commandes/?c=${o.number}`} className={styles.row}>
                    <span className={styles.rowMain}><b>N° {o.number} · {o.customer.name || 'Cliente'}</b><small className={home.meta}>{when(o.created_at)}<span className={home.status} data-tone={TONE[o.status] ?? 'go'}>{statusLabel(o.status)}</span></small></span>
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

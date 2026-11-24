'use client';

import { hasPlan, monthOrders, usage } from '@/lib/billing';
import { useEffect as useMonthEffect, useState as useMonthState } from 'react';
import { CARD_LABEL, cardState, cardStatus, type CardState } from '@/lib/card';
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
interface Step { id: string; title: string; href: string; action: string; done: boolean; state?: string; out?: boolean }

export default function AdminHome() {
  const { account, store, model } = useAdmin();
  const [stepsOff, setStepsOff] = useState(true);
  const [allSteps, setAllSteps] = useState(false);
  useEffect(() => { try { setStepsOff(window.localStorage.getItem(STEPS_KEY) === '1'); } catch { setStepsOff(false); } }, []);
  const { orders } = useOrders(store?.id ?? null);
  const [card, setCard] = useState<CardState>('loading');
  useEffect(() => { if (!store?.id) return; let on = true; void cardStatus(store.id).then((x) => { if (on) setCard(cardState(x)); }); return () => { on = false; }; }, [store?.id]);
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
  const site = (st.site ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const cats = new Set(products.map((p) => String(p.category ?? '').trim()).filter(Boolean));
  const linked = Object.keys(site.q ?? {}).length > 0 || Object.values({ ...(site.k ?? {}), ...(site.l ?? {}) }).some((v) => typeof v === 'string' && (v.startsWith('c:') || v.includes('#')));
  const brand = site.b ?? {};
  const waveLink = typeof pay.wave === 'string' && /^https:\/\/pay\.wave\.com\//i.test(pay.wave);
  const cardOn = card === 'on';
  const steps: Step[] = [
    { id: 'currency', title: 'Choisissez la monnaie et le nom de la boutique', href: '/admin/parametres/', action: 'Régler', done: typeof st.currency === 'string' && typeof st.name === 'string' && st.name.trim() !== '' },
    { id: 'brand', title: 'Ajoutez votre logo, vos couleurs et vos boutons', href: '/admin/branding/', action: 'Branding', done: (typeof st.logo === 'string' && st.logo !== '') || Object.keys(brand).length > 0 },
    ...(booking ? [] : [{ id: 'categories', title: 'Créez vos catégories et liez-les à vos sections', href: cats.size ? '/admin/editeur/' : '/admin/produits/', action: cats.size ? 'Lier' : 'Créer', done: cats.size >= 1 && linked, state: cats.size && !linked ? 'À lier' : undefined }]),
    booking ? { id: 'services', title: 'Ajoutez vos prestations et vos forfaits', href: '/admin/prestations/', action: 'Ajouter', done: false }
      : { id: 'products', title: 'Ajoutez vos produits : photos, prix, détails', href: '/admin/produits/', action: 'Ajouter', done: products.filter((p) => p.image || p.photo).length >= 3, state: products.length ? `${products.length} produit${products.length > 1 ? 's' : ''}` : undefined },
    { id: 'wave', title: 'Activez Wave avec votre lien marchand', href: '/admin/paiements/', action: 'Configurer', done: waveLink, state: !waveLink && Object.values(pay).some((v) => typeof v === 'string' && v.trim() !== '') ? 'Lien manquant' : undefined },
    { id: 'card', title: 'Acceptez les cartes bancaires (Stripe)', href: card === 'on' || card === 'soon' ? '/admin/paiements/' : '/admin/paiements/carte/', action: card === 'pending' ? 'Terminer' : 'Connecter', done: cardOn, state: card === 'loading' ? undefined : CARD_LABEL[card] },
    { id: 'contact', title: booking ? 'Vérifiez vos horaires et votre WhatsApp' : 'Vérifiez la livraison et votre WhatsApp', href: booking ? '/admin/rendez-vous/reglages/' : (zonesOf(store).length ? '/admin/parametres/' : '/admin/livraison/'), action: 'Vérifier', done: typeof st.whatsapp === 'string' && st.whatsapp.trim() !== '' && (booking || zonesOf(store).length > 0) },
    { id: 'site', title: booking ? 'Mettez vos photos et vos textes' : 'Personnalisez les textes et les photos', href: '/admin/editeur/', action: 'Éditer', done: !!st.site },
    { id: 'live', title: 'Publiez et vérifiez votre site en ligne', href: store.published ? storeUrl(store, model) : '/admin/editeur/', action: store.published ? 'Voir' : 'Publier', done: store.published, out: store.published },
  ];
  const doneN = steps.filter((x) => x.done).length, next = steps.filter((x) => !x.done).slice(0, 3);
  const shownSteps = allSteps ? steps : next;
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <>
      <p className={home.date}>{day}</p>
      <PageHead title={hello} sub={storeName(store)}
        action={<ButtonLink href={storeUrl(store, model)} target="_blank" rel="noopener" variant="secondary" icon="eye">Voir la boutique</ButtonLink>} />

      <MonthBanner storeId={store.id} plan={store.plan} owner={store.role === 'owner'} />
      {store.role === 'owner' && !hasPlan(store.plan) ? <p className={styles.banner}><Icon name="sparkle" size={18} /><span>Votre boutique n’a pas encore de formule. <a href="/admin/abonnement/"><b>Choisir une formule</b></a></span></p> : null}
      {!store.published ? <p className={styles.banner}><Icon name="info" size={18} />Votre boutique n’est pas encore en ligne : vos clientes ne la voient pas.</p> : null}

      <div className={home.layout}>
      <div className={home.mainCol}>
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
            {shownSteps.map((x) => (
              <li key={x.id}>
                <Link className={home.step} href={x.href} data-done={x.done ? '' : undefined} target={x.out ? '_blank' : undefined} rel={x.out ? 'noopener' : undefined}>
                  <span className={home.ring}>{x.done ? <Icon name="check" size={14} /> : null}</span>
                  <span>{x.title}<small>{x.done ? 'Configuré' : x.state ?? 'À faire'}</small></span>
                  <span className={home.go}>{x.done ? (x.out ? 'Voir' : 'Modifier') : x.action}</span>
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" className={home.more} aria-expanded={allSteps} onClick={() => setAllSteps((v) => !v)}><Icon name="down" size={14} />{allSteps ? 'Voir moins' : `Voir les ${steps.length} étapes (${plural(doneN, 'faite', 'faites')})`}</button>
        </section>
      )}

      <h2 className={home.section}>Vos ventes</h2>
      <dl className={styles.kpis} aria-busy={orders === null || undefined}>
        <div><span className={home.chip} data-tone="green" aria-hidden="true"><Icon name="wallet" size={22} /></span><dt>Ventes aujourd’hui</dt><dd>{money(sum(since(today)), currency)}</dd><small>{plural(since(today).length, 'commande', 'commandes')}</small></div>
        <div><span className={home.chip} data-tone="violet" aria-hidden="true"><Icon name="chart" size={22} /></span><dt>Ventes sur 7 jours</dt><dd>{money(sum(since(week)), currency)}</dd><small>{plural(since(week).length, 'commande', 'commandes')}</small></div>
        <div><span className={home.chip} data-tone="orange" aria-hidden="true"><Icon name="receipt" size={22} /></span><dt>À traiter</dt><dd>{todo.length}</dd><small>{todo.length ? 'nouvelles commandes' : 'tout est à jour'}</small></div>
        <div><span className={home.chip} data-tone="blue" aria-hidden="true"><Icon name="tag" size={22} /></span><dt>Produits</dt><dd>{products.length}</dd><small>dans votre boutique</small></div>
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
      </div>
      <StorePreview url={storeUrl(store, model)} name={storeName(store)} published={!!store.published} thumb={modelBySlug(model)?.slug ?? ''} />
      </div>
    </>
  );
}

/** The orders of the month against her plan: a word at 80 %, another past the limit (her buyers are never blocked). */
function MonthBanner({ storeId, plan, owner }: { storeId: string; plan: string | null | undefined; owner: boolean }) {
  const [n, setN] = useMonthState<number | null>(null);
  useMonthEffect(() => { let on = true; void monthOrders(storeId).then((x) => { if (on) setN(x); }); return () => { on = false; }; }, [storeId]);
  if (n === null || !hasPlan(plan)) return null;
  const u = usage(plan, n);
  if (u.level === 'ok' || u.limit === null) return null;
  return (
    <p className={styles.banner} data-tone={u.level}>
      <Icon name="chart" size={18} />
      <span>{u.level === 'over' ? `${n} commandes ce mois-ci, pour ${u.limit} dans votre formule. Vos commandes continuent d’arriver.` : `${n} commandes sur ${u.limit} ce mois-ci.`}
        {owner && u.next ? <> <a href="/admin/abonnement/"><b>Passer à {u.next.name}</b></a></> : null}</span>
    </p>
  );
}

/** « Votre boutique », on the right of the home page (from 1200 px): her site in a phone, online or not, its
 *  address, and the three things she does with it: customise, see, share. */
function StorePreview({ url, name, published, thumb }: { url: string; name: string; published: boolean; thumb: string }) {
  const [shared, setShared] = useMonthState(false);
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: name, url }); return; } } catch { /* she closed it */ return; }
    try { await navigator.clipboard.writeText(url); setShared(true); } catch { /* nothing to do */ }
  };
  return (
    <section className={home.preview} aria-label="Votre boutique">
      <div className={home.previewHead}>
        <div><h2>Votre boutique</h2><p><Icon name="external" size={14} />{url.replace(/^https:\/\//, '').replace(/\/$/, '')}</p></div>
        <span className={home.online} data-on={published ? '' : undefined}>{published ? 'En ligne' : 'Pas en ligne'}</span>
      </div>
      <div className={home.phoneWrap}>
        <div className={home.phone}>
          {published ? <iframe title={`Aperçu de ${name}`} src={url} loading="lazy" tabIndex={-1} />
            /* eslint-disable-next-line @next/next/no-img-element */
            : thumb ? <img src={`https://jehre.com/studio/sites/thumbs/concepts--${thumb}.webp`} alt="" /> : null}
        </div>
      </div>
      <ButtonLink block href="/admin/editeur/" icon="edit">Personnaliser</ButtonLink>
      <div className={home.previewActs}>
        <ButtonLink variant="secondary" href={url} target="_blank" rel="noopener" icon="eye">Voir</ButtonLink>
        <button type="button" className={home.shareBtn} onClick={() => void share()}><Icon name="up" size={18} />{shared ? 'Lien copié' : 'Partager'}</button>
      </div>
    </section>
  );
}


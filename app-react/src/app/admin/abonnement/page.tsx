'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { PLANS, PLAN_FEATURES, openPortal, planOf, subscribe, syncPlans, type Plan } from '@/lib/billing';
import { money } from '@/lib/format';
import { storeName } from '@/lib/stores';
import styles from './abonnement.module.css';

const NB = ' ';
const until = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '');

/** The plan of ONE store (a subscription is for a store, not for the account), paid by card at Stripe. */
export default function PlanPage() {
  const { store, reload } = useAdmin();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'info'; text: string } | null>(null);

  // back from Stripe: her plans are read from Stripe at once (no wait on the webhook), then the store is read again
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), back = q.get('abonnement');
    if (!back) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (back === 'annule') { setMessage({ tone: 'info', text: 'Paiement annulé. Rien n’a été prélevé.' }); return; }
    setMessage({ tone: 'info', text: 'Paiement reçu. Nous activons votre formule…' });
    void syncPlans().then(async (r) => { await reload(); setMessage(r.ok ? { tone: 'ok', text: 'Votre formule est active.' } : { tone: 'info', text: 'Paiement reçu. Votre formule sera active dans un instant : rechargez la page.' }); });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!store) return <><PageHead title="Abonnement" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Un abonnement vaut pour une boutique : choisissez d’abord un modèle.</Empty></>;

  const current = planOf(store.plan);
  const owner = store.role === 'owner';
  async function choose(p: Plan, period: 'mois' | 'semaine') {
    if (busy || !store) return;
    setBusy(`${p.id}-${period}`); setError('');
    const r = await subscribe(store.id, p.id, period);
    if (!r.ok) { setBusy(''); setError(r.message); }
  }
  async function manage() {
    if (busy) return;
    setBusy('portal'); setError('');
    const r = await openPortal();
    if (!r.ok) { setBusy(''); setError(r.message); }
  }

  return (
    <>
      <PageHead title="Abonnement" sub={`${storeName(store)} · formule ${current.name}${store.plan_until && current.month ? ` jusqu’au ${until(store.plan_until)}` : ''}`}
        action={current.month && owner ? <Button variant="secondary" busy={busy === 'portal'} onClick={() => void manage()}>Gérer mon abonnement</Button> : null} />
      {message ? <div className={styles.notice}><Notice tone={message.tone}>{message.text}</Notice></div> : null}
      {error ? <div className={styles.notice}><Notice tone="error">{error}</Notice></div> : null}
      {owner ? null : <div className={styles.notice}><Notice tone="info">Seule la propriétaire de cette boutique peut changer sa formule.</Notice></div>}

      <ul className={styles.plans}>
        {PLANS.map((p) => {
          const mine = p.id === current.id;
          return (
            <li key={p.id} className={styles.plan} data-mine={mine ? '' : undefined}>
              <div className={styles.head}><h2>{p.name}</h2>{mine ? <span className={styles.chip}>Votre formule</span> : null}</div>
              <p className={styles.for}>{p.forWho}</p>
              <p className={styles.price}><b>{p.month ? money(p.month) : `0${NB}FCFA`}</b>{p.month ? <span> / mois</span> : null}</p>
              <p className={styles.week}>{p.week ? `ou ${money(p.week)} par semaine` : NB}</p>
              <ul className={styles.facts}>
                <li><Icon name="check" size={16} />{p.orders === null ? 'Commandes illimitées' : `Jusqu’à ${p.orders} commandes par mois`}</li>
                <li><Icon name="check" size={16} />{p.fee ? `${p.fee}${NB}% par vente en ligne` : 'Aucune commission Jehre'}</li>
              </ul>
              {owner && !mine && p.month ? (
                <div className={styles.acts}>
                  <Button block busy={busy === `${p.id}-mois`} disabled={!!busy} onClick={() => void choose(p, 'mois')} aria-label={`Choisir ${p.name} au mois`}>Choisir {p.name}</Button>
                  {p.week ? <Button block variant="secondary" busy={busy === `${p.id}-semaine`} disabled={!!busy} onClick={() => void choose(p, 'semaine')} aria-label={`Choisir ${p.name} à la semaine`}>Payer à la semaine</Button> : null}
                </div>
              ) : null}
              {owner && !mine && !p.month && current.month ? <p className={styles.small}>Pour revenir à Gratuit, arrêtez votre abonnement dans « Gérer mon abonnement ».</p> : null}
            </li>
          );
        })}
      </ul>

      <section className={styles.all}>
        <h2>Dans toutes les formules</h2>
        <ul>{PLAN_FEATURES.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
        <p className={styles.small}>Paiement par carte, sécurisé par Stripe. Les frais du partenaire de paiement s’ajoutent.</p>
      </section>
    </>
  );
}

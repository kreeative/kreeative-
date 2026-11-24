'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { PLANS, PLAN_FEATURES, hasPlan, monthOrders, openPortal, planOf, subscribe, syncPlans, usage, type Plan } from '@/lib/billing';
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
  const [count, setCount] = useState<number | null>(null);
  const sid = store?.id ?? '';
  useEffect(() => { if (!sid) return; let on = true; void monthOrders(sid).then((x) => { if (on) setCount(x); }); return () => { on = false; }; }, [sid]);

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
      <PageHead title="Abonnement" sub={hasPlan(store.plan) ? `${storeName(store)} · formule ${current.name}${store.plan_until && current.month ? ` jusqu’au ${until(store.plan_until)}` : ''}` : `${storeName(store)} · aucune formule`}
        action={current.month && owner ? <Button variant="secondary" busy={busy === 'portal'} onClick={() => void manage()}>Gérer mon abonnement</Button> : null} />
      {message ? <div className={styles.notice}><Notice tone={message.tone}>{message.text}</Notice></div> : null}
      {error ? <div className={styles.notice}><Notice tone="error">{error}</Notice></div> : null}
      {owner ? null : <div className={styles.notice}><Notice tone="info">Seule la propriétaire de cette boutique peut changer sa formule.</Notice></div>}
      {owner && !hasPlan(store.plan) ? <div className={styles.notice}><Notice tone="warn" title="Choisissez une formule">Votre boutique reste en ligne. Choisissez la formule qui vous convient.</Notice></div> : null}

      {count !== null && hasPlan(store.plan) ? (() => { const u = usage(store.plan, count); const pct = u.limit ? Math.min(100, Math.round((count / u.limit) * 100)) : 0; return (
        <section className={styles.usage} aria-label="Commandes du mois" data-level={u.level}>
          <div><b>{u.limit === null ? `${count} commandes ce mois-ci` : `${count} / ${u.limit} commandes ce mois-ci`}</b><span>Toutes les commandes reçues par la boutique comptent, quel que soit le paiement.</span></div>
          {u.limit !== null ? <i aria-hidden="true"><s style={{ width: `${pct}%` }} /></i> : null}
          {u.level === 'over' && u.next ? <p>Vos commandes continuent d’arriver. La formule adaptée : <b>{u.next.name}</b>.</p> : null}
        </section>); })() : null}
      <ul className={styles.plans}>
        {PLANS.map((p) => {
          const mine = p.id === current.id;
          return (
            <li key={p.id} className={styles.plan} data-mine={mine ? '' : undefined}>
              <div className={styles.head}><h2>{p.name}</h2>{mine ? <span className={styles.chip}>Votre formule</span> : null}</div>
              <p className={styles.for}>{p.forWho}</p>
              <p className={styles.price}><b>{money(p.month)}</b><span> / mois</span></p>
              <ul className={styles.facts}>
                <li><Icon name="check" size={16} />{p.orders === null ? 'Commandes illimitées' : `Jusqu’à ${p.orders} commandes par mois`}</li>
                <li><Icon name="check" size={16} />{p.fee ? `${p.fee}${NB}% par vente en ligne` : 'Aucune commission Jehre'}</li>
                {p.live ? <li><Icon name="check" size={16} />En direct : qui visite votre boutique</li> : null}
              </ul>
              {owner && !mine && p.month ? (
                <div className={styles.acts}>
                  <Button block busy={busy === `${p.id}-mois`} disabled={!!busy} onClick={() => void choose(p, 'mois')} aria-label={`Choisir ${p.name} au mois`}>Choisir {p.name}</Button>
                </div>
              ) : null}
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

'use client';

import { useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { planOf, subscribe } from '@/lib/billing';
import { useZone, zprice } from '@/lib/zone';
import styles from './CardGate.module.css';

const day = (v?: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(+d) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''; };

/** Before the dashboard: the card for after the free month (nothing charged before its end), or, when it ended
 *  without one, the card that puts the store back online. Same rule for every store. */
export function CardGate({ need }: { need: 'trial' | 'offline' }) {
  const { store } = useAdmin();
  const z = useZone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!store) return null;
  const plan = planOf(store.plan && store.plan !== 'gratuit' ? store.plan : 'essentiel');
  const until = day(store.plan_until);
  async function add() {
    setBusy(true); setError('');
    const r = await subscribe(store!.id, plan.id, 'mois', '/admin/abonnement/');
    if (!r.ok) { setBusy(false); setError(r.message); }
  }
  return (
    <section className={styles.gate} aria-labelledby="card-gate-title">
      <span className={styles.icon} aria-hidden="true"><Icon name="wallet" size={26} /></span>
      <h1 id="card-gate-title">{need === 'trial' ? 'Ajoute ta carte' : 'Ta boutique est hors ligne'}</h1>
      {need === 'trial' ? (
        <p>Ton 1er mois est offert{until ? <> jusqu’au <b>{until}</b></> : null}. <b>Rien n’est prélevé avant.</b> Ensuite, formule {plan.name} : {zprice(z, plan.month, plan.cad)} par mois.</p>
      ) : (
        <p>Ton mois offert est terminé. Ajoute ta carte pour remettre ta boutique en ligne : formule {plan.name}, {zprice(z, plan.month, plan.cad)} par mois.</p>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button block busy={busy} icon="wallet" onClick={() => void add()}>Ajouter ma carte</Button>
      <ButtonLink block variant="quiet" href="/admin/abonnement/">Choisir une autre formule</ButtonLink>
      <small>Paiement sécurisé par Stripe. Tu peux arrêter à tout moment.</small>
    </section>
  );
}

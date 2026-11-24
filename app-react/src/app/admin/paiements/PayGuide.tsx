'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import styles from './guide.module.css';

export const GUIDE_KEY = 'jeere-pay-guide-seen';

/** How to set up her payments, on the whole screen: it comes to her the first time she opens Paiements and stays
 *  until she says « J'ai compris ». Afterwards « Comment configurer vos paiements ? » brings it back. */
export function PayGuide({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = was; };
  }, []);
  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-labelledby="pg-title">
      <div className={styles.inner}>
        <span className={styles.badge} aria-hidden="true"><Icon name="wallet" size={26} /></span>
        <h1 id="pg-title">Comment configurer vos paiements</h1>
        <p className={styles.lead}>Trois étapes pour être payée, sans attendre.</p>
        <ol className={styles.steps}>
          <li>
            <b>1</b>
            <div><h2>Activez Wave et collez votre lien marchand</h2><p>La cliente paie le montant exact, dès sa commande. C’est le plus sûr pour vous.</p><code>https://pay.wave.com/m/…</code></div>
          </li>
          <li>
            <b>2</b>
            <div><h2>Connectez Stripe pour les cartes bancaires</h2><p>Visa, Mastercard… depuis n’importe quel pays. L’argent arrive sur votre compte bancaire.</p></div>
          </li>
          <li>
            <b>3</b>
            <div><h2>Le reste, seulement si vous confirmez à la main</h2><p>Orange Money, MTN MoMo, Moov Money ou le paiement à la livraison : la cliente commande, puis vous vérifiez son paiement vous-même.</p></div>
          </li>
        </ol>
        <Button autoFocus block onClick={onDone} iconEnd="check">J’ai compris</Button>
      </div>
    </div>
  );
}

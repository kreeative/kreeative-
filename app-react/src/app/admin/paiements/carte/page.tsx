'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Select } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { cardCall, cardState, cardStatus, connectInstance, STRIPE_COUNTRIES, type CardStatus } from '@/lib/card';
import styles from '../paiements.module.css';
import own from './carte.module.css';

type Tab = 'activer' | 'ventes' | 'versements' | 'compte';
const TABS: [Tab, string, string][] = [['activer', 'Activation', 'account-onboarding'], ['ventes', 'Paiements', 'payments'], ['versements', 'Versements', 'payouts'], ['compte', 'Mon compte', 'account-management']];

/** Card payments: her own Stripe account, made INSIDE Jehre (Stripe's own secure forms, in Jehre's look) and tied to
 *  THIS store. First the country of her business, then Stripe asks for her identity and her bank account; once
 *  active, her card sales, payouts and account are here too. Jehre never sees these details. */
export default function CardPage() {
  const { store } = useAdmin();
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [country, setCountry] = useState('');
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [problem, setProblem] = useState<{ text: string; url?: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const owner = !!store && store.role === 'owner';

  useEffect(() => {
    if (!store?.id) return;
    let live = true;
    void cardStatus(store.id).then((s) => { if (!live) return; setStatus(s); setCountry(s.country || 'FR'); setTab(s.chargesEnabled ? 'ventes' : 'activer'); });
    return () => { live = false; };
  }, [store?.id]);

  const state = cardState(status);
  const needCountry = tab === 'activer' && !status?.connected && !started;
  // Stripe's form for the tab in view, mounted in the box below
  useEffect(() => {
    if (!store?.id || !tab || needCountry || state === 'soon' || state === 'loading') return;
    let live = true;
    setProblem(null);
    const el = box.current;
    if (!el) return;
    el.replaceChildren();
    void (async () => {
      try {
        const inst = await connectInstance(store.id, country);
        if (!live || !box.current) return;
        const comp = inst.create(TABS.find((t) => t[0] === tab)![2]);
        if (tab === 'activer') comp.setOnExit?.(() => { window.location.assign('/admin/paiements/?carte=1'); });
        box.current.replaceChildren(comp);
      } catch (e) {
        if (!live) return;
        const raw = String((e as Error)?.message ?? '');
        const text = /owner/.test(raw) ? 'Seule la propriétaire de la boutique peut connecter Stripe.'
          : /no_pk|config/.test(raw) ? 'Le paiement par carte se termine sur la page de Stripe.'
            : 'Stripe n’a pas pu s’ouvrir ici. Réessayez dans un instant.';
        // Stripe's own page, as a way out
        const j = tab === 'activer' ? await cardCall<{ url: string }>({ action: 'connect', storeId: store.id, country }) : await cardCall<{ url: string }>({ action: 'dashboard', storeId: store.id });
        if (live) setProblem({ text, url: j.ok ? j.url : undefined });
      }
    })();
    return () => { live = false; };
  }, [store?.id, tab, needCountry, state, country]);

  if (!store) return (<><PageHead title="Paiements par carte" /><Empty icon="wallet" title="Pas encore de boutique">Créez votre boutique pour accepter les cartes.</Empty></>);
  const back = <ButtonLink href="/admin/paiements/" variant="quiet" icon="back">Paiements</ButtonLink>;
  if (!status) return (<><PageHead title="Paiements par carte" action={back} /><CloudLoader /></>);
  if (state === 'soon') return (<><PageHead title="Paiements par carte" action={back} /><Notice tone="info">{status.message || 'Le paiement par carte s’ouvre bientôt sur Jehre.'}</Notice></>);

  const active = state === 'on';
  return (
    <>
      <PageHead title="Paiements par carte" sub={active ? 'Vos ventes par carte, vos versements et votre compte.' : 'Stripe vérifie votre identité et votre compte bancaire. Jehre ne voit pas ces informations.'} action={back} />
      <div className={own.page}>
        <ol className={own.steps} aria-label="Étapes">
          <li data-done={status.connected || started ? '' : undefined} data-on={needCountry ? '' : undefined}><b>1</b>Votre pays</li>
          <li data-done={status.detailsSubmitted ? '' : undefined} data-on={!needCountry && !active ? '' : undefined}><b>2</b>Identité et banque</li>
          <li data-done={active ? '' : undefined}><b>3</b>Carte active sur {store.slug}.jehre.com</li>
        </ol>
        {status.connected ? (
          <nav className={own.tabs} aria-label="Rubriques">
            {TABS.filter(([k]) => active || k === 'activer').map(([k, l]) => <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}</button>)}
          </nav>
        ) : null}
        {needCountry ? (
          <section className={own.start} aria-label="Votre pays">
            {!owner ? <Notice tone="info">Seule la propriétaire de la boutique peut connecter Stripe.</Notice> : (
              <>
                <Select label="Pays où votre activité est enregistrée" options={STRIPE_COUNTRIES.map(([, l]) => l)} value={STRIPE_COUNTRIES.find(([v]) => v === country)?.[1] ?? 'France'}
                  onChange={(e) => setCountry(STRIPE_COUNTRIES.find(([, l]) => l === e.target.value)?.[0] ?? 'FR')} />
                <p className={styles.note}>Ensuite, Stripe demande votre identité et le compte bancaire qui reçoit l’argent.</p>
                <Button variant="ink" onClick={() => setStarted(true)}>Commencer</Button>
              </>
            )}
          </section>
        ) : null}
        {problem ? <Notice tone="info" action={problem.url ? <a href={problem.url} target={tab === 'activer' ? undefined : '_blank'} rel="noopener"><b>Continuer sur Stripe</b></a> : undefined}>{problem.text}</Notice> : null}
        <section className={own.embed} hidden={needCountry || !!problem} aria-label="Formulaire sécurisé de Stripe">
          <div ref={box}><CloudLoader label="Ouverture du formulaire sécurisé…" /></div>
        </section>
      </div>
    </>
  );
}

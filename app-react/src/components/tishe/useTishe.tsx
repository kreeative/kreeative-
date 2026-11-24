'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { SHOPIFY_ORDERS, TISHE, tisheAuth, tisheCall, tisheConnect, tisheLink, type TisheLegacy, type TisheOverview } from '@/lib/tishe';
import styles from './tishe.module.css';

/* What the pages of The Ivory Sukundu read from the store, kept for the tab (one load per thing, again on
   « Actualiser » or after a change). */
const cache: Record<string, unknown> = {};
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());
export function tisheSet(key: string, v: unknown): void { cache[key] = v; ping(); }
export function tisheDrop(key: string): void { delete cache[key]; ping(); }

/** One thing of the store (`action`), loaded once: { data, error, reload }. */
export function useTisheData<T>(key: string, action: string, body: Record<string, unknown> = {}, pick?: (j: unknown) => T): { data: T | null; error: string; reload: () => void } {
  const { account } = useAdmin();
  const [, tick] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const load = useCallback(() => {
    setError('');
    tisheCall(action, body, account.userId).then((j) => tisheSet(key, pick ? pick(j) : j), (e: Error) => setError(e.message));
  }, [key, action, account.userId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!(key in cache)) load(); }, [key, load]);
  return { data: (cache[key] as T | undefined) ?? null, error, reload: () => { delete cache[key]; load(); } };
}

export const useOverview = () => useTisheData<TisheOverview>('overview', 'overview');
/** Every order of the old Shopify store: in full once the shop serves them (legacyOrders), else the three kept here. */
export function useLegacy(): TisheLegacy[] {
  const { data } = useTisheData<{ number: string; createdAt: string; total?: number; id: string; items?: { quantity?: number }[] }[]>('legacy', 'legacyOrders', {}, (j) => ((j as { orders?: [] }).orders ?? []));
  if (data && data.length) return data.map((o) => ({ number: o.number, createdAt: o.createdAt, total: (o.total || 0) / 100, items: (o.items || []).reduce((n, i) => n + (i.quantity || 1), 0) || 1, href: `/admin/commandes/?tx=${encodeURIComponent(o.id)}`, out: false }));
  return SHOPIFY_ORDERS;
}

/** The pages of the store open once she is signed in to it: with her Jehre account (at once, no e-mail), else
 *  with the link the store e-mails to the address that manages it. */
export function TisheGate({ title, children }: { title: string; children: ReactNode }) {
  const { account, tishe } = useAdmin();
  const [state, setState] = useState<'checking' | 'in' | 'out'>(() => (tisheAuth(account.userId) ? 'in' : 'checking'));
  const [email, setEmail] = useState(account.email || TISHE.owner);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(tishe.redeemError);
  useEffect(() => {
    if (state !== 'checking') return;
    let live = true;
    void tisheConnect(account.userId).then((ok) => { if (live) setState(ok ? 'in' : 'out'); });
    return () => { live = false; };
  }, [state, account.userId]);
  // a session that expires while she works: back to the sign-in
  useEffect(() => { const f = () => { if (!tisheAuth(account.userId)) setState('out'); }; listeners.add(f); return () => { listeners.delete(f); }; }, [account.userId]);
  if (state === 'in') return <>{children}</>;
  if (state === 'checking') return <><PageHead title={title} /><CloudLoader /></>;
  async function send() {
    setBusy(true); setError('');
    try { await tisheLink(email.trim()); setSent(true); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHead title="Connecter The Ivory Sukundu" sub="Ses commandes, ses produits, ses codes promo et son bandeau, ici même." />
      <section className={styles.card} style={{ maxWidth: 560 }}>
        <p className={styles.muted}>{sent ? <>Le lien est parti. Ouvrez l’e-mail <b>« Your dashboard sign-in link »</b> sur cet appareil : il vous ramène ici, connectée pour 30 jours.</> : 'La boutique vous envoie un lien de connexion par e-mail, à l’adresse qui la gère. Il marche 24 heures.'}</p>
        <Field label="Votre adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className={styles.acts}>
          <Button busy={busy} icon="mail" onClick={() => void send()}>{sent ? 'Renvoyer le lien' : 'Recevoir le lien de connexion'}</Button>
          <ButtonLink variant="secondary" icon="external" href={TISHE.site} target="_blank" rel="noopener">Voir la boutique</ButtonLink>
        </div>
      </section>
    </>
  );
}

/** A page of the store that could not load: its error and « Réessayer ». */
export function TisheError({ title, error, retry }: { title: string; error: string; retry: () => void }) {
  return (
    <>
      <PageHead title={title} />
      <section className={styles.card} style={{ maxWidth: 560 }}>
        <Notice tone="error">{error}</Notice>
        <div className={styles.acts}><Button variant="secondary" icon="refresh" onClick={retry}>Réessayer</Button></div>
      </section>
    </>
  );
}

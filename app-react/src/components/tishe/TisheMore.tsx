'use client';

import { useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Check, Field, TextArea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Toast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { dollars, TISHE, tisheAuth, tisheCall, tisheForget } from '@/lib/tishe';
import { saveTx, useTxStore } from './TisheProducts';
import { TisheError, TisheGate, tisheDrop, useTisheData } from './useTishe';
import styles from './tishe.module.css';

const day = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };

/* ------------------------------------------------------------------ Bandeau et soldes */

interface TxSite { announcements?: string[]; sale?: { name?: string; banner?: string; endsAt?: string; handles?: string[] } | null }
/** The announcement bar (its messages pass one after the other) and the sale (its name, its end, its products). */
export function TisheBanner() { return <TisheGate title="Bandeau et soldes"><Banner /></TisheGate>; }
function Banner() {
  const { data, error, reload } = useTxStore();
  if (error && !data) return <TisheError title="Bandeau et soldes" error={error} retry={reload} />;
  if (!data) return <><PageHead title="Bandeau et soldes" /><CloudLoader /></>;
  return <BannerForm />;
}
function BannerForm() {
  const { account } = useAdmin();
  const { data } = useTxStore();
  const site = ((data!.doc as { site?: TxSite }).site ?? {}) as TxSite, sale = site.sale ?? null, products = data!.doc.products ?? [];
  const [ann, setAnn] = useState<string[]>(() => [...(site.announcements ?? []), '', '', '', '', '', ''].slice(0, 6));
  const [on, setOn] = useState(!!sale);
  const [name, setName] = useState(sale?.name ?? 'Sale');
  const [ends, setEnds] = useState(sale?.endsAt ? sale.endsAt.slice(0, 16) : '');
  const [banner, setBanner] = useState(sale?.banner ?? '');
  const [handles, setHandles] = useState<string[]>(sale?.handles ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  async function save() {
    if (on && !ends) { setError('Choisissez la fin des soldes.'); return; }
    setBusy(true); setError('');
    try {
      await saveTx('saveSite', { announcements: ann.filter((a) => a.trim()), sale: on && ends ? { name, banner, endsAt: new Date(ends).toISOString(), handles } : null }, account.userId, data);
      setToast('Bandeau et soldes enregistrés sur la boutique.');
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHead title="Bandeau et soldes" sub="Les messages en haut de theivorysukundu.com, et vos soldes." action={<ButtonLink variant="secondary" icon="external" href={TISHE.site} target="_blank" rel="noopener">Voir la boutique</ButtonLink>} />
      <div className={styles.page}>
        <section className={styles.card} aria-label="Bandeau d’annonces">
          <div className={styles.cardHead}><h2>Bandeau d’annonces</h2></div>
          <div className={styles.two}>{ann.map((a, i) => <Field key={i} label={`Message ${i + 1}`} maxLength={70} value={a} onChange={(e) => setAnn((l) => l.map((x, k) => (k === i ? e.target.value : x)))} />)}</div>
          <p className={styles.muted}>Ils défilent l’un après l’autre. Laissez vide pour en retirer un.</p>
        </section>
        <section className={styles.card} aria-label="Soldes">
          <div className={styles.cardHead}><h2>Soldes</h2></div>
          <Check checked={on} onChange={(e) => setOn(e.target.checked)}>Des soldes en cours</Check>
          {on ? <>
            <div className={styles.two}>
              <Field label="Nom des soldes" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              <Field label="Fin des soldes" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
            <Field label="Phrase dans le bandeau pendant les soldes" maxLength={60} value={banner} onChange={(e) => setBanner(e.target.value)} />
            <p className={styles.caption}>Produits en solde</p>
            <div className={styles.checks}>{products.map((p) => <Check key={p.handle} checked={handles.includes(p.handle)} onChange={(e) => setHandles((l) => (e.target.checked ? [...l, p.handle] : l.filter((h) => h !== p.handle)))}>{p.title}</Check>)}</div>
            <p className={styles.muted}>Le prix barré de chaque option se règle dans le produit.</p>
          </> : null}
        </section>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className={styles.acts}><Button busy={busy} icon="check" onClick={() => void save()}>Enregistrer sur la boutique</Button></div>
      </div>
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </>
  );
}

/* ------------------------------------------------------------------ Livraison */

interface TxZone { id: string; label: string; currency: string; rate: number; countries?: string[] }
/** The price of the delivery, by zone (each in its own currency). */
export function TisheShipping() { return <TisheGate title="Livraison"><Shipping /></TisheGate>; }
function Shipping() {
  const { data, error, reload } = useTxStore();
  if (error && !data) return <TisheError title="Livraison" error={error} retry={reload} />;
  if (!data) return <><PageHead title="Livraison" /><CloudLoader /></>;
  return <ShippingForm />;
}
function ShippingForm() {
  const { account } = useAdmin();
  const { data } = useTxStore();
  const sh = (data!.doc.shipping ?? { zones: [] }) as unknown as { zones?: TxZone[]; freeShippingCode?: string };
  const zones = sh.zones ?? [];
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(zones.map((z) => [z.id, String(z.rate ?? '')])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  async function save() {
    const out: Record<string, number> = {};
    for (const z of zones) { const n = Number(String(rates[z.id] ?? '').replace(',', '.')); if (!isFinite(n) || n < 0) { setError(`Prix invalide pour ${z.label}.`); return; } out[z.id] = n; }
    setBusy(true); setError('');
    try { await saveTx('saveShipping', { rates: out }, account.userId, data); setToast('Tarifs de livraison enregistrés.'); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHead title="Livraison" sub={`Le prix de la livraison par zone.${sh.freeShippingCode ? ` Livraison offerte avec ${sh.freeShippingCode}.` : ''}`} />
      <div className={styles.page}>
        <section className={styles.card} aria-label="Zones">
          <div className={styles.two}>
            {zones.map((z) => <Field key={z.id} label={`${z.label} (${z.currency})`} inputMode="decimal" value={rates[z.id] ?? ''} onChange={(e) => setRates((r) => ({ ...r, [z.id]: e.target.value }))} hint={(z.countries ?? []).slice(0, 8).join(', ') + ((z.countries ?? []).length > 8 ? '…' : '')} />)}
          </div>
          {!zones.length ? <p className={styles.muted}>Aucune zone sur la boutique.</p> : null}
        </section>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className={styles.acts}><Button busy={busy} icon="check" onClick={() => void save()}>Enregistrer</Button></div>
      </div>
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </>
  );
}

/* ------------------------------------------------------------------ Clients */

interface TxCustomer { name: string; email: string; country?: string; orders: number; spent: number; last?: string }
interface TxSubscriber { email: string; firstName?: string; createdAt?: string; unsubscribed?: boolean }
/** Its customers (orders, spent), the subscribers of The Circle, and an e-mail to anyone, sent from the shop. */
export function TisheClients() { return <TisheGate title="Clientes"><Clients /></TisheGate>; }
function Clients() {
  const { account } = useAdmin();
  const c = useTisheData<TxCustomer[]>('customers', 'customers', {}, (j) => (j as { customers?: TxCustomer[] }).customers ?? []);
  const s = useTisheData<TxSubscriber[]>('subscribers', 'subscribers', {}, (j) => (j as { subscribers?: TxSubscriber[] }).subscribers ?? []);
  const [to, setTo] = useState(''); const [subject, setSubject] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [toast, setToast] = useState('');
  if (c.error && !c.data) return <TisheError title="Clientes" error={c.error} retry={c.reload} />;
  if (!c.data) return <><PageHead title="Clientes" /><CloudLoader /></>;
  const subs = s.data ?? [];
  async function send() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim()) || !message.trim()) { setError('Une adresse e-mail et un message, s’il vous plaît.'); return; }
    setBusy(true); setError('');
    try { await tisheCall('email', { to: to.trim(), subject, message }, account.userId); setToast('E-mail envoyé.'); setTo(''); setSubject(''); setMessage(''); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHead title="Clientes" sub={`${plural(c.data.length, 'cliente', 'clientes')} · ${plural(subs.length, 'abonnée', 'abonnées')} au Circle.`} />
      <div className={styles.page}>
        <section className={styles.card} aria-label="Clientes">
          <div className={styles.cardHead}><h2>Clientes</h2></div>
          {c.data.length ? (
            <ul className={styles.orows}>
              {c.data.map((x) => (
                <li key={x.email}><button type="button" className={styles.orow} onClick={() => setTo(x.email)}>
                  <span className={styles.otop}><b>{x.name || x.email}</b><span className={styles.amount}>{dollars(x.spent)}</span></span>
                  <span className={styles.oline}><span>{x.email}{x.country ? ` · ${x.country}` : ''}</span><span>{plural(x.orders, 'commande', 'commandes')}{x.last ? ` · ${day(x.last)}` : ''}</span></span>
                </button></li>
              ))}
            </ul>
          ) : <p className={styles.muted}>Pas encore de cliente.</p>}
        </section>
        <section className={styles.card} aria-label="Abonnées au Circle">
          <div className={styles.cardHead}><h2>Abonnées au Circle</h2></div>
          {subs.length ? <ul className={styles.orows}>{subs.slice(0, 200).map((x) => <li key={x.email} className={styles.sub}><b>{x.email}</b><span className={styles.muted}>{[x.firstName, day(x.createdAt), x.unsubscribed ? 'désabonnée' : ''].filter(Boolean).join(' · ')}</span></li>)}</ul> : <p className={styles.muted}>Personne pour l’instant.</p>}
        </section>
        <section className={styles.card} aria-label="Écrire à une cliente">
          <div className={styles.cardHead}><h2>Écrire à une cliente</h2></div>
          <div className={styles.two}>
            <Field label="À" type="email" placeholder="cliente@exemple.com" value={to} onChange={(e) => setTo(e.target.value)} />
            <Field label="Objet" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <TextArea label="Message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className={styles.acts}><Button busy={busy} icon="mail" onClick={() => void send()}>Envoyer depuis la boutique</Button></div>
        </section>
      </div>
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </>
  );
}

/* ------------------------------------------------------------------ Paramètres */

/** Its own site: its settings are at the services that run it; and a way to disconnect this browser. */
export function TisheSettings() {
  const { account } = useAdmin();
  const a = tisheAuth(account.userId);
  const [out, setOut] = useState(false);
  const links: [string, string, string, string][] = [
    ['Paiements', 'Les paiements par carte, les remboursements et les virements vers votre banque.', 'https://dashboard.stripe.com', 'Ouvrir Stripe'],
    ['E-mails', 'Les e-mails envoyés à vos clientes : confirmations, expédition, offres.', 'https://resend.com/emails', 'Ouvrir Resend'],
    ['Nom de domaine et hébergement', 'Le nom de domaine et l’hébergement du site.', 'https://vercel.com/dashboard', 'Ouvrir Vercel'],
  ];
  return (
    <>
      <PageHead title="Paramètres" sub="The Ivory Sukundu a son propre site : ses réglages se font chez les services qui la font tourner." />
      <div className={styles.page}>
        <section className={styles.card} aria-label="Votre boutique">
          <div className={styles.cardHead}><h2>Votre boutique</h2></div>
          <dl className={styles.dl}>
            <div><dt>Boutique</dt><dd>{TISHE.name}</dd></div>
            <div><dt>Adresse</dt><dd><a href={TISHE.site} target="_blank" rel="noopener"><b>{TISHE.url}</b></a></dd></div>
            <div><dt>Connectée avec</dt><dd>{a?.email || TISHE.owner}</dd></div>
          </dl>
        </section>
        {links.map(([t, p, href, l]) => (
          <section key={t} className={styles.card} aria-label={t}>
            <div className={styles.cardHead}><h2>{t}</h2></div>
            <p className={styles.muted}>{p}</p>
            <div className={styles.acts}><ButtonLink variant="secondary" icon="external" href={href} target="_blank" rel="noopener">{l}</ButtonLink></div>
          </section>
        ))}
        <section className={styles.card} aria-label="Cet appareil">
          <div className={styles.cardHead}><h2>Cet appareil</h2></div>
          <p className={styles.muted}>{out ? 'La boutique est déconnectée de ce navigateur. Votre compte Jehre suffit pour revenir.' : 'Vous restez connectée 30 jours sur cet appareil. Votre compte Jehre suffit pour revenir.'}</p>
          {!out ? <div className={styles.acts}><Button variant="quiet" icon="logout" onClick={() => { tisheForget(); ['overview', 'store', 'customers', 'subscribers', 'legacy'].forEach(tisheDrop); setOut(true); }}>Déconnecter la boutique de ce navigateur</Button></div> : null}
        </section>
      </div>
    </>
  );
}

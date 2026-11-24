'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { DOMAIN_STATUS, attachDomain, buyDomain, detachDomain, dnsRecords, searchDomains, verifyDomain, type DnsRecord, type DomainOffer } from '@/lib/billing';
import { money } from '@/lib/format';
import shared from '../admin.module.css';
import styles from '../abonnement/abonnement.module.css';

/** The address of a store: the free one, a domain she already owns (connected here), or one bought here by card. */
export default function DomainPage() {
  const { store, model, reload } = useAdmin();
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'info'; text: string } | null>(null);
  const [records, setRecords] = useState<DnsRecord[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [query, setQuery] = useState('');
  const [offers, setOffers] = useState<DomainOffer[] | null>(null);
  const [searchNote, setSearchNote] = useState('');

  // back from the card payment of a domain
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), back = q.get('domaine'), name = q.get('nom') ?? '';
    if (!back) return;
    window.history.replaceState(null, '', window.location.pathname);
    setMessage(back === 'ok'
      ? { tone: 'ok', text: `Paiement reçu. Nous achetons ${name || 'votre nom de domaine'} et le relions à votre boutique : il sera actif dans quelques minutes.` }
      : { tone: 'info', text: 'Paiement annulé. Rien n’a été prélevé.' });
    if (back === 'ok') { const t = setTimeout(() => void reload(), 8000); return () => clearTimeout(t); }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!store) return <><PageHead title="Nom de domaine" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez d’abord un modèle : votre boutique aura tout de suite une adresse gratuite.</Empty></>;

  const owner = store.role === 'owner';
  const domain = store.custom_domain ?? '';
  const status = DOMAIN_STATUS[store.domain_status ?? ''] ?? null;
  const free = model ? `${store.slug}.store.jehre.com` : `jehre.com/b/${store.slug}`;
  // the DNS lines are shown until the domain answers; once active there is nothing left to do
  const shown = domain && store.domain_status !== 'verified' ? records ?? dnsRecords(domain) : null;
  const run = async <T,>(key: string, f: () => Promise<{ ok: true } & T | { ok: false; message: string }>): Promise<T | null> => {
    if (busy) return null;
    setBusy(key); setError(''); setMessage(null);
    const r = await f();
    setBusy('');
    if (!r.ok) { setError(r.message); return null; }
    return r;
  };

  async function attach(e: FormEvent) {
    e.preventDefault();
    const name = own.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) { setError('Écrivez le domaine sans espace ni « https », par exemple maboutique.com.'); return; }
    const r = await run('attach', () => attachDomain(store!.id, name));
    if (!r) return;
    setRecords(r.records); setOwn(''); await reload();
    setMessage(r.status === 'verified' ? { tone: 'ok', text: `${r.domain} est relié et actif.` } : { tone: 'info', text: `${r.domain} est enregistré. Il reste à faire les deux réglages ci-dessous chez la société qui vous l’a vendu.` });
  }
  async function verify() {
    const r = await run('verify', () => verifyDomain(store!.id));
    if (!r) return;
    setRecords(r.records); await reload();
    setMessage(r.status === 'verified' ? { tone: 'ok', text: `${r.domain} est actif. Votre boutique répond à cette adresse.` } : { tone: 'info', text: 'Pas encore : les réglages peuvent mettre jusqu’à 24 h à être visibles. Réessayez plus tard.' });
  }
  async function detach() {
    const r = await run('detach', () => detachDomain(store!.id));
    if (!r) return;
    setConfirm(false); setRecords(null); await reload();
    setMessage({ tone: 'ok', text: 'Le domaine est retiré. Votre boutique garde son adresse gratuite.' });
  }
  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) { setError('Écrivez au moins deux lettres, par exemple maboutique.'); return; }
    setOffers(null); setSearchNote('');
    const r = await run('search', () => searchDomains(query));
    if (!r) return;
    if (!r.configured || !r.results) { setSearchNote(r.message ?? 'La recherche n’est pas disponible pour l’instant.'); return; }
    setOffers(r.results);
  }
  async function buy(d: DomainOffer) {
    if (busy) return;
    setBusy(d.domain); setError('');
    const r = await buyDomain(d.domain, store!.id);
    if (!r.ok) { setBusy(''); setError(r.message); }
  }

  return (
    <>
      <PageHead title="Nom de domaine" sub="L’adresse à laquelle vos clientes trouvent votre boutique." />
      <div className={styles.page}>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        <section className={shared.card}>
          <div className={shared.cardHead}><h2>Votre adresse</h2></div>
          <div className={styles.stack}>
            <p className={styles.address}><b>{free}</b><span className={styles.pill} data-tone="ok">Gratuite</span></p>
            {domain ? <p className={styles.address}><b>{domain}</b>{status ? <span className={styles.pill} data-tone={status.tone}>{status.label}</span> : null}</p> : null}
            {domain && owner ? (
              <div className={shared.sheetActions}>
                {store.domain_status !== 'verified' ? <Button busy={busy === 'verify'} disabled={!!busy} onClick={() => void verify()}>Vérifier maintenant</Button> : null}
                {confirm
                  ? <><Button variant="secondary" icon="trash" busy={busy === 'detach'} disabled={!!busy} onClick={() => void detach()}>Oui, retirer</Button><Button variant="quiet" onClick={() => setConfirm(false)}>Annuler</Button></>
                  : <Button variant="quiet" icon="trash" disabled={!!busy} onClick={() => setConfirm(true)}>Retirer ce domaine</Button>}
              </div>
            ) : null}
          </div>
        </section>

        {shown && domain ? (
          <section className={shared.card} aria-label="Réglages DNS">
            <div className={shared.cardHead}><h2>Les deux réglages à faire</h2></div>
            <p className={shared.muted}>Chez la société qui vous a vendu {domain} (GoDaddy, Namecheap, OVH, Amazon…), dans « DNS », ajoutez ces lignes. Puis revenez ici et appuyez sur « Vérifier maintenant ».</p>
            <table className={styles.dns}>
              <thead><tr><th>Type</th><th>Nom</th><th>Valeur</th></tr></thead>
              <tbody>{shown.map((r) => <tr key={r.type + r.name}><td>{r.type}</td><td>{r.name}</td><td>{r.value}</td></tr>)}</tbody>
            </table>
          </section>
        ) : null}

        {owner && !domain ? (
          <div className={shared.pair}>
            <section className={shared.card}>
              <div className={shared.cardHead}><h2>J’ai déjà un nom de domaine</h2></div>
              <form className={styles.line} onSubmit={attach} noValidate>
                <Field label="Votre domaine" placeholder="maboutique.com" inputMode="url" autoCapitalize="none" value={own} onChange={(e) => setOwn(e.target.value)} />
                <Button type="submit" busy={busy === 'attach'} disabled={!!busy}>Relier</Button>
              </form>
            </section>

            <section className={shared.card}>
              <div className={shared.cardHead}><h2>Acheter un nom de domaine</h2></div>
              <div className={styles.stack}>
                <form className={styles.line} onSubmit={search} noValidate>
                  <Field label="Le nom que vous voulez" placeholder="maboutique" autoCapitalize="none" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <Button type="submit" variant="secondary" icon="search" busy={busy === 'search'} disabled={!!busy}>Chercher</Button>
                </form>
                {searchNote ? <p className={shared.muted}>{searchNote}</p> : null}
                {offers ? (
                  <ul className={styles.offers}>
                    {offers.map((d) => (
                      <li key={d.domain} data-taken={d.available && d.purchaseFcfa ? undefined : ''}>
                        <span><b>{d.domain}</b><small>{d.available && d.purchaseFcfa ? `${money(d.purchaseFcfa)} la première année${d.renewalFcfa ? `, puis ${money(d.renewalFcfa)} par an` : ''}` : 'Déjà pris'}</small></span>
                        {d.available && d.purchaseFcfa ? <Button busy={busy === d.domain} disabled={!!busy} onClick={() => void buy(d)} aria-label={`Acheter ${d.domain}`}>Acheter</Button> : <span />}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className={shared.muted}>Paiement par carte, sécurisé par Stripe. Le domaine est à vous, relié à votre boutique automatiquement.</p>
              </div>
            </section>
          </div>
        ) : null}
        {owner ? null : <Notice tone="info">Seule la propriétaire de cette boutique peut changer son adresse.</Notice>}
      </div>
    </>
  );
}

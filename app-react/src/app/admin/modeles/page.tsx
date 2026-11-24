'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { money } from '@/lib/format';
import { CUSTOM_FROM, MODELS, askTeam, buyModel, installPrice, modelBySlug, modelPreview, modelThumb, withModel, type Model } from '@/lib/models';
import { createStore, saveFiche, storeName, storeUrl } from '@/lib/stores';
import { Icon } from '@/components/ui/Icon';
import styles from './modeles.module.css';

type Way = 'self' | 'install' | 'custom';
const NOTE: Record<Way, string> = {
  self: 'Payé une seule fois. L’abonnement de la boutique est à part.',
  install: 'Rien à payer maintenant. Vous recevez votre devis sur WhatsApp : vous le signez, vous payez, puis vous envoyez vos photos et vos textes.',
  custom: 'Rien à payer maintenant. On vous écrit sur WhatsApp pour fixer l’appel.',
};
const ACTION: Record<Way, string> = { self: 'Payer par carte', install: 'Recevoir mon devis', custom: 'Demander un appel' };

/** The designer models: a site drawn for one trade, paid once. Same cards and same words as the current dashboard. */
export default function ModelsPage() {
  const { account, store, reload, models: owned, model: current } = useAdmin();
  const { busy, problem, write } = useSave();
  const [open, setOpen] = useState<Model | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'info'; text: string; edit?: boolean } | null>(null);
  const [arriving, setArriving] = useState('');
  // a seller who has her site sees HER shop here; all the models come under « Voir plus de modèles »
  const [all, setAll] = useState(false);
  const now = useRef({ owned, store, current });
  now.current = { owned, store, current };

  // Back from the card payment. The payment server writes the purchase a moment after the card is accepted: the
  // account is read again until the model is in it, then it is put on her store (made for her if she has none yet),
  // so the site she just bought is in her account at once, ready to edit.
  useEffect(() => {
    if (!arriving) return;
    let on = true;
    const m = modelBySlug(arriving)!;
    void (async () => {
      for (let i = 0; on && i < 10 && !now.current.owned.includes(arriving); i++) { await new Promise((r) => setTimeout(r, i ? 2500 : 0)); if (on) { await reload(); await new Promise((r) => setTimeout(r, 60)); } }
      if (!on) return;
      if (!now.current.owned.includes(arriving)) { setArriving(''); setMessage({ tone: 'info', text: `Paiement reçu. Le modèle ${m.name} arrive dans votre compte dans un instant : rechargez la page.` }); return; }
      // a buyer without a store got one when her account was read again (AdminContext); here the model is only
      // put on a store she already had, when it is not the one in use
      await new Promise((r) => setTimeout(r, 60));
      const st = now.current.store;
      if (st && now.current.current !== arriving) { await saveFiche(st, withModel(st.fiche, arriving, now.current.current)); await reload(); }
      if (!on) return;
      setArriving(''); setMessage({ tone: 'ok', text: `Paiement reçu. Le modèle ${m.name} est à vous, il est dans votre compte.`, edit: true });
    })();
    return () => { on = false; };
  }, [arriving]);   // eslint-disable-line react-hooks/exhaustive-deps
  // back from the card payment (?modele=ok&nom=…), or sent here to choose one model (?choisir=…)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get('modele'), m = modelBySlug(q.get('nom') ?? q.get('choisir') ?? '');
    if (paid === 'ok') { if (m) { setMessage({ tone: 'info', text: `Paiement reçu. Nous mettons le modèle ${m.name} dans votre compte…` }); setArriving(m.slug); } else setMessage({ tone: 'ok', text: 'Paiement reçu. Votre modèle est à vous.' }); }
    else if (paid === 'annule') setMessage({ tone: 'info', text: 'Paiement annulé. Rien n’a été prélevé.' });
    else if (m) { setOpen(m); setAll(true); }
    if (q.has('tous')) setAll(true);
    if (paid || q.has('choisir')) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const close = useCallback(() => setOpen(null), []);

  async function use(m: Model) {
    if (busy || !owned.includes(m.slug) || current === m.slug) return;
    // she bought it before having a store: her store is made now, with this model
    if (!store) { if (await createStore(account.storeName || 'Ma boutique', m.slug)) { await reload(); setMessage({ tone: 'ok', text: `Votre boutique utilise maintenant le modèle ${m.name}.`, edit: true }); } return; }
    if (await write(withModel(store.fiche, m.slug, current))) setMessage({ tone: 'ok', text: `Votre boutique utilise maintenant le modèle ${m.name}.`, edit: true });
  }

  const notices = (<>
      {message ? <div className={styles.notice}><Notice tone={message.tone} action={message.edit ? <ButtonLink href={store ? `/admin/editeur/?b=${store.id}` : '/admin/editeur/'} icon="edit">Modifier mon site</ButtonLink> : undefined}>{message.text}</Notice></div> : null}
      {problem ? <div className={styles.notice}><Notice tone="error">{problem === 'conflict' ? 'Votre boutique a été modifiée ailleurs. Rechargez la page, puis réessayez.' : 'Le modèle n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.'}</Notice></div> : null}
  </>);
  const mineNow = current ? modelBySlug(current) : undefined;
  if (store && mineNow && !all && !arriving) {
    const others = MODELS.filter((m) => owned.includes(m.slug) && m.slug !== mineNow.slug);
    const url = storeUrl(store, current);
    return (
      <>
        <PageHead title="Ma boutique" sub={storeName(store)} />
        {notices}
        <section className={styles.mine} aria-label="Votre site">
          <a className={styles.mineShot} href={`/admin/editeur/?b=${store.id}`} aria-label="Modifier mon site">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modelThumb(mineNow.slug)} alt="" width={640} height={400} decoding="async" />
          </a>
          <div className={styles.mineBody}>
            <p className={styles.mineState} data-on={store.published ? '' : undefined}><i aria-hidden="true" />{store.published ? 'En ligne' : 'Pas encore en ligne'}</p>
            <p className={styles.mineName}>Modèle {mineNow.name}</p>
            <p className={styles.kind}>{url.replace(/^https:\/\//, '')}</p>
            <div className={styles.mineActs}>
              <ButtonLink href={`/admin/editeur/?b=${store.id}`} icon="edit">Modifier mon site</ButtonLink>
              <ButtonLink variant="secondary" href={url} target="_blank" rel="noopener" icon="eye">Voir ma boutique</ButtonLink>
            </div>
          </div>
        </section>
        <ul className={styles.mineLinks} aria-label="Réglages de la boutique">
          {([['/admin/produits/', 'tag', 'Produits', 'Photos, prix, catégories'], ['/admin/branding/', 'brush', 'Branding', 'Logo, couleurs, boutons'], ['/admin/paiements/', 'wallet', 'Paiements', 'Wave, Stripe, mobile money'], ['/admin/domaine/', 'link', 'Adresse du site', 'Votre nom de domaine']] as const).map(([href, icon, title, sub]) => (
            <li key={href}><a href={href}><span aria-hidden="true"><Icon name={icon} size={20} /></span><span><b>{title}</b><small>{sub}</small></span><Icon name="chevron" size={16} /></a></li>
          ))}
        </ul>
        {others.length ? (
          <section className={styles.mineOthers} aria-label="Vos autres modèles">
            <h2>Vos autres modèles</h2>
            <ul>{others.map((m) => <li key={m.slug}><span>{m.name}<small>{m.kind}</small></span><Button variant="secondary" busy={busy} onClick={() => void use(m)}>Utiliser</Button></li>)}</ul>
          </section>
        ) : null}
        <button type="button" className={styles.more} onClick={() => { setAll(true); window.scrollTo(0, 0); }}><Icon name="template" size={18} />Voir plus de modèles<Icon name="chevron" size={16} /></button>
      </>
    );
  }

  return (
    <>
      {store && mineNow ? <button type="button" className={styles.backMine} onClick={() => { setAll(false); window.scrollTo(0, 0); }}><Icon name="back" size={16} />Ma boutique</button> : null}
      <PageHead title="Modèles de designer" sub={owned.length > 1
        ? 'Les modèles achetés sont à vous : passez de l’un à l’autre quand vous voulez, vos textes et vos photos sont gardés pour chacun.'
        : 'Un site dessiné pour votre métier, payé une seule fois. Vous le remplissez vous-même, ou notre équipe l’installe pour vous.'} />
      {notices}

      <ul className={styles.grid}>
        {MODELS.map((m) => {
          const mine = owned.includes(m.slug);
          return (
            <li key={m.slug} className={styles.card}>
              <a className={styles.shot} href={modelPreview(m.slug)} aria-label={`Voir la démo du modèle ${m.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={modelThumb(m.slug)} alt="" width={640} height={400} loading="lazy" decoding="async" />
                <span className={styles.example} aria-hidden="true">Exemple de mise en page</span>
              </a>
              <div className={styles.body}>
                <p className={styles.name}>{m.name}</p>
                <p className={styles.kind}>{m.kind}</p>
                <p className={styles.price}><strong>{money(m.price)}</strong>{m.was ? <> <s>{money(m.was)}</s></> : null}</p>
                <div className={styles.acts}>
                  {current === m.slug ? <ButtonLink href={store ? `/admin/editeur/?b=${store.id}` : '/admin/editeur/'} icon="edit" aria-label={`Modifier mon site ${m.name}`}>Modifier</ButtonLink>
                    : mine ? <Button busy={busy} onClick={() => void use(m)}>Utiliser ce modèle</Button>
                      : <Button onClick={() => setOpen(m)} aria-label={`Choisir le modèle ${m.name}`}>Choisir</Button>}
                  <ButtonLink variant="secondary" href={modelPreview(m.slug)}>Voir la démo</ButtonLink>
                </div>
                {mine ? <p className={styles.small}>{current === m.slug ? <b>Modèle utilisé</b> : null}{current === m.slug ? ' · ' : ''}Acheté · il est à vous</p> : null}
              </div>
            </li>
          );
        })}
      </ul>

      {open ? <Choose key={open.slug} model={open} onClose={close} firstName={account.firstName} phone={account.phone} email={account.email ?? ''}
        storeId={store?.id ?? ''} shopName={store?.fiche.store?.name ?? account.storeName ?? ''} sells={store?.fiche.store?.tagline ?? ''}
        onAsked={(text) => { setOpen(null); setMessage({ tone: 'ok', text }); }} /> : null}
    </>
  );
}

/** « Comment voulez-vous l’installer ? »: she fills it herself (card payment), the team installs it (a quote),
 *  or a made-to-measure site (a call). Only the first one is paid here. */
function Choose({ model: m, onClose, onAsked, firstName, phone, email, storeId, shopName, sells }: {
  model: Model; onClose: () => void; onAsked: (text: string) => void; firstName: string; phone: string; email: string; storeId: string; shopName: string; sells: string;
}) {
  const [way, setWay] = useState<Way>('self');
  const [count, setCount] = useState('1 à 10');
  const [photos, setPhotos] = useState('Oui');
  const [logo, setLogo] = useState('Oui');
  const [wa, setWa] = useState(phone);
  const [need, setNeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waError, setWaError] = useState('');
  const pick = (w: Way) => { setWay(w); setError(''); setWaError(''); };

  async function go() {
    setError(''); setWaError('');
    if (way === 'self' || m.installIncluded) {
      setBusy(true);
      const r = await buyModel(m.slug, { storeId, shopName, sells });
      if (!r.ok) { setBusy(false); setError(r.message); }
      return;
    }
    if (wa.replace(/\D/g, '').length < 8) { setWaError('Écrivez un numéro WhatsApp complet, avec l’indicatif.'); return; }
    const quote = way === 'install';
    setBusy(true);
    const r = await askTeam({
      firstName: firstName || shopName || 'Cliente Jehre', whatsapp: wa.trim(), link: shopName,
      need: (quote ? `DEVIS INSTALLATION. Modèle : ${m.name}. Produits : ${count}. Photos prêtes : ${photos}. Logo : ${logo}. E-mail : ${email}. ` : `Modèle regardé : ${m.name}. `) + need.trim(),
      source: quote ? 'devis-installation' : 'tableau-de-bord',
    });
    setBusy(false);
    if (r.ok) onAsked(quote ? 'C’est noté. Vous recevez votre devis sur WhatsApp très vite.' : 'C’est noté. On vous écrit sur WhatsApp très vite pour votre site sur mesure.');
    else setError(r.message);
  }

  const options: { id: Way; title: string; price: string; text: string }[] = [
    { id: 'self', title: 'Je remplis moi-même', price: money(m.price), text: 'Vous ajoutez vous-même vos produits, vos prix et vos photos depuis votre tableau de bord.' },
    { id: 'install', title: 'Jehre installe tout pour moi', price: `Dès ${money(m.price + installPrice(m))}`, text: 'Nous mettons tout en place : jusqu’à 10 produits et 2 séries de corrections. Au-delà, c’est sur devis. Répondez à 3 questions, vous recevez votre devis à signer.' },
    { id: 'custom', title: 'Un site 100 % sur mesure', price: `À partir de ${money(CUSTOM_FROM)}`, text: 'Vous ne voulez pas d’un modèle ? Le designer de Kreeative dessine un site unique, rien que pour vous. Un site complet comme The Ivory Sukundu : 500 000 FCFA. On en parle d’abord ensemble.' },
  ];

  return (
    <Sheet title={`Modèle ${m.name}`} sub={`${m.kind}. Les photos et les textes du modèle sont remplacés par les vôtres.`} onClose={onClose} expandable>
      <a className={styles.big} href={modelPreview(m.slug)} aria-label={`Voir la démo du modèle ${m.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={modelThumb(m.slug)} alt="" width={640} height={400} />
        <span className={styles.example} aria-hidden="true">Exemple de mise en page</span>
      </a>
      <h2 className={styles.question}>Comment voulez-vous l’installer ?</h2>
      {m.installIncluded ? <p className={styles.lead}><strong>{money(m.price)}</strong>, payé une seule fois, installation par notre équipe incluse.</p> : (
        <>
          <div className={styles.opts} role="radiogroup" aria-label="Qui installe votre boutique">
            {options.map((o) => (
              <label key={o.id} className={styles.opt}>
                <input type="radio" name="model-way" value={o.id} checked={way === o.id} onChange={() => pick(o.id)} />
                <span className={styles.optBody}><span className={styles.optTitle}>{o.title}<b>{o.price}</b></span><span className={styles.optText}>{o.text}</span></span>
              </label>
            ))}
          </div>
          {way === 'install' ? (
            <div className={styles.form}>
              <Select label="Combien de produits ou prestations ?" options={['1 à 10', '11 à 30', '31 à 60', 'Plus de 60']} value={count} onChange={(e) => setCount(e.target.value)} />
              <div className={styles.two}>
                <Select label="Vos photos sont prêtes ?" options={['Oui', 'Pas encore']} value={photos} onChange={(e) => setPhotos(e.target.value)} />
                <Select label="Vous avez un logo ?" options={['Oui', 'Non']} value={logo} onChange={(e) => setLogo(e.target.value)} />
              </div>
            </div>
          ) : null}
          {way !== 'self' ? (
            <div className={styles.form}>
              <Field label="Votre numéro WhatsApp" type="tel" inputMode="tel" maxLength={30} placeholder="+225 07 07 12 34 56" value={wa} onChange={(e) => setWa(e.target.value)} error={waError} />
              <TextArea label="Précisions" optional rows={3} maxLength={800} value={need} onChange={(e) => setNeed(e.target.value)} />
            </div>
          ) : null}
          <p className={styles.small}>{NOTE[way]}</p>
        </>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.foot}>
        <Button variant="secondary" onClick={onClose}>Plus tard</Button>
        <Button busy={busy} onClick={() => void go()}>{m.installIncluded ? ACTION.self : ACTION[way]}</Button>
      </div>
    </Sheet>
  );
}

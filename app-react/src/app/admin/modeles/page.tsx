'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { money } from '@/lib/format';
import { CUSTOM_FROM, MODELS, askTeam, buyModel, currentModel, installPrice, modelBySlug, modelDemo, modelThumb, myModels, withModel, type Model } from '@/lib/models';
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
  const { account, store } = useAdmin();
  const { busy, problem, write } = useSave();
  const [owned, setOwned] = useState<string[]>([]);
  const [open, setOpen] = useState<Model | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'info'; text: string } | null>(null);

  useEffect(() => { let on = true; void myModels().then((l) => { if (on) setOwned(l); }); return () => { on = false; }; }, []);
  // back from the card payment (?modele=ok&nom=…), or sent here to choose one model (?choisir=…)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get('modele'), m = modelBySlug(q.get('nom') ?? q.get('choisir') ?? '');
    if (paid === 'ok') setMessage({ tone: 'ok', text: m ? `Paiement reçu. Le modèle ${m.name} est à vous.` : 'Paiement reçu. Votre modèle est à vous.' });
    else if (paid === 'annule') setMessage({ tone: 'info', text: 'Paiement annulé. Rien n’a été prélevé.' });
    else if (m) setOpen(m);
    if (paid || q.has('choisir')) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const current = currentModel(store?.fiche, owned);
  const close = useCallback(() => setOpen(null), []);

  async function use(m: Model) {
    if (!store || busy || !owned.includes(m.slug) || current === m.slug) return;
    if (await write(withModel(store.fiche, m.slug, current))) setMessage({ tone: 'ok', text: `Votre boutique utilise maintenant le modèle ${m.name}.` });
  }

  return (
    <>
      <PageHead title="Modèles de designer" sub={owned.length > 1
        ? 'Les modèles achetés sont à vous : passez de l’un à l’autre quand vous voulez, vos textes et vos photos sont gardés pour chacun.'
        : 'Un site dessiné pour votre métier, payé une seule fois. Vous le remplissez vous-même, ou notre équipe l’installe pour vous.'} />
      {message ? <div className={styles.notice}><Notice tone={message.tone}>{message.text}</Notice></div> : null}
      {problem ? <div className={styles.notice}><Notice tone="error">{problem === 'conflict' ? 'Votre boutique a été modifiée ailleurs. Rechargez la page, puis réessayez.' : 'Le modèle n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.'}</Notice></div> : null}

      <ul className={styles.grid}>
        {MODELS.map((m) => {
          const mine = owned.includes(m.slug);
          return (
            <li key={m.slug} className={styles.card}>
              <a className={styles.shot} href={modelDemo(m.slug)} target="_blank" rel="noopener" aria-label={`Voir la démo du modèle ${m.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={modelThumb(m.slug)} alt="" width={640} height={400} loading="lazy" decoding="async" />
              </a>
              <div className={styles.body}>
                <p className={styles.name}>{m.name}</p>
                <p className={styles.kind}>{m.kind}</p>
                <p className={styles.price}><strong>{money(m.price)}</strong>{m.was ? <> <s>{money(m.was)}</s></> : null}</p>
                <div className={styles.acts}>
                  {current === m.slug ? <span className={styles.chip}>Modèle utilisé</span>
                    : mine ? <Button busy={busy} onClick={() => void use(m)}>Utiliser ce modèle</Button>
                      : <Button onClick={() => setOpen(m)} aria-label={`Choisir le modèle ${m.name}`}>Choisir</Button>}
                  <ButtonLink variant="secondary" href={modelDemo(m.slug)} target="_blank" rel="noopener">Voir la démo</ButtonLink>
                </div>
                {mine ? <p className={styles.small}>Acheté · il est à vous</p> : null}
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
      <a className={styles.big} href={modelDemo(m.slug)} target="_blank" rel="noopener" aria-label={`Voir la démo du modèle ${m.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={modelThumb(m.slug)} alt="" width={640} height={400} />
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

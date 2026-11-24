'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Check, Field, Select, TextArea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { money } from '@/lib/format';
import { INSTALL_PRODUCTS, INSTALL_TERMS_VERSION, buyModel, installFor, installTerms, modelBySlug, type Model } from '@/lib/models';
import { storeName } from '@/lib/stores';
import { supabase } from '@/lib/supabase';
import styles from './installation.module.css';

/* « Jehre installe tout pour moi »: before she pays, she fills the form, reads exactly what is included (100 000 F
   for 10 products and 2 rounds of changes, 5 000 F per product beyond), and signs it with her legal name and her
   hand. What she signed is kept word for word (public.install_requests); the server prices the installation from
   it and refuses an installation without it. */
export default function InstallationPage() {
  const { account, store } = useAdmin();
  const [model, setModel] = useState<Model | null | undefined>(undefined);
  useEffect(() => { setModel(modelBySlug(new URLSearchParams(window.location.search).get('m') ?? '') ?? null); }, []);

  const [shop, setShop] = useState('');
  const [sells, setSells] = useState('');
  const [count, setCount] = useState('10');
  const [photos, setPhotos] = useState('Oui');
  const [logo, setLogo] = useState('Oui');
  const [links, setLinks] = useState('');
  const [wa, setWa] = useState('');
  const [email, setEmail] = useState('');
  const [wishes, setWishes] = useState('');
  const [read, setRead] = useState(false);
  const [agree, setAgree] = useState(false);
  const [legal, setLegal] = useState('');
  const [sig, setSig] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const terms = useRef<HTMLDivElement>(null);
  const ok = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  // what she already gave Jehre fills the form
  useEffect(() => {
    if (store) setShop((v) => v || storeName(store));
    setWa((v) => v || account.phone || '');
    setEmail((v) => v || account.email || '');
  }, [store, account]);

  // « lu »: the whole text has been seen (or it fits without scrolling)
  useEffect(() => {
    const el = terms.current;
    if (!el) return;
    const check = () => { if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) { setRead(true); ok('read'); } };
    check();
    el.addEventListener('scroll', check);
    return () => el.removeEventListener('scroll', check);
  }, [model]);

  if (model === undefined) return null;
  if (model === null) return <><PageHead title="Installation" /><Empty icon="template" title="Choisissez d’abord un modèle" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Le formulaire d’installation se remplit pour un modèle.</Empty></>;
  if (model.installIncluded) return <><PageHead title="Installation" /><Empty icon="template" title={`L’installation est comprise avec ${model.name}`} action={<ButtonLink href="/admin/modeles/">Retour aux modèles</ButtonLink>}>Rien à remplir ici : notre équipe vous écrit après votre achat.</Empty></>;

  const n = Math.max(1, Math.min(500, Math.round(Number(count.replace(/\D/g, '')) || 0)));
  const install = installFor(n), total = model.price + install, text = installTerms(model, n);

  async function submit() {
    if (!model || busy) return;
    const e: Record<string, string> = {};
    if (!shop.trim()) e.shop = 'Le nom de votre boutique.';
    if (!sells.trim()) e.sells = 'Dites en quelques mots ce que vous vendez.';
    if (!Number(count.replace(/\D/g, ''))) e.count = 'Combien de produits faut-il mettre en ligne ?';
    if (wa.replace(/\D/g, '').length < 8) e.wa = 'Un numéro WhatsApp complet, avec l’indicatif.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Une adresse e-mail valide.';
    if (!read) e.read = 'Lisez le formulaire jusqu’en bas.';
    if (!agree) e.agree = 'Cochez la case pour accepter.';
    if (legal.trim().length < 3 || !/\s/.test(legal.trim())) e.legal = 'Votre prénom et votre nom, comme sur votre pièce d’identité.';
    if (!sig) e.sig = 'Signez dans le cadre.';
    setErrors(e); setProblem('');
    if (Object.keys(e).length) { document.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' }); return; }
    setBusy(true);
    const { data, error } = await supabase().from('install_requests').insert({
      store_id: store?.id ?? null, model: model.slug, shop_name: shop.trim().slice(0, 80), sells: sells.trim().slice(0, 300), products_count: n,
      photos_ready: photos === 'Oui', has_logo: logo === 'Oui', links: links.trim().slice(0, 500), whatsapp: wa.trim().slice(0, 30), email: email.trim().slice(0, 160),
      wishes: wishes.trim().slice(0, 1500), install_price: install, model_price: model.price, terms_version: INSTALL_TERMS_VERSION, terms_text: text,
      legal_name: legal.trim().slice(0, 120), signature_png: sig, user_agent: navigator.userAgent.slice(0, 400),
    }).select('id');
    const id = (data as { id: string }[] | null)?.[0]?.id;
    if (error || !id) { setBusy(false); setProblem('Le formulaire n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.'); return; }
    const r = await buyModel(model.slug, { storeId: store?.id, shopName: shop.trim(), sells: sells.trim(), installRequestId: id });
    if (!r.ok) { setBusy(false); setProblem(r.message); }
  }

  return (
    <>
      <PageHead title="Formulaire d’installation" sub={`Modèle ${model.name} · installé par l’équipe Jehre`} />
      <div className={styles.grid}>
        <div className={styles.col}>
          <section className={styles.card} aria-label="Votre boutique">
            <h2>1. Votre boutique</h2>
            <Field label="Nom de la boutique" maxLength={80} value={shop} onChange={(e) => { setShop(e.target.value); ok('shop'); }} error={errors.shop} />
            <TextArea label="Ce que vous vendez" rows={2} maxLength={300} value={sells} onChange={(e) => { setSells(e.target.value); ok('sells'); }} />
            {errors.sells ? <p className={styles.err} role="alert">{errors.sells}</p> : null}
            <Field label="Nombre de produits à mettre en ligne" inputMode="numeric" maxLength={3} value={count} onChange={(e) => { setCount(e.target.value.replace(/\D/g, '')); ok('count'); }} error={errors.count}
              hint={`${INSTALL_PRODUCTS} produits compris. 5 000 F par produit en plus.`} />
            <div className={styles.two}>
              <Select label="Vos photos sont prêtes ?" options={['Oui', 'Pas encore']} value={photos} onChange={(e) => setPhotos(e.target.value)} />
              <Select label="Vous avez un logo ?" options={['Oui', 'Non']} value={logo} onChange={(e) => setLogo(e.target.value)} />
            </div>
            <Field label="Vos liens (Instagram, TikTok, site)" optional maxLength={500} value={links} onChange={(e) => setLinks(e.target.value)} />
            <div className={styles.two}>
              <Field label="WhatsApp" type="tel" inputMode="tel" maxLength={30} value={wa} onChange={(e) => { setWa(e.target.value); ok('wa'); }} error={errors.wa} />
              <Field label="E-mail" type="email" inputMode="email" autoCapitalize="none" maxLength={160} value={email} onChange={(e) => { setEmail(e.target.value); ok('email'); }} error={errors.email} />
            </div>
            <TextArea label="Vos souhaits (couleurs, style, idées)" optional rows={3} maxLength={1500} value={wishes} onChange={(e) => setWishes(e.target.value)} />
          </section>
        </div>

        <div className={styles.col}>
          <section className={styles.card} aria-label="Ce qui est compris">
            <h2>2. Lisez ce qui est compris</h2>
            <div ref={terms} className={styles.terms} tabIndex={0} aria-label="Formulaire à lire">
              {text.split('\n').map((l, i) => <p key={i} className={i === 0 ? styles.termsTitle : undefined}>{l}</p>)}
            </div>
            {!read ? <p className={styles.small}>Faites défiler jusqu’en bas pour pouvoir signer.</p> : null}
            {errors.read ? <p className={styles.err} role="alert">{errors.read}</p> : null}
          </section>

          <section className={styles.card} aria-label="Signature">
            <h2>3. Signez</h2>
            <div className={styles.total}>
              <div><span>Modèle {model.name}</span><b>{money(model.price)}</b></div>
              <div><span>Installation · {n} produit{n > 1 ? 's' : ''}</span><b>{money(install)}</b></div>
              <div className={styles.sum}><span>Total, payé une seule fois</span><b>{money(total)}</b></div>
            </div>
            <Check checked={agree} disabled={!read} onChange={(e) => { setAgree(e.target.checked); ok('agree'); }} error={errors.agree}>J’ai lu ce formulaire. Il décrit exactement le travail commandé, et je l’accepte.</Check>
            <Field label="Votre nom légal" autoComplete="name" maxLength={120} placeholder="Prénom NOM" value={legal} onChange={(e) => { setLegal(e.target.value); ok('legal'); }} error={errors.legal} />
            <SignaturePad label="Votre signature" error={errors.sig} onChange={(v) => { setSig(v); if (v) ok('sig'); }} />
            <p className={styles.small}>Signé le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())}. Vous recevez une copie par e-mail après le paiement.</p>
            {problem ? <Notice tone="error">{problem}</Notice> : null}
            <Button block busy={busy} onClick={() => void submit()}>Signer et payer {money(total)}</Button>
          </section>
        </div>
      </div>
    </>
  );
}

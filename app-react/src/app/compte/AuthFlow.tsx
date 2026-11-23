'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { Check, Field } from '@/components/ui/Field';
import { Icon, Logo } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { modelBySlug, modelPreview, type Model } from '@/lib/models';
import { clip, completeLogin, readAccount, rememberSource, saveStoreName, signOut, slugify, type Account } from '@/lib/account';
import { mountDoodles } from '@/lib/doodles';
import { COUNTRIES, launchOffer, type LaunchOffer } from '@/lib/launch';
import { currentUser, maskEmail, normEmail, normPhone, sendCode, validEmail, verifyCode, type AuthFailure } from '@/lib/auth';
import styles from './auth.module.css';

/* The seller's account, one screen at a time:
     signup → code → store (its name, or « Je ne veux pas de boutique ») → done
     login  → code → account
   A seller who is already logged in lands on « account ». The pages that are not migrated yet (dashboard, editor)
   are reached by their current addresses. */

type Step = 'loading' | 'signup' | 'login' | 'code' | 'store' | 'done' | 'account';
type Mode = 'signup' | 'login';
const RESEND_AFTER = 60;
const LINKS = { home: '/', dashboard: '/admin/', editor: '/creer/', models: '/admin/#boutique', privacy: '/confidentialite/', terms: '/mentions-legales/' };

export function AuthFlow() {
  const [step, setStep] = useState<Step>('loading');
  const [mode, setMode] = useState<Mode>('signup');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dial, setDial] = useState<string>('225');
  const [offer, setOffer] = useState<LaunchOffer | null>(null);
  const aside = useRef<HTMLElement>(null);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [codeKey, setCodeKey] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const title = useRef<HTMLHeadingElement>(null);

  const go = useCallback((next: Step) => { setErrors({}); setFailure(null); setStep(next); }, []);

  // A link to a model (jehre.com/modeles/<nom>/, or an old link sent to someone) asks for an account first:
  // the page says why, and the model opens inside Jehre as soon as she is in.
  const [wanted, setWanted] = useState<Model | null>(null);
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('suite') === 'modele') setWanted(modelBySlug(q.get('m') ?? '') ?? null); }, []);
  useEffect(() => { if (wanted && (step === 'account' || step === 'done')) window.location.replace(modelPreview(wanted.slug)); }, [wanted, step]);

  // on arrival: remember where she comes from, and open her account if a session is already there
  useEffect(() => {
    rememberSource();
    const wanted: Mode = /connexion|login/.test(window.location.hash) ? 'login' : 'signup';
    setMode(wanted);
    let alive = true;
    void currentUser().then(async (user) => {
      if (!alive) return;
      if (!user) { setStep(wanted); return; }
      const acc = await completeLogin(user).catch(() => readAccount());
      if (!alive) return;
      setAccount(acc);
      setStep(acc ? 'account' : wanted);
    });
    return () => { alive = false; };
  }, []);

  // the launch offer with its real number of spots, and the brush drawings of the black panel
  useEffect(() => { void launchOffer().then(setOffer); }, []);
  useEffect(() => (aside.current ? mountDoodles(aside.current) : undefined), []);

  // each screen starts at its title (keyboard and screen readers follow)
  useEffect(() => { if (step !== 'loading') title.current?.focus(); }, [step]);

  // the minute before a new code can be asked
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function askCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    const name = clip(firstName, 40);
    if (mode === 'signup' && !name) errs.firstName = 'Indiquez votre prénom.';
    if (!validEmail(email)) errs.email = 'Indiquez une adresse e-mail valide, comme vous@exemple.com.';
    if (mode === 'signup' && phone.trim() && !normPhone(phone, `+${dial}`)) errs.phone = 'Ce numéro ne semble pas complet. Vous pouvez aussi laisser ce champ vide.';
    if (mode === 'signup' && !consent) errs.consent = 'Cochez la case pour continuer.';
    setErrors(errs);
    setFailure(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await sendCode({ email, create: mode === 'signup', firstName: name, source: rememberSource() });
    setBusy(false);
    if (!r.ok) { setFailure(r); return; }
    setCode('');
    setWait(RESEND_AFTER);
    go('code');
  }

  async function checkCode(value = code) {
    if (busy) return;
    if (value.length < 6) { setErrors({ code: 'Entrez les 6 chiffres du code.' }); return; }
    setErrors({});
    setFailure(null);
    setBusy(true);
    const r = await verifyCode(email, value);
    if (!r.ok) { setBusy(false); setFailure(r); setCode(''); setCodeKey((k) => k + 1); return; }   // a refused code: empty boxes, ready for the right one
    try {
      const acc = await completeLogin(r.user, mode === 'signup' ? { firstName: clip(firstName, 40), phone: normPhone(phone, `+${dial}`) } : {});
      setAccount(acc);
      setStoreName(acc.storeName);
      setBusy(false);
      // a new seller names her store; one who has a name already (or who logs in) goes to her account
      go(mode === 'signup' && !acc.storeName ? 'store' : 'account');
    } catch {
      setBusy(false);
      setFailure({ ok: false, kind: 'network', text: 'Votre code est bon, mais votre compte n’a pas pu s’ouvrir. Vérifiez votre connexion, puis réessayez.' });
    }
  }

  async function resend() {
    if (busy || wait > 0) return;
    setBusy(true);
    const r = await sendCode({ email, create: mode === 'signup', firstName: clip(firstName, 40), source: rememberSource() });
    setBusy(false);
    if (!r.ok) { setFailure(r); return; }
    setFailure(null);
    setCode('');
    setCodeKey((k) => k + 1);
    setWait(RESEND_AFTER);
  }

  async function saveStore(e: FormEvent | 'skip') {
    if (e !== 'skip') e.preventDefault();
    if (busy || !account) return;
    const name = e === 'skip' ? '' : clip(storeName, 40);
    if (e !== 'skip' && !name) { setErrors({ store: 'Donnez un nom à votre boutique. Vous pourrez le changer plus tard.' }); return; }
    setErrors({});
    setBusy(true);
    const r = await saveStoreName(account, name);
    setBusy(false);
    if (!r.ok) { setFailure({ ok: false, kind: 'network', text: 'Le nom n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.' }); return; }
    setAccount(r.account);
    if (e === 'skip') { window.location.assign(LINKS.dashboard); return; }
    go('done');
  }

  async function logout() {
    setBusy(true);
    await signOut();
    setBusy(false);
    setAccount(null);
    setEmail(''); setCode(''); setFirstName(''); setPhone(''); setConsent(false);
    setMode('login');
    go('login');
  }

  // a message goes away as soon as she corrects its field
  const clearError = (key: string) => setErrors((all) => { if (!(key in all)) return all; const next = { ...all }; delete next[key]; return next; });
  const switchTo = (m: Mode) => { setMode(m); go(m); };
  const slug = slugify(storeName) || 'ma-boutique';

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <a className={styles.logo} href={LINKS.home} aria-label="Jehre, retour au site"><Logo height={34} /></a>
        <a className={styles.back} href={LINKS.home}>Retour à Jehre</a>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-live="polite" aria-busy={step === 'loading' || undefined}>
          {step === 'loading' && (
            <div className={styles.loading}><span className={styles.spinner} aria-hidden="true" /><p>Un instant…</p></div>
          )}

          {step === 'signup' && (
            <form className={styles.form} onSubmit={askCode} noValidate>
              <Progress label="Créer un compte" at={1} of={4} />
              <div className={styles.head}>
                <h1 ref={title} tabIndex={-1}>Créez votre compte</h1>
                {wanted ? <p><b>Créez votre compte pour voir le modèle {wanted.name}.</b> C’est gratuit.</p> : null}
                <p>Pas de mot de passe.</p>
              </div>
              {offer ? <p className={styles.launch}><span className={styles.launchText}><b>{offer.title}</b> {offer.detail}</span>{offer.left ? <span className={styles.launchLeft}>{offer.left}</span> : null}</p> : null}
              <Field label="Votre prénom" name="firstName" autoComplete="given-name" autoCapitalize="words" maxLength={40} value={firstName} onChange={(e) => { setFirstName(e.target.value); clearError('firstName'); }} error={errors.firstName} />
              <Field label="Adresse e-mail" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="vous@exemple.com" value={email} onChange={(e) => { setEmail(e.target.value); clearError('email'); }} error={errors.email}
                hint="Le code arrive en quelques secondes. Regardez aussi dans les courriers indésirables." />
              <Field label="Numéro WhatsApp" optional name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="07 07 12 34 56" value={phone}
                before={<span className={styles.dial}><select aria-label="Indicatif du pays" value={dial} onChange={(e) => setDial(e.target.value)}>{COUNTRIES.map(([code, flag, name]) => <option key={code} value={code}>{`${flag} +${code} ${name}`}</option>)}</select><span aria-hidden="true">{COUNTRIES.find((c) => c[0] === dial)?.[1]} +{dial}</span><Icon name="down" size={14} /></span>} onChange={(e) => { setPhone(e.target.value); clearError('phone'); }} error={errors.phone}
                hint="Celui où vous recevez vos commandes. Vous pourrez l’ajouter plus tard." />
              <Check checked={consent} onChange={(e) => { setConsent(e.target.checked); clearError('consent'); }} error={errors.consent}>
                J’ai lu et j’accepte la <a href={LINKS.privacy} target="_blank" rel="noopener">politique de confidentialité</a> et les <a href={LINKS.terms} target="_blank" rel="noopener">conditions d’utilisation</a> de Jehre.
              </Check>
              {failure && <Notice tone="error">{failure.text}</Notice>}
              <Button type="submit" variant="rainbow" block busy={busy} iconEnd="arrow">Recevoir mon code</Button>
              <p className={styles.switch}>Déjà un compte ? <button type="button" className={styles.link} onClick={() => switchTo('login')}>Se connecter</button></p>
            </form>
          )}

          {step === 'login' && (
            <form className={styles.form} onSubmit={askCode} noValidate>
              <Progress label="Connexion" at={1} of={2} />
              <div className={styles.head}>
                <h1 ref={title} tabIndex={-1}>Connectez-vous</h1>
                {wanted ? <p><b>Connectez-vous pour voir le modèle {wanted.name}.</b></p> : null}
                <p>Recevez un code par e-mail pour entrer, sans mot de passe.</p>
              </div>
              <Field label="Adresse e-mail" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="vous@exemple.com" value={email} onChange={(e) => { setEmail(e.target.value); clearError('email'); }} error={errors.email} />
              {failure?.kind === 'no-account'
                ? <Notice tone="warn" title="Aucun compte avec cette adresse" action={<Button variant="secondary" onClick={() => switchTo('signup')}>Créer un compte</Button>}>Vérifiez l’adresse, ou créez votre compte : c’est gratuit.</Notice>
                : failure && <Notice tone="error">{failure.text}</Notice>}
              <Button type="submit" variant="rainbow" block busy={busy} iconEnd="arrow">Recevoir mon code</Button>
              <p className={styles.switch}>Pas encore de compte ? <button type="button" className={styles.link} onClick={() => switchTo('signup')}>Créer un compte</button></p>
            </form>
          )}

          {step === 'code' && (
            <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void checkCode(); }} noValidate>
              <Progress label={mode === 'signup' ? 'Créer un compte' : 'Connexion'} at={2} of={mode === 'signup' ? 4 : 2} />
              <button type="button" className={styles.backBtn} onClick={() => go(mode)}><Icon name="back" size={16} />Changer d’adresse</button>
              <div className={styles.head}>
                <h1 ref={title} tabIndex={-1}>Entrez le code</h1>
                <p>Nous avons envoyé un code par e-mail à <b>{maskEmail(normEmail(email))}</b>.</p>
              </div>
              <CodeInput label="Code reçu par e-mail" value={code} onChange={setCode} onComplete={(c) => void checkCode(c)} invalid={!!errors.code || failure?.kind === 'code'} disabled={busy} focusKey={codeKey} />
              {errors.code && <Notice tone="error">{errors.code}</Notice>}
              {failure && <Notice tone="error">{failure.text}</Notice>}
              <Button type="submit" variant="rainbow" block busy={busy}>Valider</Button>
              <p className={styles.switch}>
                {wait > 0
                  ? <>Renvoyer dans <span className={styles.timer}>{Math.floor(wait / 60)}:{String(wait % 60).padStart(2, '0')}</span></>
                  : <button type="button" className={styles.link} onClick={() => void resend()}>Renvoyer le code</button>}
              </p>
            </form>
          )}

          {step === 'store' && (
            <form className={styles.form} onSubmit={saveStore} noValidate>
              <Progress label="Créer un compte" at={3} of={4} />
              <div className={styles.head}>
                <h1 ref={title} tabIndex={-1}>Le nom de votre boutique</h1>
                <p>Modifiable à tout moment.</p>
              </div>
              <Field label="Nom de la boutique" name="store" autoComplete="organization" autoCapitalize="words" maxLength={40} value={storeName} onChange={(e) => { setStoreName(e.target.value); clearError('store'); }} error={errors.store} />
              <div className={styles.addr}>
                <span>Votre adresse gratuite</span>
                <b>jehre.com/b/{slug}</b>
              </div>
              {failure && <Notice tone="error">{failure.text}</Notice>}
              <Button type="submit" variant="rainbow" block busy={busy}>Créer mon compte</Button>
              <Button variant="quiet" block disabled={busy} onClick={() => void saveStore('skip')}>Je ne veux pas de boutique</Button>
            </form>
          )}

          {step === 'done' && account && (
            <div className={styles.form}>
              <Progress label="Créer un compte" at={4} of={4} />
              <div className={styles.head}>
                <span className={styles.badge}><Icon name="check" size={22} /></span>
                <h1 ref={title} tabIndex={-1}>Compte créé</h1>
                <p>{account.firstName ? `Bienvenue ${account.firstName}. ` : ''}Comment voulez-vous commencer ?</p>
              </div>
              <ul className={styles.choices}>
                <li><a className={styles.choice} href={LINKS.models}><Icon name="template" size={22} /><span><b>Choisir un modèle</b><small>Des boutiques déjà dessinées. Changez les textes et les photos.</small></span><Icon name="arrow" size={18} /></a></li>
                <li><a className={styles.choice} href={LINKS.editor}><Icon name="edit" size={22} /><span><b>Ouvrir l’éditeur</b><small>Composez votre boutique vous-même, section par section.</small></span><Icon name="arrow" size={18} /></a></li>
                <li><a className={styles.choice} href={LINKS.dashboard}><Icon name="dashboard" size={22} /><span><b>Aller au tableau de bord</b><small>Commandes, produits, paiements, livraison et réglages.</small></span><Icon name="arrow" size={18} /></a></li>
              </ul>
            </div>
          )}

          {step === 'account' && account && (
            <div className={styles.form}>
              <div className={styles.head}>
                <h1 ref={title} tabIndex={-1}>{account.firstName ? `Bonjour ${account.firstName}` : 'Votre compte'}</h1>
                <p>Votre compte est ouvert sur cet appareil.</p>
              </div>
              <dl className={styles.summary}>
                <div><dt>Boutique</dt><dd>{account.storeName || 'Pas encore de boutique'}</dd></div>
                {account.email && <div><dt>E-mail</dt><dd>{account.email}</dd></div>}
                {account.phone && <div><dt>Numéro WhatsApp</dt><dd>{account.phone}</dd></div>}
              </dl>
              <ButtonLink href={LINKS.dashboard} block icon="dashboard">Aller au tableau de bord</ButtonLink>
              <ButtonLink href={LINKS.editor} variant="secondary" block icon="edit">Ouvrir l’éditeur</ButtonLink>
              <Button variant="quiet" block icon="logout" busy={busy} onClick={() => void logout()}>Se déconnecter</Button>
            </div>
          )}
        </section>

        <aside ref={aside} className={`${styles.side} c-aside`} aria-label="Jehre pour les vendeurs">
          <div className="c-aside__top">
            <p className={styles.sideKicker}>Jehre pour les vendeurs</p>
            <h2>Tout votre commerce, au même endroit.</h2>
            <p className={styles.sideText}>Une boutique en ligne, les commandes WhatsApp, le paiement mobile money et la livraison par commune. Depuis votre téléphone.</p>
          </div>
          <ul className={`${styles.perks} c-perks`}>
            <li><span><Icon name="check" size={16} /></span>Gratuit pour démarrer, sans carte bancaire</li>
            <li><span><Icon name="check" size={16} /></span>Jehre ne garde jamais votre argent</li>
            <li><span><Icon name="check" size={16} /></span>Une vraie personne vous répond sur WhatsApp, en français</li>
          </ul>
        </aside>
      </main>

      <footer className={styles.foot}>© 2026 Jehre™. Tous droits réservés.</footer>
    </div>
  );
}

/** Where she is in the flow: « Créer un compte · Étape 1 sur 4 ». */
function Progress({ label, at, of }: { label: string; at: number; of: number }) {
  return (
    <div className={styles.progress}>
      <div className={styles.progressBar} aria-hidden="true">{Array.from({ length: of }, (_, i) => <span key={i} data-on={i < at || undefined} />)}</div>
      <p>{label} · Étape {at} sur {of}</p>
    </div>
  );
}

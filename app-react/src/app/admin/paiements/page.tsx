'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { SaveBar } from '@/components/admin/SaveBar';
import { useSave } from '@/components/admin/useSave';
import { ButtonLink } from '@/components/ui/Button';
import { Field, Check } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { CARD_LABEL, cardState, cardStatus, type CardStatus } from '@/lib/card';
import { PAYMENT_METHODS, type PayNumbers, type PaymentKey } from '@/lib/stores';
import styles from '../admin.module.css';
import pay from './paiements.module.css';
import { GUIDE_KEY, PayGuide } from './PayGuide';

const cleanPhone = (v: string) => v.replace(/[^\d+]/g, '');
const validPhone = (v: string) => /^\+?\d{8,15}$/.test(cleanPhone(v));
const validWave = (v: string) => /^https:\/\/pay\.wave\.com\/[^\s"'<>]{3,200}$/i.test(v.trim());
/** a store that never chose: Wave only (the one that can be paid in advance); the others are her choice */
const DEFAULTS: Partial<Record<PaymentKey, boolean>> = { wave: true, orange: false, mtn: false, moov: false, cod: false };
const MANUAL: Partial<Record<PaymentKey, string>> = { orange: 'Vous confirmez chaque paiement à la main.', mtn: 'Vous confirmez chaque paiement à la main.', moov: 'Vous confirmez chaque paiement à la main.', cod: 'La cliente paie au livreur.' };

/** How her customers pay: which means are offered (fiche.payments), the numbers and the Wave link that receive the
 *  money (fiche.store.pay), and the card with her own Stripe account. Jehre never holds the money. */
export default function PaymentsPage() {
  const { store } = useAdmin();
  const { busy, problem, saved, write } = useSave();
  const [on, setOn] = useState<Partial<Record<PaymentKey, boolean>>>({});
  const [nums, setNums] = useState<PayNumbers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  // the acompte: with mobile money, a part at the order, the rest on delivery
  const [depOn, setDepOn] = useState(false);
  const [depPct, setDepPct] = useState('50');
  const [card, setCard] = useState<CardStatus | null>(null);
  // the guide comes to her the first time, on the whole screen, until « J'ai compris »
  const [guide, setGuide] = useState(false);
  useEffect(() => { try { if (window.localStorage.getItem(GUIDE_KEY) !== '1') setGuide(true); } catch { setGuide(true); } }, []);
  const guideDone = () => { setGuide(false); try { window.localStorage.setItem(GUIDE_KEY, '1'); } catch { /* shown again next time */ } };

  useEffect(() => {
    const chosen = store?.fiche.payments ?? {};
    const fresh = !Object.keys(chosen).length;
    setOn(fresh ? { ...DEFAULTS } : { ...chosen });
    setNums({ ...(store?.fiche.store?.pay ?? {}) });
    const dep = (store?.fiche.store as Record<string, unknown> | undefined)?.deposit as { on?: boolean; percent?: number } | undefined;
    setDepOn(dep?.on === true); setDepPct(String(dep?.percent ?? 50));
    setErrors({}); setDirty(fresh && !!store);   // the defaults are offered: one « Enregistrer » makes them hers
  }, [store]);
  useEffect(() => {
    if (!store?.id) return;
    let live = true;
    setCard(null);
    void cardStatus(store.id).then((s) => { if (live) setCard(s); });
    return () => { live = false; };
  }, [store?.id]);

  if (!store) return (<><PageHead title="Paiements" /><Empty icon="wallet" title="Pas encore de boutique">Créez votre boutique pour choisir vos moyens de paiement.</Empty></>);

  const toggle = (k: PaymentKey) => { setOn((s) => ({ ...s, [k]: !s[k] })); setDirty(true); };
  const setNumber = (k: keyof PayNumbers, v: string) => { setNums((s) => ({ ...s, [k]: v })); setErrors(({ [k]: _x, ...rest }) => rest); setDirty(true); };
  const state = cardState(card);
  const waveLink = validWave(nums.wave ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const errs: Record<string, string> = {};
    const next: PayNumbers = {};
    for (const m of PAYMENT_METHODS) {
      if (!m.number) continue;
      const v = (nums[m.number] ?? '').trim();
      if (!v) continue;
      if (!validPhone(v)) errs[m.number] = 'Numéro incomplet : mettez l’indicatif, par exemple +225 07 07 12 34 56.';
      else next[m.number] = cleanPhone(v);
    }
    const link = (nums.wave ?? '').trim();
    if (link) { if (validWave(link)) next.wave = link; else errs.wave = 'Un lien Wave commence par https://pay.wave.com/'; }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const st = { ...(store.fiche.store ?? {}) };
    if (Object.keys(next).length) st.pay = next; else delete st.pay;
    const pct = Math.min(90, Math.max(10, Math.round(Number(depPct.replace(/\D/g, '')) || 50)));
    if (depOn) (st as Record<string, unknown>).deposit = { on: true, percent: pct }; else delete (st as Record<string, unknown>).deposit;
    if (await write({ ...store.fiche, payments: { ...(store.fiche.payments ?? {}), ...on }, store: st })) setDirty(false);
  }

  const methods = [...PAYMENT_METHODS].sort((a, b) => (a.key === 'wave' ? -1 : b.key === 'wave' ? 1 : 0));
  return (
    <>
      {guide ? <PayGuide onDone={guideDone} /> : null}
      <PageHead title="Paiements" sub="Vos clientes vous paient directement. Jehre ne garde jamais votre argent." />
      <div className={pay.page}>
        <button type="button" className={pay.howto} onClick={() => setGuide(true)}><span aria-hidden="true"><Icon name="info" size={18} /></span>Comment configurer vos paiements ?<Icon name="chevron" size={16} /></button>

        <form onSubmit={save} noValidate className={pay.form}>
          <section className={`${styles.card} ${pay.mobile}`}>
            <div className={styles.cardHead}><h2>Paiement mobile</h2></div>
            <ul className={styles.rows}>
              {methods.map((m) => (
                <li key={m.key} className={styles.setting}>
                  <div className={styles.settingHead}>
                    <span className={pay.name}><b>{m.label}</b>{m.key === 'wave' ? <span className={pay.badge}>Recommandé</span> : null}</span>
                    <button type="button" role="switch" aria-checked={!!on[m.key]} aria-label={m.label} className={styles.switch} onClick={() => toggle(m.key)} />
                  </div>
                  {MANUAL[m.key] && on[m.key] ? <p className={pay.note}>{MANUAL[m.key]}</p> : null}
                  {m.number && on[m.key] && m.key !== 'wave' ? (
                    <Field label={`Numéro qui reçoit ${m.label}`} type="tel" inputMode="tel" placeholder="+225 07 07 12 34 56" value={nums[m.number] ?? ''} onChange={(e) => setNumber(m.number!, e.target.value)} error={errors[m.number]} />
                  ) : null}
                  {m.key === 'wave' && on.wave ? (
                    <div className={pay.wave}>
                      <div className={styles.fields}>
                      <Field label={`Numéro qui reçoit ${m.label}`} type="tel" inputMode="tel" placeholder="+225 07 07 12 34 56" value={nums[m.number!] ?? ''} onChange={(e) => setNumber(m.number!, e.target.value)} error={errors[m.number!]} />
                      <Field label="Lien de paiement Wave (recommandé)" type="url" inputMode="url" placeholder="https://pay.wave.com/m/…" value={nums.wave ?? ''} onChange={(e) => setNumber('wave', e.target.value)} error={errors.wave} />
                      </div>
                      <p className={pay.why}><Icon name={waveLink ? 'check' : 'info'} size={16} />
                        {waveLink
                          ? <span><b>La cliente paie à l’avance</b>, le montant exact, en un geste, dès sa commande.</span>
                          : <span>Avec votre lien marchand, <b>la cliente paie à l’avance</b>, le montant exact, en un geste. Avec un numéro seul, elle envoie sa commande et vous attendez son paiement.</span>}
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section className={`${styles.card} ${pay.deposit}`} aria-label="Acompte" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <h2 style={{ margin: 0, font: '600 var(--fs-lg)/1.3 var(--font)' }}>Acompte</h2>
            <Check checked={depOn} onChange={(e) => { setDepOn(e.target.checked); setDirty(true); }}>Avec Wave ou le mobile money, la cliente paie une partie à la commande, et le reste à la livraison.</Check>
            {depOn ? <Field label="Part payée à la commande (%)" inputMode="numeric" maxLength={2} value={depPct} onChange={(e) => { setDepPct(e.target.value.replace(/\D/g, '')); setDirty(true); }} hint="Entre 10 et 90 %. La carte bancaire paie toujours la totalité." /> : null}
          </section>
          <SaveBar busy={busy} problem={problem} saved={saved} dirty={dirty} />
        </form>

        <section className={`${styles.card} ${pay.stripe}`} aria-label="Carte bancaire">
          <div className={styles.cardHead}>
            <h2>Carte bancaire (Stripe)</h2>
            <span className={pay.state} data-state={state}>{state === 'on' ? <Icon name="check" size={14} /> : null}{CARD_LABEL[state]}</span>
          </div>
          <p className={pay.note}>Visa, Mastercard… depuis n’importe quel pays. L’argent va sur votre compte Stripe, puis votre banque.</p>
          {state === 'soon'
            ? <p className={pay.note}>{card?.message || 'Le paiement par carte s’ouvre bientôt sur Jehre.'}</p>
            : state === 'loading' ? null
              : <ButtonLink href="/admin/paiements/carte/" variant={state === 'on' ? 'secondary' : 'ink'} icon={state === 'on' ? 'chart' : 'wallet'}>
                  {state === 'on' ? 'Mes paiements par carte' : state === 'pending' ? 'Terminer l’activation' : 'Connecter Stripe'}
                </ButtonLink>}
        </section>
      </div>
    </>
  );
}

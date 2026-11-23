'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { SaveBar } from '@/components/admin/SaveBar';
import { useSave } from '@/components/admin/useSave';
import { Field } from '@/components/ui/Field';
import { PAYMENT_METHODS, type PayNumbers, type PaymentKey } from '@/lib/stores';
import styles from '../admin.module.css';

const cleanPhone = (v: string) => v.replace(/[^\d+]/g, '');
const validPhone = (v: string) => /^\+?\d{8,15}$/.test(cleanPhone(v));
const validWave = (v: string) => /^https:\/\/pay\.wave\.com\/[^\s"'<>]{3,200}$/i.test(v.trim());

/** How her customers pay: which means are offered (fiche.payments) and the numbers that receive the money
 *  (fiche.store.pay). Jehre never holds the money: it goes straight to her numbers. */
export default function PaymentsPage() {
  const { store } = useAdmin();
  const { busy, problem, saved, write } = useSave();
  const [on, setOn] = useState<Partial<Record<PaymentKey, boolean>>>({});
  const [pay, setPay] = useState<PayNumbers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setOn({ ...(store?.fiche.payments ?? {}) });
    setPay({ ...(store?.fiche.store?.pay ?? {}) });
    setErrors({}); setDirty(false);
  }, [store]);

  if (!store) return (<><PageHead title="Paiements" /><Empty icon="wallet" title="Pas encore de boutique">Créez votre boutique pour choisir vos moyens de paiement.</Empty></>);

  const toggle = (k: PaymentKey) => { setOn((s) => ({ ...s, [k]: !s[k] })); setDirty(true); };
  const setNumber = (k: keyof PayNumbers, v: string) => { setPay((s) => ({ ...s, [k]: v })); setErrors(({ [k]: _x, ...rest }) => rest); setDirty(true); };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const errs: Record<string, string> = {};
    const next: PayNumbers = {};
    for (const m of PAYMENT_METHODS) {
      if (!m.number) continue;
      const v = (pay[m.number] ?? '').trim();
      if (!v) continue;
      if (!validPhone(v)) errs[m.number] = 'Ce numéro ne semble pas complet (avec l’indicatif, par exemple +225 07 07 12 34 56).';
      else next[m.number] = cleanPhone(v);
    }
    const link = (pay.wave ?? '').trim();
    if (link) { if (validWave(link)) next.wave = link; else errs.wave = 'Un lien Wave commence par https://pay.wave.com/'; }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const st = { ...(store.fiche.store ?? {}) };
    if (Object.keys(next).length) st.pay = next; else delete st.pay;
    if (await write({ ...store.fiche, payments: { ...(store.fiche.payments ?? {}), ...on }, store: st })) setDirty(false);
  }

  return (
    <>
      <PageHead title="Paiements" sub="Vos clientes vous paient directement. Jehre ne garde jamais votre argent." />
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: 'var(--sp-4)', maxWidth: 640 }}>
        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Moyens de paiement proposés</h2></div>
          <ul className={styles.rows}>
            {PAYMENT_METHODS.map((m) => (
              <li key={m.key} className={styles.setting}>
                <div className={styles.settingHead}>
                  <span><b>{m.label}</b></span>
                  <button type="button" role="switch" aria-checked={!!on[m.key]} aria-label={m.label} className={styles.switch} onClick={() => toggle(m.key)} />
                </div>
                {m.number && on[m.key] ? (
                  <Field label={`Numéro qui reçoit ${m.label}`} type="tel" inputMode="tel" placeholder="+225 07 07 12 34 56" value={pay[m.number] ?? ''} onChange={(e) => setNumber(m.number!, e.target.value)} error={errors[m.number]} />
                ) : null}
                {m.key === 'wave' && on.wave ? (
                  <Field label="Lien de paiement Wave" optional type="url" inputMode="url" placeholder="https://pay.wave.com/m/…" value={pay.wave ?? ''} onChange={(e) => setNumber('wave', e.target.value)} error={errors.wave}
                    hint="Si vous avez un compte Wave marchand : la cliente paie d’un seul geste." />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <SaveBar busy={busy} problem={problem} saved={saved} dirty={dirty} />
      </form>
    </>
  );
}

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Check, Field, Select, TextArea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { bookingHome, saveBookingSettings, type BookingHome, type BookingSettings, type DayHours } from '@/lib/bookings';
import shared from '../../admin.module.css';
import styles from '../rdv.module.css';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
type Opt = [number | string, string];
const STEP: Opt[] = [[15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 heure']];
const BUFFER: Opt[] = [[0, 'Aucune'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes']];
const LEAD: Opt[] = [[0, 'Jusqu’à la dernière minute'], [60, '1 heure avant'], [120, '2 heures avant'], [180, '3 heures avant'], [720, '12 heures avant'], [1440, 'La veille (24 h)'], [2880, '2 jours avant']];
const HORIZON: Opt[] = [[14, '2 semaines à l’avance'], [30, '1 mois à l’avance'], [45, '6 semaines à l’avance'], [60, '2 mois à l’avance'], [90, '3 mois à l’avance']];
const CANCEL: Opt[] = [[0, 'Jusqu’au dernier moment'], [2, 'Jusqu’à 2 h avant'], [12, 'Jusqu’à 12 h avant'], [24, 'Jusqu’à 24 h avant'], [48, 'Jusqu’à 48 h avant'], [72, 'Jusqu’à 3 jours avant']];
const DEPOSIT: Opt[] = [['none', 'Aucun acompte'], ['fixed', 'Un montant fixe'], ['percent', 'Un pourcentage du prix']];
const POLICIES: { key: keyof BookingSettings['policies']; label: string; hint: string }[] = [
  { key: 'deposit', label: 'Acompte', hint: 'L’acompte bloque votre créneau. Il est déduit du prix et n’est pas remboursable.' },
  { key: 'cancel', label: 'Report et annulation', hint: 'Report sans frais jusqu’à 24 h avant.' },
  { key: 'late', label: 'Retard', hint: 'Au-delà de 15 minutes de retard, le rendez-vous peut être reporté.' },
  { key: 'payment', label: 'Paiement', hint: 'Le solde se règle sur place.' },
  { key: 'prep', label: 'Avant de venir', hint: 'Venez sans maquillage sur les yeux.' },
];

/** A list of the server's own choices: the value kept is the server's (a number of minutes), the label is French. */
function Pick({ label, options, value, onChange }: { label: string; options: Opt[]; value: number | string; onChange: (v: number | string) => void }) {
  const all = options.some((o) => o[0] === value) ? options : [...options, [value, String(value)] as Opt];
  return <Select label={label} options={all.map((o) => o[1])} value={all.find((o) => o[0] === value)![1]} onChange={(e) => onChange(all.find((o) => o[1] === e.target.value)![0])} />;
}

/** Hours and booking rules of a booking store: when clients can book, how, and what they read first. */
export default function BookingSettingsPage() {
  const { store } = useAdmin();
  const [home, setHome] = useState<BookingHome | null>(null);
  const [s, setS] = useState<BookingSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [saved, setSaved] = useState(false);
  const [bad, setBad] = useState('');
  const storeId = store?.id ?? '';

  const load = useCallback(async () => {
    if (!storeId) return;
    const h = await bookingHome(storeId);
    if (h.ok) { setError(''); setHome(h); setS(h.settings); } else setError(h.message);
  }, [storeId]);
  useEffect(() => { setHome(null); setS(null); void load(); }, [load]);

  const dirty = !!home && !!s && JSON.stringify(s) !== JSON.stringify(home.settings);
  const set = (patch: Partial<BookingSettings>) => { setSaved(false); setFailed(''); setBad(''); setS((x) => (x ? { ...x, ...patch } : x)); };
  const setDay = (d: number, patch: Partial<DayHours>) => set({ hours: s!.hours.map((h, i) => (i === d ? { ...h, ...patch } : h)) });
  const setBreak = (d: number, side: 'from' | 'to', v: string) => {
    const b = { from: '', to: '', ...(s!.hours[d]!.breaks[0] ?? {}), [side]: v };
    setDay(d, { breaks: b.from || b.to ? [b] : [] });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!home || !s || busy || !dirty) return;
    const wrong = ORDER.find((d) => s.hours[d]!.open && s.hours[d]!.to <= s.hours[d]!.from);
    if (wrong !== undefined) { setBad(`Le ${DAYS[wrong]}, la fermeture doit être après l’ouverture.`); return; }
    setBusy(true); setFailed('');
    const r = await saveBookingSettings(storeId, s);
    setBusy(false);
    if (!r.ok) { setFailed(r.message); return; }
    setHome({ ...home, settings: r.settings }); setS(r.settings); setSaved(true);
  }

  if (!store) return <><PageHead title="Horaires et réservation" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle de prise de rendez-vous pour commencer.</Empty></>;

  return (
    <>
      <PageHead title="Horaires et réservation" sub="Quand vos clientes peuvent réserver, comment, et ce qu’elles lisent avant." action={<ButtonLink variant="secondary" href="/admin/rendez-vous/" icon="back">Agenda</ButtonLink>} />
      {error ? <Notice tone="error" action={<Button variant="secondary" onClick={() => void load()}>Réessayer</Button>}>{error}</Notice> : null}
      {!s && !error ? <p className={shared.muted}>Chargement…</p> : null}

      {s && home ? (
        <form className={styles.page} onSubmit={save} noValidate>
          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Réservation en ligne</h2></div>
            <div className={styles.stack}>
              <div className={styles.switchLine}><span><b>Prendre des rendez-vous en ligne</b><small>Fermé : vos clientes voient vos prestations, mais ne peuvent pas réserver.</small></span>
                <button type="button" role="switch" aria-checked={s.enabled} aria-label="Prendre des rendez-vous en ligne" className={shared.switch} onClick={() => set({ enabled: !s.enabled })} /></div>
              <div className={styles.switchLine}><span><b>Confirmer automatiquement</b><small>Oui : le créneau est réservé tout de suite. Non : vous recevez une demande, et vous confirmez.</small></span>
                <button type="button" role="switch" aria-checked={s.autoConfirm} aria-label="Confirmer automatiquement" className={shared.switch} onClick={() => set({ autoConfirm: !s.autoConfirm })} /></div>
              <Pick label="La cliente peut déplacer ou annuler seule" options={CANCEL} value={s.cancelWindow} onChange={(v) => set({ cancelWindow: Number(v) })} />
            </div>
          </section>

          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Horaires d’ouverture</h2></div>
            <p className={shared.muted}>La pause est facultative : laissez-la vide si vous n’en prenez pas.</p>
            <div className={styles.hours}>
              {ORDER.map((d) => {
                const h = s.hours[d]!, b = h.breaks[0] ?? { from: '', to: '' };
                return (
                  <div key={d} className={styles.day} role="group" aria-label={DAYS[d]}>
                    <div className={styles.dayHead}>
                      <b>{DAYS[d]}</b>{h.open ? null : <span>Fermé</span>}
                      <button type="button" role="switch" aria-checked={h.open} aria-label={`Ouvert le ${DAYS[d]}`} className={shared.switch} onClick={() => setDay(d, { open: !h.open })} />
                    </div>
                    {h.open ? (
                      <div className={styles.times}>
                        <Field label="Ouverture" type="time" step={300} value={h.from} onChange={(e) => setDay(d, { from: e.target.value })} />
                        <Field label="Fermeture" type="time" step={300} value={h.to} onChange={(e) => setDay(d, { to: e.target.value })} />
                        <Field label="Pause de" type="time" step={300} value={b.from} onChange={(e) => setBreak(d, 'from', e.target.value)} />
                        <Field label="à" type="time" step={300} value={b.to} onChange={(e) => setBreak(d, 'to', e.target.value)} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Règles de réservation</h2></div>
            <div className={styles.two}>
              <Pick label="Un créneau toutes les" options={STEP} value={s.step} onChange={(v) => set({ step: Number(v) })} />
              <Pick label="Pause entre deux clientes" options={BUFFER} value={s.buffer} onChange={(v) => set({ buffer: Number(v) })} />
              <Pick label="Réserver au plus tard" options={LEAD} value={s.lead} onChange={(v) => set({ lead: Number(v) })} />
              {s.openUntil ? null : <Pick label="Réserver jusqu’à" options={HORIZON} value={s.horizon} onChange={(v) => set({ horizon: Number(v) })} />}
            </div>
            {s.openUntil ? <p className={shared.muted}>Vos réservations sont ouvertes jusqu’au {new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${s.openUntil}T12:00:00Z`))}.</p> : null}
          </section>

          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Acompte</h2></div>
            <p className={shared.muted}>Pour limiter les rendez-vous manqués. Vous envoyez la demande de paiement, puis vous marquez l’acompte « reçu ».</p>
            <div className={styles.stack}>
              <div className={styles.two}>
                <Pick label="Demander" options={DEPOSIT} value={s.deposit.mode} onChange={(v) => set({ deposit: { mode: v as BookingSettings['deposit']['mode'], value: v === 'percent' ? 30 : v === 'none' ? 0 : s.deposit.value } })} />
                {s.deposit.mode === 'none' ? null : <Field label={s.deposit.mode === 'percent' ? 'Pourcentage (%)' : `Montant (${home.currency === 'XOF' ? 'FCFA' : home.currency})`} inputMode="numeric" value={String(s.deposit.value || '')} onChange={(e) => set({ deposit: { ...s.deposit, value: Number(e.target.value.replace(/\D/g, '')) } })} />}
              </div>
              <fieldset className={styles.checks}>
                <legend>Moyens de paiement proposés</legend>
                {home.payments.map((p) => <Check key={p} checked={s.payments.includes(p)} onChange={() => set({ payments: s.payments.includes(p) ? s.payments.filter((x) => x !== p) : [...s.payments, p] })}>{p}</Check>)}
              </fieldset>
            </div>
          </section>

          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Ce que vos clientes lisent</h2></div>
            <p className={shared.muted}>Affiché sur votre site et avant la réservation. Laissez vide ce qui ne vous concerne pas.</p>
            <div className={styles.stack}>
              <Field label="Adresse du studio" maxLength={200} value={s.address} onChange={(e) => set({ address: e.target.value })} />
              <TextArea label="Présentation courte" rows={2} maxLength={600} value={s.intro} onChange={(e) => set({ intro: e.target.value })} />
              {POLICIES.map((p) => <TextArea key={p.key} label={p.label} rows={2} maxLength={600} placeholder={p.hint} value={s.policies[p.key] ?? ''} onChange={(e) => set({ policies: { ...s.policies, [p.key]: e.target.value } })} />)}
            </div>
          </section>

          {bad ? <Notice tone="error">{bad}</Notice> : null}
          {failed ? <Notice tone="error">{failed}</Notice> : null}
          {saved && !dirty ? <Notice tone="ok">Enregistré.</Notice> : null}
          <div><Button type="submit" busy={busy} disabled={!dirty}>Enregistrer</Button></div>
        </form>
      ) : null}
    </>
  );
}

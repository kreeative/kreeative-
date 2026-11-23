'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { APPT_STATUS, DEPOSIT_LABEL, addDays, agenda, bookingHome, dayKey, dayLabel, durationLabel, hour, setApptStatus, setDeposit, type Agenda, type Appointment, type ApptStatus, type BookingHome } from '@/lib/bookings';
import { plural, price, waLink } from '@/lib/format';
import shared from '../admin.module.css';
import styles from './rdv.module.css';

/** The agenda of a booking store: the requests to confirm, the week, the appointments of the chosen day. */
export default function AgendaPage() {
  const { store } = useAdmin();
  const [home, setHome] = useState<BookingHome | null>(null);
  const [data, setData] = useState<Agenda | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState('');
  const [failed, setFailed] = useState('');
  const [copied, setCopied] = useState(false);
  const storeId = store?.id ?? '';

  const load = useCallback(async () => {
    if (!storeId) return;
    const now = new Date();
    const [h, a] = await Promise.all([bookingHome(storeId), agenda(storeId, new Date(now.getTime() - 7 * 864e5), new Date(now.getTime() + 45 * 864e5))]);
    if (!h.ok) { setError(h.message); return; }
    if (!a.ok) { setError(a.message); return; }
    setError(''); setHome(h); setData(a); setDay((d) => d || a.today);
  }, [storeId]);
  useEffect(() => { setHome(null); setData(null); setDay(''); void load(); }, [load]);

  const tz = data?.timezone ?? 'Africa/Abidjan';
  const all = useMemo(() => {
    const map = new Map<string, Appointment>();
    for (const a of [...(data?.appointments ?? []), ...(data?.pending ?? [])]) map.set(a.id, a);
    return [...map.values()].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  }, [data]);
  const week = useMemo(() => (day ? Array.from({ length: 7 }, (_, i) => addDays(day, i - 3)) : []), [day]);
  const ofDay = useMemo(() => all.filter((a) => dayKey(a.starts_at, tz) === day && a.status !== 'annule'), [all, day, tz]);
  const count = (k: string) => all.filter((a) => dayKey(a.starts_at, tz) === k && a.status !== 'annule').length;
  const open = all.find((a) => a.id === openId) ?? null;

  const put = (a: Appointment) => setData((d) => (d ? { ...d, appointments: d.appointments.some((x) => x.id === a.id) ? d.appointments.map((x) => (x.id === a.id ? a : x)) : [...d.appointments, a], pending: d.pending.filter((x) => x.id !== a.id || a.status === 'en_attente') } : d));
  async function change(a: Appointment, status: ApptStatus) {
    if (saving) return;
    setSaving(status); setFailed('');
    const r = await setApptStatus(a.id, status);
    setSaving('');
    if (r.ok) put(r.appointment); else setFailed(r.message);
  }
  async function deposit(a: Appointment, value: string) {
    if (saving) return;
    setSaving('deposit'); setFailed('');
    const r = await setDeposit(a.id, value);
    setSaving('');
    if (r.ok) put(r.appointment); else setFailed(r.message);
  }
  async function copy() {
    if (!home) return;
    try { await navigator.clipboard.writeText(home.bookingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* she can still select the link */ }
  }

  if (!store) return <><PageHead title="Rendez-vous" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle de prise de rendez-vous pour commencer.</Empty></>;

  const line = (a: Appointment) => (
    <li key={a.id}>
      <button type="button" className={shared.row} onClick={() => { setFailed(''); setOpenId(a.id); }}>
        <span className={styles.time}>{hour(a.starts_at, tz)}</span>
        <span className={shared.rowMain}><b>{a.customer.name || 'Cliente'}</b><small>{a.service.name || 'Prestation'}{a.service.duration ? ` · ${durationLabel(a.service.duration)}` : ''}</small></span>
        <span className={styles.pill} data-tone={APPT_STATUS[a.status]?.tone}>{APPT_STATUS[a.status]?.label ?? a.status}</span>
        <Icon name="chevron" size={16} />
      </button>
    </li>
  );

  return (
    <>
      <PageHead title="Rendez-vous" sub={data ? (data.pending.length ? plural(data.pending.length, 'demande à confirmer', 'demandes à confirmer') : 'Aucune demande en attente') : undefined} />
      {error ? <Notice tone="error" action={<Button variant="secondary" onClick={() => void load()}>Réessayer</Button>}>{error}</Notice> : null}
      {!data && !error ? <p className={shared.muted}>Chargement…</p> : null}

      {data && home ? (
        <div className={styles.page}>
          {!home.configured ? <Notice tone="info" title="Ajoutez vos prestations" action={<ButtonLink variant="secondary" href="/admin/prestations/">Mes prestations</ButtonLink>}>Vos clientes pourront réserver dès que vous aurez au moins une prestation.</Notice> : null}

          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Votre lien de réservation</h2></div>
            <div className={styles.link}>
              <span>{home.bookingUrl.replace(/^https:\/\//, '')}</span>
              <Button variant="secondary" icon="copy" onClick={() => void copy()}>{copied ? 'Copié' : 'Copier'}</Button>
            </div>
          </section>

          {data.pending.length ? (
            <section className={shared.card} aria-label="Demandes à confirmer">
              <div className={shared.cardHead}><h2>À confirmer</h2></div>
              <ul className={shared.rows}>
                {data.pending.map((a) => (
                  <li key={a.id} className={styles.pending}>
                    <button type="button" className={shared.row} onClick={() => { setFailed(''); setOpenId(a.id); }}>
                      <span className={shared.rowMain}><b>{a.customer.name || 'Cliente'}</b><small>{dayLabel(dayKey(a.starts_at, tz))} · {hour(a.starts_at, tz)} · {a.service.name || 'Prestation'}</small></span>
                    </button>
                    <div className={styles.pendingActs}>
                      <Button disabled={!!saving} onClick={() => void change(a, 'confirme')} aria-label={`Confirmer le rendez-vous de ${a.customer.name || 'la cliente'}`}>Confirmer</Button>
                      <Button variant="secondary" disabled={!!saving} onClick={() => void change(a, 'annule')} aria-label={`Refuser le rendez-vous de ${a.customer.name || 'la cliente'}`}>Refuser</Button>
                    </div>
                  </li>
                ))}
              </ul>
              {failed && !open ? <Notice tone="error">{failed}</Notice> : null}
            </section>
          ) : null}

          <section className={shared.card}>
            <div className={styles.weekHead}>
              <button type="button" className={styles.nav} onClick={() => setDay(addDays(day, -7))} aria-label="Semaine précédente"><Icon name="back" size={18} /></button>
              <h2>{dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <button type="button" className={styles.nav} onClick={() => setDay(addDays(day, 7))} aria-label="Semaine suivante"><Icon name="arrow" size={18} /></button>
            </div>
            <div className={styles.week} role="group" aria-label="Jours de la semaine">
              {week.map((k) => (
                <button key={k} type="button" aria-pressed={k === day} data-today={k === data.today ? '' : undefined} onClick={() => setDay(k)} aria-label={`${dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })}, ${plural(count(k), 'rendez-vous', 'rendez-vous')}`}>
                  <small>{dayLabel(k, { weekday: 'short' }).replace('.', '')}</small><b>{Number(k.slice(8))}</b><i data-n={count(k) || undefined}>{count(k) || ''}</i>
                </button>
              ))}
            </div>
            {day !== data.today ? <button type="button" className={styles.today} onClick={() => setDay(data.today)}>Revenir à aujourd’hui</button> : null}
            {ofDay.length ? <ul className={shared.rows}>{ofDay.map(line)}</ul> : <p className={shared.muted}>Aucun rendez-vous ce jour-là.</p>}
          </section>
        </div>
      ) : null}

      {open ? (
        <Sheet title={`Rendez-vous n° ${open.number}`} sub={`${dayLabel(dayKey(open.starts_at, tz), { weekday: 'long', day: 'numeric', month: 'long' })} · ${hour(open.starts_at, tz)} – ${hour(open.ends_at, tz)}`} onClose={() => setOpenId(null)}>
          <div className={shared.block}>
            <h3>Statut</h3>
            <p><span className={styles.pill} data-tone={APPT_STATUS[open.status]?.tone}>{APPT_STATUS[open.status]?.label ?? open.status}</span></p>
            <div className={shared.sheetActions}>
              {open.status === 'en_attente' ? <><Button busy={saving === 'confirme'} disabled={!!saving} onClick={() => void change(open, 'confirme')}>Confirmer</Button><Button variant="secondary" busy={saving === 'annule'} disabled={!!saving} onClick={() => void change(open, 'annule')}>Refuser</Button></> : null}
              {open.status === 'confirme' ? <><Button busy={saving === 'termine'} disabled={!!saving} onClick={() => void change(open, 'termine')}>Terminé</Button><Button variant="secondary" busy={saving === 'absent'} disabled={!!saving} onClick={() => void change(open, 'absent')}>Absente</Button><Button variant="quiet" busy={saving === 'annule'} disabled={!!saving} onClick={() => void change(open, 'annule')}>Annuler</Button></> : null}
              {open.status === 'termine' || open.status === 'absent' || open.status === 'annule' ? <Button variant="secondary" busy={saving === 'confirme'} disabled={!!saving} onClick={() => void change(open, 'confirme')}>Remettre « Confirmé »</Button> : null}
            </div>
            {failed ? <Notice tone="error">{failed}</Notice> : null}
          </div>
          <div className={shared.block}>
            <h3>Cliente</h3>
            <p><b>{open.customer.name || 'Sans nom'}</b></p>
            {open.customer.phone ? <p>{open.customer.phone}</p> : null}
            {open.customer.email ? <p className={shared.muted}>{open.customer.email}</p> : null}
            <div className={shared.sheetActions}>
              {open.customer.phone && waLink(open.customer.phone) ? <ButtonLink href={waLink(open.customer.phone)} target="_blank" rel="noopener" variant="secondary" icon="call">Écrire sur WhatsApp</ButtonLink> : null}
            </div>
          </div>
          <div className={shared.block}>
            <h3>Prestation</h3>
            <p><b>{open.service.name || 'Prestation'}</b>{open.service.duration ? ` · ${durationLabel(open.service.duration)}` : ''}</p>
            {(open.service.addons ?? []).length ? <p className={shared.muted}>{(open.service.addons ?? []).map((x) => x.name).filter(Boolean).join(' · ')}</p> : null}
            <p className={shared.total}><span>Total</span><span>{price(open.total, open.currency)}</span></p>
          </div>
          {open.deposit > 0 ? (
            <div className={shared.block}>
              <h3>Acompte</h3>
              <p>{price(open.deposit, open.currency)} · {DEPOSIT_LABEL[open.deposit_status] ?? 'Pas d’acompte demandé'}</p>
              <div className={shared.sheetActions}>
                {open.deposit_status === 'en_attente' ? <Button variant="secondary" busy={saving === 'deposit'} disabled={!!saving} onClick={() => void deposit(open, 'recu')}>Acompte reçu</Button> : null}
                {open.deposit_status === 'recu' ? <Button variant="quiet" busy={saving === 'deposit'} disabled={!!saving} onClick={() => void deposit(open, 'en_attente')}>Pas encore reçu</Button> : null}
              </div>
            </div>
          ) : null}
          {open.note ? <div className={shared.block}><h3>Note de la cliente</h3><p>{open.note}</p></div> : null}
        </Sheet>
      ) : null}
    </>
  );
}

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { bookingHome, durationLabel, saveBookingSettings, type Addon, type BookingHome, type BookingSettings, type Service } from '@/lib/bookings';
import { plural, price } from '@/lib/format';
import shared from '../admin.module.css';
import styles from '../rendez-vous/rdv.module.css';

interface Draft { id: string | null; name: string; category: string; duration: string; price: string; deposit: string; desc: string; active: boolean; from: boolean }
interface Extra { index: number | null; name: string; duration: string; price: string; active: boolean }
const draftOf = (s?: Service): Draft => ({ id: s?.id ?? null, name: s?.name ?? '', category: s?.category ?? '', duration: String(s?.duration ?? 60), price: s ? String(s.price) : '', deposit: s?.deposit === null || s?.deposit === undefined ? '' : String(s.deposit), desc: s?.desc ?? '', active: s?.active !== false, from: s?.from === true });
const num = (v: string) => Number(v.replace(/\D/g, ''));

/** Her services (a booking store's products): name, category, duration, price, deposit. Saved on the server with
 *  the rest of her booking settings, which travel untouched. */
export default function ServicesPage() {
  const { store } = useAdmin();
  const [home, setHome] = useState<BookingHome | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [extra, setExtra] = useState<Extra | null>(null);
  const storeId = store?.id ?? '';

  const load = useCallback(async () => {
    if (!storeId) return;
    const h = await bookingHome(storeId);
    if (h.ok) { setError(''); setHome(h); } else setError(h.message);
  }, [storeId]);
  useEffect(() => { setHome(null); void load(); }, [load]);

  const services = home?.settings.services ?? [];
  const close = () => { setDraft(null); setErrors({}); setFailed(''); setConfirmDelete(false); };

  const addons = home?.settings.addons ?? [];
  async function write(next: Service[], patch: Partial<BookingSettings> = {}) {
    if (!home) return false;
    setBusy(true); setFailed('');
    const r = await saveBookingSettings(storeId, { ...home.settings, services: next, ...patch });
    setBusy(false);
    if (!r.ok) { setFailed(r.message); return false; }
    setHome({ ...home, settings: r.settings, configured: true });
    return true;
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    const err: Record<string, string> = {};
    if (!draft.name.trim()) err.name = 'Donnez un nom à la prestation.';
    if (draft.price.trim() === '') err.price = 'Indiquez un prix (0 si c’est gratuit).';
    const d = num(draft.duration);
    if (d < 5 || d > 720) err.duration = 'Entre 5 et 720 minutes.';
    setErrors(err);
    if (Object.keys(err).length) return;
    const old = services.find((s) => s.id === draft.id);
    const one: Service = {
      id: old?.id ?? '', name: draft.name.trim(), category: draft.category.trim(), duration: d, price: num(draft.price), from: draft.from,
      deposit: draft.deposit.trim() === '' ? null : num(draft.deposit), desc: draft.desc.trim(), photo: old?.photo ?? '', active: draft.active, staff: old?.staff ?? [],
    };
    if (await write(old ? services.map((s) => (s.id === old.id ? one : s)) : [...services, one])) close();
  }
  async function saveExtra(e: FormEvent) {
    e.preventDefault();
    if (!extra || busy) return;
    if (!extra.name.trim()) { setFailed('Donnez un nom à l’option.'); return; }
    const old = extra.index === null ? undefined : addons[extra.index];
    const one: Addon = { id: old?.id ?? '', name: extra.name.trim(), duration: Math.min(240, num(extra.duration)), price: num(extra.price), active: extra.active };
    if (await write(services, { addons: old ? addons.map((a, i) => (i === extra.index ? one : a)) : [...addons, one] })) { setExtra(null); setFailed(''); }
  }
  async function removeExtra() {
    if (!extra || extra.index === null || busy) return;
    if (await write(services, { addons: addons.filter((_, i) => i !== extra.index) })) { setExtra(null); setFailed(''); }
  }
  async function remove() {
    if (!draft?.id || busy) return;
    if (await write(services.filter((s) => s.id !== draft.id))) close();
  }

  if (!store) return <><PageHead title="Prestations" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle de prise de rendez-vous pour commencer.</Empty></>;

  return (
    <>
      <PageHead title="Prestations" sub={home ? plural(services.length, 'prestation', 'prestations') : undefined}
        action={home ? <Button icon="plus" onClick={() => setDraft(draftOf())}>Ajouter une prestation</Button> : null} />
      {error ? <Notice tone="error" action={<Button variant="secondary" onClick={() => void load()}>Réessayer</Button>}>{error}</Notice> : null}
      {!home && !error ? <p className={shared.muted}>Chargement…</p> : null}

      {home ? (services.length === 0
        ? <Empty icon="tag" title="Aucune prestation pour l’instant" action={<Button icon="plus" onClick={() => setDraft(draftOf())}>Ajouter une prestation</Button>}>Ajoutez ce que vos clientes peuvent réserver : son nom, sa durée et son prix.</Empty>
        : <section className={shared.card} style={{ maxWidth: 760 }}>
            <ul className={shared.rows}>
              {services.map((s) => (
                <li key={s.id} className={s.active ? undefined : styles.off}>
                  <button type="button" className={shared.row} onClick={() => setDraft(draftOf(s))} aria-label={`Modifier ${s.name}`}>
                    <span className={shared.rowMain}><b>{s.name}</b><small>{[s.category, durationLabel(s.duration), s.active ? '' : 'Masquée'].filter(Boolean).join(' · ')}</small></span>
                    <span className={styles.price}>{s.from ? 'Dès ' : ''}{price(s.price, home.currency)}</span>
                    <Icon name="chevron" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>) : null}

      {home ? (
        <section aria-label="Options" style={{ maxWidth: 760 }}>
          <h2 className={styles.sectionTitle}>Options</h2>
          <p className={shared.muted} style={{ marginBottom: 'var(--sp-3)' }}>Ce que la cliente peut ajouter à une prestation : une dépose, un soin, un nail art.</p>
          {addons.length ? (
            <div className={shared.card} style={{ marginBottom: 'var(--sp-3)' }}>
              <ul className={shared.rows}>
                {addons.map((a, i) => (
                  <li key={a.id || i} className={a.active ? undefined : styles.off}>
                    <button type="button" className={shared.row} onClick={() => { setFailed(''); setExtra({ index: i, name: a.name, duration: String(a.duration), price: String(a.price), active: a.active }); }} aria-label={`Modifier l’option ${a.name}`}>
                      <span className={shared.rowMain}><b>{a.name}</b><small>{[a.duration ? `+ ${durationLabel(a.duration)}` : '', a.active ? '' : 'Masquée'].filter(Boolean).join(' · ') || 'Sans durée en plus'}</small></span>
                      <span className={styles.price}>+ {price(a.price, home.currency)}</span>
                      <Icon name="chevron" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button variant="secondary" icon="plus" onClick={() => { setFailed(''); setExtra({ index: null, name: '', duration: '0', price: '', active: true }); }}>Ajouter une option</Button>
        </section>
      ) : null}

      {extra && home ? (
        <Sheet title={extra.index === null ? 'Nouvelle option' : 'Modifier l’option'} onClose={() => { setExtra(null); setFailed(''); }}>
          <form className={shared.block} style={{ gap: 'var(--sp-4)' }} onSubmit={saveExtra} noValidate>
            <Field label="Nom de l’option" maxLength={80} autoFocus placeholder="Dépose" value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} />
            <div className={styles.two}>
              <Field label="Durée en plus (minutes)" inputMode="numeric" value={extra.duration} onChange={(e) => setExtra({ ...extra, duration: e.target.value })} />
              <Field label={`Prix (${home.currency === 'XOF' ? 'FCFA' : home.currency})`} inputMode="numeric" placeholder="2 000" value={extra.price} onChange={(e) => setExtra({ ...extra, price: e.target.value })} />
            </div>
            <div className={styles.switchLine}>
              <span><b>Proposée à la réservation</b></span>
              <button type="button" role="switch" aria-checked={extra.active} aria-label="Option proposée à la réservation" className={shared.switch} onClick={() => setExtra({ ...extra, active: !extra.active })} />
            </div>
            {failed ? <Notice tone="error">{failed}</Notice> : null}
            <Button type="submit" block busy={busy}>{extra.index === null ? 'Ajouter l’option' : 'Enregistrer'}</Button>
            {extra.index !== null ? <Button variant="quiet" block icon="trash" disabled={busy} onClick={() => void removeExtra()}>Supprimer cette option</Button> : null}
          </form>
        </Sheet>
      ) : null}

      {draft && home ? (
        <Sheet title={draft.id ? 'Modifier la prestation' : 'Nouvelle prestation'} sub="Visible sur votre page de réservation dès l’enregistrement." onClose={close} expandable>
          <form className={shared.block} style={{ gap: 'var(--sp-4)' }} onSubmit={save} noValidate>
            <Field label="Nom de la prestation" maxLength={80} autoFocus placeholder="Pose de cils classique" value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setErrors(({ name: _gone, ...rest }) => rest); }} error={errors.name} />
            <Field label="Catégorie" optional maxLength={40} placeholder="Cils" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <div className={styles.two}>
              <Field label="Durée (minutes)" inputMode="numeric" placeholder="60" value={draft.duration} onChange={(e) => { setDraft({ ...draft, duration: e.target.value }); setErrors(({ duration: _gone, ...rest }) => rest); }} error={errors.duration} />
              <Field label={`Prix (${home.currency === 'XOF' ? 'FCFA' : home.currency})`} inputMode="numeric" placeholder="15 000" value={draft.price} onChange={(e) => { setDraft({ ...draft, price: e.target.value }); setErrors(({ price: _gone, ...rest }) => rest); }} error={errors.price} />
            </div>
            <Field label="Acompte" optional inputMode="numeric" placeholder="5 000" value={draft.deposit} onChange={(e) => setDraft({ ...draft, deposit: e.target.value })} hint="Laissez vide pour suivre votre règle générale." />
            <TextArea label="Description" optional rows={3} maxLength={400} value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
            <div className={styles.switchLine}>
              <span><b>Prix « à partir de »</b><small>Le prix final dépend de la cliente (longueur, volume…).</small></span>
              <button type="button" role="switch" aria-checked={draft.from} aria-label="Prix à partir de" className={shared.switch} onClick={() => setDraft({ ...draft, from: !draft.from })} />
            </div>
            <div className={styles.switchLine}>
              <span><b>Proposée à la réservation</b></span>
              <button type="button" role="switch" aria-checked={draft.active} aria-label="Proposée à la réservation" className={shared.switch} onClick={() => setDraft({ ...draft, active: !draft.active })} />
            </div>
            {failed ? <Notice tone="error">{failed}</Notice> : null}
            <Button type="submit" block busy={busy}>{draft.id ? 'Enregistrer' : 'Ajouter la prestation'}</Button>
            {draft.id ? (confirmDelete
              ? <div className={shared.sheetActions}><Button variant="secondary" icon="trash" disabled={busy} onClick={() => void remove()}>Oui, supprimer</Button><Button variant="quiet" onClick={() => setConfirmDelete(false)}>Annuler</Button></div>
              : <Button variant="quiet" block icon="trash" disabled={busy} onClick={() => setConfirmDelete(true)}>Supprimer cette prestation</Button>) : null}
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

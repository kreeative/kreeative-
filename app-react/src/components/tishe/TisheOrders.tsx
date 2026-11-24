'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Check, Field, Select, TextArea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { cents, tisheCall, tisheImg, TISHE_STATUS, type TisheAddress, type TisheOrder, type TisheOrderDetail, type TisheStatus } from '@/lib/tishe';
import { LegacyRow, TishePill, TisheRow } from './TisheHome';
import { TisheError, TisheGate, tisheSet, useLegacy, useOverview } from './useTishe';
import styles from './tishe.module.css';

const STATUSES = Object.keys(TISHE_STATUS) as TisheStatus[];
const dayTime = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; } catch { return ''; } };
const addr = (x?: TisheAddress | null) => (x ? [x.name, x.line1, x.line2, [x.city, x.state, x.postalCode].filter(Boolean).join(' '), x.country].filter(Boolean) : []);

/** Commandes of The Ivory Sukundu: the paid orders of the site, by status, and the old Shopify store's. One opens in
 *  the side panel: what was bought and paid, its history, the customer, and what she does with it (the supplier,
 *  the tracking, a refund, an e-mail to the customer). Every change is saved on the live shop. */
export function TisheOrders() { return <TisheGate title="Commandes"><Orders /></TisheGate>; }
function Orders() {
  const { data, error, reload } = useOverview();
  const legacy = useLegacy();
  const [f, setF] = useState<'all' | TisheStatus>('all');
  const [open, setOpen] = useState<string | null>(null);
  // ?statut=new (Accueil's figures) and ?tx=<id> (a line of Accueil) open the list filtered, or the order
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const st = q.get('statut') as TisheStatus | null;
    if (st && STATUSES.includes(st)) setF(st);
    const id = q.get('tx'); if (id) setOpen(id);
  }, []);
  if (error && !data) return <TisheError title="Commandes" error={error} retry={reload} />;
  if (!data) return <><PageHead title="Commandes" /><CloudLoader /></>;
  const all = data.orders;
  const list = f === 'all' ? all : all.filter((o) => o.status === f);
  return (
    <>
      <PageHead title="Commandes" sub={`${plural(all.length, 'commande payée', 'commandes payées')} sur theivorysukundu.com.`}
        action={<Button variant="secondary" icon="refresh" onClick={reload}>Actualiser</Button>} />
      <div className={styles.page}>
        <div className={styles.filters} role="group" aria-label="Filtrer les commandes">
          {(['all', ...STATUSES] as const).map((k) => (
            <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{k === 'all' ? 'Toutes' : TISHE_STATUS[k][0]} · {k === 'all' ? all.length : all.filter((o) => o.status === k).length}</button>
          ))}
        </div>
        {list.length ? <section className={styles.card}><ul className={styles.orows}>{list.map((o) => <TisheRow key={o.id} o={o} onOpen={() => setOpen(o.id)} />)}</ul></section>
          : <p className={styles.muted}>Aucune commande ici.</p>}
        {f === 'all' || f === 'delivered' ? (
          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Ancienne boutique Shopify</h2></div>
            <ul className={styles.orows}>{legacy.map((x) => <LegacyRow key={x.number} x={x} who={false} />)}</ul>
          </section>
        ) : null}
      </div>
      {open ? <OrderSheet key={open} id={open} onClose={() => { setOpen(null); try { history.replaceState(null, '', '/admin/commandes/'); } catch { /* ok */ } }} /> : null}
    </>
  );
}

function OrderSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { account } = useAdmin();
  const { data: overview } = useOverview();
  const [d, setD] = useState<TisheOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [panel, setPanel] = useState<'' | 'refund' | 'mail'>('');
  const [busy, setBusy] = useState('');
  const load = () => { setError(''); tisheCall<TisheOrderDetail>('order', { id }, account.userId).then(setD, (e: Error) => setError(e.message)); };
  useEffect(load, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a change: the panel and the list show the order as the shop now has it
  const took = (j: { order: TisheOrder; supplierMessages?: TisheOrderDetail['supplierMessages'] }, msg: string) => {
    setD((was) => ({ order: j.order, supplierMessages: j.supplierMessages ?? was?.supplierMessages }));
    if (overview) tisheSet('overview', { ...overview, orders: overview.orders.map((x) => (x.id === id ? { ...x, ...j.order } : x)) });
    setToast(msg);
  };
  if (!d) return <Sheet title="Commande" onClose={onClose}>{error ? <><Notice tone="error">{error}</Notice><Button variant="secondary" icon="refresh" onClick={load}>Réessayer</Button></> : <CloudLoader />}</Sheet>;
  const o = d.order, cur = o.currency, ro = o.readOnly === true;
  const money = (n?: number) => cents(n, cur);
  const left = Math.max(0, (Number(o.total) || 0) - (Number(o.refundedAmount) || 0));
  const canRefund = !ro && o.paid !== false && !o.refunded && left > 0;
  const open = o.status !== 'delivered' && o.status !== 'cancelled';
  async function status(v: TisheStatus) {
    if (v === 'cancelled' && !window.confirm('Annuler cette commande ? Elle passe en « Annulée ». Pour rendre l’argent, utilisez aussi « Rembourser ».')) return;
    setBusy(v);
    try { took(await tisheCall('update', { id, status: v }, account.userId), v === 'delivered' ? 'Commande marquée livrée.' : 'Commande annulée.'); } catch (e) { setToast((e as Error).message); }
    setBusy('');
  }
  return (
    <Sheet title={`Commande #${o.number ?? '—'}`} sub={dayTime(o.createdAt)} onClose={onClose} expandable>
      <div className={styles.chips}><TishePill status={o.status} />{o.refunded ? <span className={styles.pill} data-tone="muted">Remboursée</span> : o.refundedAmount ? <span className={styles.pill} data-tone="muted">Remboursée en partie</span> : null}{ro ? <span className={styles.pill} data-tone="muted">Ancienne boutique Shopify</span> : null}</div>
      <div className={styles.acts}>
        {canRefund ? <Button variant="secondary" icon="refresh" onClick={() => setPanel(panel === 'refund' ? '' : 'refund')}>Rembourser</Button> : null}
        {o.email ? <Button variant="secondary" icon="mail" onClick={() => setPanel(panel === 'mail' ? '' : 'mail')}>Écrire à la cliente</Button> : null}
        {!ro && open ? <Button variant="quiet" icon="check" busy={busy === 'delivered'} onClick={() => void status('delivered')}>Marquer livrée</Button> : null}
        {!ro && open ? <Button variant="quiet" busy={busy === 'cancelled'} onClick={() => void status('cancelled')}>Annuler la commande</Button> : null}
        {/^https:\/\//.test(o.stripeUrl ?? '') ? <ButtonLink variant="quiet" icon="external" href={o.stripeUrl} target="_blank" rel="noopener">Ouvrir dans Stripe</ButtonLink> : null}
      </div>
      {ro ? <Notice>Commande de l’ancienne boutique Shopify : elle se consulte seulement.</Notice> : null}
      {panel === 'refund' && canRefund ? <Refund order={o} max={left} onDone={(j, msg) => { took(j, msg); setPanel(''); }} onCancel={() => setPanel('')} /> : null}
      {panel === 'mail' ? <Mail order={o} onDone={() => { setPanel(''); setToast('E-mail envoyé.'); load(); }} onCancel={() => setPanel('')} /> : null}

      <div className={styles.block}>
        <h3>Articles</h3>
        <ul className={styles.items}>
          {(o.items ?? []).map((i, n) => (
            <li key={n}>
              {i.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={tisheImg(i.image)} alt="" /> : <span className={styles.noimg} />}
              <span><b>{i.title}</b><small>{[i.variant, i.unitAmount != null ? `${money(i.unitAmount)} × ${i.quantity}` : `× ${i.quantity}`].filter(Boolean).join(' · ')}</small></span>
              <span className={styles.amount}>{money(i.total)}</span>
            </li>
          ))}
        </ul>
        {(o.trackingNumbers ?? []).length ? <p className={styles.muted}>{o.carrier || 'Suivi'} : {(o.trackingNumbers ?? []).join(', ')}{/^https:\/\//.test(o.trackingUrl ?? '') ? <> · <a href={o.trackingUrl} target="_blank" rel="noopener"><b>Suivre le colis</b></a></> : null}</p> : null}
      </div>
      <div className={styles.block}>
        <h3>{o.refunded ? 'Remboursée' : 'Payée'}</h3>
        <dl className={styles.dl}>
          <div><dt>Sous-total</dt><dd>{money(o.subtotal)}</dd></div>
          {o.discount ? <div><dt>Réduction{o.code ? ` (${o.code})` : ''}</dt><dd>−{money(o.discount)}</dd></div> : null}
          <div><dt>Livraison</dt><dd>{money(o.shippingAmount)}</dd></div>
          {o.tax ? <div><dt>{o.taxLabel || 'Taxes'}</dt><dd>{money(o.tax)}</dd></div> : null}
          <div className={styles.dlTotal}><dt>Total</dt><dd>{money(o.total)}</dd></div>
          {o.payment ? <div><dt>Payé avec</dt><dd>{o.payment}</dd></div> : null}
          {o.refundedAmount ? <div><dt>Remboursé</dt><dd>−{money(o.refundedAmount)}</dd></div> : null}
          {o.settled ? <div><dt>Reçu sur le compte</dt><dd>{cents(o.net, 'CAD')} <span className={styles.muted}>(frais Stripe {cents(o.fee, 'CAD')})</span></dd></div> : null}
        </dl>
      </div>
      <div className={styles.block}>
        <h3>Cliente</h3>
        <p><b>{o.name}</b></p>
        {o.email ? <p><a href={`mailto:${o.email}`}>{o.email}</a></p> : null}
        {o.phone ? <p>{o.phone}</p> : null}
      </div>
      <div className={styles.block}>
        <h3>Adresse de livraison</h3>
        <p className={styles.addr}>{o.shipping ? addr(o.shipping).join('\n') : 'Adresse manquante'}</p>
        {o.billing === null ? <><h3>Adresse de facturation</h3><p className={styles.muted}>Stripe n’a pris que le pays et le code postal de la carte.</p></> : o.billing ? <><h3>Adresse de facturation</h3><p className={styles.addr}>{addr(o.billing).join('\n')}</p></> : null}
      </div>
      {ro && o.note ? <div className={styles.block}><h3>Note</h3><p>{o.note}</p></div> : null}
      {!ro ? <Follow order={o} onDone={took} /> : null}
      {!ro && (d.supplierMessages ?? []).length ? (
        <div className={styles.block}>
          <h3>Commander chez le fournisseur</h3>
          {(d.supplierMessages ?? []).map((m, i) => <Supplier key={i} name={m.name} message={m.message} onCopied={() => setToast('Message copié.')} />)}
        </div>
      ) : null}
      <div className={styles.block}>
        <h3>Chronologie</h3>
        {(o.timeline ?? []).filter((t) => t && t.title).length ? (
          <ol className={styles.tl}>
            {(o.timeline ?? []).filter((t) => t && t.title).map((t, i) => <li key={i}><span className={styles.dot} aria-hidden="true" /><div><p><b>{t.title}</b></p>{t.detail ? <p className={styles.muted}>{t.detail}</p> : null}</div><time dateTime={t.at}>{dayTime(t.at)}</time></li>)}
          </ol>
        ) : <p className={styles.muted}>Pas encore d’historique.</p>}
      </div>
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </Sheet>
  );
}

/** « Suivi de la commande »: its status, the supplier's reference, the carrier and the tracking numbers, her note. */
function Follow({ order: o, onDone }: { order: TisheOrder; onDone: (j: { order: TisheOrder; supplierMessages?: TisheOrderDetail['supplierMessages'] }, msg: string) => void }) {
  const { account } = useAdmin();
  const [st, setSt] = useState<TisheStatus>(o.status);
  const [ref, setRef] = useState(o.supplierRef ?? '');
  const [car, setCar] = useState(o.carrier ?? '');
  const [trk, setTrk] = useState((o.trackingNumbers ?? []).length ? (o.trackingNumbers ?? []).join(', ') : o.tracking ?? '');
  const [note, setNote] = useState(o.note ?? '');
  const [notify, setNotify] = useState(!o.shippedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const j = await tisheCall<{ order: TisheOrder; supplierMessages?: TisheOrderDetail['supplierMessages']; notified?: boolean }>('update', { id: o.id, status: st, supplierRef: ref, carrier: car, tracking: trk, note, notify }, account.userId);
      onDone(j, j.notified ? 'Enregistré. La cliente a reçu son numéro de suivi.' : 'Commande enregistrée.');
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <div className={styles.block}>
      <h3>Suivi de la commande</h3>
      <Select label="Statut" options={STATUSES.map((k) => TISHE_STATUS[k][0])} value={TISHE_STATUS[st][0]} onChange={(e) => setSt(STATUSES.find((k) => TISHE_STATUS[k][0] === e.target.value) ?? st)} />
      <Field label="Référence chez le fournisseur" value={ref} onChange={(e) => setRef(e.target.value)} />
      <div className={styles.two}>
        <Field label="Transporteur" placeholder="DHL, Canada Post…" value={car} onChange={(e) => setCar(e.target.value)} />
        <Field label="Numéros de suivi" value={trk} onChange={(e) => setTrk(e.target.value)} hint="Plusieurs : séparés par une virgule. Avec un numéro, la commande passe en « Expédiée »." />
      </div>
      <TextArea label="Note (pour vous seulement)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      <Check checked={notify} onChange={(e) => setNotify(e.target.checked)}>Envoyer à la cliente l’e-mail avec son numéro de suivi</Check>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.acts}><Button busy={busy} icon="check" onClick={() => void save()}>Enregistrer</Button></div>
    </div>
  );
}

function Refund({ order: o, max, onDone, onCancel }: { order: TisheOrder; max: number; onDone: (j: { order: TisheOrder }, msg: string) => void; onCancel: () => void }) {
  const { account } = useAdmin();
  const [amount, setAmount] = useState((max / 100).toFixed(2).replace('.', ','));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    const amt = Math.round(Number(amount.replace(/\s/g, '').replace(',', '.')) * 100);
    if (!(amt > 0) || amt > max) { setError(`Montant invalide : entre 0 et ${cents(max, o.currency)}.`); return; }
    if (!window.confirm(`Rembourser ${cents(amt, o.currency)} à ${o.name || 'la cliente'} ? L’argent quitte votre compte Stripe.`)) return;
    setBusy(true); setError('');
    try {
      const j = await tisheCall<{ order: TisheOrder; notified?: boolean }>('refund', { id: o.id, notify, ...(amt < max ? { amount: amt } : {}) }, account.userId);
      onDone(j, j.notified ? 'Remboursement fait. La cliente est prévenue.' : 'Remboursement fait.');
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <div className={styles.inset}>
      <h3>Rembourser</h3>
      <Field label={`Montant (${String(o.currency || 'CAD').toUpperCase()})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Au plus ${cents(max, o.currency)}. L’argent repart sur la carte de la cliente.`} />
      <Check checked={notify} onChange={(e) => setNotify(e.target.checked)}>Prévenir la cliente par e-mail</Check>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.acts}><Button variant="quiet" onClick={onCancel}>Annuler</Button><Button variant="ink" busy={busy} onClick={() => void go()}>Rembourser</Button></div>
    </div>
  );
}

function Mail({ order: o, onDone, onCancel }: { order: TisheOrder; onDone: () => void; onCancel: () => void }) {
  const { account } = useAdmin();
  const [subject, setSubject] = useState(`Votre commande #${o.number ?? ''}`);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    if (!message.trim()) { setError('Écrivez votre message.'); return; }
    setBusy(true); setError('');
    try { await tisheCall('email', { to: o.email, subject, message }, account.userId); onDone(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <div className={styles.inset}>
      <h3>Écrire à {o.name || 'la cliente'}</h3>
      <Field label="Objet" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <TextArea label="Message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.acts}><Button variant="quiet" onClick={onCancel}>Annuler</Button><Button variant="ink" icon="mail" busy={busy} onClick={() => void go()}>Envoyer depuis la boutique</Button></div>
    </div>
  );
}

function Supplier({ name, message, onCopied }: { name: string; message: string; onCopied: () => void }) {
  return (
    <div className={styles.supplier}>
      <TextArea label={`Message pour ${name}`} rows={7} readOnly value={message} />
      <Button variant="secondary" icon="copy" onClick={() => { void navigator.clipboard?.writeText(message); onCopied(); }}>Copier le message</Button>
    </div>
  );
}


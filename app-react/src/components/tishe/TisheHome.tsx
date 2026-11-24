'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { plural } from '@/lib/format';
import { cents, dollars, TISHE, tisheCall, TISHE_STATUS, type TisheLegacy, type TisheOrderRow } from '@/lib/tishe';
import { useAdmin } from '@/components/admin/AdminContext';
import { TisheError, TisheGate, tisheDrop, useLegacy, useOverview } from './useTishe';
import styles from './tishe.module.css';

const PERIODS: [string, string, number][] = [['mois', 'Ce mois-ci', 0], ['3m', '3 derniers mois', 3], ['6m', '6 derniers mois', 6], ['12m', '12 derniers mois', 12], ['tout', 'Depuis le début', -1]];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
interface Bucket { from: Date; to: Date; label: string; long: string; sum: number; n: number }
const day = (iso: string) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

/** The days of this month, or the months of the period (the current one included). */
function buckets(key: string, all: { at: Date }[]): Bucket[] {
  const now = new Date(), out: Bucket[] = [];
  if (key === 'mois') {
    for (let i = 1; i <= now.getDate(); i++) out.push({ from: new Date(now.getFullYear(), now.getMonth(), i), to: new Date(now.getFullYear(), now.getMonth(), i + 1), label: String(i), long: `${i} ${MONTHS[now.getMonth()]}`, sum: 0, n: 0 });
    return out;
  }
  let n = (PERIODS.find((p) => p[0] === key) ?? PERIODS[2]!)[2];
  if (n < 0) { const first = all.reduce((d, x) => (x.at < d ? x.at : d), now); n = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1; }
  for (let i = n - 1; i >= 0; i--) {
    const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({ from: a, to: b, label: MONTHS[a.getMonth()]!, long: `${MONTHS[a.getMonth()]} ${a.getFullYear()}`, sum: 0, n: 0 });
  }
  return out;
}

export function TishePill({ status }: { status: TisheOrderRow['status'] }) {
  const t = TISHE_STATUS[status] ?? [status, 'muted'];
  return <span className={styles.pill} data-tone={t[1]}>{t[0]}</span>;
}
/** One order: on Commandes it opens the side panel (`onOpen`), elsewhere it leads there. */
export function TisheRow({ o, onOpen }: { o: TisheOrderRow; onOpen?: () => void }) {
  const where = o.shipping ? [o.shipping.city, o.shipping.country].filter(Boolean).join(', ') : o.country ?? '';
  const body = (<>
    <span className={styles.otop}><b>#{o.number ?? '—'} <span className={styles.who}>· {o.name || o.email}</span></b><TishePill status={o.status} /></span>
    <span className={styles.oline}><span>{day(o.createdAt)}{where ? ` · ${where}` : ''}{o.refunded ? ' · Remboursée' : ''}</span><span className={styles.amount}>{cents(o.total, o.currency)}</span></span>
  </>);
  return <li>{onOpen ? <button type="button" className={styles.orow} onClick={onOpen}>{body}</button> : <Link className={styles.orow} href={`/admin/commandes/?tx=${encodeURIComponent(o.id)}`}>{body}</Link>}</li>;
}
export function LegacyRow({ x, who }: { x: TisheLegacy; who: boolean }) {
  const inner = (<>
    <span className={styles.otop}><b>#{x.number}{who ? <span className={styles.who}> · ancienne boutique Shopify</span> : null}</b><span className={styles.pill} data-tone="ok">Livrée</span></span>
    <span className={styles.oline}><span>{day(x.createdAt)} · {plural(x.items, 'article', 'articles')}{x.out ? ' · voir dans Shopify' : ''}</span><span className={styles.amount}>{dollars(x.total)}</span></span>
  </>);
  return <li>{x.out ? <a className={styles.orow} href={x.href} target="_blank" rel="noopener">{inner}</a> : <Link className={styles.orow} href={x.href}>{inner}</Link>}</li>;
}

function Kpi({ icon, label, value, sub, href }: { icon: IconName; label: string; value: string; sub: string; href?: string }) {
  const body = <><span className={styles.kLabel}><Icon name={icon} size={16} />{label}</span><span className={styles.kValue}>{value}</span><span className={styles.kSub}>{sub}</span></>;
  return href ? <Link className={styles.kpi} href={href}>{body}</Link> : <div className={styles.kpi}>{body}</div>;
}

/** Accueil of The Ivory Sukundu: what is paid, by period (old Shopify store included), in Canadian dollars; what
 *  waits to be ordered from the supplier or tracked; the last orders. */
export function TisheHome() { return <TisheGate title="The Ivory Sukundu"><Home /></TisheGate>; }
function Home() {
  const { account } = useAdmin();
  const { data: o, error, reload } = useOverview();
  const legacy = useLegacy();
  const [key, setKey] = useState('6m');
  const [fixing, setFixing] = useState('');
  if (error && !o) return <TisheError title="The Ivory Sukundu" error={error} retry={reload} />;
  if (!o) return <><PageHead title="The Ivory Sukundu" /><CloudLoader /></>;
  const live = o.orders.filter((x) => x.status !== 'cancelled' && !x.refunded).map((x) => ({ at: new Date(x.createdAt), amount: (x.settled || x.total || 0) / 100 }));
  // #1001 was a test at 0 $: it would only pull the average down
  const all = live.concat(legacy.filter((x) => x.total > 0).map((x) => ({ at: new Date(x.createdAt), amount: x.total })));
  const bk = buckets(key, all);
  bk.forEach((b) => { const xs = all.filter((x) => x.at >= b.from && x.at < b.to); b.sum = xs.reduce((n, x) => n + x.amount, 0); b.n = xs.length; });
  const tot = bk.reduce((n, b) => n + b.sum, 0), cnt = bk.reduce((n, b) => n + b.n, 0);
  const max = bk.reduce((m, b) => Math.max(m, b.sum), 0) || 1, many = bk.length > 14;
  const s = o.setup ?? {};
  async function setup() {
    setFixing('busy');
    try { const j = await tisheCall<{ webhook?: boolean }>('setup', {}, account.userId); setFixing(j.webhook ? 'Les commandes payées arrivent maintenant toutes seules.' : 'La réparation n’a pas marché.'); tisheDrop('overview'); }
    catch (e) { setFixing((e as Error).message); }
  }
  return (
    <>
      <PageHead title="The Ivory Sukundu" sub="Vos ventes, ancienne boutique Shopify comprise. Montants payés, en dollars canadiens."
        action={<ButtonLink variant="secondary" icon="external" href={TISHE.site} target="_blank" rel="noopener">Voir la boutique</ButtonLink>} />
      <div className={styles.page}>
        {!s.stripe || s.testMode || (s.stripe && !s.webhook) || !s.resend ? (
          <section className={styles.warn}>
            {!s.stripe ? <p><b>La boutique ne peut pas encore encaisser.</b> La clé Stripe n’est pas branchée sur le site : à ajouter sur Vercel (projet « tishe »), Settings › Environment Variables : <code>STRIPE_SECRET_KEY</code>.</p> : null}
            {s.stripe && s.testMode ? <p>Stripe est en mode test : les paiements ne sont pas réels.</p> : null}
            {s.stripe && !s.webhook ? <p>Les commandes payées n’arrivent pas toutes seules. <Button variant="secondary" busy={fixing === 'busy'} onClick={() => void setup()}>Réparer</Button>{fixing && fixing !== 'busy' ? ` ${fixing}` : ''}</p> : null}
            {!s.resend ? <p>Les e-mails aux clientes ne partent pas (Resend n’est pas branché sur le site).</p> : null}
          </section>
        ) : null}
        <div className={styles.periods} role="group" aria-label="Période">
          {PERIODS.map(([k, l]) => <button key={k} type="button" aria-pressed={key === k} onClick={() => setKey(k)}>{l}</button>)}
        </div>
        <section className={styles.card}>
          <div className={styles.sum}>
            <div><span className={styles.kLabel}><Icon name="wallet" size={16} />Ventes</span><span className={styles.sumV}>{dollars(tot)}</span></div>
            <div><span className={styles.kLabel}><Icon name="receipt" size={16} />Commandes</span><span className={styles.sumV}>{cnt}</span></div>
            <div><span className={styles.kLabel}><Icon name="bag" size={16} />Panier moyen</span><span className={styles.sumV}>{dollars(cnt ? tot / cnt : 0)}</span></div>
          </div>
          <div className={styles.chart} role="img" aria-label={`Ventes par ${many ? 'jour' : 'mois'}`}>
            <div className={styles.plot}>
              {bk.map((b, i) => { const tip = `${b.long} · ${dollars(b.sum)} · ${plural(b.n, 'commande', 'commandes')}`; return (
                <span key={i} className={styles.col} tabIndex={0} title={tip} aria-label={tip}><span className={styles.bar} style={{ height: `${b.sum ? Math.max(3, Math.round((b.sum / max) * 100)) : 0}%` }} /></span>
              ); })}
            </div>
            <div className={styles.axis}>{bk.map((b, i) => <span key={i}>{!many || i === 0 || (i + 1) % 5 === 0 || i === bk.length - 1 ? b.label : ''}</span>)}</div>
          </div>
        </section>
        <div className={styles.kpis}>
          <Kpi icon="refresh" label="À commander chez le fournisseur" value={String(o.stats.todo.toOrder)} sub="Commandes payées, pas encore passées" href="/admin/commandes/?statut=new" />
          <Kpi icon="truck" label="En attente du suivi" value={String(o.stats.todo.awaitingTracking)} sub="Commandées, sans numéro de suivi" href="/admin/commandes/?statut=ordered" />
          <Kpi icon="chart" label="Depuis le début" value={dollars(all.reduce((n, x) => n + x.amount, 0))} sub={`${plural(all.length, 'commande', 'commandes')}, Shopify compris`} />
        </div>
        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Dernières commandes</h2><Link href="/admin/commandes/">Toutes les commandes</Link></div>
          <ul className={styles.orows}>
            {o.orders.slice(0, 5).map((x) => <TisheRow key={x.id} o={x} />)}
            {legacy.map((x) => <LegacyRow key={x.number} x={x} who />)}
          </ul>
        </section>
      </div>
    </>
  );
}

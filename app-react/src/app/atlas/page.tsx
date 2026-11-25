'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { CodeInput } from '@/components/ui/CodeInput';
import { Field, Select } from '@/components/ui/Field';
import { Icon, Logo } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Globe } from '@/components/admin/Globe';
import live from '../admin/en-direct/live.module.css';
import { Toast } from '@/components/ui/Toast';
import { atlas, can, ROLE_LABEL, ROLE_TEXT, type AtlasStore, type AtlasAccount, type AtlasAdmin, type AtlasLive, type AtlasLog, type AtlasRole } from '@/lib/atlas';
import { maskEmail, sendCode, verifyCode } from '@/lib/auth';
import { money } from '@/lib/format';
import { planOf, PLANS } from '@/lib/billing';
import { MODELS, SHOP_OPTION, SHOP_OPTION_CAD } from '@/lib/models';
import styles from './atlas.module.css';
import { MailTab } from './Mail';

type Tab = 'vue' | 'comptes' | 'boutiques' | 'achats' | 'courriels' | 'direct' | 'admins' | 'journal';
const TABS: [Tab, string][] = [['vue', 'Vue d’ensemble'], ['comptes', 'Comptes'], ['boutiques', 'Boutiques'], ['achats', 'Achats'], ['courriels', 'Courriels'], ['direct', 'En direct'], ['admins', 'Administrateurs'], ['journal', 'Journal']];
const ROLES: AtlasRole[] = ['fondatrice', 'admin', 'support', 'lecture'];
const PLAN_CHOICES = [{ id: 'gratuit', name: 'Aucune formule' }, ...PLANS.map((p) => ({ id: p.id, name: p.name }))];
const day = (v?: string | null) => { const d = v ? new Date(v) : null; return d && !isNaN(+d) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const ago = (v?: string | null) => {
  const d = v ? new Date(v) : null; if (!d || isNaN(+d)) return 'jamais';
  const m = Math.max(0, Math.round((Date.now() - +d) / 60000));
  if (m < 1) return 'à l’instant'; if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24); return j < 31 ? `il y a ${j} j` : day(v);
};

/** Atlas: Jehre's admin space. Her Jehre account, then a code by e-mail (12 hours), then the tabs her role allows. */
export default function AtlasPage() {
  const [state, setState] = useState<'loading' | 'login' | 'code' | 'denied' | 'in'>('loading');
  const [role, setRole] = useState<AtlasRole>('lecture');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const check = useCallback(async () => {
    const r = await atlas<{ role: AtlasRole; email: string }>('me');
    if (r.ok) { setRole(r.role); setEmail(r.email); setState('in'); return; }
    setMessage(r.message);
    if (r.code === 'code') { setEmail(r.email ?? ''); setState('code'); }
    else if (r.code === 'login') setState('login');
    else setState('denied');
  }, []);
  useEffect(() => { void check(); }, [check]);

  if (state === 'loading') return <CloudLoader full label="Ouverture d’Atlas…" />;
  if (state === 'login') return <Gate title="Atlas" text="Connectez-vous avec votre compte Jehre."><ButtonLink href="/compte/#connexion" icon="user">Se connecter</ButtonLink></Gate>;
  if (state === 'denied') return <Gate title="Atlas" text={message || 'Cet espace est réservé à l’équipe Jehre.'}><ButtonLink variant="secondary" href="/admin/" icon="back">Mon tableau de bord</ButtonLink></Gate>;
  if (state === 'code') return <CodeStep email={email} onDone={() => { setState('loading'); void check(); }} />;
  return <Space role={role} email={email} />;
}

function Gate({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className={styles.gate}>
      <section className={styles.gateCard}>
        <Logo height={40} rainbow />
        <h1>{title}</h1>
        <p>{text}</p>
        {children}
      </section>
    </main>
  );
}

/** A code by e-mail each time Atlas opens (valid 12 hours on the server). */
function CodeStep({ email, onDone }: { email: string; onDone: () => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    setBusy(true); setError('');
    const r = await sendCode({ email, create: false });
    setBusy(false);
    if (!r.ok) { setError(r.text); return; }
    setSent(true);
  }
  async function verify(v = code) {
    if (v.length < 6) return;
    setBusy(true); setError('');
    const r = await verifyCode(email, v);
    setBusy(false);
    if (!r.ok) { setError(r.text); setCode(''); return; }
    onDone();
  }
  return (
    <Gate title="Atlas" text={sent ? `Entrez le code envoyé à ${maskEmail(email)}.` : 'Pour ouvrir l’espace administrateur, confirmez avec un code reçu par e-mail.'}>
      {sent ? <CodeInput label="Code reçu par e-mail" value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} invalid={!!error} /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {sent ? <Button busy={busy} onClick={() => void verify()}>Ouvrir Atlas</Button> : <Button busy={busy} icon="mail" onClick={() => void send()}>Recevoir le code</Button>}
      {sent ? <button type="button" className={styles.link} onClick={() => void send()}>Renvoyer le code</button> : null}
    </Gate>
  );
}

function Space({ role, email }: { role: AtlasRole; email: string }) {
  const [tab, setTab] = useState<Tab>('vue');
  const [toast, setToast] = useState('');
  const shown = TABS.filter(([t]) => (t !== 'admins' && t !== 'courriels') || can(role, 'support'));
  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <a href="/admin/" className={styles.brand} aria-label="Mon tableau de bord"><Logo height={32} rainbow /><b>Atlas</b></a>
        <span className={styles.me}><span className={styles.pill}>{ROLE_LABEL[role]}</span><span className={styles.muted}>{email}</span></span>
      </header>
      <nav className={styles.tabs} aria-label="Atlas">
        {shown.map(([t, l]) => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{l}</button>)}
      </nav>
      <main className={styles.main}>
        {tab === 'vue' ? <Overview me={email} /> : null}
        {tab === 'comptes' ? <Accounts role={role} me={email} onToast={setToast} /> : null}
        {tab === 'boutiques' ? <Stores role={role} onToast={setToast} /> : null}
        {tab === 'achats' ? <Purchases /> : null}
        {tab === 'direct' ? <Live /> : null}
        {tab === 'admins' ? <Admins role={role} me={email} onToast={setToast} /> : null}
        {tab === 'courriels' ? <MailTab onToast={setToast} /> : null}
        {tab === 'journal' ? <Journal /> : null}
      </main>
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </div>
  );
}

/** One thing of Atlas, loaded when its tab opens. */
function useAtlas<T>(action: string, pick: (j: Record<string, unknown>) => T): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    void atlas<Record<string, unknown>>(action).then((r) => { if (r.ok) setData(pick(r)); else setError(r.message); });
  }, [action]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  return { data, error, reload: load };
}
function Loading({ error, retry }: { error: string; retry: () => void }) {
  return error ? <div className={styles.card}><Notice tone="error">{error}</Notice><div className={styles.acts}><Button variant="secondary" icon="refresh" onClick={retry}>Réessayer</Button></div></div> : <CloudLoader />;
}

const NB = ' ';
const COUNTRY = (code: string): string => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; } };
const num = (n: number) => n.toLocaleString('fr-FR').replace(/\s/g, NB);
/** Her own test stores never count as paid plans or launch offers. */
const others = (list: AtlasAccount[], me: string) => list.filter((a) => a.email.toLowerCase() !== me);
const paid = (s: AtlasStore) => s.plan !== 'gratuit' && !s.promo;
const offered = (s: AtlasStore) => s.plan !== 'gratuit' && s.promo;

/** Sums by money: « 50 000 FCFA · 59,99 $ CA ». */
const sums = (list: { amount: number; currency?: string }[]) => {
  const by: Record<string, number> = {};
  list.forEach((p) => { const c = (p.currency || 'xof').toUpperCase(); by[c] = (by[c] ?? 0) + (Number(p.amount) || 0); });
  return Object.entries(by).map(([c, n]) => money(n, c)).join(' · ') || money(0, 'XOF');
};

function Overview({ me }: { me: string }) {
  const { data: all, error, reload } = useAtlas<AtlasAccount[]>('accounts', (j) => (j.accounts as AtlasAccount[]) ?? []);
  if (!all) return <Loading error={error} retry={reload} />;
  const stores = all.flatMap((a) => a.stores);
  const theirs = others(all, me).flatMap((a) => a.stores);
  const pay = theirs.filter(paid), off = theirs.filter(offered);
  const mrr = pay.reduce((n, s) => n + planOf(s.plan).month, 0);
  const buys = all.flatMap((a) => a.purchases.map((p) => ({ ...p, a })));
  const todo = buys.filter((b) => b.install && !b.installedAt);
  const since = (h: number) => all.filter((a) => Date.now() - Date.parse(a.createdAt) < h * 36e5).length;
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return { d, n: 0 }; });
  all.forEach((a) => { const t = new Date(a.createdAt); t.setHours(0, 0, 0, 0); const x = days.find((y) => +y.d === +t); if (x) x.n++; });
  const max = Math.max(1, ...days.map((x) => x.n));
  const src: Record<string, number> = {};
  all.forEach((a) => { const k = a.source || 'direct'; src[k] = (src[k] ?? 0) + 1; });
  const srcs = Object.entries(src).sort((x, y) => y[1] - x[1]);
  const k: [string, string, string][] = [
    ['Inscrits', num(all.length), `+${since(24)} en 24${NB}h · +${since(168)} en 7${NB}j`],
    ['E-mail confirmé', num(all.filter((a) => a.verified).length), ''],
    ['Boutiques', num(stores.length), `${stores.filter((s) => s.published).length} en ligne`],
    ['Formules payées', num(pay.length), `≈${NB}${money(mrr, 'XOF')} / mois`],
    ['En offre de lancement', num(off.length), 'gratuit pour l’instant'],
    ['Modèles vendus', num(buys.length), sums(buys)],
    ['Installations à faire', num(todo.length), ''],
    ['Comptes suspendus', num(all.filter((a) => a.suspended).length), ''],
  ];
  return (
    <>
      <h1 className={styles.h1}>Vue d’ensemble</h1>
      <div className={styles.kpis}>{k.map(([l, v, s]) => <div key={l} className={styles.kpi}><span>{l}</span><b>{v}</b><small>{s || NB}</small></div>)}</div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <section className={styles.card} aria-label="Inscriptions">
            <h2>Inscriptions <small className={styles.muted}>14 derniers jours</small></h2>
            <div className={styles.bars}>{days.map((x) => <div key={+x.d}><b>{x.n || ''}</b><i style={{ height: `${Math.round(100 * x.n / max)}%` }} /><span>{x.d.getDate()}</span></div>)}</div>
          </section>
          <section className={styles.card} aria-label="Derniers inscrits">
            <h2>Derniers inscrits</h2>
            <ul className={styles.rows}>{all.slice().sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, 8).map((a) => (
              <li key={a.id} className={styles.store}><span><b>{a.firstName || a.email}</b><small>{a.email}{a.source ? ` · via ${a.source}` : ''}</small></span><small className={styles.right}>{ago(a.createdAt)}<br />{a.stores[0]?.name ?? 'pas de boutique'}</small></li>
            ))}</ul>
          </section>
        </div>
        <div className={styles.col}>
          <section className={styles.card} aria-label="D’où ils viennent">
            <h2>D’où ils viennent</h2>
            <ul className={styles.rows}>{srcs.map(([s, n]) => <li key={s} className={styles.store}><span><b>{s === 'direct' ? 'Direct' : s.charAt(0).toUpperCase() + s.slice(1)}</b></span><b className={styles.amount}>{n}</b></li>)}</ul>
          </section>
          <section className={styles.card} aria-label="Installations à faire">
            <h2>Installations à faire</h2>
            {todo.length ? <ul className={styles.rows}>{todo.map((b, i) => <li key={i} className={styles.store}><span><b>{b.model.toUpperCase()}</b><small>{b.a.firstName ? `${b.a.firstName} · ` : ''}{b.a.email}</small></span><small className={styles.right}>{day(b.at)}</small></li>)}</ul> : <p className={styles.muted}>Rien en attente.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

function Accounts({ role, me, onToast }: { role: AtlasRole; me: string; onToast: (m: string) => void }) {
  const { data, error, reload } = useAtlas<AtlasAccount[]>('accounts', (j) => (j.accounts as AtlasAccount[]) ?? []);
  const [q, setQ] = useState('');
  const [f, setF] = useState<'tous' | 'boutique' | 'payant' | 'suspendus'>('tous');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [interac, setInterac] = useState<string | null>(null);
  const list = useMemo(() => (data ?? []).filter((a) => {
    const t = `${a.email} ${a.firstName} ${a.stores.map((s) => `${s.slug} ${s.name}`).join(' ')}`.toLowerCase();
    if (q.trim() && !t.includes(q.trim().toLowerCase())) return false;
    if (f === 'boutique') return a.stores.length > 0;
    if (f === 'payant') return a.stores.some((s) => s.plan !== 'gratuit' && !s.promo);
    if (f === 'suspendus') return a.suspended;
    return true;
  }), [data, q, f]);
  if (!data) return <Loading error={error} retry={reload} />;
  async function act(key: string, action: string, body: Record<string, unknown>, ok: string) {
    setBusy(key);
    const r = await atlas(action, body);
    setBusy('');
    onToast(r.ok ? ok : r.message);
    if (r.ok) reload();
  }
  return (
    <>
      <h1 className={styles.h1}>Comptes <span className={styles.count}>{data.length}</span></h1>
      <div className={styles.tools}>
        <input className={styles.search} type="search" placeholder="Un e-mail, un prénom, une boutique" aria-label="Rechercher un compte" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={styles.filters} role="group" aria-label="Filtrer les comptes">
          {([['tous', 'Tous'], ['boutique', 'Avec boutique'], ['payant', 'Formule payante'], ['suspendus', 'Suspendus']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
        </div>
      </div>
      <section className={styles.card}>
        <ul className={styles.rows}>
          {list.map((a) => (
            <li key={a.id}>
              <button type="button" className={styles.row} aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                <span className={styles.rowMain}><b>{a.firstName ? `${a.firstName} · ` : ''}{a.email}</b><small>Inscrit le {day(a.createdAt)} · vu {ago(a.lastSignIn)}{a.verified ? '' : ' · e-mail non vérifié'}</small></span>
                <span className={styles.tags}>{a.suspended ? <span className={styles.pill} data-tone="err">Suspendu</span> : null}{a.stores.map((s) => <span key={s.id} className={styles.pill} data-tone={s.plan !== 'gratuit' && !s.promo ? 'ok' : undefined}>{planOf(s.plan).name}</span>)}</span>
                <Icon name="down" size={14} />
              </button>
              {open === a.id ? (
                <div className={styles.detail}>
                  {a.stores.length ? a.stores.map((s) => (
                    <div key={s.id} className={styles.store}>
                      <span><b>{s.name}</b><small>{s.slug}.store.jehre.com · {s.published ? 'en ligne' : 'hors ligne'}{s.promo ? ' · formule offerte' : ''}</small></span>
                      {can(role, 'admin') ? <Select label={`Formule de ${s.name}`} options={PLAN_CHOICES.map((p) => p.name)} value={PLAN_CHOICES.find((p) => p.id === s.plan)?.name ?? 'Aucune formule'} disabled={busy === s.id}
                        onChange={(e) => { const p = PLAN_CHOICES.find((x) => x.name === e.target.value)?.id; if (p) void act(s.id, 'plan', { storeId: s.id, plan: p }, `Formule de ${s.name} : ${e.target.value}.`); }} /> : <span className={styles.pill}>{planOf(s.plan).name}</span>}
                    </div>
                  )) : <p className={styles.muted}>Pas de boutique.</p>}
                  {a.purchases.length ? <p className={styles.muted}>Achats : {a.purchases.map((p) => `${p.model} (${money(p.amount, p.currency || 'XOF')}${p.method === 'interac' ? ' par Interac' : ''}, ${day(p.at)})`).join(' · ')}</p> : null}
                  {interac === a.id ? <InteracForm account={a} onToast={onToast} onDone={() => { setInterac(null); reload(); }} /> : null}
                  <div className={styles.acts}>
                    {can(role, 'admin') && interac !== a.id ? <Button variant="secondary" icon="wallet" onClick={() => setInterac(a.id)}>Enregistrer un paiement Interac</Button> : null}
                    {can(role, 'support') ? <Button variant="secondary" icon="lock" busy={busy === `r${a.id}`} onClick={() => void act(`r${a.id}`, 'reset', { email: a.email }, `Lien de mot de passe envoyé à ${a.email}.`)}>Envoyer un lien de mot de passe</Button> : null}
                    {can(role, 'admin') && a.email.toLowerCase() !== me ? (a.suspended
                      ? <Button variant="secondary" icon="check" busy={busy === `s${a.id}`} onClick={() => void act(`s${a.id}`, 'suspend', { userId: a.id, on: false }, 'Compte réactivé : ses boutiques sont de nouveau en ligne.')}>Réactiver le compte</Button>
                      : <Button variant="quiet" icon="lock" busy={busy === `s${a.id}`} onClick={() => { if (window.confirm(`Suspendre ${a.email} ? Le compte ne peut plus se connecter et ses boutiques passent hors ligne. Vous pourrez le réactiver.`)) void act(`s${a.id}`, 'suspend', { userId: a.id, on: true }, 'Compte suspendu.'); }}>Suspendre le compte</Button>) : null}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {!list.length ? <p className={styles.muted}>Aucun compte ici.</p> : null}
      </section>
    </>
  );
}

/** A model paid by Interac (Canadian dollars): written like a card purchase, so the model opens for her. */
const PAYABLE = [...MODELS.map((m) => ({ slug: m.slug, name: m.name, cad: m.cad })), { slug: SHOP_OPTION, name: 'Option vente de produits', cad: SHOP_OPTION_CAD }];
const dollars = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
function InteracForm({ account: a, onToast, onDone }: { account: AtlasAccount; onToast: (m: string) => void; onDone: () => void }) {
  const [slug, setSlug] = useState(PAYABLE[0]!.slug);
  const [amount, setAmount] = useState(dollars(PAYABLE[0]!.cad));
  const [storeId, setStoreId] = useState(a.stores[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = PAYABLE.find((x) => x.slug === slug) ?? PAYABLE[0]!;
  async function save() {
    const n = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!(n >= 1 && n <= 5000)) { setError('Le montant reçu, en dollars canadiens (par exemple 59,99).'); return; }
    if (!window.confirm(`Enregistrer ${dollars(Math.round(n * 100))} $ CA reçus par Interac pour ${item.name}, au compte ${a.email} ? Le modèle s’ouvre tout de suite.`)) return;
    setBusy(true); setError('');
    const r = await atlas('interac', { userId: a.id, model: slug, amount: n, storeId });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onToast(`Paiement Interac enregistré : ${item.name} est ouvert pour ${a.email}.`);
    onDone();
  }
  return (
    <div className={styles.interac} role="group" aria-label="Paiement Interac">
      <div className={styles.interacRow}>
        <Select label="Ce qu’elle a payé" options={PAYABLE.map((x) => x.name)} value={item.name} onChange={(e) => { const x = PAYABLE.find((y) => y.name === e.target.value); if (x) { setSlug(x.slug); setAmount(dollars(x.cad)); } }} />
        <Field label="Montant reçu ($ CA)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {a.stores.length > 1 ? <Select label="Pour la boutique" options={a.stores.map((s) => s.name)} value={a.stores.find((s) => s.id === storeId)?.name ?? a.stores[0]!.name} onChange={(e) => setStoreId(a.stores.find((s) => s.name === e.target.value)?.id ?? '')} /> : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={styles.acts}>
        <Button icon="check" busy={busy} onClick={() => void save()}>Enregistrer le paiement</Button>
        <Button variant="quiet" onClick={onDone}>Annuler</Button>
      </div>
    </div>
  );
}

function Stores({ role, onToast }: { role: AtlasRole; onToast: (m: string) => void }) {
  const { data, error, reload } = useAtlas<AtlasAccount[]>('accounts', (j) => (j.accounts as AtlasAccount[]) ?? []);
  const [busy, setBusy] = useState('');
  if (!data) return <Loading error={error} retry={reload} />;
  const all = data.flatMap((a) => a.stores.map((s) => ({ ...s, owner: a.email })));
  return (
    <>
      <h1 className={styles.h1}>Boutiques <span className={styles.count}>{all.length}</span></h1>
      <section className={styles.card}>
        <ul className={styles.rows}>
          {all.map((s) => (
            <li key={s.id} className={styles.store}>
              <span><b>{s.name}</b><small>{s.domain || `${s.slug}.store.jehre.com`} · {s.owner} · {s.published ? 'en ligne' : 'hors ligne'}</small></span>
              {can(role, 'admin') ? <Select label={`Formule de ${s.name}`} options={PLAN_CHOICES.map((p) => p.name)} value={PLAN_CHOICES.find((p) => p.id === s.plan)?.name ?? 'Aucune formule'} disabled={busy === s.id}
                onChange={async (e) => { const p = PLAN_CHOICES.find((x) => x.name === e.target.value)?.id; if (!p) return; setBusy(s.id); const r = await atlas('plan', { storeId: s.id, plan: p }); setBusy(''); onToast(r.ok ? `Formule de ${s.name} : ${e.target.value}.` : r.message); if (r.ok) reload(); }} />
                : <span className={styles.pill}>{planOf(s.plan).name}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Purchases() {
  const { data, error, reload } = useAtlas<AtlasAccount[]>('accounts', (j) => (j.accounts as AtlasAccount[]) ?? []);
  if (!data) return <Loading error={error} retry={reload} />;
  const all = data.flatMap((a) => a.purchases.map((p) => ({ ...p, a }))).sort((x, y) => (x.at < y.at ? 1 : -1));
  return (
    <>
      <h1 className={styles.h1}>Achats <span className={styles.count}>{all.length}</span></h1>
      <div className={styles.kpis}>
        <div className={styles.kpi}><span>Modèles vendus</span><b>{num(all.length)}</b><small>{NB}</small></div>
        <div className={styles.kpi}><span>Encaissé</span><b>{sums(all)}</b><small>{NB}</small></div>
        <div className={styles.kpi}><span>Avec installation</span><b>{num(all.filter((p) => p.install).length)}</b><small>{NB}</small></div>
      </div>
      <section className={styles.card}>
        <ul className={styles.rows}>{all.map((p, i) => (
          <li key={i} className={styles.store}>
            <span><b>{p.model.toUpperCase()}</b><small>{p.a.firstName ? `${p.a.firstName} · ` : ''}{p.a.email}{p.a.phone ? ` · ${p.a.phone}` : ''} · {day(p.at)}{p.method === 'interac' ? ' · Interac' : ''}</small></span>
            <span className={styles.pill} data-tone={!p.install ? undefined : p.installedAt ? 'ok' : 'warn'}>{!p.install ? 'elle remplit elle-même' : p.installedAt ? `installée le ${day(p.installedAt)}` : 'installation à faire'}</span>
            <b className={styles.amount}>{money(p.amount, p.currency || 'XOF')}</b>
          </li>
        ))}</ul>
        {!all.length ? <p className={styles.muted}>Aucun achat pour l’instant.</p> : null}
      </section>
    </>
  );
}

function Live() {
  const { data, error, reload } = useAtlas<AtlasLive>('live', (j) => j as unknown as AtlasLive);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) reload(); }, 30000); return () => clearInterval(t); }, [reload]);
  if (!data) return <Loading error={error} retry={reload} />;
  const points = data.points.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number').map((p) => ({ lat: p.lat as number, lon: p.lon as number, live: p.live === true }));
  const last = data.points.filter((p) => p.city || p.country).slice(0, 12);
  return (
    <>
      <h1 className={styles.h1}>En direct sur jehre.com</h1>
      <div className={live.grid}>
        <section className={live.stage} aria-label="Globe">
          <Globe points={points} label="Globe des visiteurs de jehre.com" />
          <p className={live.legend}><span><i className={live.dot} data-on="" />En ce moment</span><span><i className={live.dot} />Ces 7 derniers jours</span></p>
        </section>
        <div className={live.side}>
          <div className={styles.kpis}>
            <div className={styles.kpi}><span>En ce moment</span><b>{data.now}</b><small>les 5 dernières minutes</small></div>
            <div className={styles.kpi}><span>Aujourd’hui</span><b>{data.today}</b><small>sur 24 heures</small></div>
            <div className={styles.kpi}><span>Cette semaine</span><b>{data.week}</b><small>sur 7 jours</small></div>
          </div>
          {data.countries?.length ? (
            <section className={styles.card} aria-label="Par pays">
              <h2>Par pays <small className={styles.muted}>aujourd’hui</small></h2>
              <ul className={styles.rows}>{data.countries.map((c) => <li key={c.country} className={styles.store}><span><b>{COUNTRY(c.country)}</b></span><b className={styles.amount}>{c.n}</b></li>)}</ul>
            </section>
          ) : null}
          <section className={styles.card} aria-label="Dernières visites">
            <h2>Dernières visites</h2>
            {last.length ? <ul className={styles.rows}>{last.map((p, i) => <li key={i} className={styles.store}><span><b>{[p.city, p.country ? COUNTRY(p.country) : ''].filter(Boolean).join(', ')}{p.live ? <span className={styles.pill} data-tone="ok">en ce moment</span> : null}</b><small>{pageName(p.path)}</small></span><small className={styles.right}>{ago(p.at)}</small></li>)}</ul> : <p className={styles.muted}>Pas encore de visite.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
const PAGES: Record<string, string> = { '/': 'Accueil', '/creer/': 'Créer une boutique', '/compte/': 'Compte', '/admin/': 'Tableau de bord', '/modeles/': 'Modèles', '/a-propos/': 'À propos', '/pitch/': 'Pitch' };
function pageName(p?: string | null): string {
  let k = (String(p || '/').split(/[?#]/)[0] ?? '/').replace(/index\.html$/, '');
  if (!k.endsWith('/')) k += '/';
  return PAGES[k] ?? (k.length > 40 ? `${k.slice(0, 40)}…` : k);
}

function Admins({ role, me, onToast }: { role: AtlasRole; me: string; onToast: (m: string) => void }) {
  const { data, error, reload } = useAtlas<AtlasAdmin[]>('admins', (j) => (j.admins as AtlasAdmin[]) ?? []);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<AtlasRole>('support');
  const [busy, setBusy] = useState('');
  const boss = can(role, 'fondatrice');
  if (!data) return <Loading error={error} retry={reload} />;
  async function set(who: string, r: AtlasRole | null, ok: string) {
    setBusy(who);
    const a = await atlas('admin_set', { email: who, role: r });
    setBusy('');
    onToast(a.ok ? ok : a.message);
    if (a.ok) { reload(); setEmail(''); }
  }
  return (
    <>
      <h1 className={styles.h1}>Administrateurs</h1>
      <ul className={styles.roles}>{ROLES.map((r) => <li key={r}><b>{ROLE_LABEL[r]}</b><span>{ROLE_TEXT[r]}</span></li>)}</ul>
      {boss ? (
        <section className={styles.card} aria-label="Ajouter un administrateur">
          <h2>Ajouter un administrateur</h2>
          <p className={styles.muted}>La personne se connecte avec son compte Jehre à cette adresse, puis avec un code reçu par e-mail.</p>
          <div className={styles.addRow}>
            <Field label="Adresse e-mail" type="email" placeholder="prenom@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select label="Rôle" options={ROLES.filter((r) => r !== 'fondatrice').map((r) => ROLE_LABEL[r])} value={ROLE_LABEL[newRole]} onChange={(e) => setNewRole(ROLES.find((r) => ROLE_LABEL[r] === e.target.value) ?? 'support')} />
            <Button icon="plus" busy={busy === email.trim().toLowerCase() && !!email} onClick={() => void set(email.trim().toLowerCase(), newRole, `${email.trim()} est ${ROLE_LABEL[newRole].toLowerCase()}.`)}>Ajouter</Button>
          </div>
        </section>
      ) : null}
      <section className={styles.card}>
        <ul className={styles.rows}>
          {data.map((a) => (
            <li key={a.email} className={styles.store}>
              <span><b>{a.email}{a.email === me ? ' (vous)' : ''}</b><small>Depuis le {day(a.added_at)}{a.added_by && a.added_by !== 'migration' ? ` · ajouté par ${a.added_by}` : ''}</small></span>
              {boss && a.email !== me ? (
                <span className={styles.adminActs}>
                  <Select label={`Rôle de ${a.email}`} options={ROLES.map((r) => ROLE_LABEL[r])} value={ROLE_LABEL[a.role]} disabled={busy === a.email} onChange={(e) => { const r = ROLES.find((x) => ROLE_LABEL[x] === e.target.value); if (r) void set(a.email, r, `${a.email} : ${ROLE_LABEL[r]}.`); }} />
                  <Button variant="quiet" icon="trash" busy={busy === a.email} onClick={() => { if (window.confirm(`Retirer ${a.email} des administrateurs ?`)) void set(a.email, null, `${a.email} n’est plus administrateur.`); }}>Retirer</Button>
                </span>
              ) : <span className={styles.pill}>{ROLE_LABEL[a.role]}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Journal() {
  const { data, error, reload } = useAtlas<AtlasLog[]>('log', (j) => (j.log as AtlasLog[]) ?? []);
  if (!data) return <Loading error={error} retry={reload} />;
  return (
    <>
      <h1 className={styles.h1}>Journal</h1>
      <section className={styles.card}>
        <ul className={styles.rows}>{data.map((l, i) => <li key={i} className={styles.store}><span><b>{l.action}{l.target ? ` · ${l.target}` : ''}</b><small>{l.actor}{l.detail && Object.keys(l.detail).length ? ` · ${Object.entries(l.detail).map(([k, v]) => `${k} ${String(v)}`).join(', ')}` : ''}</small></span><small className={styles.muted}>{ago(l.at)}</small></li>)}</ul>
        {!data.length ? <p className={styles.muted}>Rien pour l’instant.</p> : null}
      </section>
    </>
  );
}


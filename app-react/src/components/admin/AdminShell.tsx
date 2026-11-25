'use client';

import { useSwipeDown } from '@/components/ui/useSwipeDown';
import { sitesEditor } from '@/lib/tishe';
import { CardGate } from '@/components/admin/CardGate';
import { cardNeed } from '@/lib/billing';
import Link from 'next/link';
import { Sheet } from '@/components/ui/Sheet';
import { useOrders } from '@/components/admin/useOrders';
import { productsOf } from '@/lib/stores';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, Logo, type IconName } from '@/components/ui/Icon';
import { signOut } from '@/lib/account';
import { modelBySlug } from '@/lib/models';
import { storeName, storeUrl } from '@/lib/stores';
import { useAdmin } from './AdminContext';
import { TISHE } from '@/lib/tishe';
import styles from './AdminShell.module.css';

interface NavItem { href: string; label: string; icon: IconName; group?: string; more?: boolean; /** a page outside this app (a plain link) */ ext?: boolean }
// the founder's own websites (kreeative.xyz, Aïssa Kee, client sites), edited in the Studio: for her only
const MY_SITES: NavItem = { href: '/studio/mes-sites/', label: 'Mes sites', icon: 'pages', group: 'Kreeative', more: true, ext: true };
// a booking model (REGARD, VERNIE, MINUIT): appointments and services come first, as orders and products do for a shop
const RDV: NavItem[] = [
  { href: '/admin/', label: 'Accueil', icon: 'home' },
  { href: '/admin/rendez-vous/', label: 'Rendez-vous', icon: 'receipt' },
  { href: '/admin/prestations/', label: 'Prestations', icon: 'tag' },
];
// `more`: on a phone the bar shows the first three; the others are behind « Plus »
const SHOP: NavItem[] = [
  { href: '/admin/', label: 'Accueil', icon: 'home' },
  { href: '/admin/commandes/', label: 'Commandes', icon: 'receipt' },
  { href: '/admin/produits/', label: 'Produits', icon: 'tag' },
  { href: '/admin/en-direct/', label: 'En direct', icon: 'eye', more: true },
  { href: '/admin/clients/', label: 'Clients', icon: 'users', more: true },
  { href: '/admin/promos/', label: 'Codes promo', icon: 'sparkle', more: true },
  { href: '/admin/paniers/', label: 'Paniers abandonnés', icon: 'bag', more: true },
  { href: '/admin/editeur/', label: 'Éditeur', icon: 'edit', group: 'Boutique en ligne', more: true },
  { href: '/admin/modeles/', label: 'Modèles', icon: 'template', more: true },
  { href: '/admin/branding/', label: 'Branding', icon: 'brush', more: true },
  { href: '/admin/paiements/', label: 'Paiements', icon: 'wallet', group: 'Réglages', more: true },
  { href: '/admin/livraison/', label: 'Livraison', icon: 'truck', more: true },
  { href: '/admin/equipe/', label: 'Associés', icon: 'users', more: true },
  { href: '/admin/abonnement/', label: 'Abonnement', icon: 'sparkle', more: true },
  { href: '/admin/domaine/', label: 'Nom de domaine', icon: 'external', more: true },
  { href: '/admin/parametres/', label: 'Paramètres', icon: 'gear', more: true },
];

// The Ivory Sukundu: its own pages (its data stays on its site, ../../lib/tishe.ts)
// its pages: its data stays on its site (../../lib/tishe.ts)
const TISHE_NAV: NavItem[] = [
  { href: '/admin/', label: 'Accueil', icon: 'home' },
  { href: '/admin/commandes/', label: 'Commandes', icon: 'receipt' },
  { href: '/admin/produits/', label: 'Produits', icon: 'tag' },
  { href: '/admin/en-direct/', label: 'En direct', icon: 'eye', more: true },
  { href: '/admin/clients/', label: 'Clientes', icon: 'users', more: true },
  { href: '/admin/promos/', label: 'Codes promo', icon: 'sparkle', more: true },
  { href: '/admin/le-site/', label: 'Le site', icon: 'edit', group: 'Boutique en ligne', more: true },
  { href: '/admin/bandeau/', label: 'Bandeau et soldes', icon: 'text', more: true },
  { href: '/admin/livraison/', label: 'Livraison', icon: 'truck', group: 'Réglages', more: true },
  { href: '/admin/parametres/', label: 'Paramètres', icon: 'gear', more: true },
];

/** The frame of the dashboard: the store and the menu on the left (a bar at the bottom on a phone), the page on the right. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { account, stores, store, selectStore, model, tishe } = useAdmin();
  const [founder, setFounder] = useState(false);
  useEffect(() => { let on = true; void sitesEditor(account.userId).then((x) => { if (on) setFounder(x); }); return () => { on = false; }; }, [account.userId]);
  const NAV = useMemo(() => { const base = tishe.on ? TISHE_NAV : modelBySlug(model)?.rdv ? [...RDV, ...SHOP.slice(1).map((n) => ({ ...n, more: true }))] : SHOP; return founder ? [...base, MY_SITES] : base; }, [model, tishe.on, founder]);
  // the stores of the switcher: hers, then The Ivory Sukundu for the founder and its partners
  const picks = [...stores.map((s) => ({ id: s.id, name: storeName(s) })), ...(tishe.allowed ? [{ id: 'ext:tishe', name: TISHE.name }] : [])];
  const pickId = tishe.on ? 'ext:tishe' : store?.id ?? '';
  const viewUrl = tishe.on ? TISHE.site : store ? storeUrl(store, model) : '';
  const shownName = tishe.on ? TISHE.name : store ? storeName(store) : '';
  const path = usePathname();
  // the free month asks for her card first (the plans page stays open, to choose another plan)
  const gate = !tishe.on && !/^\/admin\/abonnement\/?$/.test(path) ? cardNeed(store) : null;
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const me = useRef<HTMLDivElement>(null);
  // the menu closes by itself: a choice, Échap, a click outside, another page; it leaves with a short fade
  const closeMenu = useCallback(() => {
    setLeaving((was) => { if (!was) window.setTimeout(() => { setMenu(false); setLeaving(false); }, 160); return true; });
  }, []);
  useEffect(() => { setMenu(false); setLeaving(false); }, [path]);
  const [panel, setPanel] = useState<'' | 'search' | 'help'>('');
  const [query, setQuery] = useState('');
  const { orders } = useOrders(panel === 'search' ? store?.id ?? null : null);
  useEffect(() => { setPanel(''); setQuery(''); }, [path]);
  const sheet = useRef<HTMLDivElement>(null);
  useSwipeDown(sheet, closeMenu, menu);      // « Plus » on a phone: pulled down, it closes
  // on a computer every page is already in the bar: her name goes straight to her account. On a phone it is « Plus ».
  const openAccount = () => { if (window.matchMedia('(min-width: 821px)').matches) { window.location.assign('/compte/'); return; } if (menu) closeMenu(); else setMenu(true); };
  // links written for the current dashboard (« Choisir ce modèle » on a model's demo: /admin/#boutique/modele/<nom>)
  useEffect(() => {
    const m = /^#boutique(?:\/modele\/([a-z]+))?/.exec(window.location.hash);
    if (m) window.location.replace(m[1] ? `/admin/modeles/?choisir=${m[1]}` : '/admin/modeles/');
  }, []);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeMenu(); me.current?.querySelector('button')?.focus(); } };
    const away = (e: MouseEvent) => { if (!me.current?.contains(e.target as Node)) closeMenu(); };
    window.addEventListener('keydown', onKey); document.addEventListener('mousedown', away);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', away); };
  }, [menu, closeMenu]);

  const isOn = (href: string) => (href === '/admin/' ? path === '/admin' || path === '/admin/' : path.startsWith(href.slice(0, -1)));
  const logout = async () => { await signOut(); window.location.assign('/compte/#connexion'); };
  const initial = (account.firstName || account.email || 'J').slice(0, 1).toUpperCase();

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Link className={styles.logo} href="/admin/" aria-label="Jehre, accueil du tableau de bord"><Logo height={38} rainbow /></Link>

        {picks.length > 0 && (store || tishe.on) ? (
          <div className={styles.store}>
            <label className={styles.storeLabel} htmlFor="store-pick">Boutique</label>
            <div className={styles.storePick}>
              <select id="store-pick" value={pickId} onChange={(e) => selectStore(e.target.value)} disabled={picks.length < 2}>
                {picks.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {picks.length > 1 ? <Icon name="down" size={14} /> : null}
            </div>
            <a className={styles.storeLink} href={viewUrl} target="_blank" rel="noopener"><Icon name="eye" size={16} />Voir la boutique</a>
          </div>
        ) : null}

        <nav className={styles.nav} aria-label="Tableau de bord">
          {NAV.map((n) => {
            const on = isOn(n.href);
            return (
              <Fragment key={n.href}>
                {n.group ? <p className={styles.group}>{n.group}</p> : null}
                {n.ext ? <a href={n.href} className={[styles.item, n.more ? styles.more : ''].join(' ')}><Icon name={n.icon} size={18} /><span>{n.label}</span></a>
                  : <Link href={n.href} className={[styles.item, on ? styles.on : '', n.more ? styles.more : ''].join(' ')} aria-current={on ? 'page' : undefined}><Icon name={n.icon} size={18} /><span>{n.label}</span></Link>}
              </Fragment>
            );
          })}
          {/* on a phone, the fourth tab: her online store (her model, and from there the editor) */}
          {tishe.on ? null : (() => { const on = /^\/admin\/(modeles|editeur)(\/|$)/.test(path); return <Link href="/admin/modeles/" className={[styles.item, styles.tabOnly, on ? styles.on : ''].join(' ')} aria-current={on ? 'page' : undefined}><Icon name="store" size={18} /><span>Boutique</span></Link>; })()}
        </nav>

        <div className={styles.me} ref={me}>
          <button type="button" className={styles.meBtn} aria-expanded={menu && !leaving} aria-haspopup="menu" onClick={openAccount}>
            <span className={styles.avatar} aria-hidden="true">{initial}</span>
            <span className={styles.plus}><Icon name="menu" size={20} /><span>Plus</span></span>
            <span className={styles.meName}>{account.firstName || 'Mon compte'}</span>
            <span className={styles.chev}><Icon name="down" size={14} /></span>
          </button>
          {menu ? (<>
            <div className={styles.menuScrim} data-leaving={leaving || undefined} onClick={closeMenu} aria-hidden="true" />
            <div className={styles.menu} ref={sheet} role="menu" data-leaving={leaving || undefined} onClick={(e) => { if ((e.target as Element).closest('a, button')) closeMenu(); }}>
              <span className={styles.menuHandle} aria-hidden="true" />
              {NAV.filter((n) => n.more).map((n) => (n.ext ? <a key={n.href} role="menuitem" href={n.href} className={styles.moreItem}><Icon name={n.icon} size={18} />{n.label}</a> : <Link key={n.href} role="menuitem" href={n.href} className={styles.moreItem}><Icon name={n.icon} size={18} />{n.label}</Link>))}
              <a role="menuitem" href="/compte/"><Icon name="user" size={18} />Mon compte</a>
              <button role="menuitem" type="button" onClick={() => void logout()}><Icon name="logout" size={18} />Se déconnecter</button>
            </div>
          </>) : null}
        </div>
      </aside>

      {/* on a phone: her store on top (and a way to change it), the search, the help, her account */}
      {/^\/admin\/(editeur|modeles\/apercu)\/?$/.test(path) ? null : (
        <header className={styles.topbar}>
          {store || tishe.on ? (
            <label className={styles.topStore}>
              <span className={styles.topMark} aria-hidden="true">{shownName.slice(0, 1).toUpperCase()}</span>
              <span className={styles.topName}>{shownName}</span>
              {picks.length > 1 ? <Icon name="down" size={14} /> : null}
              <select aria-label="Boutique" value={pickId} onChange={(e) => selectStore(e.target.value)} disabled={picks.length < 2}>
                {picks.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ) : <Link className={styles.topStore} href="/admin/" aria-label="Jehre, accueil du tableau de bord"><Logo height={28} rainbow /></Link>}
          <div className={styles.topActs}>
            {store ? <button type="button" className={styles.topBtn} onClick={() => setPanel('search')} aria-label="Rechercher"><Icon name="search" size={20} /></button> : null}
            <button type="button" className={styles.topBtn} onClick={() => setPanel('help')} aria-label="Aide"><Icon name="info" size={20} /></button>
            <a className={styles.topMe} href="/compte/" aria-label="Mon compte">{initial}</a>
          </div>
        </header>
      )}
      {panel === 'search' && store ? (() => {
        const q = query.trim().toLowerCase();
        const prods = q ? productsOf(store).filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q)).slice(0, 6) : [];
        const ords = q ? (orders ?? []).filter((o) => `${o.number} ${o.customer.name ?? ''} ${o.customer.phone ?? ''}`.toLowerCase().includes(q)).slice(0, 6) : [];
        return (
          <Sheet title="Rechercher" onClose={() => setPanel('')}>
            <input className={styles.find} type="search" autoFocus placeholder="Un produit, une cliente, un numéro de commande" aria-label="Rechercher un produit ou une commande" value={query} onChange={(e) => setQuery(e.target.value)} />
            {q && !prods.length && !ords.length ? <p className={styles.findNone}>{orders === null ? 'Recherche…' : 'Rien ne correspond.'}</p> : null}
            {ords.length ? <ul className={styles.findList} aria-label="Commandes">{ords.map((o) => <li key={o.id}><Link href={`/admin/commandes/?c=${o.number}`}><Icon name="receipt" size={18} /><span>N° {o.number} · {o.customer.name || 'Cliente'}</span></Link></li>)}</ul> : null}
            {prods.length ? <ul className={styles.findList} aria-label="Produits">{prods.map((p) => <li key={p.id}><Link href="/admin/produits/"><Icon name="tag" size={18} /><span>{p.name}</span></Link></li>)}</ul> : null}
          </Sheet>
        );
      })() : null}
      {panel === 'help' ? (
        <Sheet title="Aide" sub="Une vraie personne vous répond, en français." onClose={() => setPanel('')}>
          <ul className={styles.findList}>
            <li><a href="mailto:bonjour@jehre.com"><Icon name="mail" size={18} /><span>Écrire à l’équipe Jehre</span></a></li>
            <li><button type="button" onClick={() => { try { window.localStorage.removeItem('jehre-steps-hidden'); } catch { /* nothing kept */ } window.location.assign('/admin/'); }}><Icon name="check" size={18} /><span>Afficher les premiers pas</span></button></li>
            <li><a href="/admin/editeur/?visite=1"><Icon name="edit" size={18} /><span>Revoir la visite de l’éditeur</span></a></li>
            <li><a href="/compte/"><Icon name="user" size={18} /><span>Mon compte</span></a></li>
          </ul>
        </Sheet>
      ) : null}

      {/* each page comes in with a soft fade. The editor and the model viewer cover the screen (position: fixed):
          they are not wrapped in anything that moves */}
      <main className={styles.main}>{gate ? <div className={styles.page}><CardGate need={gate} /></div> : /^\/admin\/(editeur|modeles\/apercu)\/?$/.test(path) ? children : <div key={path} className={styles.page}>{children}</div>}</main>
    </div>
  );
}

/** The title of a page, its one-line summary and its main action. */
export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className={styles.head}>
      <div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
      {action ? <div className={styles.headAction}>{action}</div> : null}
    </header>
  );
}

/** What a page shows when there is nothing yet: an icon, one sentence, one action. */
export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}><Icon name={icon} size={24} /></span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, Logo, type IconName } from '@/components/ui/Icon';
import { signOut } from '@/lib/account';
import { modelBySlug } from '@/lib/models';
import { storeName, storeUrl } from '@/lib/stores';
import { useAdmin } from './AdminContext';
import styles from './AdminShell.module.css';

interface NavItem { href: string; label: string; icon: IconName; group?: string; more?: boolean }
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
  { href: '/admin/clients/', label: 'Clients', icon: 'users', more: true },
  { href: '/admin/editeur/', label: 'Éditeur', icon: 'edit', group: 'Boutique en ligne', more: true },
  { href: '/admin/modeles/', label: 'Modèles', icon: 'template', more: true },
  { href: '/admin/paiements/', label: 'Paiements', icon: 'wallet', group: 'Réglages', more: true },
  { href: '/admin/livraison/', label: 'Livraison', icon: 'truck', more: true },
  { href: '/admin/abonnement/', label: 'Abonnement', icon: 'sparkle', more: true },
  { href: '/admin/domaine/', label: 'Nom de domaine', icon: 'external', more: true },
  { href: '/admin/parametres/', label: 'Paramètres', icon: 'gear', more: true },
];

/** The frame of the dashboard: the store and the menu on the left (a bar at the bottom on a phone), the page on the right. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { account, stores, store, selectStore, model } = useAdmin();
  const NAV = useMemo(() => (modelBySlug(model)?.rdv ? [...RDV, ...SHOP.slice(1).map((n) => ({ ...n, more: true }))] : SHOP), [model]);
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const me = useRef<HTMLDivElement>(null);
  // the menu closes by itself: a choice, Échap, a click outside, another page; it leaves with a short fade
  const closeMenu = useCallback(() => {
    setLeaving((was) => { if (!was) window.setTimeout(() => { setMenu(false); setLeaving(false); }, 160); return true; });
  }, []);
  useEffect(() => { setMenu(false); setLeaving(false); }, [path]);
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

        {stores.length > 0 && store ? (
          <div className={styles.store}>
            <label className={styles.storeLabel} htmlFor="store-pick">Boutique</label>
            <div className={styles.storePick}>
              <select id="store-pick" value={store.id} onChange={(e) => selectStore(e.target.value)} disabled={stores.length < 2}>
                {stores.map((s) => <option key={s.id} value={s.id}>{storeName(s)}</option>)}
              </select>
              {stores.length > 1 ? <Icon name="down" size={14} /> : null}
            </div>
            <a className={styles.storeLink} href={storeUrl(store, model)} target="_blank" rel="noopener"><Icon name="eye" size={16} />Voir la boutique</a>
          </div>
        ) : null}

        <nav className={styles.nav} aria-label="Tableau de bord">
          {NAV.map((n) => {
            const on = isOn(n.href);
            return (
              <Fragment key={n.href}>
                {n.group ? <p className={styles.group}>{n.group}</p> : null}
                <Link href={n.href} className={[styles.item, on ? styles.on : '', n.more ? styles.more : ''].join(' ')} aria-current={on ? 'page' : undefined}><Icon name={n.icon} size={20} /><span>{n.label}</span></Link>
              </Fragment>
            );
          })}
        </nav>

        <div className={styles.me} ref={me}>
          <button type="button" className={styles.meBtn} aria-expanded={menu && !leaving} aria-haspopup="menu" onClick={() => (menu ? closeMenu() : setMenu(true))}>
            <span className={styles.avatar} aria-hidden="true">{initial}</span>
            <span className={styles.plus}><Icon name="menu" size={20} /><span>Plus</span></span>
            <span className={styles.meName}>{account.firstName || 'Mon compte'}</span>
            <Icon name="down" size={14} />
          </button>
          {menu ? (<>
            <div className={styles.menuScrim} data-leaving={leaving || undefined} onClick={closeMenu} aria-hidden="true" />
            <div className={styles.menu} role="menu" data-leaving={leaving || undefined} onClick={(e) => { if ((e.target as Element).closest('a, button')) closeMenu(); }}>
              <span className={styles.menuHandle} aria-hidden="true" />
              {NAV.filter((n) => n.more).map((n) => <Link key={n.href} role="menuitem" href={n.href} className={styles.moreItem}><Icon name={n.icon} size={18} />{n.label}</Link>)}
              <a role="menuitem" href="/compte/"><Icon name="user" size={18} />Mon compte</a>
              <button role="menuitem" type="button" onClick={() => void logout()}><Icon name="logout" size={18} />Se déconnecter</button>
            </div>
          </>) : null}
        </div>
      </aside>

      {/* each page comes in with a soft fade. The editor and the model viewer cover the screen (position: fixed):
          they are not wrapped in anything that moves */}
      <main className={styles.main}>{/^\/admin\/(editeur|modeles\/apercu)\/?$/.test(path) ? children : <div key={path} className={styles.page}>{children}</div>}</main>
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

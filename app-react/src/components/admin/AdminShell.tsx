'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, Logo, type IconName } from '@/components/ui/Icon';
import { signOut } from '@/lib/account';
import { storeName, storeUrl } from '@/lib/stores';
import { useAdmin } from './AdminContext';
import styles from './AdminShell.module.css';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin/', label: 'Accueil', icon: 'home' },
  { href: '/admin/commandes/', label: 'Commandes', icon: 'receipt' },
  { href: '/admin/produits/', label: 'Produits', icon: 'tag' },
];

/** The frame of the dashboard: the store and the menu on the left (a bar at the bottom on a phone), the page on the right. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { account, stores, store, selectStore } = useAdmin();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [path]);

  const logout = async () => { await signOut(); window.location.assign('/compte/#connexion'); };
  const initial = (account.firstName || account.email || 'J').slice(0, 1).toUpperCase();

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Link className={styles.logo} href="/admin/" aria-label="Jehre, accueil du tableau de bord"><Logo height={34} /></Link>

        {stores.length > 0 && store ? (
          <div className={styles.store}>
            <label className={styles.storeLabel} htmlFor="store-pick">Boutique</label>
            <div className={styles.storePick}>
              <select id="store-pick" value={store.id} onChange={(e) => selectStore(e.target.value)} disabled={stores.length < 2}>
                {stores.map((s) => <option key={s.id} value={s.id}>{storeName(s)}</option>)}
              </select>
              {stores.length > 1 ? <Icon name="down" size={14} /> : null}
            </div>
            <a className={styles.storeLink} href={storeUrl(store)} target="_blank" rel="noopener"><Icon name="eye" size={16} />Voir la boutique</a>
          </div>
        ) : null}

        <nav className={styles.nav} aria-label="Tableau de bord">
          {NAV.map((n) => {
            const on = n.href === '/admin/' ? path === '/admin' || path === '/admin/' : path.startsWith(n.href.slice(0, -1));
            return <Link key={n.href} href={n.href} className={on ? `${styles.item} ${styles.on}` : styles.item} aria-current={on ? 'page' : undefined}><Icon name={n.icon} size={20} /><span>{n.label}</span></Link>;
          })}
        </nav>

        <div className={styles.me}>
          <button type="button" className={styles.meBtn} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)}>
            <span className={styles.avatar} aria-hidden="true">{initial}</span>
            <span className={styles.meName}>{account.firstName || 'Mon compte'}</span>
            <Icon name="down" size={14} />
          </button>
          {menu ? (
            <div className={styles.menu} role="menu">
              <a role="menuitem" href="/compte/"><Icon name="user" size={18} />Mon compte</a>
              <button role="menuitem" type="button" onClick={() => void logout()}><Icon name="logout" size={18} />Se déconnecter</button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
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

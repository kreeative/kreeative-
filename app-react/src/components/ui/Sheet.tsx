'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Sheet.module.css';

interface SheetProps {
  title: string;
  sub?: string;
  /** read by screen readers when it differs from the title */
  label?: string;
  onClose: () => void;
  /** offers « Ouvrir en grand »: the panel takes the whole page, and comes back to the side */
  expandable?: boolean;
  children: ReactNode;
}

/** A panel over the page. On a computer it slides in from the right (and can open full page, like a Notion
 *  page); on a phone it is a bottom sheet: full width, rounded top, a handle, the page dimmed behind.
 *  Échap or a tap outside closes it. */
export function Sheet({ title, sub, label, onClose, expandable, children }: SheetProps) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';            // the page behind does not scroll
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [onClose]);

  return (
    <div className={styles.scrim} data-full={full || undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={styles.sheet} role="dialog" aria-modal="true" aria-label={label ?? title}>
        <span className={styles.handle} aria-hidden="true" />
        <div className={styles.inner}>
          <header className={styles.head}>
            <div className={styles.titles}><h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div>
            <div className={styles.tools}>
              {expandable ? (
                <button type="button" className={`${styles.tool} ${styles.expand}`} aria-pressed={full} aria-label={full ? 'Revenir au panneau' : 'Ouvrir en grand'} title={full ? 'Revenir au panneau' : 'Ouvrir en grand'} onClick={() => setFull((v) => !v)}>
                  <Icon name={full ? 'shrink' : 'expand'} size={18} />
                </button>
              ) : null}
              <button type="button" className={styles.tool} aria-label="Fermer" title="Fermer" onClick={onClose}><Icon name="close" size={18} /></button>
            </div>
          </header>
          {children}
        </div>
      </aside>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useSwipeDown } from './useSwipeDown';
import styles from './Sheet.module.css';

const PHONE = '(max-width: 820px)';

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
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const done = useRef(onClose);
  done.current = onClose;
  useEffect(() => { setMounted(true); }, []);
  // closing plays the way out first (a short fade and slide), then tells the page
  const leave = useCallback(() => {
    setLeaving((was) => { if (!was) window.setTimeout(() => done.current(), 170); return true; });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') leave(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';            // the page behind does not scroll
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [leave]);

  const panel = useRef<HTMLElement>(null);
  useSwipeDown(panel, leave, mounted && !full, PHONE);      // a bottom sheet on a phone: pulled down, it closes

  if (!mounted) return null;
  return createPortal(
    <div className={styles.scrim} data-full={full || undefined} data-leaving={leaving || undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) leave(); }}>
      <aside className={styles.sheet} ref={panel} role="dialog" aria-modal="true" aria-label={label ?? title}>
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
              <button type="button" className={styles.tool} aria-label="Fermer" title="Fermer" onClick={leave}><Icon name="close" size={18} /></button>
            </div>
          </header>
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

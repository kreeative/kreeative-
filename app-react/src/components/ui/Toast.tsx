'use client';

import { useEffect, type ReactNode } from 'react';
import styles from './Toast.module.css';

/** A short word at the bottom of the screen after an action: a white card, grey text, no coloured edge. It leaves
 *  by itself and never moves the page. */
export function Toast({ children, action, onDone, ms = 6000 }: { children: ReactNode; action?: ReactNode; onDone: () => void; ms?: number }) {
  useEffect(() => { const t = setTimeout(onDone, ms); return () => clearTimeout(t); }, [onDone, ms]);
  return <div className={styles.toast} role="status"><span>{children}</span>{action}</div>;
}

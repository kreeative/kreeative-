'use client';

import { useEffect, useState } from 'react';
import { ICONS } from './icons';
import styles from './CloudLoader.module.css';

/** Jehre's cloud filling with the logo's colours from the bottom up, on a light ground, while something loads. It only
 *  shows after a short moment, so a load that is almost instant never makes the screen blink. With « reduce
 *  motion » the cloud stays still, filled halfway. */
export function CloudLoader({ label = 'Chargement…', full = false, delay = 250 }: { label?: string; full?: boolean; delay?: number }) {
  const [shown, setShown] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const t = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  const icon = ICONS.cloud;
  const grad = '<defs><linearGradient id="jehre-fill" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="#E8467C"/><stop offset=".17" stop-color="#F08A3C"/><stop offset=".34" stop-color="#F0C414"/><stop offset=".5" stop-color="#22C97E"/><stop offset=".67" stop-color="#1E9BE0"/><stop offset=".84" stop-color="#6A4CFF"/><stop offset="1" stop-color="#C13CE0"/></linearGradient></defs>';
  return (
    <div className={styles.box} data-full={full ? '' : undefined} role="status" aria-live="polite" aria-label={label}>
      {shown ? (
        <>
          <div className={styles.cloud} aria-hidden="true">
            <svg className={styles.base} viewBox={icon.viewBox} fill="currentColor" dangerouslySetInnerHTML={{ __html: icon.body }} />
            <svg className={styles.fill} viewBox={icon.viewBox} fill="url(#jehre-fill)" dangerouslySetInnerHTML={{ __html: grad + icon.body }} />
          </div>
          {label ? <p className={styles.label}>{label}</p> : null}
        </>
      ) : null}
    </div>
  );
}

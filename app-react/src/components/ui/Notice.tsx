import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Notice.module.css';

type Tone = 'info' | 'error' | 'ok' | 'warn';
const ICON: Record<Tone, IconName> = { info: 'info', error: 'alert', ok: 'check', warn: 'alert' };

/** A message inside a screen: a soft tinted block, an icon, short words. Never a coloured edge. */
export function Notice({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={[styles.notice, styles[tone]].join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ICON[tone]} size={18} className={styles.icon} />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.text}>{children}</div> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}

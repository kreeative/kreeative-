import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'quiet' | 'rainbow';

interface Common { variant?: Variant; block?: boolean; icon?: IconName; iconEnd?: IconName; busy?: boolean; children: ReactNode }

const cls = (variant: Variant, block?: boolean, extra?: string) =>
  [styles.btn, styles[variant], block ? styles.block : '', extra ?? ''].filter(Boolean).join(' ');

/** A button. « primary » is black, « rainbow » is white with the logo's rainbow around it (one per screen at most). */
export function Button({ variant = 'primary', block, icon, iconEnd, busy, children, className, disabled, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={cls(variant, block, className)} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
      {iconEnd && !busy ? <Icon name={iconEnd} size={18} /> : null}
    </button>
  );
}

/** The same look on a link. */
export function ButtonLink({ variant = 'primary', block, icon, iconEnd, children, className, ...rest }: Omit<Common, 'busy'> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={cls(variant, block, className)}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </a>
  );
}

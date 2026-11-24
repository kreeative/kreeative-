'use client';

import { useId, useState } from 'react';
import { PASSWORD_CHECKS } from '@/lib/auth';
import { Icon } from './Icon';
import styles from './PasswordField.module.css';

/** A new password: shown or hidden with the eye, each rule ticked as she types, a rainbow bar that fills up.
 *  The form refuses it until every rule is met. */
export function PasswordField({ label = 'Mot de passe', value, onChange, error, autoFocus }: { label?: string; value: string; onChange: (v: string) => void; error?: string; autoFocus?: boolean }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const met = PASSWORD_CHECKS.map((c) => c.test(value));
  const n = met.filter(Boolean).length;
  const words = n === PASSWORD_CHECKS.length ? 'Solide' : n >= 3 ? 'Presque' : value ? 'Trop faible' : '';
  return (
    <div className={styles.box}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={styles.input} data-error={error ? '' : undefined}>
        <input id={id} name="new-password" type={shown ? 'text' : 'password'} autoComplete="new-password" maxLength={72} value={value} autoFocus={autoFocus}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-rules`} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoCapitalize="none" />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={shown}>
          <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      <div className={styles.meter} aria-hidden="true"><i style={{ width: `${(n / PASSWORD_CHECKS.length) * 100}%` }} data-full={n === PASSWORD_CHECKS.length ? '' : undefined} /></div>
      <div className={styles.foot}>
        <ul id={`${id}-rules`} className={styles.rules} aria-label="Votre mot de passe doit avoir">
          {PASSWORD_CHECKS.map((c, i) => <li key={c.id} data-ok={met[i] ? '' : undefined}><span aria-hidden="true">{met[i] ? <Icon name="check" size={11} /> : null}</span>{c.label}<span className={styles.sr}>{met[i] ? ' : fait' : ' : à faire'}</span></li>)}
        </ul>
        {words ? <b className={styles.words} data-full={n === PASSWORD_CHECKS.length ? '' : undefined} aria-live="polite">{words}</b> : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}

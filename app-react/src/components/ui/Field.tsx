'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Field.module.css';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** shown after the label, in grey: « (facultatif) » */
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
}

/** A labelled text field with its hint and its error, tied together for screen readers. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, optional, hint, error, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [error ? `${fid}-err` : '', hint ? `${fid}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      <label className={styles.label} htmlFor={fid}>
        {label}{optional ? <span className={styles.optional}> (facultatif)</span> : null}
      </label>
      <input ref={ref} id={fid} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {error ? <p className={styles.error} id={`${fid}-err`} role="alert">{error}</p> : null}
      {hint ? <p className={styles.hint} id={`${fid}-hint`}>{hint}</p> : null}
    </div>
  );
});

interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { children: ReactNode; error?: string }

/** A checkbox with its sentence. */
export function Check({ children, error, id, ...rest }: CheckProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={styles.check}>
      <label className={styles.checkRow} htmlFor={fid}>
        <input type="checkbox" id={fid} className={styles.box} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-err` : undefined} {...rest} />
        <span>{children}</span>
      </label>
      {error ? <p className={styles.error} id={`${fid}-err`} role="alert">{error}</p> : null}
    </div>
  );
}

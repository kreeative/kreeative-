'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import styles from './Field.module.css';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** shown after the label, in grey: « (facultatif) » */
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  /** a control placed before the field on the same line (a country code) */
  before?: ReactNode;
}

/** A labelled text field with its hint and its error, tied together for screen readers. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, optional, hint, error, before, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [error ? `${fid}-err` : '', hint ? `${fid}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      <label className={styles.label} htmlFor={fid}>
        {label}{optional ? <span className={styles.optional}> (facultatif)</span> : null}
      </label>
      <div className={styles.line}>
        {before}
        <input ref={ref} id={fid} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      </div>
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

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label: string; options: string[] }

/** A labelled list of choices, drawn like a field (never the browser's raw look). */
export function Select({ label, options, id, className, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      <label className={styles.label} htmlFor={fid}>{label}</label>
      <select id={fid} className={[styles.input, styles.select].join(' ')} {...rest}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label: string; optional?: boolean }

/** A labelled field of several lines. */
export function TextArea({ label, optional, id, className, ...rest }: AreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      <label className={styles.label} htmlFor={fid}>{label}{optional ? <span className={styles.optional}> (facultatif)</span> : null}</label>
      <textarea id={fid} className={[styles.input, styles.area].join(' ')} {...rest} />
    </div>
  );
}

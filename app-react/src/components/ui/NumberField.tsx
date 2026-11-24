'use client';

import { useEffect, useId, useState } from 'react';
import styles from './NumberField.module.css';

interface Props {
  label: string;
  /** the value she set; undefined = the model's own (shown as `placeholder`, or as `shown` when given) */
  value: number | undefined;
  /** what the model shows when she has set nothing (the arrows start from it) */
  shown?: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  onChange: (v: number | undefined) => void;
}

/** A number in px: she types freely (the box never jumps back while she types), ▲▼ add or take away one step,
 *  the unit sits inside the box. A value out of bounds is brought back when she leaves the box. */
export function NumberField({ label, value, shown, min, max, step = 1, unit = 'px', placeholder, onChange }: Props) {
  const id = useId();
  const base = value ?? shown;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [value]);
  const text = draft ?? (value !== undefined ? String(value) : shown !== undefined ? String(shown) : '');
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  function type(v: string) {
    const clean = v.replace(/[^\d]/g, '').slice(0, 4);
    setDraft(clean);
    if (clean === '') return;                         // an empty box waits: the model's value comes back on leaving
    const n = Number(clean);
    if (n >= min && n <= max) onChange(n);            // in bounds: the page follows at once
  }
  function leave() {
    if (draft === null) return;
    if (draft === '') onChange(undefined);
    else onChange(clamp(Number(draft)));
    setDraft(null);
  }
  const bump = (d: number) => { setDraft(null); onChange(clamp((base ?? min) + d * step)); };
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={styles.box} data-num-box="">
        <input id={id} className={styles.input} inputMode="numeric" value={text} placeholder={placeholder} onChange={(e) => type(e.target.value)} onBlur={leave}
          onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); } else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); } else if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        {unit ? <span className={styles.unit} aria-hidden="true">{unit}</span> : null}
        <span className={styles.steps}>
          <button type="button" tabIndex={-1} aria-label={`${label} : plus`} disabled={base !== undefined && base >= max} onClick={() => bump(1)}>
            <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" tabIndex={-1} aria-label={`${label} : moins`} disabled={base !== undefined && base <= min} onClick={() => bump(-1)}>
            <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </span>
      </div>
    </div>
  );
}

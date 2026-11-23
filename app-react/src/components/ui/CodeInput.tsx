'use client';

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './CodeInput.module.css';

interface CodeInputProps { value: string; onChange: (code: string) => void; onComplete?: (code: string) => void; length?: number; invalid?: boolean; disabled?: boolean; label: string;
  /** change it to empty the boxes' focus back to the first one (a refused code, a new code sent) */
  focusKey?: number }

/** The one-time code, one box per digit. Typing moves on, Retour goes back, a pasted code fills every box,
 *  and a phone offers the code it just received (autocomplete « one-time-code »). */
export function CodeInput({ value, onChange, onComplete, length = 6, invalid, disabled, label, focusKey = 0 }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (!disabled) refs.current[0]?.focus(); }, [focusKey, disabled]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const set = (next: string, focusAt?: number) => {
    const code = next.replace(/\D/g, '').slice(0, length);
    onChange(code);
    if (focusAt != null) refs.current[Math.max(0, Math.min(length - 1, focusAt))]?.focus();
    if (code.length === length) onComplete?.(code);
  };

  const onInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) { set(value.slice(0, i) + value.slice(i + 1), i); return; }
    // one digit typed in a box, or a whole code dropped by the keyboard's suggestion
    set(typed.length > 1 ? typed : value.slice(0, i) + typed + value.slice(i + 1), i + typed.length);
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); set(value.slice(0, i - 1) + value.slice(i), i - 1); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && i < length - 1) { e.preventDefault(); refs.current[i + 1]?.focus(); }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    set(text, text.replace(/\D/g, '').length);
  };

  return (
    <div className={styles.code} role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={styles.box}
          value={d}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? length : 1}
          aria-label={`Chiffre ${i + 1} sur ${length}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

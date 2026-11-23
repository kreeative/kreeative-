'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import styles from './Menu.module.css';

export interface MenuOption { value: string; label: string }

/** A drop-down list with the house look (never the browser's raw one): a quiet button showing the choice, and
 *  the choices in a small card under it. Escape, a click outside or a choice closes it; the arrows move in it. */
export function Menu({ label, options, value, onChange }: { label: string; options: MenuOption[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    box.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <div className={styles.menu} ref={box}>
      <button type="button" className={styles.button} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={`${label} : ${current?.label ?? ''}`} onClick={() => setOpen((v) => !v)}>
        <span>{current?.label}</span><Icon name="down" size={14} />
      </button>
      {open ? (
        <div className={styles.list} role="listbox" id={id} aria-label={label}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={styles.option} onClick={() => { setOpen(false); if (o.value !== value) onChange(o.value); }}>
              <span>{o.label}</span>{o.value === value ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

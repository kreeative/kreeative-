'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { FONT_STYLES, fontById, fontsUrl, SITE_FONTS } from '@/lib/fonts';
import styles from './FontPicker.module.css';

/** The fonts of the list, loaded once in the dashboard so each name is written in its own font. */
export function useSiteFonts() {
  useEffect(() => {
    if (document.getElementById('jehre-site-fonts')) return;
    const l = document.createElement('link');
    l.id = 'jehre-site-fonts'; l.rel = 'stylesheet'; l.href = fontsUrl(SITE_FONTS);
    document.head.appendChild(l);
  }, []);
}

const familyOf = (name: string, style: string) => `'${name}', ${style === 'elegant' ? 'serif' : 'sans-serif'}`;

/** One field: the font chosen, written in itself. It opens a menu that drops down: « Celle du modèle », then the
 *  fonts by style, each name in its own font. Échap or a click outside closes it. `textOnly`: only the fonts that
 *  read well in paragraphs. */
export function FontPicker({ label, value, textOnly = false, onChange }: { label: string; value: string | undefined; textOnly?: boolean; onChange: (id: string | undefined) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const now = fontById(value);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', away); window.addEventListener('keydown', key);
    box.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key); };
  }, [open]);
  const pick = (v: string | undefined) => { onChange(v); setOpen(false); };
  return (
    <div className={styles.field} ref={box}>
      <span className={styles.label} id={`${id}-l`}>{label}</span>
      <button type="button" className={styles.trigger} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} onClick={() => setOpen((o) => !o)}>
        <span id={`${id}-v`} style={now ? { fontFamily: familyOf(now.name, now.style) } : undefined}>{now ? now.name : 'Celle du modèle'}</span>
        <Icon name="down" size={14} />
      </button>
      {open ? (
        <div className={styles.menu} role="listbox" aria-label={label}>
          <button type="button" role="option" aria-selected={!now} className={styles.model} onClick={() => pick(undefined)}>Celle du modèle</button>
          {FONT_STYLES.map((k) => {
            const list = SITE_FONTS.filter((f) => f.style === k.id && (!textOnly || f.text));
            if (!list.length) return null;
            return (
              <div key={k.id} role="group" aria-label={k.label}>
                <p className={styles.group}>{k.label}</p>
                {list.map((f) => <button key={f.id} type="button" role="option" aria-selected={value === f.id} style={{ fontFamily: familyOf(f.name, f.style) }} onClick={() => pick(f.id)}>{f.name}</button>)}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

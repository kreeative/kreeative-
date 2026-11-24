'use client';

import { createContext, useContext, useEffect, useId, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Icon } from './Icon';
import styles from './ColorField.module.css';

/* Choosing a colour, as in Canva: the colours of her model first, a few plain base colours, the colours she chose
   lately, and a « + » that opens a picker of any colour (a field, a band of hues, before/after, the #code). */

const HEX = /^#[0-9a-fA-F]{6}$/;
const RECENT_KEY = 'jeere-recent-colors';
const RECENT_MAX = 8;
/** plain colours, always offered, after the model's own */
export const BASE_COLORS: [string, string][] = [['#FFFFFF', 'Blanc'], ['#111111', 'Noir'], ['#E53935', 'Rouge'], ['#1E6FE0', 'Bleu'], ['#1F9D62', 'Vert'], ['#E8B931', 'Or']];

/** The colours of the site being edited (its model's, her brand's): given once by the page, read by every field. */
const Palette = createContext<[string, string][]>([]);
export const ColorPalette = Palette.Provider;

const up = (v: string) => v.toUpperCase();
function readRecent(): string[] {
  try { const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && HEX.test(x)).slice(0, RECENT_MAX) : []; } catch { return []; }
}
/** a colour she chose herself goes first in « Couleurs récentes » (on this device), the oldest leaves after 8 */
export function rememberColor(hex: string): string[] {
  const list = [up(hex), ...readRecent().filter((x) => up(x) !== up(hex))].slice(0, RECENT_MAX);
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list)); window.dispatchEvent(new Event('jeere-recent-colors')); } catch { /* kept for this visit only */ }
  return list;
}
function useRecent(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setList(readRecent());
    read();
    window.addEventListener('jeere-recent-colors', read);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener('jeere-recent-colors', read); window.removeEventListener('storage', read); };
  }, []);
  return list;
}

/* ---- colour arithmetic: hue / saturation / value <-> #RRGGBB ---- */
type HSV = { h: number; s: number; v: number };
function toHsv(hex: string): HSV {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function toHex({ h, s, v }: HSV): string {
  const f = (k: number) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** two colours the eye can hardly tell apart (a model's ink and the base black): only one is offered */
function near(a: string, b: string): boolean {
  if (!HEX.test(a) || !HEX.test(b)) return false;
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return Math.abs((x >> 16) - (y >> 16)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255)) < 20;
}
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** The picker of any colour: drag in the field (light / strength), along the band (hue), or type its code. */
export function ColorPicker({ start, label, onApply, onCancel }: { start: string; label: string; onApply: (hex: string) => void; onCancel: () => void }) {
  const [hsv, setHsv] = useState<HSV>(() => toHsv(HEX.test(start) ? start : '#E53935'));
  const hex = toHex(hsv);
  const [text, setText] = useState(hex);
  useEffect(() => { setText(hex); }, [hex]);
  const drag = (move: (x: number, y: number) => void) => (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    e.preventDefault();
    const at = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); move(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)); };
    at(e);
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => at(ev);
    const onUp = () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
  };
  const keys = (axis: 'sv' | 'h') => (e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02, d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const m = d[e.key]; if (!m) { if (e.key === 'Enter') onApply(hex); return; }
    e.preventDefault();
    setHsv((c) => axis === 'h' ? { ...c, h: (c.h + (m[0] || m[1]) * step * 360 + 360) % 360 } : { ...c, s: clamp(c.s + m[0] * step), v: clamp(c.v + m[1] * step) });
  };
  const before = HEX.test(start) ? up(start) : '';
  return (
    <div className={styles.picker} role="group" aria-label={`Choisir la couleur : ${label}`}>
      <div className={styles.field} style={{ background: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={drag((x, y) => setHsv((c) => ({ ...c, s: x, v: 1 - y })))}>
        <span className={styles.fieldThumb} role="slider" tabIndex={0} aria-label="Clarté et intensité" aria-valuetext={hex} aria-valuenow={Math.round(hsv.s * 100)} aria-valuemin={0} aria-valuemax={100}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} onKeyDown={keys('sv')} />
      </div>
      <div className={styles.band} onPointerDown={drag((x) => setHsv((c) => ({ ...c, h: Math.min(359.9, x * 360) })))}>
        <span className={styles.bandThumb} role="slider" tabIndex={0} aria-label="Teinte" aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360}
          style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} onKeyDown={keys('h')} />
      </div>
      <div className={styles.row}>
        <div className={styles.compare} aria-label="Avant, après">
          <span title="Avant" style={before ? { background: before } : undefined} data-none={before ? undefined : ''} />
          <span title="Après" style={{ background: hex }} />
        </div>
        <label className={styles.code}>
          <span aria-hidden="true">#</span>
          <input aria-label="Code couleur" value={text.replace('#', '')} maxLength={6} spellCheck={false} autoCapitalize="none"
            onChange={(e) => { const v = '#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6); setText(v); if (HEX.test(v)) setHsv(toHsv(v)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && HEX.test(text)) onApply(up(text)); }} />
        </label>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>Annuler</button>
        <button type="button" className={styles.apply} onClick={() => onApply(hex)}><Icon name="check" size={14} />Appliquer</button>
      </div>
    </div>
  );
}

function Swatch({ v, name, on, pick }: { v: string; name: string; on: boolean; pick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={pick} aria-label={name} title={name}><i style={v ? { background: v } : undefined} data-none={v ? undefined : ''} /></button>;
}

/** A colour of her site, as one calm line: its name, the colour in use, and a chevron. Touched, it unfolds (and the
 *  other colour fields of the page fold): the model's colours, a few base colours, « Personnaliser » for any colour,
 *  and her recent colours, once. A colour she makes with the picker is kept in her recent colours. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string | undefined) => void }) {
  const model = useContext(Palette), recent = useRecent();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const me = useId();
  // one colour field open at a time on the page: opening one folds the others
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent<string>).detail !== me) { setOpen(false); setPicking(false); } };
    window.addEventListener('jeere-color-open', other);
    return () => window.removeEventListener('jeere-color-open', other);
  }, [me]);
  const toggle = () => { const next = !open; setOpen(next); setPicking(false); if (next) window.dispatchEvent(new CustomEvent('jeere-color-open', { detail: me })); };
  const cur = up(value || '');
  const seen = new Set<string>();
  const own = model.filter(([v]) => { const k = up(v); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  const base = BASE_COLORS.filter(([v]) => !own.some(([o]) => near(o, v)));
  const quick = new Set([...own, ...base].map(([v]) => up(v)));
  const recents = recent.filter((v) => !quick.has(v)).slice(0, 6);
  const name = !cur ? 'Couleur du modèle' : [...own, ...base].find(([v]) => up(v) === cur)?.[1] ?? cur;
  const pick = (v: string) => onChange(v || undefined);
  return (
    <div className={styles.control} data-open={open ? '' : undefined}>
      <button type="button" className={styles.row} aria-expanded={open} onClick={toggle} aria-label={`${label} : ${name}`}>
        <i className={styles.dot} style={cur ? { background: cur } : undefined} data-none={cur ? undefined : ''} aria-hidden="true" />
        <span className={styles.what}><span className={styles.caption}>{label}</span><b>{name}</b></span>
        <Icon name="down" size={16} />
      </button>
      {open ? (
        <div className={styles.panel}>
          <div className={styles.swatches} role="group" aria-label={`${label} : couleurs du modèle`}>
            <Swatch v="" name="Couleur du modèle" on={!cur} pick={() => pick('')} />
            {own.map(([v, n]) => <Swatch key={v} v={v} name={n} on={cur === up(v)} pick={() => pick(up(v))} />)}
          </div>
          <div className={styles.swatches} role="group" aria-label={`${label} : couleurs de base`}>
            {base.map(([v, n]) => <Swatch key={v} v={v} name={n} on={cur === up(v)} pick={() => pick(v)} />)}
            <button type="button" className={styles.custom} aria-expanded={picking} onClick={() => setPicking((o) => !o)}><Icon name={picking ? 'close' : 'plus'} size={14} />Personnaliser</button>
          </div>
          {recents.length ? (
            <div className={styles.recent}>
              <span className={styles.sub}>Récentes</span>
              <div className={styles.swatches} role="group" aria-label={`${label} : couleurs récentes`}>
                {recents.map((v) => <Swatch key={v} v={v} name={v} on={cur === v} pick={() => pick(v)} />)}
              </div>
            </div>
          ) : null}
          {picking ? <ColorPicker start={cur} label={label} onCancel={() => setPicking(false)} onApply={(hex) => { rememberColor(hex); pick(hex); setPicking(false); }} /> : null}
        </div>
      ) : null}
    </div>
  );
}

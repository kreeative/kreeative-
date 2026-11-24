'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import styles from './SignaturePad.module.css';

/** A signature drawn with a finger or the mouse. `onChange` gives the PNG (data URL), or '' when it is empty. */
export function SignaturePad({ label, error, onChange }: { label: string; error?: string; onChange: (png: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  // her strokes, in page pixels: drawn again when the screen changes size (a phone turned, the keyboard), never lost
  const strokes = useRef<{ x: number; y: number }[][]>([]);
  const [empty, setEmpty] = useState(true);

  // a sharp line on every screen: the canvas is drawn at the screen's density
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const size = () => {
      const r = c.getBoundingClientRect(), k = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * k)); c.height = Math.max(1, Math.round(r.height * k));
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4; ctx.strokeStyle = '#111111'; ctx.fillStyle = '#111111';
      strokes.current.forEach((st) => {
        if (!st.length) return;
        ctx.beginPath(); ctx.arc(st[0]!.x, st[0]!.y, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(st[0]!.x, st[0]!.y); st.slice(1).forEach((q) => ctx.lineTo(q.x, q.y)); ctx.stroke();
      });
    };
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e: PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true; last.current = at(e); strokes.current.push([last.current]);
    const ctx = e.currentTarget.getContext('2d'); const p = last.current;
    if (ctx) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#111111'; ctx.fill(); }
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d'), p = at(e);
    if (ctx) { ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    last.current = p; strokes.current[strokes.current.length - 1]?.push(p);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    setEmpty(false);
    onChange(canvas.current?.toDataURL('image/png') ?? '');
  }
  function clear() {
    const c = canvas.current, ctx = c?.getContext('2d');
    if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
    strokes.current = [];
    setEmpty(true); onChange('');
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}><span className={styles.label}>{label}</span>{!empty ? <button type="button" className={styles.clear} onClick={clear}>Effacer</button> : null}</div>
      <div className={styles.pad} data-error={error ? '' : undefined}>
        <canvas ref={canvas} className={styles.canvas} aria-label={label} role="img" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {empty ? <span className={styles.hint} aria-hidden="true">Signez ici avec le doigt ou la souris</span> : null}
        <i className={styles.line} aria-hidden="true" />
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}

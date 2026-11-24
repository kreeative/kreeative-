'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './ImageCropper.module.css';

/* The cropping window, for a logo and for any photo of the editor. The picture sits under a frame with a grid of
   thirds; what is outside the frame is darkened. She moves the picture with a finger or the mouse, zooms with the
   slider, the − / + buttons, two fingers or the wheel, and can start again with « Réinitialiser ». « Appliquer »
   draws exactly what is in the frame into a new image (PNG when the picture may be transparent, like a logo). */

export interface CropShape { label: string; ratio: number | null }
export const PHOTO_SHAPES: CropShape[] = [{ label: 'Original', ratio: null }, { label: 'Carré', ratio: 1 }, { label: 'Portrait', ratio: 4 / 5 }, { label: 'Paysage', ratio: 16 / 9 }];
export const LOGO_SHAPES: CropShape[] = [{ label: 'Original', ratio: null }, { label: 'Carré', ratio: 1 }, { label: 'Large', ratio: 3 }];

const MAX_ZOOM = 5;
const OUT_MAX = 2048;
const PAD = 28;

interface Props {
  src: string;
  title?: string;
  shapes?: CropShape[];
  /** a logo may be smaller than its frame (transparent around it); a photo always fills its frame */
  transparent?: boolean;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onApply: (file: File) => void;
}

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function ImageCropper({ src, title = 'Recadrer', shapes = PHOTO_SHAPES, transparent = false, busy = false, error = '', onCancel, onApply }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  // the window lives on the page itself (above the bars), once the page is in the browser
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shape, setShape] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState<Pt>({ x: 0, y: 0 });
  const [drawErr, setDrawErr] = useState('');
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ d: number; z: number; mid: Pt; off: Pt } | null>(null);

  // the picture, readable by the canvas (her photos and the models' allow it)
  useEffect(() => {
    let live = true;
    const i = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) i.crossOrigin = 'anonymous';
    i.onload = () => { if (live) setImg(i); };
    i.onerror = () => { if (live) setFailed(true); };
    i.src = src;
    return () => { live = false; };
  }, [src]);

  // the room the picture has
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  // keys: Échap closes
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', k);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = was; };
  }, [busy, onCancel]);

  const nw = img?.naturalWidth ?? 1, nh = img?.naturalHeight ?? 1;
  const ratio = shapes[shape]?.ratio ?? nw / nh;
  // the frame: as large as the room allows, in the chosen shape
  const roomW = Math.max(40, box.w - PAD * 2), roomH = Math.max(40, box.h - PAD * 2);
  const fw = Math.min(roomW, roomH * ratio), fh = fw / ratio;
  const cover = Math.max(fw / nw, fh / nh), contain = Math.min(fw / nw, fh / nh);
  const minZoom = transparent ? contain / cover : 1;
  const scale = cover * zoom, iw = nw * scale, ih = nh * scale;

  // the picture never leaves an empty edge in the frame (a logo smaller than the frame stays inside it)
  const clamp = useCallback((p: Pt, z: number): Pt => {
    const w = nw * cover * z, h = nh * cover * z;
    const mx = Math.abs(w - fw) / 2, my = Math.abs(h - fh) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  }, [nw, nh, cover, fw, fh]);

  const setZoomAt = useCallback((z: number, base?: { z: number; off: Pt }) => {
    const nz = Math.max(minZoom, Math.min(MAX_ZOOM, z));
    const from = base ?? { z: zoom, off };
    // zoom around the centre of the frame: the point in the middle stays in the middle
    const k = nz / from.z;
    setZoom(nz);
    setOff(clamp({ x: from.off.x * k, y: from.off.y * k }, nz));
  }, [minZoom, zoom, off, clamp]);

  const reset = () => { setZoom(1); setOff({ x: 0, y: 0 }); };
  // a new shape or a new picture starts centred
  useEffect(() => { setZoom(1); setOff({ x: 0, y: 0 }); }, [shape, img]);
  // the frame changed size (window turned): keep the picture inside it
  useEffect(() => { setOff((o) => clamp(o, zoom)); }, [fw, fh]); // eslint-disable-line react-hooks/exhaustive-deps

  function down(e: PointerEvent<HTMLDivElement>) {
    if (!img) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  }
  function startGesture() {
    const ps = [...pointers.current.values()];
    if (ps.length === 0) { gesture.current = null; return; }
    const mid = ps.length > 1 ? { x: (ps[0]!.x + ps[1]!.x) / 2, y: (ps[0]!.y + ps[1]!.y) / 2 } : ps[0]!;
    gesture.current = { d: ps.length > 1 ? dist(ps[0]!, ps[1]!) : 0, z: zoom, mid, off };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()], g = gesture.current;
    const mid = ps.length > 1 ? { x: (ps[0]!.x + ps[1]!.x) / 2, y: (ps[0]!.y + ps[1]!.y) / 2 } : ps[0]!;
    let z = g.z;
    if (ps.length > 1 && g.d > 0) z = Math.max(minZoom, Math.min(MAX_ZOOM, g.z * (dist(ps[0]!, ps[1]!) / g.d)));
    const k = z / g.z;
    setZoom(z);
    setOff(clamp({ x: g.off.x * k + (mid.x - g.mid.x), y: g.off.y * k + (mid.y - g.mid.y) }, z));
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    startGesture();
  }
  function wheel(e: WheelEvent<HTMLDivElement>) {
    if (!img) return;
    setZoomAt(zoom * Math.exp(-e.deltaY * 0.0015));
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 20 : 6;
    const d: Record<string, Pt> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
    if (d[e.key]) { e.preventDefault(); setOff((o) => clamp({ x: o.x + d[e.key]!.x, y: o.y + d[e.key]!.y }, zoom)); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoomAt(zoom * 1.15); }
    else if (e.key === '-') { e.preventDefault(); setZoomAt(zoom / 1.15); }
  }

  function apply() {
    if (!img) return;
    setDrawErr('');
    // as sharp as the picture itself, never larger than 2048 px on its long side
    const k = Math.min(1 / scale, OUT_MAX / Math.max(fw, fh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(fw * k)); c.height = Math.max(1, Math.round(fh * k));
    const ctx = c.getContext('2d');
    if (!ctx) { setDrawErr('Le recadrage n’a pas pu être fait. Réessayez.'); return; }
    ctx.imageSmoothingQuality = 'high';
    if (!transparent) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, (fw / 2 + off.x - iw / 2) * k, (fh / 2 + off.y - ih / 2) * k, iw * k, ih * k);
    const type = transparent ? 'image/png' : 'image/jpeg';
    try {
      c.toBlob((b) => {
        if (!b) { setDrawErr('Le recadrage n’a pas pu être fait. Réessayez.'); return; }
        onApply(new File([b], transparent ? 'logo.png' : 'photo.jpg', { type }));
      }, type, 0.92);
    } catch { setDrawErr('Cette image ne peut pas être recadrée ici. Importez-la depuis votre appareil.'); }
  }

  const pct = Math.round(((zoom - minZoom) / (MAX_ZOOM - minZoom)) * 100);
  const changed = Math.abs(zoom - 1) > 0.001 || off.x !== 0 || off.y !== 0;
  const say = error || drawErr || (failed ? 'Cette image n’a pas pu être ouverte.' : '');

  const view = (
    <div className={styles.back} role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className={styles.win} role="dialog" aria-modal="true" aria-labelledby="crop-title">
        <header className={styles.head}>
          <button type="button" className={styles.round} onClick={onCancel} disabled={busy} aria-label="Annuler"><Icon name="close" size={20} /></button>
          <h2 id="crop-title">{title}</h2>
          <button type="button" className={styles.round} onClick={reset} disabled={busy || !changed} aria-label="Réinitialiser" title="Réinitialiser"><Icon name="refresh" size={18} /></button>
        </header>

        <div ref={stage} className={styles.stage} data-alpha={transparent ? '' : undefined} tabIndex={0} aria-label="Zone de recadrage : glissez pour déplacer, pincez pour zoomer"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onKeyDown={keys}>
          {img ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.pic} src={img.src} alt="" draggable={false} crossOrigin={img.crossOrigin === 'anonymous' ? 'anonymous' : undefined}
              style={{ width: iw, height: ih, transform: `translate(${box.w / 2 + off.x - iw / 2}px, ${box.h / 2 + off.y - ih / 2}px)` }} />
            <div className={styles.frame} style={{ width: fw, height: fh }} aria-hidden="true">
              <i className={styles.v1} /><i className={styles.v2} /><i className={styles.h1} /><i className={styles.h2} />
              <b className={styles.c1} /><b className={styles.c2} /><b className={styles.c3} /><b className={styles.c4} />
            </div>
          </> : failed ? null : <span className={styles.wait} aria-label="Chargement" />}
        </div>

        <div className={styles.tools}>
          {shapes.length > 1 ? (
            <div className={styles.shapes} role="group" aria-label="Forme du cadre">
              {shapes.map((s, i) => <button key={s.label} type="button" aria-pressed={shape === i} onClick={() => setShape(i)} disabled={busy}>{s.label}</button>)}
            </div>
          ) : null}
          <div className={styles.zoom}>
            <button type="button" className={styles.step} onClick={() => setZoomAt(zoom / 1.2)} disabled={busy || zoom <= minZoom + 0.001} aria-label="Dézoomer"><span aria-hidden="true">−</span></button>
            <input type="range" className={styles.range} min={0} max={1000} step={1} value={Math.round(((zoom - minZoom) / (MAX_ZOOM - minZoom)) * 1000)} disabled={busy || !img}
              style={{ ['--p' as string]: `${pct}%` }} aria-label="Zoom" aria-valuetext={`${Math.round(zoom * 100)} %`}
              onChange={(e) => setZoomAt(minZoom + (Number(e.target.value) / 1000) * (MAX_ZOOM - minZoom))} />
            <button type="button" className={styles.step} onClick={() => setZoomAt(zoom * 1.2)} disabled={busy || zoom >= MAX_ZOOM - 0.001} aria-label="Zoomer"><Icon name="plus" size={16} /></button>
            <output className={styles.pct}>{Math.round(zoom * 100)} %</output>
          </div>
          {say ? <p className={styles.err} role="alert">{say}</p> : <p className={styles.hint}>Glissez pour déplacer, pincez pour zoomer.</p>}
          <div className={styles.acts}>
            <Button variant="secondary" onClick={onCancel} disabled={busy}>Annuler</Button>
            <Button variant="ink" icon="check" busy={busy} disabled={!img} onClick={apply}>Appliquer</Button>
          </div>
        </div>
      </div>
    </div>
  );
  return mounted ? createPortal(view, document.body) : null;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ENGINE_BASE } from '@/lib/engine';
import type { Fiche } from '@/lib/stores';
import styles from './StorePreview.module.css';

type Device = 'phone' | 'desktop';
const SIZE: Record<Device, { w: number; h: number }> = { phone: { w: 390, h: 760 }, desktop: { w: 1280, h: 800 } };

interface EngineWindow extends Window {
  JEERE_DATA?: { normalizeConfig?: (f: unknown) => unknown; defaultConfig?: (o: { name?: string }) => Record<string, unknown> };
  JeereRender?: { render: (cfg: unknown, root: Element, o: { device: Device; page: string }) => void; ensureFonts?: (cfg: unknown, doc: Document) => void };
}

/** A store drawn by the engine, in a frame of its own (the store's styles never touch the dashboard's).
 *  `width` is the room it gets on the page: the store is drawn at a real phone or computer size and scaled to fit. */
export function StorePreview({ fiche, device = 'phone', width, height, title, interactive = false, focus, onPick }: {
  fiche: Fiche; device?: Device; width: number; title: string; interactive?: boolean;
  /** the room in height (the editor): the store keeps its real width and scrolls inside */
  height?: number;
  /** the section being edited: brought into view and framed */
  focus?: string;
  /** a click on a section of the store (the editor selects it); links and buttons of the store then do nothing */
  onPick?: (sectionId: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const base = SIZE[device];
  const scale = Math.min(1, width / base.w);
  const size = { w: base.w, h: height ? Math.max(320, Math.round(height / scale)) : base.h };
  const pick = useRef(onPick);
  pick.current = onPick;

  const doc = useMemo(() => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><base href="${ENGINE_BASE}">
<link rel="stylesheet" href="${ENGINE_BASE}store.css">
<style>html,body{margin:0;background:#fff}body{overflow-x:hidden}</style>
<script src="${ENGINE_BASE}data.js"></script><script src="${ENGINE_BASE}render.js"></script>
</head><body><div id="root"></div></body></html>`, []);

  // draw, and draw again when the fiche or the device changes
  useEffect(() => {
    if (!ready) return;
    const w = frame.current?.contentWindow as EngineWindow | null;
    const root = w?.document.getElementById('root');
    if (!w?.JeereRender || !root) { setFailed(true); return; }
    try {
      let source: unknown = JSON.parse(JSON.stringify(fiche));
      // a seller who has no store yet: the engine's example store, in the model and the name asked for
      if (!Array.isArray(fiche.products) && w.JEERE_DATA?.defaultConfig) {
        const base = w.JEERE_DATA.defaultConfig({ name: fiche.store?.name });
        source = { ...base, template: fiche.template ?? base.template, theme: { ...(base.theme as object), ...((fiche.theme as object | undefined) ?? {}) } };
      }
      const cfg = w.JEERE_DATA?.normalizeConfig ? w.JEERE_DATA.normalizeConfig(source) : source;
      w.JeereRender.ensureFonts?.(cfg, w.document);
      w.JeereRender.render(cfg, root, { device, page: 'home' });
      setFailed(false);
    } catch { setFailed(true); }
  }, [ready, fiche, device]);

  // the editor: a click on a section selects it
  useEffect(() => {
    if (!ready || !onPick) return;
    const d = frame.current?.contentDocument;
    if (!d) return;
    const onClick = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      const id = (e.target as Element | null)?.closest?.('[data-section-id]')?.getAttribute('data-section-id');
      if (id) pick.current?.(id);
    };
    d.addEventListener('click', onClick, true);
    return () => d.removeEventListener('click', onClick, true);
  }, [ready, !!onPick]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the section being edited: in view, with the blue frame of a selection
  useEffect(() => {
    if (!ready) return;
    const d = frame.current?.contentDocument;
    if (!d) return;
    let st = d.getElementById('jehre-focus');
    if (!st) { st = d.createElement('style'); st.id = 'jehre-focus'; d.head.appendChild(st); }
    st.textContent = focus ? `[data-section-id="${focus.replace(/["\\]/g, '')}"]{outline:2px solid #3B82F6;outline-offset:-2px}` + (onPick ? '[data-section-id]{cursor:pointer}' : '') : (onPick ? '[data-section-id]{cursor:pointer}' : '');
    if (focus) d.querySelector(`[data-section-id="${focus.replace(/["\\]/g, '')}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ready, focus, fiche, device, !!onPick]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.wrap} style={{ width: Math.round(size.w * scale), height: Math.round(size.h * scale) }} data-device={device}>
      <iframe ref={frame} title={title} className={styles.frame} srcDoc={doc} width={size.w} height={size.h} tabIndex={interactive ? 0 : -1}
        style={{ transform: `scale(${scale})`, pointerEvents: interactive ? 'auto' : 'none' }} onLoad={() => setReady(true)} />
      {!ready ? <p className={styles.note}>Chargement de l’aperçu…</p> : null}
      {failed ? <p className={styles.note}>L’aperçu n’a pas pu se charger.</p> : null}
    </div>
  );
}

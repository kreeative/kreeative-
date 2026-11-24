'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { modelSite, type Model } from '@/lib/models';
import styles from '@/app/admin/editeur/editeur.module.css';

type Device = 'phone' | 'desktop';
const WIDTH: Record<Device, number> = { phone: 390, desktop: 1280 };

/** A model shown inside Jehre, the way a theme is shown inside Shopify: a quiet bar (back, the sizes, full screen,
 *  one button), then the designer's real site in a frame. Anyone can look; `action` is the one button on the right. */
export function ModelViewer({ model: m, back, backLabel, action }: { model: Model; back: string; backLabel: string; action: ReactNode }) {
  const [full, setFull] = useState(false);
  const [device, setDevice] = useState<Device>('desktop');
  const [room, setRoom] = useState({ w: 1000, h: 700 });
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { if (window.matchMedia('(max-width: 820px)').matches) setDevice('phone'); }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const c = getComputedStyle(el); setRoom({ w: Math.max(240, el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)), h: Math.max(320, el.clientHeight - parseFloat(c.paddingTop)) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  const scale = Math.min(1, room.w / WIDTH[device]);
  return (
    <div className={styles.preview} data-full={full ? '' : undefined}>
      {full ? (
        <button type="button" className={styles.pvLeave} onClick={() => setFull(false)} aria-label="Quitter le plein écran"><Icon name="shrink" size={18} /></button>
      ) : (
        <header className={styles.pvBar}>
          <Link className={styles.pvIcon} href={back} aria-label={backLabel}><Icon name="back" size={18} /></Link>
          <div className={styles.pvSizes} role="group" aria-label={`Modèle ${m.name} · ${m.kind}`}>
            <button type="button" className={styles.pvIcon} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} aria-label="Ordinateur"><Icon name="desktop" size={18} /></button>
            <button type="button" className={styles.pvIcon} aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} aria-label="Téléphone"><Icon name="phone" size={18} /></button>
            <button type="button" className={styles.pvIcon} onClick={() => setFull(true)} aria-label="Plein écran"><Icon name="expand" size={18} /></button>
          </div>
          {action}
        </header>
      )}
      <div className={styles.pvStage} ref={stage}>
        <div className={styles.frameBox} style={full ? { width: '100%', height: '100%', borderRadius: 0 } : { width: Math.round(WIDTH[device] * scale), height: room.h }} data-device={device}>
          <span className={styles.example} aria-hidden="true">Exemple de mise en page</span>
          <iframe title={`Modèle ${m.name}`} src={modelSite(m.slug)} width={full ? '100%' : WIDTH[device]} height={full ? '100%' : Math.round(room.h / scale)} style={full ? undefined : { transform: `scale(${scale})` }} />
        </div>
      </div>
    </div>
  );
}

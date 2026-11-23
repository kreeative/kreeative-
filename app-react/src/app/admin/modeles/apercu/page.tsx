'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { modelBySlug, modelSite, type Model } from '@/lib/models';
import styles from '../../editeur/editeur.module.css';

type Device = 'phone' | 'desktop';
const WIDTH: Record<Device, number> = { phone: 390, desktop: 1280 };

/** A model seen inside Jehre, as a theme is previewed inside Shopify or Framer: the designer's real site in a
 *  frame, on a phone or a computer, page by page, with « Choisir ce modèle » at hand. Only a seller who is
 *  logged in gets here (the dashboard asks for the account first). */
export default function ModelPreviewPage() {
  const { models, model: current, store } = useAdmin();
  const [m, setM] = useState<Model | null | undefined>(undefined);
  const [full, setFull] = useState(false);
  const [device, setDevice] = useState<Device>('desktop');
  const [room, setRoom] = useState({ w: 1000, h: 700 });
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { setM(modelBySlug(new URLSearchParams(window.location.search).get('m') ?? '') ?? null); if (window.matchMedia('(max-width: 820px)').matches) setDevice('phone'); }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const c = getComputedStyle(el); setRoom({ w: Math.max(240, el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)), h: Math.max(320, el.clientHeight - parseFloat(c.paddingTop)) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [m, full]);

  if (m === undefined) return null;
  if (!m) return <Empty icon="template" title="Ce modèle n’existe pas" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle dans la liste.</Empty>;

  const scale = Math.min(1, room.w / WIDTH[device]);
  const mine = models.includes(m.slug);
  const action = mine
    ? <ButtonLink variant="secondary" className={styles.pvAction} href={current === m.slug && store ? `/admin/editeur/?b=${store.id}` : '/admin/modeles/'}>{current === m.slug ? 'Modifier mon site' : 'Utiliser ce modèle'}</ButtonLink>
    : <ButtonLink variant="secondary" className={styles.pvAction} href={`/admin/modeles/?choisir=${m.slug}`}>Choisir ce modèle</ButtonLink>;
  // the way a theme is shown inside Shopify: a quiet bar (back, the sizes, the button), then the site itself
  return (
    <div className={styles.preview} data-full={full ? '' : undefined}>
      {full ? (
        <button type="button" className={styles.pvLeave} onClick={() => setFull(false)} aria-label="Quitter le plein écran"><Icon name="shrink" size={18} /></button>
      ) : (
        <header className={styles.pvBar}>
          <Link className={styles.pvIcon} href="/admin/modeles/" aria-label="Retour aux modèles"><Icon name="back" size={18} /></Link>
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
          <iframe title={`Modèle ${m.name}`} src={modelSite(m.slug)} width={full ? '100%' : WIDTH[device]} height={full ? '100%' : Math.round(room.h / scale)} style={full ? undefined : { transform: `scale(${scale})` }} />
        </div>
      </div>
    </div>
  );
}

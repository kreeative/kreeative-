'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { money } from '@/lib/format';
import { MODEL_PAGES, modelBySlug, modelSite, type Model } from '@/lib/models';
import styles from '../../editeur/editeur.module.css';

type Device = 'phone' | 'desktop';
const WIDTH: Record<Device, number> = { phone: 390, desktop: 1280 };

/** A model seen inside Jehre, as a theme is previewed inside Shopify or Framer: the designer's real site in a
 *  frame, on a phone or a computer, page by page, with « Choisir ce modèle » at hand. Only a seller who is
 *  logged in gets here (the dashboard asks for the account first). */
export default function ModelPreviewPage() {
  const { models, model: current, store } = useAdmin();
  const [m, setM] = useState<Model | null | undefined>(undefined);
  const [path, setPath] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [room, setRoom] = useState({ w: 1000, h: 700 });
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { setM(modelBySlug(new URLSearchParams(window.location.search).get('m') ?? '') ?? null); if (window.matchMedia('(max-width: 820px)').matches) setDevice('phone'); }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom({ w: Math.max(240, el.clientWidth - 32), h: Math.max(320, el.clientHeight - 32) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [m]);

  if (m === undefined) return null;
  if (!m) return <Empty icon="template" title="Ce modèle n’existe pas" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle dans la liste.</Empty>;

  const pages = MODEL_PAGES[m.slug] ?? [{ path: '', name: 'Accueil' }];
  const scale = Math.min(1, room.w / WIDTH[device]);
  const mine = models.includes(m.slug);
  return (
    <div className={styles.editor}>
      <header className={styles.top}>
        <Link className={styles.back} href="/admin/modeles/" aria-label="Retour aux modèles"><Icon name="back" size={20} /></Link>
        <div className={styles.what}><b>Modèle {m.name}</b><span>{m.kind} · {mine ? 'il est à vous' : money(m.price)}</span></div>
        <div className={styles.devices} role="group" aria-label="Taille de l’aperçu">
          <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>Téléphone</button>
          <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Ordinateur</button>
        </div>
        {mine
          ? <ButtonLink className={styles.save} icon="edit" href={current === m.slug && store ? `/admin/editeur/?b=${store.id}` : '/admin/modeles/'}>{current === m.slug ? 'Modifier mon site' : 'Utiliser ce modèle'}</ButtonLink>
          : <ButtonLink className={styles.save} href={`/admin/modeles/?choisir=${m.slug}`}>Choisir ce modèle</ButtonLink>}
      </header>
      {pages.length > 1 ? (
        <div className={styles.previewPages} role="tablist" aria-label="Pages du modèle">
          {pages.map((p) => <button key={p.path} type="button" role="tab" aria-selected={p.path === path} onClick={() => setPath(p.path)}>{p.name}</button>)}
        </div>
      ) : <span />}
      <div className={styles.stage} ref={stage}>
        <div className={styles.frameBox} style={{ width: Math.round(WIDTH[device] * scale), height: room.h }} data-device={device}>
          <iframe key={path} title={`Modèle ${m.name}`} src={modelSite(m.slug) + path} width={WIDTH[device]} height={Math.round(room.h / scale)} style={{ transform: `scale(${scale})` }} />
        </div>
      </div>
    </div>
  );
}

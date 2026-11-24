'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import styles from './tour.module.css';

/* The guided visit of the editor: a few short steps, each one lighting the part of the screen it talks about. It
   opens by itself the first time the editor is used on this device, and again from the « ? » of the top bar. A
   seller who installs her model alone learns the editor here, without asking anyone. */

export interface TourStep { target?: string; title: string; text: string }
export const TOUR_KEY = 'jehre-editor-tour';

export const DESK_TOUR: TourStep[] = [
  { title: 'Bienvenue dans votre éditeur', text: 'Voici votre site, tel que vos clientes le verront. Tout se change ici, en quelques clics. La visite dure une minute.' },
  { target: 'site', title: 'Cliquez pour changer', text: 'Cliquez sur un texte, une photo ou un bouton de votre site. Il s’encadre en bleu et ses réglages s’ouvrent à droite : écrivez votre texte, remplacez la photo, choisissez où mène un bouton.' },
  { target: 'sections', title: 'Les sections de la page', text: 'Chaque ligne est une partie de votre page. Glissez-la pour changer l’ordre, l’œil la masque, la corbeille la retire. Cliquez sur une section pour régler son fond et ses espaces.' },
  { target: 'add', title: 'Ajouter une section', text: 'Une bannière, vos produits, un texte avec une image, des avis, des questions fréquentes : elle se place après la section choisie.' },
  { target: 'devices', title: 'Ordinateur ou téléphone', text: 'Vérifiez votre site sur les deux. La plupart de vos clientes viendront avec leur téléphone.' },
  { target: 'history', title: 'Une erreur ? Annulez', text: 'Ces deux flèches annulent et rétablissent vos derniers changements.' },
  { target: 'publish', title: 'Publier', text: 'Rien n’est en ligne tant que vous n’avez pas cliqué sur Publier. Vos produits, eux, se gèrent et se modifient dans le tableau de bord, page Produits.' },
];
export const PHONE_TOUR: TourStep[] = [
  { title: 'Bienvenue dans votre éditeur', text: 'Voici votre site, tel que vos clientes le verront. Tout se change ici, du bout du doigt. La visite dure une minute.' },
  { target: 'site', title: 'Touchez pour changer', text: 'Touchez un texte, une photo ou un bouton. Il s’encadre en bleu et ses outils apparaissent en bas : modifier, couleur, remplacer, cadrer, supprimer. Le rond noir ✓ termine.' },
  { target: 'bar', title: 'Les outils du site', text: 'Sections : l’ordre et ce qui est masqué. Pages : les autres pages. Style : la police. Ajouter : remettre ce que vous avez supprimé.' },
  { target: 'history', title: 'Une erreur ? Annulez', text: 'Ces deux flèches annulent et rétablissent vos derniers changements.' },
  { target: 'publish', title: 'Publier', text: 'Rien n’est en ligne tant que vous n’avez pas touché Publier. Vos produits se gèrent et se modifient dans le tableau de bord, onglet Produits.' },
];

export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const step = steps[at]!;
  useEffect(() => { setMounted(true); }, []);
  // the part of the screen this step talks about, measured again when the window changes
  useLayoutEffect(() => {
    const read = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      const r = el?.getBoundingClientRect();
      setBox(r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [step.target, at]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onDone]);
  if (!mounted) return null;

  const vw = window.innerWidth, vh = window.innerHeight, W = Math.min(340, vw - 24), pad = 6;
  const hole = box ? { x: Math.max(4, box.x - pad), y: Math.max(4, box.y - pad), w: Math.min(vw - 8, box.w + 2 * pad), h: Math.min(vh - 8, box.h + 2 * pad) } : null;
  // the card sits where there is room: beside a tall part, under or above a wide one, in the middle without a part
  let left = (vw - W) / 2, top: number | undefined, bottom: number | undefined;
  if (!hole) top = Math.max(16, vh / 2 - 110);
  else if (hole.w > vw * 0.6) {      // most of the screen (the site): the card over its lower part
    left = Math.min(vw - W - 12, Math.max(12, hole.x + hole.w / 2 - W / 2)); bottom = Math.max(16, vh - (hole.y + hole.h) + 20);
  } else if (hole.x + hole.w + W + 28 <= vw && hole.h > 160) { left = hole.x + hole.w + 16; top = Math.min(vh - 240, Math.max(16, hole.y)); }
  else {
    left = Math.min(vw - W - 12, Math.max(12, hole.x + hole.w / 2 - W / 2));
    if (hole.y + hole.h + 220 <= vh) top = hole.y + hole.h + 14; else bottom = Math.max(16, vh - hole.y + 14);
  }
  const last = at === steps.length - 1;
  return createPortal(
    <div className={styles.tour} role="dialog" aria-modal="true" aria-label={`Visite de l’éditeur, étape ${at + 1} sur ${steps.length}`}>
      {hole ? <div className={styles.hole} style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} /> : <div className={styles.dim} />}
      <div className={styles.card} key={at} style={{ left, width: W, top, bottom }}>
        <p className={styles.count}>{at + 1} sur {steps.length}</p>
        <h2>{step.title}</h2>
        <p className={styles.text}>{step.text}</p>
        <div className={styles.acts}>
          <button type="button" className={styles.skip} onClick={onDone}>{last ? 'Fermer' : 'Passer la visite'}</button>
          <div className={styles.nav}>
            {at > 0 ? <Button variant="secondary" onClick={() => setAt(at - 1)}>Retour</Button> : null}
            <Button onClick={() => (last ? onDone() : setAt(at + 1))}>{last ? 'C’est parti' : 'Suivant'}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

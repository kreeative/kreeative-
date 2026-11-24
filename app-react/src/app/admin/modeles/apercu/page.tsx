'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { ModelViewer } from '@/components/models/ModelViewer';
import { ButtonLink } from '@/components/ui/Button';
import { modelBySlug, storeOfModel, type Model } from '@/lib/models';
import styles from '../../editeur/editeur.module.css';

/** A model seen from the dashboard: the same viewer as the public one, with the button that fits her account
 *  (choose it, use it, or edit her site when it is the one in use). */
export default function ModelPreviewPage() {
  const { models, model: current, store, stores } = useAdmin();
  const [m, setM] = useState<Model | null | undefined>(undefined);
  useEffect(() => { setM(modelBySlug(new URLSearchParams(window.location.search).get('m') ?? '') ?? null); }, []);

  if (m === undefined) return null;
  if (!m) return <Empty icon="template" title="Ce modèle n’existe pas" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle dans la liste.</Empty>;
  const mine = models.includes(m.slug);
  const action = mine
    ? (() => { const at = current === m.slug && store ? store : storeOfModel(stores, models, m.slug); return <ButtonLink variant="secondary" className={styles.pvAction} href={at ? `/admin/editeur/?b=${at.id}` : '/admin/modeles/'}>{at ? 'Modifier mon site' : 'Utiliser ce modèle'}</ButtonLink>; })()
    : <ButtonLink variant="secondary" className={styles.pvAction} href={`/admin/modeles/?choisir=${m.slug}`}>Choisir ce modèle</ButtonLink>;
  return <ModelViewer model={m} back="/admin/modeles/" backLabel="Retour aux modèles" action={action} />;
}

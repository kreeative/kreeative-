'use client';

import { use, useEffect, useState } from 'react';
import { ModelViewer } from '@/components/models/ModelViewer';
import { ButtonLink } from '@/components/ui/Button';
import { currentUser } from '@/lib/auth';
import { modelBySlug, myModels, storeOfModel } from '@/lib/models';
import { listStores } from '@/lib/stores';
import styles from '@/app/admin/editeur/editeur.module.css';

/** jehre.com/modeles/<nom>/ — the address of a model, the one sent to people. Anyone sees the model, inside Jehre
 *  (never as a bare public site). No account is asked to look: only « Choisir ce modèle » asks for it. */
export default function ModelLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const m = modelBySlug(slug);
  const [logged, setLogged] = useState(false);
  // a model she already has: no « Choisir », her own site opens instead
  const [mineAt, setMineAt] = useState<string | null>(null);
  useEffect(() => {
    if (!m) { window.location.replace('/'); return; }
    void currentUser().then(async (u) => {
      setLogged(!!u);
      if (!u) return;
      const [stores, owned] = await Promise.all([listStores(u.id).catch(() => []), myModels()]);
      const at = storeOfModel(stores, owned, m.slug);
      if (at) setMineAt(at.id); else if (owned.includes(m.slug)) setMineAt('');
    });
  }, [m]);
  if (!m) return null;
  return <ModelViewer model={m} back={logged ? '/admin/modeles/' : '/'} backLabel={logged ? 'Retour aux modèles' : 'Retour à l’accueil de Jehre'}
    action={mineAt !== null
      ? <ButtonLink variant="secondary" className={styles.pvAction} href={mineAt ? `/admin/editeur/?b=${mineAt}` : '/admin/modeles/'}>{mineAt ? 'Modifier mon site' : 'Utiliser ce modèle'}</ButtonLink>
      : <ButtonLink variant="secondary" className={styles.pvAction} href={logged ? `/admin/modeles/?choisir=${m.slug}` : `/compte/?suite=modele&m=${m.slug}#inscription`}>Choisir ce modèle</ButtonLink>} />;
}

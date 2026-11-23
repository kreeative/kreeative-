'use client';

import { use, useEffect, useState } from 'react';
import { ModelViewer } from '@/components/models/ModelViewer';
import { ButtonLink } from '@/components/ui/Button';
import { currentUser } from '@/lib/auth';
import { modelBySlug } from '@/lib/models';
import styles from '@/app/admin/editeur/editeur.module.css';

/** jehre.com/modeles/<nom>/ — the address of a model, the one sent to people. Anyone sees the model, inside Jehre
 *  (never as a bare public site). No account is asked to look: only « Choisir ce modèle » asks for it. */
export default function ModelLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const m = modelBySlug(slug);
  const [logged, setLogged] = useState(false);
  useEffect(() => { if (!m) { window.location.replace('/'); return; } void currentUser().then((u) => setLogged(!!u)); }, [m]);
  if (!m) return null;
  return <ModelViewer model={m} back={logged ? '/admin/modeles/' : '/'} backLabel={logged ? 'Retour aux modèles' : 'Retour à l’accueil de Jehre'}
    action={<ButtonLink variant="secondary" className={styles.pvAction} href={logged ? `/admin/modeles/?choisir=${m.slug}` : `/compte/?suite=modele&m=${m.slug}#inscription`}>Choisir ce modèle</ButtonLink>} />;
}

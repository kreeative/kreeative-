'use client';

import { use, useEffect } from 'react';
import { currentUser } from '@/lib/auth';
import { modelBySlug, modelPreview } from '@/lib/models';

/** jehre.com/modeles/<nom>/ — the address of a model, the one sent to people. A model is not a public page: with
 *  an account it opens inside Jehre; without one, the account page says « Connectez-vous pour voir ce modèle ». */
export default function ModelLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  useEffect(() => {
    const m = modelBySlug(slug);
    if (!m) { window.location.replace('/admin/modeles/'); return; }
    void currentUser().then((u) => window.location.replace(u ? modelPreview(m.slug) : `/compte/?suite=modele&m=${m.slug}#connexion`));
  }, [slug]);
  return <p style={{ display: 'grid', placeItems: 'center', minHeight: '60dvh', color: '#5E5E5E' }}>Un instant…</p>;
}

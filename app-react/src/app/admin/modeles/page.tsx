'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { StorePreview } from '@/components/store/StorePreview';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { SECTION_TYPES, TEMPLATES, withTemplate, type Template } from '@/lib/engine';
import type { Fiche } from '@/lib/stores';
import styles from './modeles.module.css';

/** The models. Every model is the same store (her products, her eight sections, her words) in another layout:
 *  each card shows HER store in that model, drawn by the engine. Choosing one changes the layout, the palette,
 *  the fonts and the corners; nothing she wrote is lost. */
export default function ModelsPage() {
  const { account, store, reload } = useAdmin();
  const { busy, problem, write } = useSave();
  const [open, setOpen] = useState<Template | null>(null);
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [applied, setApplied] = useState('');

  const base: Fiche = useMemo(() => store?.fiche ?? { store: { name: account.storeName || 'Ma boutique' } }, [store, account.storeName]);
  const current = typeof base.template === 'string' ? base.template : '';
  const fiches = useMemo(() => Object.fromEntries(TEMPLATES.map((t) => [t.id, withTemplate(base, t.id)])) as Record<string, Fiche>, [base]);
  const close = useCallback(() => setOpen(null), []);

  async function choose(t: Template) {
    if (!store || busy) return;
    if (await write(withTemplate(store.fiche, t.id))) { setApplied(t.name); setOpen(null); }
  }

  return (
    <>
      <PageHead title="Modèles" sub={store ? 'Votre boutique, dans chaque modèle. Vos produits et vos textes ne changent pas.' : 'Voici à quoi ressemblera votre boutique dans chaque modèle.'} />
      {applied ? <div className={styles.notice}><Notice tone="ok">Votre boutique utilise maintenant le modèle {applied}.</Notice></div> : null}

      <ul className={styles.grid}>
        {TEMPLATES.map((t) => (
          <li key={t.id} className={styles.card}>
            <button type="button" className={styles.shot} onClick={() => { setDevice('phone'); setOpen(t); }} aria-label={`Voir le modèle ${t.name} en grand`}>
              <StorePreview fiche={fiches[t.id]!} width={260} title={`Aperçu du modèle ${t.name}`} />
            </button>
            <div className={styles.body}>
              <p className={styles.name}><b>{t.name}</b><span>{t.style}</span>{current === t.id ? <em>Modèle utilisé</em> : null}</p>
              <p className={styles.desc}>{t.description}</p>
              <p className={styles.best}>Idéal pour : {t.bestFor.toLowerCase()}</p>
              <div className={styles.acts}>
                <Button variant="secondary" icon="eye" onClick={() => { setDevice('phone'); setOpen(t); }}>Aperçu</Button>
                {store ? (current === t.id ? null : <Button busy={busy} onClick={() => void choose(t)}>Utiliser ce modèle</Button>)
                  : <ButtonLink href="/creer/">Commencer avec ce modèle</ButtonLink>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {problem ? <div className={styles.notice}>{problem === 'conflict'
        ? <Notice tone="warn" title="Votre boutique a changé entre-temps" action={<Button variant="secondary" onClick={() => void reload()}>Recharger</Button>}>Elle a été modifiée ailleurs. Rechargez, puis choisissez à nouveau.</Notice>
        : <Notice tone="error">Le modèle n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.</Notice>}</div> : null}

      <section className={styles.sections}>
        <h2>Les huit sections d’une boutique</h2>
        <p>Tous les modèles utilisent les mêmes. Vous les activez, les ordonnez et les remplissez dans l’éditeur.</p>
        <ol>{SECTION_TYPES.map((s) => <li key={s.type}><b>{s.name}</b><span>{s.description}</span></li>)}</ol>
      </section>

      {open ? (
        <Sheet title={`Modèle ${open.name}`} sub={open.style} onClose={close} expandable>
          <div className={styles.devices} role="group" aria-label="Taille de l’aperçu">
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>Téléphone</button>
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Ordinateur</button>
          </div>
          <div className={styles.big}><StorePreview fiche={fiches[open.id]!} device={device} width={device === 'phone' ? 390 : 700} title={`Modèle ${open.name}, ${device === 'phone' ? 'téléphone' : 'ordinateur'}`} interactive /></div>
          {store && current !== open.id ? <Button block busy={busy} onClick={() => void choose(open)}>Utiliser ce modèle</Button> : null}
        </Sheet>
      ) : null}
    </>
  );
}

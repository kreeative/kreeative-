'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Toast';
import { endMirror, MIRROR_BLOCKED, MIRROR_CHANGED, mirrorInfo, setMirrorEdit, type MirrorInfo } from '@/lib/mirror';
import styles from './MirrorBar.module.css';

/** The bar of a mirror tab (opened from Atlas): whose account this is, read only or editing, and the way out. */
export function MirrorBar() {
  const [m, setM] = useState<MirrorInfo | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => {
    setM(mirrorInfo());
    const changed = () => setM(mirrorInfo());
    const blocked = (e: Event) => setToast((e as CustomEvent<{ never?: boolean }>).detail?.never ? 'Le miroir ne fait jamais ça à sa place.' : 'Lecture seule : rien n’a été modifié.');
    window.addEventListener(MIRROR_CHANGED, changed);
    window.addEventListener(MIRROR_BLOCKED, blocked);
    return () => { window.removeEventListener(MIRROR_CHANGED, changed); window.removeEventListener(MIRROR_BLOCKED, blocked); };
  }, []);
  if (!m) return null;
  const who = m.name || m.email;
  const edit = () => {
    if (m.edit) { setMirrorEdit(false); return; }
    if (window.confirm(`Modifier le compte de ${who} ? Ce que vous changez sera enregistré dans son compte, comme si elle l’avait fait.`)) setMirrorEdit(true);
  };
  return (
    <>
      <div className={styles.bar} data-edit={m.edit ? 'on' : undefined} role="region" aria-label="Miroir d’un compte">
        <Icon name="eye" size={16} />
        <span className={styles.who}><b>{who}</b><small>{m.edit ? 'Modification activée' : 'Lecture seule'}</small></span>
        {m.canEdit ? <button type="button" className={styles.btn} onClick={edit}>{m.edit ? 'Lecture seule' : 'Modifier'}</button> : null}
        <button type="button" className={styles.btn} onClick={endMirror}>Quitter</button>
      </div>
      {toast ? <Toast onDone={() => setToast('')} ms={3500}>{toast}</Toast> : null}
    </>
  );
}

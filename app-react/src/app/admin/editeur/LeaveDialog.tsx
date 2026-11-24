'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import styles from './leave.module.css';

/** She leaves the editor with changes not saved: save them and leave, leave without them, or stay where she was. */
export function LeaveDialog({ published, busy, onSave, onDrop, onStay }: { published: boolean; busy: boolean; onSave: () => void; onDrop: () => void; onStay: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onStay(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onStay]);
  return (
    <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget) onStay(); }}>
      <div className={styles.card} role="alertdialog" aria-modal="true" aria-labelledby="leave-t" aria-describedby="leave-d">
        <span className={styles.badge} aria-hidden="true"><Icon name="alert" size={20} /></span>
        <h2 id="leave-t">Enregistrer vos modifications ?</h2>
        <p id="leave-d">{published ? 'Sans enregistrer, elles seront perdues. Enregistrer met aussi votre site en ligne à jour.' : 'Sans enregistrer, elles seront perdues.'}</p>
        <div className={styles.actions}>
          <button ref={first} type="button" className={styles.save} disabled={busy} aria-busy={busy || undefined} onClick={onSave}>{busy ? <span className={styles.spin} aria-hidden="true" /> : <Icon name="check" size={16} />}Enregistrer et quitter</button>
          <button type="button" className={styles.drop} disabled={busy} onClick={onDrop}>Quitter sans enregistrer</button>
          <button type="button" className={styles.stay} disabled={busy} onClick={onStay}>Rester</button>
        </div>
      </div>
    </div>
  );
}

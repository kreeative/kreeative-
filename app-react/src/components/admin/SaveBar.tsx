'use client';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { useAdmin } from './AdminContext';
import type { SaveProblem } from './useSave';

/** The end of a settings form: what went wrong (if anything), « Enregistré », and the save button. */
export function SaveBar({ busy, problem, saved, dirty, label = 'Enregistrer' }: { busy: boolean; problem: SaveProblem; saved: boolean; dirty: boolean; label?: string }) {
  const { reload } = useAdmin();
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      {problem === 'conflict' ? <Notice tone="warn" title="Votre boutique a changé entre-temps" action={<Button variant="secondary" onClick={() => void reload()}>Recharger</Button>}>Elle a été modifiée ailleurs (un autre onglet, une associée). Rechargez, puis refaites votre modification.</Notice> : null}
      {problem === 'network' ? <Notice tone="error">Rien n’a été enregistré. Vérifiez votre connexion, puis réessayez.</Notice> : null}
      {saved && !dirty ? <Notice tone="ok">Enregistré.</Notice> : null}
      <div><Button type="submit" busy={busy} disabled={!dirty}>{label}</Button></div>
    </div>
  );
}

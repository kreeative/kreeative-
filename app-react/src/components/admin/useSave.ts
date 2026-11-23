'use client';

import { useCallback, useState } from 'react';
import { saveFiche, type Fiche } from '@/lib/stores';
import { useAdmin } from './AdminContext';

export type SaveProblem = '' | 'network' | 'conflict';

/** Writing the current store's fiche from a page: `write(next)` resolves to true once saved; `problem` says why
 *  not (no connection, or the store changed elsewhere meanwhile, in which case nothing was overwritten). */
export function useSave() {
  const { store, replaceStore } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SaveProblem>('');
  const [saved, setSaved] = useState(false);

  const write = useCallback(async (next: Fiche): Promise<boolean> => {
    if (!store) return false;
    setBusy(true); setProblem(''); setSaved(false);
    const r = await saveFiche(store, next);
    setBusy(false);
    if (r.ok) { replaceStore(r.store); setSaved(true); return true; }
    setProblem(r.conflict ? 'conflict' : 'network');
    return false;
  }, [store, replaceStore]);

  return { busy, problem, saved, write, clear: () => { setProblem(''); setSaved(false); } };
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { completeLogin, readAccount, type Account } from '@/lib/account';
import { currentUser } from '@/lib/auth';
import { listStores, type Store } from '@/lib/stores';

/* What every page of the dashboard needs: who is logged in, her stores, the one she is looking at. A visitor
   without a session is sent to the account page and comes back here after logging in. */

interface AdminState {
  account: Account;
  stores: Store[];
  store: Store | null;
  selectStore: (id: string) => void;
  /** put back a store row after a save (its `updated_at` changed) */
  replaceStore: (next: Store) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<AdminState | null>(null);
const CURRENT_KEY = 'jehre-admin-store';

export function useAdmin(): AdminState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin must be used inside <AdminProvider>');
  return v;
}

export function AdminProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const user = await currentUser();
    if (!user) { window.location.replace('/compte/#connexion'); return; }
    const acc = await completeLogin(user).catch(() => readAccount());
    if (!acc) { window.location.replace('/compte/#connexion'); return; }
    const list = await listStores(user.id);
    let wanted: string | null = null;
    try { wanted = window.localStorage.getItem(CURRENT_KEY); } catch { /* storage blocked */ }
    setAccount(acc);
    setStores(list);
    setCurrentId((cur) => (list.some((s) => s.id === cur) ? cur : list.some((s) => s.id === wanted) ? wanted : list[0]?.id ?? null));
    setReady(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo<AdminState | null>(() => {
    if (!account) return null;
    return {
      account,
      stores,
      store: stores.find((s) => s.id === currentId) ?? null,
      selectStore: (id) => { setCurrentId(id); try { window.localStorage.setItem(CURRENT_KEY, id); } catch { /* not kept */ } },
      replaceStore: (next) => setStores((list) => list.map((s) => (s.id === next.id ? next : s))),
      reload: load,
    };
  }, [account, stores, currentId, load]);

  if (!ready || !value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

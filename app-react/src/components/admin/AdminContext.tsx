'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { currentModel, modelBySlug, myModels } from '@/lib/models';
import { completeLogin, readAccount, type Account } from '@/lib/account';
import { currentUser, emailVerified, hasPassword } from '@/lib/auth';
import { createStore, listStores, type Store } from '@/lib/stores';
import { tisheAllowed, tisheEnter, tisheLeave, tisheOn, tisheRedeem } from '@/lib/tishe';
import { endMirror } from '@/lib/mirror';
import { mirrorSignIn } from '@/lib/mirrorSession';
import { MirrorBar } from './MirrorBar';

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
  /** the designer models she paid for, and the one her current store uses ('' when none) */
  models: string[];
  model: string;
  /** The Ivory Sukundu (her own site, with its own data and API): `allowed` for the founder and its partners,
   *  `on` while it is the store in view (its pages replace the Jehre store's), `redeem` = an error of the e-mail link */
  tishe: { allowed: boolean; on: boolean; redeemError: string };
}

const Ctx = createContext<AdminState | null>(null);
const CURRENT_KEY = 'jehre-admin-store';
/** Without a session: the login page; when she was opening a model, it says so and brings her back to it. */
function loginUrl(): string {
  const m = /^\/admin\/modeles\/apercu\/?$/.test(window.location.pathname) ? new URLSearchParams(window.location.search).get('m') : null;
  // a model is public: the dashboard's own preview sends a visitor to the public one, never to a login wall
  return m && /^[a-z]+$/.test(m) ? `/modeles/${m}/` : '/compte/#connexion';
}

export function useAdmin(): AdminState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin must be used inside <AdminProvider>');
  return v;
}

export function AdminProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [tisheOk, setTisheOk] = useState<boolean | null>(null);
  const [ext, setExt] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  const made = useRef(false);
  const load = useCallback(async () => {
    // a tab Atlas opened on a client's account: her session, kept apart, read only (../../lib/mirror.ts)
    const mirror = await mirrorSignIn();
    if (mirror === false) { window.alert('Ce lien de miroir a expiré. Rouvrez le compte depuis Atlas.'); endMirror(); return; }
    const user = await currentUser();
    if (!user) { window.location.replace(loginUrl()); return; }
    // every account has a verified e-mail and a password: the account page asks for what is missing (not in a mirror:
    // the page is hers to see as it is)
    if (!mirror && (!emailVerified(user) || !hasPassword(user))) { window.location.replace('/compte/'); return; }
    const acc = await completeLogin(user).catch(() => readAccount());
    if (!acc) { window.location.replace(loginUrl()); return; }
    let [list, owned] = await Promise.all([listStores(user.id), myModels()]);
    // she paid for a model and has no store yet: her site is made now (not online), so it is in her account,
    // ready to edit, instead of a dashboard that says « pas encore de boutique »
    if (!list.length && owned.length && !made.current) {
      made.current = true;
      if (await createStore(acc.storeName || 'Ma boutique', owned[0]!)) list = await listStores(user.id);
    }
    // the stores that ARE the designer models (the founder's account: SÈVE, REGARD…) carry their own model, without a purchase
    owned = [...new Set([...owned, ...list.filter((s) => s.role === 'owner' && modelBySlug(s.slug)).map((s) => s.slug)])];
    let wanted: string | null = null;
    try { wanted = window.localStorage.getItem(CURRENT_KEY); } catch { /* storage blocked */ }
    // « Gérer la boutique » (#boutique=tishe) and the link of the store's e-mail (#tishe=<token>) open it here
    const h = window.location.hash;
    const tk = /[#&]tishe=([A-Za-z0-9._-]+)/.exec(h);
    if (/[#&]boutique=tishe\b/.test(h) || tk) { tisheEnter(); try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the hash stays */ } }
    if (tk) await tisheRedeem(tk[1]!, user.id).catch((e: Error) => setRedeemError(e.message));
    setExt(tisheOn());
    setTisheOk(await tisheAllowed(user.id).catch(() => false));
    setAccount(acc);
    setStores(list);
    setModels(owned);
    setCurrentId((cur) => (list.some((s) => s.id === cur) ? cur : list.some((s) => s.id === wanted) ? wanted : list[0]?.id ?? null));
    setReady(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo<AdminState | null>(() => {
    if (!account) return null;
    const store = stores.find((s) => s.id === currentId) ?? null;
    return {
      account,
      stores,
      store,
      models,
      model: store && store.role === 'owner' && modelBySlug(store.slug) ? store.slug : currentModel(store?.fiche, models),
      selectStore: (id) => {
        if (id === 'ext:tishe') { tisheEnter(); setExt(true); return; }
        tisheLeave(); setExt(false);
        setCurrentId(id); try { window.localStorage.setItem(CURRENT_KEY, id); } catch { /* not kept */ }
      },
      tishe: { allowed: tisheOk === true, on: ext && tisheOk === true, redeemError },
      replaceStore: (next) => setStores((list) => list.map((s) => (s.id === next.id ? next : s))),
      reload: load,
    };
  }, [account, stores, currentId, load, models, ext, tisheOk, redeemError]);

  if (!ready || !value) return <><MirrorBar />{fallback}</>;
  return <Ctx.Provider value={value}><MirrorBar />{children}</Ctx.Provider>;
}

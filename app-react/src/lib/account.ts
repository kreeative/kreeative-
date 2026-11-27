import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/* The seller's account.
   The server's truth is public.profiles (one row per user, created by the database when she signs up).
   The pages of the current site that are not migrated yet (the dashboard, the editor) read a copy in
   localStorage, 'jeere-account', with a snapshot of what the server has in 'jeere-auth-sync'. This module
   writes both in the very same shape, so those pages keep working unchanged after a login made here. */

export type Plan = 'gratuit' | 'essentiel' | 'croissance' | 'pro' | 'business' | 'entreprise';
const PLANS: readonly Plan[] = ['gratuit', 'essentiel', 'croissance', 'pro', 'business', 'entreprise'];

export interface Profile {
  id: string;
  first_name: string | null;
  phone: string | null;
  store_name: string | null;
  plan: string | null;
  studio: Record<string, unknown> | null;
  created_at: string | null;
}

export interface Account {
  version: 1;
  firstName: string;
  phone: string;
  storeName: string;
  createdAt: string;
  plan: Plan;
  loggedIn: boolean;
  userId: string;
  method: 'email' | 'sms' | 'whatsapp';
  email?: string;
  studio?: Record<string, unknown>;
}

const ACCOUNT_KEY = 'jeere-account';
const SYNC_KEY = 'jeere-auth-sync';
const REF_KEY = 'jeere-ref';

export const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const isPlan = (v: unknown): v is Plan => PLANS.includes(v as Plan);

function lsGet(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
function lsSet(key: string, value: string): boolean { try { window.localStorage.setItem(key, value); return true; } catch { return false; } }
function lsDel(key: string): void { try { window.localStorage.removeItem(key); } catch { /* storage blocked */ } }

export function readAccount(): Account | null {
  const raw = lsGet(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Account> | null;
    return o && typeof o === 'object' && typeof o.userId === 'string' ? (o as Account) : null;
  } catch { return null; }
}

/** Where she comes from (?ref=tiktok or utm_source): kept 30 days, the first visit wins, written at sign-up. */
export function rememberSource(): string {
  const now = Date.now();
  try {
    const url = `${window.location.search}&${window.location.hash.replace(/^[^?]*\?/, '')}`;
    const m = /[?&](?:ref|utm_source)=([A-Za-z0-9_-]{1,30})/.exec(url);
    let saved: { src?: string; at?: number } | null = null;
    try { saved = JSON.parse(lsGet(REF_KEY) ?? 'null'); } catch { saved = null; }
    if (saved && (!saved.at || now - saved.at > 30 * 864e5)) saved = null;
    if (m?.[1] && !saved) { saved = { src: m[1].toLowerCase(), at: now }; lsSet(REF_KEY, JSON.stringify(saved)); }
    return saved?.src ?? '';
  } catch { return ''; }
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase().from('profiles')
    .select('id, first_name, phone, store_name, plan, studio, created_at').eq('id', userId).maybeSingle();
  return error || !data ? null : (data as Profile);
}

export interface LoginExtra { firstName?: string; phone?: string }

/** After the code is verified: read her profile, send up what she just typed, accept the stores she was invited
 *  to, and write the local copy the other pages read. Returns the account. */
export async function completeLogin(user: User, extra: LoginExtra = {}): Promise<Account> {
  const profile = await loadProfile(user.id);
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const patch: Record<string, string> = {};
  const firstName = clip(extra.firstName, 40) || clip(profile?.first_name, 40) || clip(meta.first_name, 40);
  const phone = extra.phone && /^\+\d{8,15}$/.test(extra.phone) ? extra.phone : (profile?.phone ?? '');
  if (firstName && firstName !== (profile?.first_name ?? '')) patch.first_name = firstName;
  if (phone && phone !== (profile?.phone ?? '')) patch.phone = phone;
  if (Object.keys(patch).length) await supabase().from('profiles').update(patch).eq('id', user.id);

  // the stores an agency or a partner handed over to this address (best effort: never blocks a login)
  try { await supabase().rpc('accept_store_invites'); } catch { /* the dashboard asks again */ }

  const account: Account = {
    version: 1,
    firstName,
    phone,
    storeName: clip(profile?.store_name, 40),
    createdAt: profile?.created_at ?? user.created_at ?? new Date().toISOString(),
    plan: isPlan(profile?.plan) ? profile.plan : 'gratuit',
    loggedIn: true,
    userId: user.id,
    method: 'email',
    ...(user.email ? { email: user.email.toLowerCase() } : {}),
    ...(profile?.studio && typeof profile.studio === 'object' ? { studio: profile.studio } : {}),
  };
  writeAccount(account);
  return account;
}

export function writeAccount(account: Account): boolean {
  const server = { first_name: account.firstName, phone: account.phone, store_name: account.storeName, plan: account.plan, studio: account.studio ?? null };
  lsSet(SYNC_KEY, JSON.stringify({ userId: account.userId, data: server, at: new Date().toISOString() }));
  return lsSet(ACCOUNT_KEY, JSON.stringify(account));
}

/** The name of her store (or none: « Je ne veux pas de boutique »), on the server then in the local copy. */
export async function saveStoreName(account: Account, name: string): Promise<{ ok: boolean; account: Account }> {
  const storeName = clip(name, 40);
  const { error } = await supabase().from('profiles').update({ store_name: storeName }).eq('id', account.userId);
  if (error) return { ok: false, account };
  const next = { ...account, storeName };
  writeAccount(next);
  return { ok: true, account: next };
}

/** Logs out THIS device only: her phone stays logged in when she logs out on her computer, and the other way round
 *  (supabase-js logs out every device by default). */
export async function signOut(): Promise<void> {
  try { await supabase().auth.signOut({ scope: 'local' }); } catch { /* the local session goes anyway */ }
  const acc = readAccount();
  if (acc) lsSet(ACCOUNT_KEY, JSON.stringify({ ...acc, loggedIn: false }));
  lsDel(SYNC_KEY);
}

/** « Ma Boutique » → « ma-boutique »: the free address shown under the name. */
export function slugify(raw: string): string {
  return raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

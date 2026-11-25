'use client';

import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

/* Atlas, Jehre's admin space: everything goes through the « atlas » function, which checks the account, its role and
   the e-mail code of less than 12 hours on every call (concepts/jeere/supabase/functions/atlas/index.ts). */
export type AtlasRole = 'fondatrice' | 'admin' | 'support' | 'lecture';
export const ROLE_LABEL: Record<AtlasRole, string> = { fondatrice: 'Fondatrice', admin: 'Administrateur', support: 'Support', lecture: 'Lecture seule' };
export const ROLE_TEXT: Record<AtlasRole, string> = {
  fondatrice: 'Tout, y compris les administrateurs.', admin: 'Comptes, formules, boutiques, suspensions.', support: 'Voir, et envoyer un lien de mot de passe.', lecture: 'Voir seulement.',
};
const RANK: Record<AtlasRole, number> = { fondatrice: 4, admin: 3, support: 2, lecture: 1 };
export const can = (role: AtlasRole, need: AtlasRole): boolean => RANK[role] >= RANK[need];

export type AtlasAnswer<T> = ({ ok: true } & T) | { ok: false; code?: string; message: string; email?: string };
export async function atlas<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<AtlasAnswer<T>> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, code: 'login', message: 'Connectez-vous.' };
    const r = await fetch(`${SUPABASE_URL}/functions/v1/atlas`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }) });
    const j = (await r.json().catch(() => null)) as AtlasAnswer<T> | null;
    return j ?? { ok: false, message: 'Le serveur n’a pas répondu.' };
  } catch { return { ok: false, message: 'La connexion a été coupée. Réessayez.' }; }
}

export interface AtlasStore { id: string; slug: string; createdAt?: string; name: string; published: boolean; plan: string; promo: boolean; until?: string | null; domain?: string | null }
export interface AtlasAccount { id: string; email: string; firstName: string; phone?: string; source?: string; createdAt: string; lastSignIn?: string | null; verified: boolean; suspended: boolean; stores: AtlasStore[]; purchases: { model: string; amount: number; currency?: string; at: string; install: boolean; installedAt?: string | null }[] }
export interface AtlasOverview { accounts: number; newWeek: number; verified: number; stores: number; published: number; paying: number; byPlan: Record<string, number>; suspended: number; purchases: number; purchasesAmount: number }
export interface AtlasAdmin { email: string; role: AtlasRole; added_by?: string; added_at: string }
export interface AtlasLog { at: string; actor: string; action: string; target?: string; detail?: Record<string, unknown> }
export interface AtlasLive { now: number; today: number; week: number; countries?: { country: string; n: number }[]; points: { lat?: number | null; lon?: number | null; city?: string | null; country?: string | null; at: string; path?: string | null; live?: boolean }[] }

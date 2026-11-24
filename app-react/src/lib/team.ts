import { supabase } from './supabase';

/* The partners of a store (« associés »): people who manage it with its owner, each with her own e-mail. An
   invitation is a row of store_invites (mode « editor »); it becomes a membership the next time that address
   logs in (the server does it: accept_store_invites). */

export interface Member { user_id: string; email: string; first_name: string; role: string; added_at: string }
export interface Invite { id: string; email: string; created_at: string }
export interface Live { ok: boolean; reason?: string; now?: number; today?: number; week?: number; countries?: { country: string; n: number }[]; points?: { lat?: number | null; lon?: number | null; city?: string | null; country?: string | null; at?: string | null; live?: boolean }[] }

export async function listTeam(storeId: string): Promise<{ members: Member[]; invites: Invite[] } | null> {
  const sb = supabase();
  const [team, inv] = await Promise.all([
    sb.rpc('store_team', { p_store: storeId }),
    sb.from('store_invites').select('id, email, created_at').eq('store_id', storeId).eq('mode', 'editor').is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  if (team.error || inv.error) return null;
  return { members: (Array.isArray(team.data) ? team.data : []) as Member[], invites: (inv.data ?? []) as Invite[] };
}
export async function invitePartner(storeId: string, email: string): Promise<Invite | null> {
  const { data, error } = await supabase().from('store_invites').insert({ store_id: storeId, email, mode: 'editor' }).select('id, email, created_at');
  return error ? null : ((data ?? [])[0] as Invite | undefined) ?? null;
}
export async function cancelInvite(id: string): Promise<boolean> {
  return !(await supabase().from('store_invites').delete().eq('id', id)).error;
}
/** The owner removes a partner, or a partner leaves (her own line). */
export async function removeMember(storeId: string, userId: string): Promise<boolean> {
  return !(await supabase().from('store_members').delete().eq('store_id', storeId).eq('user_id', userId)).error;
}
/** Who is on the store right now (Pro and Business plans). */
export async function liveVisits(storeId: string): Promise<Live | null> {
  const { data, error } = await supabase().rpc('store_visits_live', { p_store: storeId });
  return error || !data ? null : (data as Live);
}
/** The visitors of The Ivory Sukundu (its own site: its visits are kept under its name). The server lets in the
 *  founder and its partners only. */
export async function tisheVisits(): Promise<Live | null> {
  const { data, error } = await supabase().rpc('site_visits_live', { p_site: 'the-ivory-sukundu' });
  return error || !data ? null : (data as Live);
}

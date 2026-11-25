import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { installMirror } from './mirror';

/* The same Supabase project as the current site, with its publishable key (safe in a browser: the rules of each
   table decide what a visitor may read). The session is kept where supabase-js already keeps it for the current
   site ('sb-<project>-auth-token' in localStorage), so a seller who is logged in stays logged in. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    // a tab Atlas opened on a client's account keeps her session apart and writes nothing (./mirror.ts)
    installMirror(SUPABASE_URL);
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

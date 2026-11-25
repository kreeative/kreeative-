import { isMirror, takeMirrorToken } from './mirror';
import { supabase } from './supabase';

/** In a mirror tab: signs in as the client with the one-time token Atlas handed over (once), then says whether her
 *  session is there. Outside a mirror tab: null, nothing done. */
export async function mirrorSignIn(): Promise<boolean | null> {
  const sb = supabase();          // turns this tab into the mirror when Atlas opened it so (./mirror.ts)
  if (!isMirror()) return null;
  const t = takeMirrorToken();
  if (t) {
    const { error } = await sb.auth.verifyOtp({ token_hash: t, type: 'magiclink' });
    if (error) return false;
  }
  const { data } = await sb.auth.getSession();
  return !!data.session;
}

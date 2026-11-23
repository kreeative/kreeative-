import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/* Sign-up and login with a one-time code sent by e-mail (Supabase Auth). There is no password on Jehre:
   nothing to forget, nothing to reset. The same e-mail carries a link that also opens the session. */

export type AuthFailure = { ok: false; kind: 'no-account' | 'network' | 'rate' | 'code' | 'email' | 'other'; text: string };
export type AuthResult<T = object> = ({ ok: true } & T) | AuthFailure;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validEmail = (v: string): boolean => EMAIL_RE.test(v.trim());
export const normEmail = (v: string): string => v.trim().toLowerCase();

/** A phone number as typed (« 07 07 12 34 56 », « +225 07… ») → +2250707123456, or '' when it is not one. */
export function normPhone(raw: string, country = '+225'): string {
  const s = raw.replace(/[^\d+]/g, '');
  if (!s) return '';
  const full = s.startsWith('+') ? s : s.startsWith('00') ? `+${s.slice(2)}` : `${country}${s}`;
  return /^\+\d{8,15}$/.test(full) ? full : '';
}

function failure(err: unknown): AuthFailure {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number; name?: string };
  const msg = String(e.message ?? '');
  const code = String(e.code ?? '');
  if (code === 'otp_disabled' || /signups not allowed for otp|user not found/i.test(msg)) {
    return { ok: false, kind: 'no-account', text: 'Aucun compte avec cette adresse.' };
  }
  if (e.status === 429 || code === 'over_email_send_rate_limit' || /rate limit|too many|security purposes/i.test(msg)) {
    return { ok: false, kind: 'rate', text: 'Trop de demandes en peu de temps. Patientez une minute, puis réessayez.' };
  }
  if (code === 'otp_expired' || /expired|invalid.*(token|otp)|token.*invalid/i.test(msg)) {
    return { ok: false, kind: 'code', text: 'Ce code n’est pas le bon, ou il a expiré. Vérifiez-le ou demandez-en un nouveau.' };
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) {
    return { ok: false, kind: 'email', text: 'Cette adresse e-mail ne semble pas valide.' };
  }
  if (e.name === 'AuthRetryableFetchError' || /failed to fetch|fetch failed|networkerror|load failed|timed out/i.test(msg)) {
    return { ok: false, kind: 'network', text: 'Pas de connexion avec Jehre. Vérifiez votre connexion Internet, puis réessayez.' };
  }
  return { ok: false, kind: 'other', text: 'Quelque chose n’a pas marché. Réessayez dans un instant.' };
}

export interface SendCodeInput { email: string; create: boolean; firstName?: string; source?: string }

export async function sendCode(input: SendCodeInput): Promise<AuthResult> {
  try {
    const data: Record<string, string> = {};
    if (input.create && input.firstName) data.first_name = input.firstName;
    if (input.create && input.source) data.source = input.source;
    const { error } = await supabase().auth.signInWithOtp({
      email: normEmail(input.email),
      options: {
        shouldCreateUser: input.create,
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        ...(Object.keys(data).length ? { data } : {}),
      },
    });
    return error ? failure(error) : { ok: true };
  } catch (err) { return failure(err); }
}

export async function verifyCode(email: string, token: string): Promise<AuthResult<{ user: User }>> {
  try {
    const { data, error } = await supabase().auth.verifyOtp({ email: normEmail(email), token: token.trim(), type: 'email' });
    if (error) return failure(error);
    if (!data.user) return failure({ message: 'invalid token' });
    return { ok: true, user: data.user };
  } catch (err) { return failure(err); }
}

/** The user of the open session, or null. */
export async function currentUser(): Promise<User | null> {
  try {
    const { data } = await supabase().auth.getSession();
    return data.session?.user ?? null;
  } catch { return null; }
}

/** j•••@exemple.com */
export function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(3, Math.min(6, name.length - 1)))}@${domain}`;
}

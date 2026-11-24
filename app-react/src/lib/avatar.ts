/* The face of an account: one of Jehre's five hand-drawn faces, in place of a bare initial. Each account gets one
   from the start (always the same for the same account); she can pick another on her account page. Her choice is
   kept on this device (`jehre-avatar`): no table is changed for it. */

export const AVATARS = [1, 2, 3, 4, 5].map((n) => ({ id: String(n), src: `/avatars/${n}.webp` }));
const KEY = 'jehre-avatar';

/** The face given to an account before she chooses: drawn from her id, so it never changes by itself. */
function first(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length]!.id;
}
export function avatarId(userId: string): string {
  let kept: string | null = null;
  try { kept = window.localStorage.getItem(KEY); } catch { /* storage blocked: the first face */ }
  return AVATARS.some((a) => a.id === kept) ? kept! : first(userId);
}
export const avatarSrc = (id: string): string => (AVATARS.find((a) => a.id === id) ?? AVATARS[0]!).src;
export function keepAvatar(id: string): void {
  try { window.localStorage.setItem(KEY, id); } catch { /* not kept */ }
}

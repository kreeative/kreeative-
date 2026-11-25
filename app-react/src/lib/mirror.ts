/* The mirror: Atlas opens a client's dashboard, exactly as she sees it, in a tab of its own.

   Atlas asks the server (atlas function, action « mirror ») for a one-time sign-in to her account and opens
   /admin/#miroir=<token>… in a new tab. That tab, and only that tab:
   - keeps everything it stores apart from the admin's own (`localStorage` is replaced by a copy kept in this tab's
     sessionStorage), so the admin's session, account and drafts are never touched, and closing the tab ends it;
   - signs in as her with the token (mirrorSignIn, once);
   - lets nothing be written: every request that would change something is answered « read only » here, before it
     leaves the browser. An admin (canEdit, decided by the server) may switch editing on, in that tab only.
   Some requests are refused even then: accepting her pending invitations, signing her out everywhere, changing her
   e-mail or password, push notifications, Atlas itself. */

export interface MirrorInfo { email: string; name: string; canEdit: boolean; edit: boolean; at: string }

const INFO = 'jehre-mirror';
const TOKEN = 'jehre-mirror-token';
const PREFIX = 'jehre-mirror:';
export const MIRROR_BLOCKED = 'jehre:mirror-blocked';
export const MIRROR_CHANGED = 'jehre:mirror';

const ss = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; } };

export function mirrorInfo(): MirrorInfo | null {
  const s = ss(); if (!s) return null;
  try {
    const o = JSON.parse(s.getItem(INFO) || 'null') as Partial<MirrorInfo> | null;
    return o && typeof o.email === 'string' ? { email: o.email, name: String(o.name ?? ''), canEdit: o.canEdit === true, edit: o.canEdit === true && o.edit === true, at: String(o.at ?? '') } : null;
  } catch { return null; }
}
export const isMirror = (): boolean => !!mirrorInfo();

export function setMirrorEdit(on: boolean): void {
  const s = ss(), m = mirrorInfo(); if (!s || !m) return;
  s.setItem(INFO, JSON.stringify({ ...m, edit: on && m.canEdit }));
  window.dispatchEvent(new Event(MIRROR_CHANGED));
}

/** Ends the mirror: this tab forgets her session and everything it kept, then closes (or goes back to Atlas). */
export function endMirror(): void {
  const s = ss();
  if (s) {
    for (let i = s.length - 1; i >= 0; i--) { const k = s.key(i); if (k && (k.startsWith(PREFIX) || k === INFO || k === TOKEN)) s.removeItem(k); }
  }
  window.close();
  window.setTimeout(() => window.location.replace('/atlas/'), 150);
}

/** The token handed by Atlas, taken once by the sign-in. */
export function takeMirrorToken(): string {
  const s = ss(); if (!s) return '';
  const t = s.getItem(TOKEN) || '';
  s.removeItem(TOKEN);
  return t;
}

/* ---------------------------------------------------------------- this tab's own storage */

class TabStorage implements Storage {
  constructor(private readonly s: Storage) {}
  private keys(): string[] { const out: string[] = []; for (let i = 0; i < this.s.length; i++) { const k = this.s.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } return out; }
  get length(): number { return this.keys().length; }
  key(i: number): string | null { return this.keys()[i] ?? null; }
  getItem(k: string): string | null { return this.s.getItem(PREFIX + k); }
  setItem(k: string, v: string): void { this.s.setItem(PREFIX + k, String(v)); }
  removeItem(k: string): void { this.s.removeItem(PREFIX + k); }
  clear(): void { this.keys().forEach((k) => this.s.removeItem(PREFIX + k)); }
}

/* ---------------------------------------------------------------- what may leave this tab */

const READ_RPC = new Set(['my_models', 'my_stores', 'my_ext_stores', 'store_team', 'store_visits_live', 'site_visits_live', 'slug_available', 'launch_spots', 'my_projects']);
const READ_ACTIONS: Record<string, string[]> = {
  bookings: ['list', 'clients', 'settings', 'config', 'slots', 'get'],
  payments: ['status'],
  billing: ['status', 'whoami'],
};
const NEVER_FUNCTIONS = new Set(['atlas', 'push', 'handoff', 'appel', 'relances']);

type Verdict = 'read' | 'write' | 'never';
function verdict(url: URL, method: string, body: unknown): Verdict {
  const p = url.pathname;
  if (p.startsWith('/auth/v1/')) {
    if (p === '/auth/v1/token' || p === '/auth/v1/verify') return 'read';
    if (p === '/auth/v1/user' && method === 'GET') return 'read';
    return 'never';                                       // logout, a new e-mail or password, codes, recovery
  }
  if (p.startsWith('/rest/v1/rpc/')) {
    const name = p.slice('/rest/v1/rpc/'.length);
    if (name === 'accept_store_invites') return 'never';
    return READ_RPC.has(name) ? 'read' : 'write';
  }
  if (p.startsWith('/rest/v1/') || p.startsWith('/storage/v1/')) return method === 'GET' || method === 'HEAD' ? 'read' : 'write';
  if (p.startsWith('/functions/v1/')) {
    const fn = p.slice('/functions/v1/'.length).split('/')[0] ?? '';
    if (NEVER_FUNCTIONS.has(fn)) return 'never';
    let action = '';
    try { action = String((JSON.parse(typeof body === 'string' ? body : '{}') as { action?: unknown }).action ?? ''); } catch { action = ''; }
    return (READ_ACTIONS[fn] ?? []).includes(action) ? 'read' : 'write';
  }
  return method === 'GET' || method === 'HEAD' ? 'read' : 'write';
}

function refuse(never: boolean): Response {
  window.dispatchEvent(new CustomEvent(MIRROR_BLOCKED, { detail: { never } }));
  const message = never ? 'Le miroir ne fait jamais ça à sa place.' : 'Miroir en lecture seule : rien n’a été modifié.';
  return new Response(JSON.stringify({ ok: false, code: 'mirror', message, error: message }), { status: 403, headers: { 'Content-Type': 'application/json' } });
}

let installed = false;
/** Turns this tab into the mirror when Atlas opened it so (or it already is one). Called before any session is read. */
export function installMirror(supabaseUrl: string): void {
  if (installed || typeof window === 'undefined') return;
  const s = ss(); if (!s) return;
  // Atlas hands over: /admin/#miroir=<token>&m=<email>&n=<name>&e=<1|0>; the address loses it at once
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const tok = h.get('miroir');
  if (tok && /^[A-Za-z0-9_-]{10,200}$/.test(tok)) {
    for (let i = s.length - 1; i >= 0; i--) { const k = s.key(i); if (k && k.startsWith(PREFIX)) s.removeItem(k); }
    s.setItem(TOKEN, tok);
    s.setItem(INFO, JSON.stringify({ email: (h.get('m') || '').slice(0, 200), name: (h.get('n') || '').slice(0, 60), canEdit: h.get('e') === '1', edit: false, at: new Date().toISOString() }));
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the hash stays */ }
  }
  if (!mirrorInfo()) return;
  installed = true;
  const store = new TabStorage(s);
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => store }); } catch { /* an old browser: the mirror still guards what is sent */ }
  const host = new URL(supabaseUrl).host;
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href); } catch { return real(input, init); }
    if (url.host !== host) return real(input, init);
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const v = verdict(url, method, init?.body);
    if (v === 'read') return real(input, init);
    if (v === 'never') return Promise.resolve(refuse(true));
    return mirrorInfo()?.edit ? real(input, init) : Promise.resolve(refuse(false));
  };
}

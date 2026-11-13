// Jeere — Edge Function `bookings` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk).
//
// Appointments for service businesses (lashes, nails, hair…): what `orders` is to a shop. A store's services, team,
// hours and rules live in public.booking_settings; its appointments in public.appointments. Nothing here is readable
// or writable from a browser except through this function.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/bookings
//   headers: apikey: <publishable key>[, Authorization: Bearer <session> for the store's managers]
//
//   Anyone (a client, on the store's site — connect/jeere-booking.js):
//     { action: 'config', slug }                                        → the services, add-ons, team, hours, policies
//     { action: 'slots', slug, serviceId, addons?, staffId?, from, days } → { days: { '2026-11-20': [{ t, start, staff }] } }
//     { action: 'book', slug, serviceId, addons?, staffId?, start, customer: { name, phone, email }, note, payment, site }
//                                                                       → { number, token, … } (e-mails sent)
//     { action: 'get', token }                                          → her appointment
//     { action: 'cancel', token }  { action: 'reschedule', token, start, staffId? }   (until `cancelWindow` hours before)
//   The store's managers (session):
//     { action: 'settings', storeId }  { action: 'save', storeId, settings }
//     { action: 'list', storeId, from, to }          → appointments and blocks of the period
//     { action: 'create', storeId, serviceId, addons?, staffId, start, customer, note }   (a booking taken by phone)
//     { action: 'status', id, status }  { action: 'deposit', id, depositStatus }  { action: 'memo', id, memo }
//     { action: 'move', id, start, staffId? }
//     { action: 'block', storeId, staffId?, from, to, reason }  { action: 'unblock', id }
//     { action: 'clients', storeId }                 → her clients, from the appointments
//   pg_cron, every hour (header x-jeere-cron = public.jeere_cron.secret):
//     { action: 'remind' }                           → the reminder e-mail, the day before
//
// Every time is checked HERE against her hours, her breaks, her blocks and the other appointments, in her time zone;
// the database then refuses any overlap (exclusion constraint), so two clients can never get the same slot.
// Prices and deposits are recomputed here from her settings: the browser only says which service and when.
// Amounts are saved in the currency's smallest unit, like orders. E-mails go through Resend, as in `orders`.
// Deployed with verify_jwt = false (the publishable key is not a JWT): sessions are checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS = Deno.env.get('BOOKINGS_FROM') ?? Deno.env.get('ORDERS_FROM') ?? 'commandes@kreeative.xyz';
const SITE = (Deno.env.get('JEERE_SITE') ?? 'https://jeere.kreeative.xyz').replace(/\/$/, '');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').trim().slice(0, n) : '');
const int = (v: unknown, min: number, max: number, d = 0) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9_-]{1,24}$/;
const DAY = 86400000;

const CURRENCIES: Record<string, { short: string; minor: number }> = { XOF: { short: 'FCFA', minor: 1 }, CAD: { short: '$ CA', minor: 100 }, USD: { short: '$ US', minor: 100 }, EUR: { short: '€', minor: 100 } };
const currencyOf = (fiche: unknown) => {
  const st = isObj(fiche) && isObj((fiche as Obj).store) ? (fiche as Obj).store as Obj : {};
  const c = typeof st.currency === 'string' ? st.currency.toUpperCase() : '';
  return c in CURRENCIES ? c : 'XOF';
};
const curInfo = (c: unknown) => CURRENCIES[typeof c === 'string' && c.toUpperCase() in CURRENCIES ? c.toUpperCase() : 'XOF'];
const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const money = (n: number, cur?: unknown) => {
  const c = curInfo(cur);
  const x = Math.round(Number(n) || 0);
  if (c.minor === 1) return group(x) + ' ' + c.short;
  const a = Math.abs(x), whole = Math.floor(a / c.minor), cents = a % c.minor;
  return (x < 0 ? '-' : '') + group(whole) + (cents ? ',' + String(cents).padStart(2, '0') : '') + ' ' + c.short;
};

/* ------------------------------------------------------------------ her settings, cleaned */
type Hours = { open: boolean; from: string; to: string; breaks: { from: string; to: string }[] };
type Service = { id: string; name: string; category: string; duration: number; price: number; from: boolean; deposit: number | null; desc: string; photo: string; active: boolean; staff: string[] };
type Addon = { id: string; name: string; duration: number; price: number; active: boolean };
type Staff = { id: string; name: string; role: string; photo: string; active: boolean; hours: Hours[] | null };
type Settings = {
  enabled: boolean; timezone: string; step: number; lead: number; horizon: number; buffer: number; autoConfirm: boolean; cancelWindow: number;
  deposit: { mode: 'none' | 'fixed' | 'percent'; value: number };
  policies: { deposit: string; late: string; cancel: string; payment: string; prep: string };
  intro: string; address: string; mapUrl: string; hours: Hours[]; services: Service[]; addons: Addon[]; staff: Staff[]; payments: string[];
};
export const PAYS = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Sur place', 'Carte bancaire'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const hhmm = (v: unknown, d: string) => (typeof v === 'string' && HHMM.test(v) ? v : d);
const price = (v: unknown) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.min(n, 1e8) : 0; };
const httpsUrl = (v: unknown, n = 400) => { const s = str(v, n); return /^https:\/\/[^\s"'<>\\]+$/i.test(s) ? s : ''; };
function validTz(v: unknown) {
  const s = str(v, 60);
  try { if (s) { new Intl.DateTimeFormat('en-US', { timeZone: s }); return s; } } catch { /* unknown zone */ }
  return 'Africa/Abidjan';
}
function cleanHours(v: unknown): Hours[] {
  const a = arr(v);
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const h = isObj(a[d]) ? a[d] as Obj : {};
    const def = d === 0 ? { open: false, from: '09:00', to: '18:00' } : (d === 6 ? { open: true, from: '10:00', to: '18:00' } : { open: true, from: '09:00', to: '18:00' });
    let from = hhmm(h.from, def.from), to = hhmm(h.to, def.to);
    if (toMin(to) <= toMin(from)) { from = def.from; to = def.to; }
    const breaks = arr(h.breaks).filter(isObj).slice(0, 3).map((b) => ({ from: hhmm((b as Obj).from, ''), to: hhmm((b as Obj).to, '') }))
      .filter((b) => b.from && b.to && toMin(b.to) > toMin(b.from));
    return { open: typeof h.open === 'boolean' ? h.open : def.open, from, to, breaks };
  });
}
function cleanSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const ids = new Set<string>();
  const freshId = (v: unknown, p: string) => {
    let id = typeof v === 'string' && ID.test(v) && !ids.has(v) ? v : '';
    for (let i = 1; !id; i++) { const c = p + i; if (!ids.has(c)) id = c; }
    ids.add(id); return id;
  };
  const staff: Staff[] = arr(r.staff).filter(isObj).slice(0, 12).map((x) => {
    const s = x as Obj;
    return { id: freshId(s.id, 'e'), name: str(s.name, 40) || 'Équipe', role: str(s.role, 60), photo: httpsUrl(s.photo), active: s.active !== false, hours: Array.isArray(s.hours) ? cleanHours(s.hours) : null };
  });
  const staffIds = staff.map((s) => s.id);
  const services: Service[] = arr(r.services).filter(isObj).slice(0, 80).map((x) => {
    const s = x as Obj;
    return {
      id: freshId(s.id, 's'), name: str(s.name, 80) || 'Prestation', category: str(s.category, 40), duration: int(s.duration, 5, 720, 60), price: price(s.price), from: s.from === true,
      deposit: s.deposit === null || s.deposit === undefined || s.deposit === '' ? null : price(s.deposit), desc: text(s.desc, 400), photo: httpsUrl(s.photo), active: s.active !== false,
      staff: arr(s.staff).filter((i): i is string => typeof i === 'string' && staffIds.includes(i))
    };
  });
  const addons: Addon[] = arr(r.addons).filter(isObj).slice(0, 40).map((x) => {
    const s = x as Obj;
    return { id: freshId(s.id, 'a'), name: str(s.name, 80) || 'Option', duration: int(s.duration, 0, 240, 0), price: price(s.price), active: s.active !== false };
  });
  const dep = isObj(r.deposit) ? r.deposit : {};
  const mode = dep.mode === 'fixed' || dep.mode === 'percent' ? dep.mode : 'none';
  const pol = isObj(r.policies) ? r.policies : {};
  const pays = arr(r.payments).filter((p): p is string => typeof p === 'string' && PAYS.includes(p));
  return {
    enabled: r.enabled !== false && services.some((s) => s.active),
    timezone: validTz(r.timezone),
    step: [10, 15, 20, 30, 45, 60].includes(Number(r.step)) ? Number(r.step) : 30,
    lead: int(r.lead, 0, 20160, 120), horizon: int(r.horizon, 1, 365, 60), buffer: int(r.buffer, 0, 120, 0),
    autoConfirm: r.autoConfirm !== false, cancelWindow: int(r.cancelWindow, 0, 336, 24),
    deposit: { mode, value: mode === 'percent' ? int(dep.value, 1, 100, 30) : price(dep.value) },
    policies: { deposit: text(pol.deposit, 600), late: text(pol.late, 600), cancel: text(pol.cancel, 600), payment: text(pol.payment, 600), prep: text(pol.prep, 600) },
    intro: text(r.intro, 600), address: str(r.address, 200), mapUrl: httpsUrl(r.mapUrl),
    hours: cleanHours(r.hours), services, addons, staff, payments: pays.length ? pays : ['Sur place']
  };
}

/* ------------------------------------------------------------------ time zones */
function partsOf(tz: string, ms: number) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p: Record<string, number> = {};
  f.formatToParts(new Date(ms)).forEach((x) => { if (x.type !== 'literal') p[x.type] = Number(x.value); });
  return p;
}
const offsetMin = (tz: string, ms: number) => { const p = partsOf(tz, ms); return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms) / 60000); };
// A wall time of her zone (2026-11-20, 14:30) → the instant
function localToUtc(tz: string, y: number, m: number, d: number, minutes: number) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const off = offsetMin(tz, guess);
  let t = guess - off * 60000;
  const off2 = offsetMin(tz, t);
  if (off2 !== off) t = guess - off2 * 60000;
  return t;
}
const pad = (n: number) => String(n).padStart(2, '0');
function localDate(tz: string, ms: number) { const p = partsOf(tz, ms); return { date: p.year + '-' + pad(p.month) + '-' + pad(p.day), minutes: p.hour * 60 + p.minute }; }
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
function addDays(date: string, n: number) { const m = DATE.exec(date)!; const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
const frDate = (tz: string, ms: number) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
const frTime = (tz: string, ms: number) => { const p = partsOf(tz, ms); return p.hour + ' h' + (p.minute ? ' ' + pad(p.minute) : ''); };
const frDuration = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + pad(m) : '') : m + ' min'; };

/* ------------------------------------------------------------------ data */
const admin = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) }
});
async function rows(path: string) { const r = await admin(path); return r.ok ? await r.json() as Obj[] : []; }
const STORE_COLS = 'id,slug,owner,fiche,notifications,contact_email,custom_domain,published';
async function storeBySlug(slug: string) { return /^[a-z0-9-]{3,40}$/.test(slug) ? (await rows('stores?select=' + STORE_COLS + '&published=is.true&slug=eq.' + slug))[0] : undefined; }
async function storeById(id: string) { return UUID.test(id) ? (await rows('stores?select=' + STORE_COLS + '&id=eq.' + id))[0] : undefined; }
async function settingsOf(storeId: unknown): Promise<{ S: Settings; has: boolean }> {
  const r = (await rows('booking_settings?select=settings&store_id=eq.' + storeId))[0];
  return { S: cleanSettings(r ? r.settings : {}), has: !!r && isObj(r.settings) && Object.keys(r.settings as Obj).length > 0 };
}
const storeInfo = (st: Obj) => {
  const f = isObj(st.fiche) ? st.fiche : {};
  const s = isObj(f.store) ? f.store as Obj : {};
  return { name: str(s.name, 80) || str(st.slug, 40), whatsapp: str(s.whatsapp, 30), logo: httpsUrl(s.logo), currency: currencyOf(f) };
};
async function userOf(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth) || auth.includes(PUBLISHABLE)) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && typeof u.id === 'string' ? { id: u.id, email: String(u.email ?? '') } : null;
}
async function canManage(store: Obj, userId: string) {
  if (store.owner === userId) return true;
  const m = await rows('store_members?select=user_id&store_id=eq.' + store.id + '&user_id=eq.' + userId);
  return m.length > 0;
}
async function ownerEmail(store: Obj) {
  if (typeof store.contact_email === 'string' && store.contact_email) return store.contact_email;
  if (typeof store.owner !== 'string') return '';
  const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + store.owner, { headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } });
  if (!r.ok) return '';
  const u = await r.json();
  return String(u.email ?? '');
}
async function notify(storeId: unknown, title: string, body: string, url: string, tag: string) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    await fetch(SUPABASE_URL + '/functions/v1/push', { method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE, 'x-jeere-internal': SECRET },
      body: JSON.stringify({ action: 'notify', storeId: String(storeId ?? ''), title, body, url, tag }) }).catch(() => null);
    clearTimeout(t);
  } catch { /* a notification is a bonus */ }
}

/* ------------------------------------------------------------------ the free slots */
type Busy = { staff: string; s: number; e: number; id?: string };
const teamOf = (S: Settings, info: { name: string }): Staff[] => {
  const on = S.staff.filter((s) => s.active);
  return on.length ? on : [{ id: 'e1', name: info.name, role: '', photo: '', active: true, hours: null }];
};
const eligible = (S: Settings, team: Staff[], svc: Service) => { const who = svc.staff.filter((id) => team.some((t) => t.id === id)); return who.length ? team.filter((t) => who.includes(t.id)) : team; };
async function busyOf(storeId: unknown, fromMs: number, toMs: number): Promise<Busy[]> {
  const a = new Date(fromMs).toISOString(), b = new Date(toMs).toISOString();
  const [ap, bl] = await Promise.all([
    rows('appointments?select=id,staff_id,starts_at,busy_until&store_id=eq.' + storeId + '&status=neq.annule&starts_at=lt.' + encodeURIComponent(b) + '&busy_until=gt.' + encodeURIComponent(a) + '&limit=2000'),
    rows('booking_blocks?select=staff_id,starts_at,ends_at&store_id=eq.' + storeId + '&starts_at=lt.' + encodeURIComponent(b) + '&ends_at=gt.' + encodeURIComponent(a) + '&limit=500')
  ]);
  const a1: Busy[] = ap.map((x) => ({ staff: String(x.staff_id), s: Date.parse(String(x.starts_at)), e: Date.parse(String(x.busy_until)), id: String(x.id) }));
  const b1: Busy[] = bl.map((x) => ({ staff: String(x.staff_id ?? ''), s: Date.parse(String(x.starts_at)), e: Date.parse(String(x.ends_at)) }));
  return a1.concat(b1);
}
// The times of one day (her zone) where `dur` minutes fit, for the people given
function daySlots(S: Settings, who: Staff[], date: string, dur: number, busy: Busy[], now: number, skipId = '') {
  const m = DATE.exec(date); if (!m) return [];
  const y = +m[1], mo = +m[2], d = +m[3];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const out = new Map<string, { t: string; start: number; staff: string[] }>();
  for (const p of who) {
    const h = (p.hours ?? S.hours)[dow];
    if (!h || !h.open) continue;
    const open = toMin(h.from), close = toMin(h.to);
    for (let t = open; t + dur <= close; t += S.step) {
      if (h.breaks.some((b) => t < toMin(b.to) && t + dur > toMin(b.from))) continue;
      const start = localToUtc(S.timezone, y, mo, d, t);
      if (start < now + S.lead * 60000 || start > now + S.horizon * DAY) continue;
      const end = start + dur * 60000, until = end + S.buffer * 60000;
      if (busy.some((b) => (b.staff === p.id || b.staff === '') && b.id !== skipId && start < b.e && until > b.s)) continue;
      const key = pad(Math.floor(t / 60)) + ':' + pad(t % 60);
      const cur = out.get(key);
      if (cur) cur.staff.push(p.id); else out.set(key, { t: key, start, staff: [p.id] });
    }
  }
  return [...out.values()].sort((a, b) => a.start - b.start);
}
// What she asked for, priced from the settings (smallest unit of the currency)
function pick(S: Settings, cur: string, serviceId: unknown, addonIds: unknown) {
  const svc = S.services.find((s) => s.active && s.id === serviceId);
  if (!svc) return null;
  const k = CURRENCIES[cur].minor;
  const minor = (v: number) => Math.round(v * k);
  const adds = arr(addonIds).slice(0, 10).map((id) => S.addons.find((a) => a.active && a.id === id)).filter((a): a is Addon => !!a);
  const uniq = adds.filter((a, i) => adds.indexOf(a) === i);
  const duration = svc.duration + uniq.reduce((n, a) => n + a.duration, 0);
  const total = minor(svc.price) + uniq.reduce((n, a) => n + minor(a.price), 0);
  let deposit = 0;
  if (svc.deposit !== null) deposit = minor(svc.deposit);
  else if (S.deposit.mode === 'fixed') deposit = minor(S.deposit.value);
  else if (S.deposit.mode === 'percent') deposit = Math.round(total * S.deposit.value / 100);
  deposit = Math.max(0, Math.min(deposit, total));
  const snapshot = { id: svc.id, name: svc.name, category: svc.category, duration, price: minor(svc.price), from: svc.from, addons: uniq.map((a) => ({ id: a.id, name: a.name, duration: a.duration, price: minor(a.price) })) };
  return { svc, duration, total, deposit, snapshot, k };
}

/* ------------------------------------------------------------------ e-mails */
const KINDS = ['rdv_confirmation', 'rdv_demande', 'rdv_nouveau', 'rdv_confirme', 'rdv_rappel', 'rdv_deplace', 'rdv_annule'] as const;
type Kind = typeof KINDS[number];
const MAILS: Record<Kind, { to: 'client' | 'boutique'; subject: string; body: string }> = {
  rdv_confirmation: { to: 'client', subject: 'Votre rendez-vous du {{rdv.date}} chez {{boutique.nom}}',
    body: 'Bonjour {{client.prenom}},\n\nVotre rendez-vous est confirmé.\n\n{{rdv.resume}}\n\n{{rdv.acompte_texte}}{{rdv.adresse_texte}}Pour déplacer ou annuler votre rendez-vous : {{rdv.lien}}\n\nÀ très vite,\n{{boutique.nom}}' },
  rdv_demande: { to: 'client', subject: 'Votre demande de rendez-vous chez {{boutique.nom}}',
    body: 'Bonjour {{client.prenom}},\n\nNous avons bien reçu votre demande. Nous vous confirmons le rendez-vous très vite.\n\n{{rdv.resume}}\n\n{{rdv.acompte_texte}}Suivre votre demande : {{rdv.lien}}\n\n{{boutique.nom}}' },
  rdv_nouveau: { to: 'boutique', subject: 'Nouveau rendez-vous n° {{rdv.numero}} · {{rdv.date_courte}} à {{rdv.heure}}',
    body: 'Nouveau rendez-vous de {{client.nom}} ({{client.telephone}}).\n\n{{rdv.resume}}\n\nAcompte : {{rdv.acompte}}\nPaiement : {{paiement}}\nNote : {{rdv.note}}\n\nRetrouvez-le dans votre agenda Jeere.' },
  rdv_confirme: { to: 'client', subject: 'Rendez-vous confirmé : {{rdv.date}} à {{rdv.heure}}',
    body: 'Bonjour {{client.prenom}},\n\nBonne nouvelle : votre rendez-vous est confirmé.\n\n{{rdv.resume}}\n\n{{rdv.adresse_texte}}Pour le déplacer ou l’annuler : {{rdv.lien}}\n\n{{boutique.nom}}' },
  rdv_rappel: { to: 'client', subject: 'Rappel : votre rendez-vous de demain à {{rdv.heure}}',
    body: 'Bonjour {{client.prenom}},\n\nUn petit rappel : nous vous attendons {{rdv.date}} à {{rdv.heure}}.\n\n{{rdv.resume}}\n\n{{rdv.prep_texte}}{{rdv.adresse_texte}}Un empêchement ? {{rdv.lien}}\n\n{{boutique.nom}}' },
  rdv_deplace: { to: 'client', subject: 'Votre rendez-vous est déplacé au {{rdv.date}} à {{rdv.heure}}',
    body: 'Bonjour {{client.prenom}},\n\nVotre rendez-vous a changé d’horaire.\n\n{{rdv.resume}}\n\nGérer votre rendez-vous : {{rdv.lien}}\n\n{{boutique.nom}}' },
  rdv_annule: { to: 'client', subject: 'Votre rendez-vous du {{rdv.date}} est annulé',
    body: 'Bonjour {{client.prenom}},\n\nVotre rendez-vous n° {{rdv.numero}} du {{rdv.date}} à {{rdv.heure}} est annulé. Pour en prendre un autre, répondez à cet e-mail ou retournez sur notre site.\n\n{{boutique.nom}}' }
};
function mailVars(st: Obj, S: Settings, a: Obj) {
  const info = storeInfo(st);
  const c = isObj(a.customer) ? a.customer : {};
  const svc = isObj(a.service) ? a.service : {};
  const start = Date.parse(String(a.starts_at));
  const name = str(c.name, 80);
  const adds = arr(svc.addons).filter(isObj).map((x) => str((x as Obj).name, 80)).filter(Boolean);
  const staffName = (S.staff.find((s) => s.id === a.staff_id) || { name: '' }).name;
  const dep = Number(a.deposit) || 0;
  const resume = [
    '• ' + str(svc.name, 80) + (adds.length ? ' + ' + adds.join(', ') : ''),
    '• ' + frDate(S.timezone, start) + ' à ' + frTime(S.timezone, start) + ' (' + frDuration(Number(svc.duration) || 0) + ')',
    staffName && S.staff.filter((s) => s.active).length > 1 ? '• Avec ' + staffName : '',
    '• ' + (svc.from ? 'À partir de ' : '') + money(Number(a.total) || 0, a.currency)
  ].filter(Boolean).join('\n');
  return {
    'boutique.nom': info.name, 'boutique.whatsapp': info.whatsapp,
    'client.nom': name, 'client.prenom': name.split(' ')[0] || name, 'client.telephone': str(c.phone, 30), 'client.email': str(c.email, 120),
    'rdv.numero': '#' + a.number, 'rdv.prestation': str(svc.name, 80), 'rdv.date': frDate(S.timezone, start),
    'rdv.date_courte': new Intl.DateTimeFormat('fr-FR', { timeZone: S.timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(start)),
    'rdv.heure': frTime(S.timezone, start), 'rdv.duree': frDuration(Number(svc.duration) || 0), 'rdv.prix': money(Number(a.total) || 0, a.currency),
    'rdv.acompte': dep ? money(dep, a.currency) + (a.deposit_status === 'recu' ? ' (reçu)' : ' (à régler)') : 'aucun',
    'rdv.acompte_texte': dep && a.deposit_status !== 'recu' ? 'Acompte à régler pour bloquer votre créneau : ' + money(dep, a.currency) + (a.payment ? ' (' + a.payment + ')' : '') + '.' + (S.policies.deposit ? ' ' + S.policies.deposit : '') + '\n\n' : '',
    'rdv.adresse_texte': S.address ? 'Adresse : ' + S.address + '\n\n' : '',
    'rdv.prep_texte': S.policies.prep ? 'Avant de venir : ' + S.policies.prep + '\n\n' : '',
    'rdv.resume': resume, 'rdv.note': str(a.note, 1000) || '—', 'rdv.lien': str(a.manage_url, 400) || SITE,
    'paiement': str(a.payment, 40) || 'sur place'
  } as Record<string, string>;
}
const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m));
function accentOf(store: Obj) {
  const f = isObj(store.fiche) ? store.fiche : {};
  const th = isObj(f.theme) ? f.theme as Obj : {};
  const a = str(th.accent, 9) || str((th.colors as Obj | undefined)?.accent, 9);
  return /^#[0-9a-f]{6}$/i.test(a) ? a : '#111111';
}
function htmlMail(store: Obj, subject: string, body: string) {
  const info = storeInfo(store);
  const name = esc(info.name);
  const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const link = (s: string) => s.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#111111;">$1</a>');
  const paras = esc(body).split(/\n{2,}/).filter((p) => p.trim()).map((p) => '<p style="margin:0 0 14px 0;">' + link(p).replace(/\n/g, '<br>') + '</p>').join('');
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F4F2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:28px 14px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;">' +
    '<tr><td style="padding:26px 28px 8px 28px;border-bottom:3px solid ' + accentOf(store) + ';">' +
    (info.logo ? '<img src="' + esc(info.logo) + '" alt="' + name + '" height="40" style="display:block;height:40px;width:auto;border:0;">' : '<div style="font:700 20px/26px ' + font + ';color:#111111;">' + name + '</div>') +
    '</td></tr><tr><td style="padding:22px 28px 6px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' + paras + '</td></tr>' +
    '<tr><td style="padding:10px 28px 26px 28px;font:400 12px/1.5 ' + font + ';color:#6E6E6E;">' + name + ' · rendez-vous pris avec Jeere</td></tr>' +
    '</table></td></tr></table></body></html>';
}
function renderMail(st: Obj, S: Settings, kind: Kind, a: Obj) {
  const all = isObj(st.notifications) ? st.notifications : {};
  const o = isObj(all[kind]) ? all[kind] as Obj : {};
  if (o.on === false) return null;
  const v = mailVars(st, S, a);
  const subject = fill(str(o.subject, 200) || MAILS[kind].subject, v);
  const body = fill(typeof o.body === 'string' && o.body.trim() ? o.body.slice(0, 8000) : MAILS[kind].body, v).replace(/\n{3,}/g, '\n\n');
  return { subject, text: body, html: htmlMail(st, subject, body) };
}
async function send(store: Obj, to: string, m: { subject: string; text: string; html: string }, replyTo: string) {
  if (!RESEND_KEY) return { ok: false, reason: 'no_key' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, reason: 'no_address' };
  const name = (storeInfo(store).name || 'Rendez-vous').replace(/[<>"]/g, '').slice(0, 60);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: name + ' <' + FROM_ADDRESS + '>', to: [to], subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  return { ok: r.ok, reason: r.ok ? '' : 'resend_' + r.status };
}
// Sends one kind to the client (or the shop) and remembers it on the appointment
async function mail(st: Obj, S: Settings, a: Obj, kind: Kind) {
  const m = renderMail(st, S, kind, a);
  if (!m) return null;
  const c = isObj(a.customer) ? a.customer : {};
  const publicReply = typeof st.contact_email === 'string' ? st.contact_email : '';
  const to = MAILS[kind].to === 'client' ? str(c.email, 120) : await ownerEmail(st);
  if (!to) return null;
  const r = await send(st, to, m, MAILS[kind].to === 'client' ? publicReply : str(c.email, 120));
  const sent = (Array.isArray(a.emails) ? a.emails as Obj[] : []).concat([{ kind, to, at: new Date().toISOString(), ...r }]);
  a.emails = sent;
  await admin('appointments?id=eq.' + a.id, { method: 'PATCH', body: JSON.stringify({ emails: sent }) });
  return r;
}

/* ------------------------------------------------------------------ what a client may see of her appointment */
function publicView(st: Obj, S: Settings, a: Obj, now: number) {
  const info = storeInfo(st);
  const svc = isObj(a.service) ? a.service : {};
  const k = curInfo(a.currency).minor;
  const start = Date.parse(String(a.starts_at));
  const live = a.status === 'en_attente' || a.status === 'confirme';
  const staff = S.staff.find((s) => s.id === a.staff_id);
  return {
    number: a.number, status: a.status, start: a.starts_at, end: a.ends_at, timezone: S.timezone, staffId: a.staff_id, staffName: staff ? staff.name : '',
    service: { id: svc.id, name: svc.name, duration: svc.duration, from: !!svc.from, addons: arr(svc.addons).filter(isObj).map((x) => ({ id: (x as Obj).id, name: (x as Obj).name })) },
    total: (Number(a.total) || 0) / k, deposit: (Number(a.deposit) || 0) / k, depositStatus: a.deposit_status, payment: a.payment, currency: a.currency,
    firstName: str((isObj(a.customer) ? a.customer : {}).name, 80).split(' ')[0],
    canChange: live && start - now > S.cancelWindow * 3600000, cancelWindow: S.cancelWindow,
    store: { name: info.name, whatsapp: info.whatsapp, address: S.address, mapUrl: S.mapUrl }, policies: S.policies
  };
}
const manageUrlFor = (st: Obj, want: unknown, token: string) => {
  const w = str(want, 300);
  const host = (/^https:\/\/([a-z0-9.-]+)(\/[^\s]*)?$/i.exec(w) || [])[1]?.toLowerCase() ?? '';
  const cd = String(st.custom_domain ?? '').toLowerCase();
  const okHost = host && (host === new URL(SITE).host || host === 'kreeative.xyz' || host === 'www.kreeative.xyz' || (cd && (host === cd || host === 'www.' + cd || 'www.' + host === cd)));
  const base = okHost ? w.replace(/[?#].*$/, '') : SITE + '/rdv/';
  return base + (okHost ? '?' : '?b=' + st.slug + '&') + 'rdv=' + token;
};
const conflict = async (r: Response) => { if (r.status !== 409) return false; const j = await r.clone().json().catch(() => ({})); return String((j as Obj).code ?? '') === '23P01' || /appointments_no_overlap/.test(JSON.stringify(j)); };
const TAKEN = 'Ce créneau vient d’être pris. Choisissez-en un autre.';
const STATUSES = ['en_attente', 'confirme', 'termine', 'absent', 'annule'];
const DEPOSITS = ['', 'en_attente', 'recu', 'rembourse', 'garde'];
const APPT_COLS = 'id,store_id,number,status,staff_id,starts_at,ends_at,busy_until,service,customer,total,deposit,deposit_status,payment,currency,note,memo,source,manage_url,emails,created_at,updated_at';

/* ------------------------------------------------------------------ the handler */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config', message: 'Clé serveur absente.' }, 500);
  let b: Obj = {};
  try { const x = await req.json(); if (isObj(x)) b = x; } catch { /* empty */ }
  const action = String(b.action ?? '');
  const now = Date.now();

  /* ---------- anyone: what the store offers */
  if (action === 'config' || action === 'slots' || action === 'book') {
    const st = await storeBySlug(str(b.slug, 40).toLowerCase());
    if (!st) return json({ ok: false, code: 'store', message: 'Boutique introuvable ou pas encore en ligne.' }, 404);
    const { S } = await settingsOf(st.id);
    const info = storeInfo(st);
    const team = teamOf(S, info);
    if (action === 'config') {
      return json({
        ok: true, enabled: S.enabled, store: { slug: st.slug, name: info.name, whatsapp: info.whatsapp, logo: info.logo, currency: info.currency },
        timezone: S.timezone, step: S.step, horizon: S.horizon, autoConfirm: S.autoConfirm, cancelWindow: S.cancelWindow, deposit: S.deposit,
        intro: S.intro, address: S.address, mapUrl: S.mapUrl, hours: S.hours, policies: S.policies, payments: S.payments,
        services: S.services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, category: s.category, duration: s.duration, price: s.price, from: s.from, deposit: s.deposit, desc: s.desc, photo: s.photo, staff: s.staff })),
        addons: S.addons.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, duration: a.duration, price: a.price })),
        staff: team.map((s) => ({ id: s.id, name: s.name, role: s.role, photo: s.photo })), today: localDate(S.timezone, now).date
      });
    }
    if (!S.enabled) return json({ ok: false, code: 'closed', message: 'La prise de rendez-vous en ligne n’est pas ouverte pour le moment.' }, 409);
    const p = pick(S, info.currency, b.serviceId, b.addons);
    if (!p) return json({ ok: false, code: 'service', message: 'Cette prestation n’est plus proposée.' }, 400);
    const pool = eligible(S, team, p.svc);
    const wantStaff = str(b.staffId, 24);
    const who = wantStaff && wantStaff !== 'any' ? pool.filter((s) => s.id === wantStaff) : pool;
    if (!who.length) return json({ ok: false, code: 'staff', message: 'Cette personne ne propose pas cette prestation.' }, 400);

    if (action === 'slots') {
      const today = localDate(S.timezone, now).date;
      let from = DATE.test(str(b.from, 10)) ? str(b.from, 10) : today;
      if (from < today) from = today;
      const days = int(b.days, 1, 45, 31);
      const m = DATE.exec(from)!;
      const a = localToUtc(S.timezone, +m[1], +m[2], +m[3], 0) - DAY, z = a + (days + 2) * DAY;
      const busy = await busyOf(st.id, a, z);
      const out: Record<string, { t: string; start: string; staff: string[] }[]> = {};
      for (let i = 0; i < days; i++) {
        const d = addDays(from, i);
        const s = daySlots(S, who, d, p.duration, busy, now);
        if (s.length) out[d] = s.map((x) => ({ t: x.t, start: new Date(x.start).toISOString(), staff: x.staff }));
      }
      return json({ ok: true, from, days: out, duration: p.duration, timezone: S.timezone, today });
    }

    // book
    const startMs = Date.parse(str(b.start, 40));
    if (!isFinite(startMs)) return json({ ok: false, code: 'slot', message: 'Choisissez un horaire.' }, 400);
    const c = isObj(b.customer) ? b.customer : {};
    const customer = { name: str(c.name, 80), phone: str(c.phone, 30), email: str(c.email, 120).toLowerCase() };
    if (!customer.name || customer.phone.replace(/\D/g, '').length < 8) return json({ ok: false, code: 'customer', message: 'Votre nom et un numéro de téléphone sont nécessaires.' }, 400);
    if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) return json({ ok: false, code: 'email', message: 'Cette adresse e-mail n’est pas valide.' }, 400);
    const day = localDate(S.timezone, startMs).date;
    const busy = await busyOf(st.id, startMs - DAY, startMs + 2 * DAY);
    const slot = daySlots(S, who, day, p.duration, busy, now).find((x) => x.start === startMs);
    if (!slot) return json({ ok: false, code: 'taken', message: TAKEN }, 409);
    // a little brake on robots: 3 bookings per number per store in 10 minutes, 30 per store; 6 upcoming per number
    const since = new Date(now - 10 * 60000).toISOString();
    const digitsOf = (x: unknown) => String(x ?? '').replace(/\D/g, '').slice(-8);
    const recent = await rows('appointments?select=customer&store_id=eq.' + st.id + '&created_at=gte.' + encodeURIComponent(since) + '&limit=40');
    const mine = (list: Obj[]) => list.filter((r) => isObj(r.customer) && digitsOf((r.customer as Obj).phone) === digitsOf(customer.phone)).length;
    const upcoming = await rows('appointments?select=customer&store_id=eq.' + st.id + '&status=in.(en_attente,confirme)&starts_at=gte.' + encodeURIComponent(new Date(now).toISOString()) + '&limit=600');
    if (recent.length >= 30 || mine(recent) >= 3 || mine(upcoming) >= 6) return json({ ok: false, code: 'rate', message: 'Trop de réservations en peu de temps. Réessayez dans quelques minutes, ou écrivez-nous.' }, 429);
    const numR = await admin('rpc/jeere_next_booking_number', { method: 'POST', body: JSON.stringify({ p_store: st.id }) });
    const number = numR.ok ? Number(await numR.json()) : NaN;
    if (!isFinite(number)) return json({ ok: false, code: 'server', message: 'Le rendez-vous n’a pas pu être enregistré.' }, 500);
    const pay = str(b.payment, 40);
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const end = startMs + p.duration * 60000;
    const row = {
      store_id: st.id, number, status: S.autoConfirm ? 'confirme' : 'en_attente', staff_id: slot.staff[0],
      starts_at: new Date(startMs).toISOString(), ends_at: new Date(end).toISOString(), busy_until: new Date(end + S.buffer * 60000).toISOString(),
      service: p.snapshot, customer, total: p.total, deposit: p.deposit, deposit_status: p.deposit > 0 ? 'en_attente' : '',
      payment: S.payments.includes(pay) ? pay : '', currency: info.currency, note: text(b.note, 1000), source: b.source === 'jeere' ? 'jeere' : 'site',
      token, manage_url: manageUrlFor(st, b.site, token)
    };
    const ins = await admin('appointments', { method: 'POST', body: JSON.stringify(row) });
    if (await conflict(ins)) return json({ ok: false, code: 'taken', message: TAKEN }, 409);
    if (!ins.ok) return json({ ok: false, code: 'server', message: 'Le rendez-vous n’a pas pu être enregistré.' }, 500);
    const saved = (await ins.json())[0] as Obj;
    const sent: Obj[] = [];
    const r1 = await mail(st, S, saved, S.autoConfirm ? 'rdv_confirmation' : 'rdv_demande'); if (r1) sent.push({ kind: 'client', ok: r1.ok });
    const r2 = await mail(st, S, saved, 'rdv_nouveau'); if (r2) sent.push({ kind: 'boutique', ok: r2.ok });
    await notify(st.id, (S.autoConfirm ? 'Nouveau rendez-vous' : 'Demande de rendez-vous') + ' n° ' + number,
      customer.name + ' · ' + p.svc.name + ' · ' + frDate(S.timezone, startMs).replace(/ \d{4}$/, '') + ' à ' + frTime(S.timezone, startMs), '/admin/#rendez-vous', 'rdv-' + st.id + '-' + number);
    return json({ ok: true, token, manageUrl: row.manage_url, appointment: publicView(st, S, saved, now), emails: sent, emailsReady: !!RESEND_KEY });
  }

  /* ---------- a client and her appointment (the token of her e-mail) */
  if (action === 'get' || action === 'cancel' || action === 'reschedule') {
    const token = str(b.token, 80);
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ ok: false, code: 'token', message: 'Rendez-vous introuvable.' }, 404);
    const a = (await rows('appointments?select=' + APPT_COLS + '&token=eq.' + token))[0];
    const st = a ? await storeById(String(a.store_id)) : undefined;
    if (!a || !st) return json({ ok: false, code: 'token', message: 'Rendez-vous introuvable.' }, 404);
    const { S } = await settingsOf(st.id);
    const info = storeInfo(st);
    if (action === 'get') return json({ ok: true, appointment: publicView(st, S, a, now), slug: st.slug });
    const view = publicView(st, S, a, now);
    if (!view.canChange) {
      const live = a.status === 'en_attente' || a.status === 'confirme';
      return json({ ok: false, code: live ? 'late' : 'closed', message: live ? 'Il est trop tard pour modifier ce rendez-vous en ligne (moins de ' + S.cancelWindow + ' h avant). Contactez-nous directement.' : 'Ce rendez-vous ne peut plus être modifié.' }, 409);
    }
    if (action === 'cancel') {
      const up = await admin('appointments?id=eq.' + a.id, { method: 'PATCH', body: JSON.stringify({ status: 'annule', updated_at: new Date().toISOString() }) });
      if (!up.ok) return json({ ok: false, code: 'server' }, 500);
      a.status = 'annule';
      await mail(st, S, a, 'rdv_annule');
      await notify(st.id, 'Rendez-vous annulé n° ' + a.number, str((a.customer as Obj).name, 80) + ' a annulé · ' + frDate(S.timezone, Date.parse(String(a.starts_at))).replace(/ \d{4}$/, '') + ' à ' + frTime(S.timezone, Date.parse(String(a.starts_at))), '/admin/#rendez-vous', 'rdv-' + st.id + '-' + a.number);
      return json({ ok: true, appointment: publicView(st, S, a, now) });
    }
    // reschedule: the same service, another free time
    const startMs = Date.parse(str(b.start, 40));
    const svc = isObj(a.service) ? a.service : {};
    const real = S.services.find((s) => s.id === svc.id);
    const dur = Number(svc.duration) || 60;
    const team = teamOf(S, info);
    const pool = real ? eligible(S, team, real) : team;
    const wantStaff = str(b.staffId, 24);
    const who = wantStaff && wantStaff !== 'any' ? pool.filter((s) => s.id === wantStaff) : pool;
    if (!isFinite(startMs) || !who.length) return json({ ok: false, code: 'slot', message: 'Choisissez un horaire.' }, 400);
    const busy = await busyOf(st.id, startMs - DAY, startMs + 2 * DAY);
    const slot = daySlots(S, who, localDate(S.timezone, startMs).date, dur, busy, now, String(a.id)).find((x) => x.start === startMs);
    if (!slot) return json({ ok: false, code: 'taken', message: TAKEN }, 409);
    const end = startMs + dur * 60000;
    const staffId = slot.staff.includes(String(a.staff_id)) ? String(a.staff_id) : slot.staff[0];
    const up = await admin('appointments?id=eq.' + a.id, { method: 'PATCH', body: JSON.stringify({ starts_at: new Date(startMs).toISOString(), ends_at: new Date(end).toISOString(), busy_until: new Date(end + S.buffer * 60000).toISOString(), staff_id: staffId, updated_at: new Date().toISOString() }) });
    if (await conflict(up)) return json({ ok: false, code: 'taken', message: TAKEN }, 409);
    if (!up.ok) return json({ ok: false, code: 'server' }, 500);
    const saved = (await up.json())[0] as Obj;
    saved.emails = (Array.isArray(saved.emails) ? saved.emails as Obj[] : []).filter((x) => x.kind !== 'rdv_rappel'); // a new reminder for the new day
    await mail(st, S, saved, 'rdv_deplace');
    await notify(st.id, 'Rendez-vous déplacé n° ' + a.number, str((a.customer as Obj).name, 80) + ' · ' + frDate(S.timezone, startMs).replace(/ \d{4}$/, '') + ' à ' + frTime(S.timezone, startMs), '/admin/#rendez-vous', 'rdv-' + st.id + '-' + a.number);
    return json({ ok: true, appointment: publicView(st, S, saved, now) });
  }

  /* ---------- pg_cron: the reminder, the day before */
  if (action === 'remind') {
    const cfg = await rows('jeere_cron?select=secret&id=eq.1');
    const want = cfg[0] && typeof cfg[0].secret === 'string' ? cfg[0].secret : '';
    if (!want || req.headers.get('x-jeere-cron') !== want) return json({ ok: false, code: 'forbidden' }, 403);
    const due = await rows('appointments?select=' + APPT_COLS + '&status=eq.confirme&starts_at=gte.' + encodeURIComponent(new Date(now + 2 * 3600000).toISOString()) + '&starts_at=lte.' + encodeURIComponent(new Date(now + 26 * 3600000).toISOString()) + '&order=starts_at&limit=300');
    const todo = due.filter((a) => !(Array.isArray(a.emails) ? a.emails as Obj[] : []).some((x) => x.kind === 'rdv_rappel') && str((isObj(a.customer) ? a.customer : {}).email, 120)
      && Date.parse(String(a.created_at)) < now - 3 * 3600000); // booked just now: she has her confirmation
    if (b.dry === true) return json({ ok: true, pending: todo.length });
    let sent = 0;
    const cache = new Map<string, { st: Obj; S: Settings } | null>();
    for (const a of todo) {
      const sid = String(a.store_id);
      if (!cache.has(sid)) { const st = await storeById(sid); cache.set(sid, st ? { st, S: (await settingsOf(sid)).S } : null); }
      const x = cache.get(sid);
      if (!x) continue;
      const r = await mail(x.st, x.S, a, 'rdv_rappel');
      if (r && r.ok) sent++;
    }
    return json({ ok: true, sent, pending: todo.length });
  }

  /* ---------- everything else: the store's managers */
  const user = await userOf(req);
  if (!user) return json({ ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere.' }, 401);
  const forbidden = () => json({ ok: false, code: 'forbidden', message: 'Cette boutique n’est pas à vous.' }, 403);
  // the store of the request: by its id, or through one of its appointments / blocks
  let st: Obj | undefined, appt: Obj | undefined;
  if (['status', 'deposit', 'memo', 'move'].includes(action)) {
    const id = str(b.id, 40);
    appt = UUID.test(id) ? (await rows('appointments?select=' + APPT_COLS + ',token&id=eq.' + id))[0] : undefined;
    if (!appt) return json({ ok: false, code: 'appointment', message: 'Rendez-vous introuvable.' }, 404);
    st = await storeById(String(appt.store_id));
  } else if (action === 'unblock') {
    const id = str(b.id, 40);
    const bl = UUID.test(id) ? (await rows('booking_blocks?select=id,store_id&id=eq.' + id))[0] : undefined;
    if (!bl) return json({ ok: true });
    st = await storeById(String(bl.store_id));
  } else st = await storeById(str(b.storeId, 40));
  if (!st || !(await canManage(st, user.id))) return forbidden();
  const info = storeInfo(st);
  const { S, has } = await settingsOf(st.id);
  const out = (a: Obj) => { const k = curInfo(a.currency).minor; return { ...a, total: (Number(a.total) || 0) / k, deposit: (Number(a.deposit) || 0) / k, service: isObj(a.service) ? { ...a.service, price: (Number((a.service as Obj).price) || 0) / k, addons: arr((a.service as Obj).addons).filter(isObj).map((x) => ({ ...(x as Obj), price: (Number((x as Obj).price) || 0) / k })) } : {} }; };

  if (action === 'settings') return json({ ok: true, settings: S, configured: has, store: { id: st.id, slug: st.slug, name: info.name, currency: info.currency, published: st.published === true }, payments: PAYS, bookingUrl: SITE + '/rdv/?b=' + st.slug, emails: !!RESEND_KEY });

  if (action === 'save') {
    const clean = cleanSettings(b.settings);
    // `enabled` is hers to switch off; cleanSettings only refuses « on » with nothing to book
    const r = await admin('booking_settings?on_conflict=store_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ store_id: st.id, settings: clean, updated_at: new Date().toISOString() }) });
    if (!r.ok) return json({ ok: false, code: 'server', message: 'Vos réglages n’ont pas pu être enregistrés.' }, 500);
    return json({ ok: true, settings: clean });
  }

  if (action === 'list') {
    const a = Date.parse(str(b.from, 40)), z = Date.parse(str(b.to, 40));
    const from = isFinite(a) ? a : now - DAY, to = isFinite(z) ? Math.min(z, from + 120 * DAY) : from + 45 * DAY;
    const [ap, bl] = await Promise.all([
      rows('appointments?select=' + APPT_COLS + '&store_id=eq.' + st.id + '&starts_at=lt.' + encodeURIComponent(new Date(to).toISOString()) + '&ends_at=gt.' + encodeURIComponent(new Date(from).toISOString()) + '&order=starts_at&limit=2000'),
      rows('booking_blocks?select=id,staff_id,starts_at,ends_at,reason&store_id=eq.' + st.id + '&starts_at=lt.' + encodeURIComponent(new Date(to).toISOString()) + '&ends_at=gt.' + encodeURIComponent(new Date(from).toISOString()) + '&order=starts_at&limit=500')
    ]);
    const pending = await rows('appointments?select=' + APPT_COLS + '&store_id=eq.' + st.id + '&status=eq.en_attente&starts_at=gte.' + encodeURIComponent(new Date(now).toISOString()) + '&order=starts_at&limit=100');
    return json({ ok: true, appointments: ap.map(out), blocks: bl, pending: pending.map(out), timezone: S.timezone, today: localDate(S.timezone, now).date, now: new Date(now).toISOString() });
  }

  if (action === 'clients') {
    const all = await rows('appointments?select=customer,status,total,currency,starts_at,service&store_id=eq.' + st.id + '&order=starts_at.desc&limit=3000');
    const map = new Map<string, Obj>();
    for (const a of all) {
      const c = isObj(a.customer) ? a.customer : {};
      const key = String(c.phone ?? '').replace(/\D/g, '').slice(-8) || str(c.email, 120) || str(c.name, 80);
      if (!key) continue;
      const k = curInfo(a.currency).minor;
      const t = Date.parse(String(a.starts_at));
      const cur = map.get(key) ?? { name: str(c.name, 80), phone: str(c.phone, 30), email: str(c.email, 120), visits: 0, upcoming: 0, noShows: 0, cancelled: 0, spent: 0, last: '', next: '', lastService: '' };
      if (a.status === 'termine' || (a.status === 'confirme' && t < now)) { cur.visits = Number(cur.visits) + 1; cur.spent = Number(cur.spent) + (Number(a.total) || 0) / k; if (!cur.last) { cur.last = a.starts_at; cur.lastService = str((isObj(a.service) ? a.service : {}).name, 80); } }
      else if ((a.status === 'confirme' || a.status === 'en_attente') && t >= now) { cur.upcoming = Number(cur.upcoming) + 1; cur.next = a.starts_at; }
      else if (a.status === 'absent') cur.noShows = Number(cur.noShows) + 1;
      else if (a.status === 'annule') cur.cancelled = Number(cur.cancelled) + 1;
      map.set(key, cur);
    }
    return json({ ok: true, clients: [...map.values()], currency: info.currency });
  }

  if (action === 'create') {
    const p = pick(S, info.currency, b.serviceId, b.addons);
    if (!p) return json({ ok: false, code: 'service', message: 'Choisissez une prestation.' }, 400);
    const startMs = Date.parse(str(b.start, 40));
    if (!isFinite(startMs)) return json({ ok: false, code: 'slot', message: 'Choisissez un jour et une heure.' }, 400);
    const c = isObj(b.customer) ? b.customer : {};
    const customer = { name: str(c.name, 80), phone: str(c.phone, 30), email: str(c.email, 120).toLowerCase() };
    if (!customer.name) return json({ ok: false, code: 'customer', message: 'Le nom de la cliente est nécessaire.' }, 400);
    const team = teamOf(S, info);
    const staffId = team.some((s) => s.id === b.staffId) ? String(b.staffId) : team[0].id;
    const dur = int(b.duration, 5, 720, p.duration);
    const end = startMs + dur * 60000;
    // she may book outside her hours (a favour, a walk-in); only a block or another client stops her
    const busy = await busyOf(st.id, startMs - DAY, end + DAY);
    if (busy.some((x) => (x.staff === staffId || x.staff === '') && startMs < x.e && end > x.s)) return json({ ok: false, code: 'taken', message: 'Ce créneau est déjà occupé (un autre rendez-vous ou un blocage).' }, 409);
    const numR = await admin('rpc/jeere_next_booking_number', { method: 'POST', body: JSON.stringify({ p_store: st.id }) });
    const number = numR.ok ? Number(await numR.json()) : NaN;
    if (!isFinite(number)) return json({ ok: false, code: 'server' }, 500);
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const wantDep = b.deposit === true;
    const row = {
      store_id: st.id, number, status: 'confirme', staff_id: staffId, starts_at: new Date(startMs).toISOString(), ends_at: new Date(end).toISOString(), busy_until: new Date(end + S.buffer * 60000).toISOString(),
      service: { ...p.snapshot, duration: dur }, customer, total: p.total, deposit: wantDep ? p.deposit : 0, deposit_status: wantDep && p.deposit > 0 ? 'en_attente' : '',
      payment: '', currency: info.currency, memo: text(b.note, 1000), source: 'manuel', token, manage_url: manageUrlFor(st, b.site, token)
    };
    const ins = await admin('appointments', { method: 'POST', body: JSON.stringify(row) });
    if (await conflict(ins)) return json({ ok: false, code: 'taken', message: 'Ce créneau est déjà occupé.' }, 409);
    if (!ins.ok) return json({ ok: false, code: 'server', message: 'Le rendez-vous n’a pas pu être enregistré.' }, 500);
    const saved = (await ins.json())[0] as Obj;
    if (customer.email) await mail(st, S, saved, 'rdv_confirmation');
    return json({ ok: true, appointment: out(saved) });
  }

  if (action === 'block') {
    const a = Date.parse(str(b.from, 40)), z = Date.parse(str(b.to, 40));
    if (!isFinite(a) || !isFinite(z) || z <= a || z - a > 400 * DAY) return json({ ok: false, code: 'range', message: 'Choisissez un début et une fin.' }, 400);
    const staffId = S.staff.some((s) => s.id === b.staffId) ? String(b.staffId) : '';
    const r = await admin('booking_blocks', { method: 'POST', body: JSON.stringify({ store_id: st.id, staff_id: staffId, starts_at: new Date(a).toISOString(), ends_at: new Date(z).toISOString(), reason: str(b.reason, 120) }) });
    if (!r.ok) return json({ ok: false, code: 'server' }, 500);
    return json({ ok: true, block: (await r.json())[0] });
  }
  if (action === 'unblock') { await admin('booking_blocks?id=eq.' + str(b.id, 40), { method: 'DELETE' }); return json({ ok: true }); }

  if (!appt) return json({ ok: false, code: 'action' }, 400);

  if (action === 'status') {
    const status = str(b.status, 20);
    if (!STATUSES.includes(status)) return json({ ok: false, code: 'status' }, 400);
    const was = appt.status;
    const up = await admin('appointments?id=eq.' + appt.id, { method: 'PATCH', body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
    if (await conflict(up)) return json({ ok: false, code: 'taken', message: 'Ce créneau a été repris par un autre rendez-vous.' }, 409);
    if (!up.ok) return json({ ok: false, code: 'server' }, 500);
    const saved = (await up.json())[0] as Obj;
    if (status === 'confirme' && was === 'en_attente') await mail(st, S, saved, 'rdv_confirme');
    if (status === 'annule' && was !== 'annule' && b.silent !== true) await mail(st, S, saved, 'rdv_annule');
    return json({ ok: true, appointment: out(saved) });
  }
  if (action === 'deposit') {
    const ds = str(b.depositStatus, 20);
    if (!DEPOSITS.includes(ds)) return json({ ok: false, code: 'deposit' }, 400);
    const up = await admin('appointments?id=eq.' + appt.id, { method: 'PATCH', body: JSON.stringify({ deposit_status: ds, updated_at: new Date().toISOString() }) });
    if (!up.ok) return json({ ok: false, code: 'server' }, 500);
    return json({ ok: true, appointment: out((await up.json())[0] as Obj) });
  }
  if (action === 'memo') {
    const up = await admin('appointments?id=eq.' + appt.id, { method: 'PATCH', body: JSON.stringify({ memo: text(b.memo, 2000), updated_at: new Date().toISOString() }) });
    if (!up.ok) return json({ ok: false, code: 'server' }, 500);
    return json({ ok: true, appointment: out((await up.json())[0] as Obj) });
  }
  if (action === 'move') {
    const startMs = Date.parse(str(b.start, 40));
    if (!isFinite(startMs)) return json({ ok: false, code: 'slot', message: 'Choisissez un jour et une heure.' }, 400);
    const dur = Number((isObj(appt.service) ? appt.service : {}).duration) || 60;
    const end = startMs + dur * 60000;
    const team = teamOf(S, info);
    const staffId = team.some((s) => s.id === b.staffId) ? String(b.staffId) : String(appt.staff_id);
    const busy = await busyOf(st.id, startMs - DAY, end + DAY);
    if (busy.some((x) => (x.staff === staffId || x.staff === '') && x.id !== appt!.id && startMs < x.e && end > x.s)) return json({ ok: false, code: 'taken', message: 'Ce créneau est déjà occupé.' }, 409);
    const emails = (Array.isArray(appt.emails) ? appt.emails as Obj[] : []).filter((x) => x.kind !== 'rdv_rappel');
    const up = await admin('appointments?id=eq.' + appt.id, { method: 'PATCH', body: JSON.stringify({ starts_at: new Date(startMs).toISOString(), ends_at: new Date(end).toISOString(), busy_until: new Date(end + S.buffer * 60000).toISOString(), staff_id: staffId, emails, updated_at: new Date().toISOString() }) });
    if (await conflict(up)) return json({ ok: false, code: 'taken', message: 'Ce créneau est déjà occupé.' }, 409);
    if (!up.ok) return json({ ok: false, code: 'server' }, 500);
    const saved = (await up.json())[0] as Obj;
    if (b.silent !== true) await mail(st, S, saved, 'rdv_deplace');
    return json({ ok: true, appointment: out(saved) });
  }

  return json({ ok: false, code: 'action' }, 400);
});

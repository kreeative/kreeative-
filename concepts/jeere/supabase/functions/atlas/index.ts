// Atlas — Jehre's admin space (jehre.com/atlas/). One door for everything it reads and does, checked on every call:
//   1. a Jehre session (the caller's own token);
//   2. an e-mail listed in public.jehre_admins, with its role;
//   3. a code received by e-mail less than 12 hours ago (the token says how she signed in: amr « otp »).
// Roles: fondatrice (everything, the admins too) · admin (accounts, plans, stores, suspensions) · support (see, send a
// password link) · lecture (see). Every change is written in public.atlas_log. The tables are reached with the service
// key only (they have no policy): nothing here is open to a browser.
//
//   { action: 'me' }                                → { role, email }
//   { action: 'overview' }                          → counts
//   { action: 'accounts' }                          → every account, its stores, its purchases, suspended or not
//   { action: 'suspend', userId, on }               → admin+ · the account cannot sign in; its stores go offline (back with it)
//   { action: 'plan', storeId, plan }               → admin+
//   { action: 'interac', userId, model, amount, storeId? } → admin+ · a model paid by Interac (in $ CA): written like a card
//                                                     purchase (the model opens, and the first month comes with it)
//   { action: 'reset', email }                      → support+ · the « choose a new password » e-mail
//   { action: 'admins' } / { action: 'admin_set', email, role | null } → list (all) / change (fondatrice)
//   { action: 'log' }                               → the last 300 actions
//   { action: 'live' }                              → who is on jehre.com now, today, this week

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CODE_HOURS = 12;
const ROLES = ['fondatrice', 'admin', 'support', 'lecture'] as const;
type Role = typeof ROLES[number];
const RANK: Record<Role, number> = { fondatrice: 4, admin: 3, support: 2, lecture: 1 };
const PLANS = ['gratuit', 'essentiel', 'croissance', 'pro', 'business', 'entreprise'];
const MODELS = ['seve', 'soyeuse', 'michou', 'anse', 'regard', 'vernie', 'minuit', 'option-produits'];

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const UUID = /^[0-9a-f-]{36}$/i;

const svc = (path: string, init: RequestInit = {}) => fetch(URL_ + path, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
async function rows<T = Obj>(path: string): Promise<T[]> { const r = await svc('/rest/v1/' + path); return r.ok ? (await r.json()) as T[] : []; }
async function log(actor: string, action: string, target: string, detail: Obj = {}) {
  await svc('/rest/v1/atlas_log', { method: 'POST', body: JSON.stringify({ actor, action, target, detail }) });
}
/** Every account (the admin API lists them 1000 at a time). */
async function users(): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await svc(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!r.ok) break;
    const j = await r.json() as { users?: Obj[] };
    const list = j.users ?? [];
    out.push(...list);
    if (list.length < 1000) break;
  }
  return out;
}
const jwtPart = (t: string): Obj => { try { return JSON.parse(atob(t.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, code: 'login', message: 'Connectez-vous.' }, 401);
  // 1. who is calling (the auth server checks the token)
  const ur = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: ANON || SERVICE, Authorization: 'Bearer ' + token } });
  if (!ur.ok) return json({ ok: false, code: 'login', message: 'Connectez-vous.' }, 401);
  const me = await ur.json() as { id: string; email?: string };
  const email = String(me.email ?? '').toLowerCase();
  // 2. an admin, with a role
  const adm = (await rows<{ role: Role }>('jehre_admins?select=role&email=eq.' + encodeURIComponent(email)))[0];
  if (!adm) return json({ ok: false, code: 'denied', message: 'Cet espace est réservé à l’équipe Jehre.' }, 403);
  const role = adm.role;
  // 3. a code received by e-mail less than 12 hours ago
  const amr = (jwtPart(token).amr as { method?: string; timestamp?: number }[] | undefined) ?? [];
  const otp = amr.filter((a) => a.method === 'otp' || a.method === 'magiclink').map((a) => Number(a.timestamp) || 0);
  if (!otp.length || Date.now() / 1000 - Math.max(...otp) > CODE_HOURS * 3600) return json({ ok: false, code: 'code', message: 'Confirmez avec le code reçu par e-mail.', email }, 403);

  let b: Obj = {};
  try { b = await req.json(); } catch { /* empty */ }
  const action = str(b.action, 40);
  const need = (r: Role) => RANK[role] >= RANK[r];
  const no = () => json({ ok: false, code: 'role', message: 'Votre rôle ne permet pas cette action.' }, 403);

  if (action === 'me') return json({ ok: true, role, email });

  if (action === 'overview' || action === 'accounts') {
    const [us, stores, buys, susp, profs] = await Promise.all([
      users(),
      rows('stores?select=id,owner,slug,published,plan,plan_until,plan_promo,created_at,custom_domain,fiche->store->>name&order=created_at.desc&limit=5000'),
      rows('model_purchases?select=user_id,store_id,model,amount,currency,session_id,created_at,install,installed_at&order=created_at.desc&limit=5000'),
      rows<{ user_id: string }>('atlas_suspended?select=user_id'),
      rows<{ id: string; first_name: string | null; phone: string | null; source: string | null }>('profiles?select=id,first_name,phone,source&limit=10000'),
    ]);
    const prof = new Map(profs.map((p) => [p.id, p]));
    const off = new Set(susp.map((s) => s.user_id));
    if (action === 'overview') {
      const paying = stores.filter((s) => s.plan && s.plan !== 'gratuit' && !s.plan_promo);
      const byPlan: Record<string, number> = {};
      paying.forEach((s) => { byPlan[String(s.plan)] = (byPlan[String(s.plan)] ?? 0) + 1; });
      const week = Date.now() - 7 * 864e5;
      return json({ ok: true, accounts: us.length, newWeek: us.filter((u) => Date.parse(String(u.created_at)) > week).length, verified: us.filter((u) => u.email_confirmed_at).length,
        stores: stores.length, published: stores.filter((s) => s.published).length, paying: paying.length, byPlan, suspended: off.size,
        purchases: buys.length, purchasesAmount: buys.reduce((n, p) => n + (Number(p.amount) || 0), 0) });
    }
    const accounts = us.map((u) => {
      const meta = isObj(u.user_metadata) ? u.user_metadata : {};
      return {
        id: u.id, email: u.email, firstName: str(prof.get(String(u.id))?.first_name ?? meta.first_name, 60), phone: prof.get(String(u.id))?.phone ?? '', source: prof.get(String(u.id))?.source ?? '', createdAt: u.created_at, lastSignIn: u.last_sign_in_at, verified: !!u.email_confirmed_at,
        suspended: off.has(String(u.id)) || (typeof u.banned_until === 'string' && Date.parse(u.banned_until) > Date.now()),
        stores: stores.filter((s) => s.owner === u.id).map((s) => ({ id: s.id, slug: s.slug, createdAt: s.created_at, name: s.name || s.slug, published: !!s.published, plan: s.plan || 'gratuit', promo: !!s.plan_promo, until: s.plan_until, domain: s.custom_domain })),
        purchases: buys.filter((p) => p.user_id === u.id).map((p) => ({ model: p.model, amount: p.amount, currency: p.currency || 'xof', method: String(p.session_id ?? '').startsWith('interac:') ? 'interac' : 'carte', at: p.created_at, install: !!p.install, installedAt: p.installed_at ?? null })),
      };
    });
    return json({ ok: true, accounts });
  }

  if (action === 'suspend') {
    if (!need('admin')) return no();
    const id = str(b.userId, 40), on = b.on === true;
    if (!UUID.test(id) || id === me.id) return json({ ok: false, message: 'Ce compte ne peut pas être suspendu ici.' }, 400);
    const ur2 = await svc('/auth/v1/admin/users/' + id);
    if (!ur2.ok) return json({ ok: false, message: 'Compte introuvable.' }, 404);
    const target = await ur2.json() as { email?: string };
    const tAdmin = (await rows<{ role: Role }>('jehre_admins?select=role&email=eq.' + encodeURIComponent(String(target.email ?? '').toLowerCase())))[0];
    if (tAdmin && RANK[tAdmin.role] >= RANK[role]) return no();
    if (on) {
      const live = await rows<{ id: string }>('stores?select=id&published=is.true&owner=eq.' + id);
      const r = await svc('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) });
      if (!r.ok) return json({ ok: false, message: 'Le compte n’a pas pu être suspendu.' }, 500);
      if (live.length) await svc('/rest/v1/stores?owner=eq.' + id + '&published=is.true', { method: 'PATCH', body: JSON.stringify({ published: false }) });
      await svc('/rest/v1/atlas_suspended', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: id, stores: live.map((s) => s.id), by: email }) });
      await log(email, 'suspendre', String(target.email ?? id), { stores: live.length });
    } else {
      const s = (await rows<{ stores: string[] }>('atlas_suspended?select=stores&user_id=eq.' + id))[0];
      const r = await svc('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ ban_duration: 'none' }) });
      if (!r.ok) return json({ ok: false, message: 'Le compte n’a pas pu être réactivé.' }, 500);
      if (s && s.stores.length) await svc('/rest/v1/stores?id=in.(' + s.stores.filter((x) => UUID.test(x)).join(',') + ')', { method: 'PATCH', body: JSON.stringify({ published: true }) });
      await svc('/rest/v1/atlas_suspended?user_id=eq.' + id, { method: 'DELETE' });
      await log(email, 'réactiver', String(target.email ?? id), { stores: s?.stores.length ?? 0 });
    }
    return json({ ok: true });
  }

  if (action === 'interac') {
    if (!need('admin')) return no();
    const id = str(b.userId, 40), model = str(b.model, 20).toLowerCase();
    const cents = Math.round(Number(b.amount) * 100);
    if (!UUID.test(id)) return json({ ok: false, message: 'Compte introuvable.' }, 400);
    if (!MODELS.includes(model)) return json({ ok: false, message: 'Choisissez un modèle.' }, 400);
    if (!(cents >= 100 && cents <= 500000)) return json({ ok: false, message: 'Le montant reçu, en dollars canadiens (par exemple 59,99).' }, 400);
    const ur2 = await svc('/auth/v1/admin/users/' + id);
    if (!ur2.ok) return json({ ok: false, message: 'Compte introuvable.' }, 404);
    const target = await ur2.json() as { email?: string };
    const mine = await rows<{ id: string; slug: string; name: string }>('stores?select=id,slug,fiche->store->>name&owner=eq.' + id + '&order=created_at.asc');
    const want = str(b.storeId, 40);
    const st = mine.find((x) => x.id === want) ?? mine[0] ?? null;
    if (model === 'option-produits' && !st) return json({ ok: false, message: 'L’option se prend pour une boutique : ce compte n’en a pas.' }, 400);
    const r = await svc('/rest/v1/model_purchases', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      session_id: 'interac:' + crypto.randomUUID(), user_id: id, store_id: st ? st.id : null, model, amount: cents, currency: 'cad',
      email: str(target.email, 120), shop_name: st ? str(st.name || st.slug, 60) : '', install: model === 'anse'
    }) });
    if (!r.ok) return json({ ok: false, message: 'Le paiement n’a pas pu être enregistré. Réessayez.' }, 500);
    await log(email, 'paiement Interac', String(target.email ?? id), { modèle: model, montant: (cents / 100).toFixed(2) + ' $ CA', boutique: st ? st.slug : '' });
    return json({ ok: true });
  }

  if (action === 'plan') {
    if (!need('admin')) return no();
    const id = str(b.storeId, 40), plan = str(b.plan, 20);
    if (!UUID.test(id) || !PLANS.includes(plan)) return json({ ok: false, message: 'Formule inconnue.' }, 400);
    const st = (await rows<{ slug: string; plan: string }>('stores?select=slug,plan&id=eq.' + id))[0];
    if (!st) return json({ ok: false, message: 'Boutique introuvable.' }, 404);
    const r = await svc('/rest/v1/stores?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ plan }) });
    if (!r.ok) return json({ ok: false, message: 'La formule n’a pas pu être changée.' }, 500);
    await log(email, 'formule', st.slug, { from: st.plan, to: plan });
    return json({ ok: true });
  }

  if (action === 'reset') {
    if (!need('support')) return no();
    const to = str(b.email, 200).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ ok: false, message: 'Adresse invalide.' }, 400);
    const r = await fetch(URL_ + '/auth/v1/recover?redirect_to=' + encodeURIComponent('https://jehre.com/compte/'), { method: 'POST', headers: { apikey: ANON || SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: to }) });
    if (!r.ok) return json({ ok: false, message: 'Le lien n’a pas pu être envoyé. Réessayez dans une minute.' }, 500);
    await log(email, 'lien mot de passe', to);
    return json({ ok: true });
  }

  if (action === 'admins') return json({ ok: true, admins: await rows('jehre_admins?select=email,role,added_by,added_at&order=added_at.asc') });

  if (action === 'admin_set') {
    if (!need('fondatrice')) return no();
    const who = str(b.email, 200).toLowerCase(), r0 = b.role === null ? null : str(b.role, 20) as Role;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(who)) return json({ ok: false, message: 'Adresse invalide.' }, 400);
    if (r0 !== null && !ROLES.includes(r0)) return json({ ok: false, message: 'Rôle inconnu.' }, 400);
    if (who === email) return json({ ok: false, message: 'Vous ne pouvez pas changer votre propre rôle.' }, 400);
    if (r0 === null) {
      await svc('/rest/v1/jehre_admins?email=eq.' + encodeURIComponent(who), { method: 'DELETE' });
      await log(email, 'retirer un administrateur', who);
    } else {
      await svc('/rest/v1/jehre_admins', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ email: who, role: r0, added_by: email }) });
      await log(email, 'administrateur', who, { role: r0 });
    }
    return json({ ok: true });
  }

  if (action === 'log') return json({ ok: true, log: await rows('atlas_log?select=at,actor,action,target,detail&order=at.desc&limit=300') });

  if (action === 'live') {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const v = await rows<{ visitor: string; lat: number | null; lon: number | null; city: string | null; country: string | null; at: string; path: string | null }>(
      'store_visits?select=visitor,lat,lon,city,country,at,path&site=eq.jehre-com&at=gte.' + encodeURIComponent(since) + '&order=at.desc&limit=20000');
    const t = Date.now(), within = (ms: number) => new Set(v.filter((x) => t - Date.parse(x.at) < ms).map((x) => x.visitor)).size;
    const seen = new Set<string>(), points: Obj[] = [];
    for (const x of v) { if (seen.has(x.visitor)) continue; seen.add(x.visitor); points.push({ lat: x.lat, lon: x.lon, city: x.city, country: x.country, at: x.at, path: x.path, live: t - Date.parse(x.at) < 5 * 60000 }); if (points.length >= 300) break; }
    const day: Record<string, Set<string>> = {};
    v.filter((x) => t - Date.parse(x.at) < 864e5 && x.country).forEach((x) => { (day[x.country!] ??= new Set()).add(x.visitor); });
    const countries = Object.entries(day).map(([country, set]) => ({ country, n: set.size })).sort((p, q) => q.n - p.n).slice(0, 12);
    return json({ ok: true, now: within(5 * 60000), today: within(864e5), week: seen.size, points, countries });
  }

  return json({ ok: false, message: 'Action inconnue.' }, 400);
});

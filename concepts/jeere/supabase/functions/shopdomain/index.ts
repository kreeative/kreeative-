// Jehre — Edge Function `shopdomain` (Supabase project ref aezchxfvzfoqlvzchqyk): every published store gets its
// free address <slug>.store.jehre.com, by itself.
//
// The DNS of jehre.com has one wildcard record (*.store → cname.vercel-dns.com). A name answers with its padlock
// once it is a domain of the Vercel project: this function adds the ones that are missing.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/shopdomain   body: { action: 'sync' | 'dry' }
//   header x-jeere-cron = public.jeere_cron.secret (the database calls it: a trigger when a store goes online
//   or changes its address, and pg_cron every hour as a safety net). Nothing here is open to the public.
// Secrets: VERCEL_TOKEN (already set for the custom domains), optionally VERCEL_PROJECT_ID, VERCEL_TEAM_ID,
// VERCEL_GIT_BRANCH. Deployed with verify_jwt = false: the header is checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VERCEL_TOKEN = Deno.env.get('VERCEL_TOKEN') ?? '';
const PROJECT_ID = Deno.env.get('VERCEL_PROJECT_ID') || 'prj_sm5rloic5l934qiErQnQ6YZqD0z7';
const TEAM_ID = Deno.env.get('VERCEL_TEAM_ID') || 'team_baaIo2HD3gXK1oOziipXPpAl';
const GIT_BRANCH = Deno.env.get('VERCEL_GIT_BRANCH') ?? '';
const SUFFIX = '.store.jehre.com';
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_ADDS = 25; // per call: the next call (an hour later at most) takes the rest

type Obj = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const db = (path: string) => fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } });
const vercel = (path: string, init: RequestInit = {}) => fetch('https://api.vercel.com' + path + (path.includes('?') ? '&' : '?') + 'teamId=' + TEAM_ID, {
  ...init, headers: { Authorization: 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
});

// the names of the project that are store addresses already
let listError = '';
async function existing(): Promise<Set<string> | null> {
  const names = new Set<string>();
  let until = '';
  for (let page = 0; page < 20; page++) {
    const r = await vercel(`/v9/projects/${PROJECT_ID}/domains?limit=100` + (until ? '&until=' + until : ''));
    if (!r.ok) { listError = String(r.status); try { const e = await r.json() as { error?: { code?: string } }; listError += ' ' + ((e.error && e.error.code) || ''); } catch { /* the status */ } return null; }
    const j = await r.json() as { domains?: { name?: string }[]; pagination?: { next?: number | null } };
    (j.domains ?? []).forEach((d) => { const n = String(d.name || '').toLowerCase(); if (n.endsWith(SUFFIX)) names.add(n); });
    const next = j.pagination && j.pagination.next;
    if (!next) break;
    until = String(next);
  }
  return names;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config' }, 500);
  const cfg = await db('jeere_cron?select=secret&id=eq.1').then((r) => (r.ok ? r.json() : [])).catch(() => []) as Obj[];
  const want = cfg[0] && typeof cfg[0].secret === 'string' ? cfg[0].secret as string : '';
  if (!want || req.headers.get('x-jeere-cron') !== want) return json({ ok: false, code: 'forbidden' }, 403);
  if (!VERCEL_TOKEN) return json({ ok: false, code: 'no_vercel' }, 503);
  let b: Obj = {};
  try { const x = await req.json(); if (x && typeof x === 'object') b = x as Obj; } catch { /* empty */ }

  const rows = await db('stores?select=slug&published=is.true&limit=5000').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { slug: string }[] | null;
  if (!Array.isArray(rows)) return json({ ok: false, code: 'db' }, 500);
  const have = await existing();
  // the list could not be read: every store is tried (a name already there is fine)
  const missing = rows.map((r) => String(r.slug || '').toLowerCase()).filter((s) => SLUG.test(s) && !(have && have.has(s + SUFFIX)));
  if (b.action === 'dry') return json({ ok: true, stores: rows.length, have: have ? have.size : null, listError, missing });

  const added: string[] = [], failed: { name: string; code: string }[] = [];
  for (const s of missing.slice(0, MAX_ADDS)) {
    const name = s + SUFFIX;
    const r = await vercel(`/v10/projects/${PROJECT_ID}/domains`, { method: 'POST', body: JSON.stringify(GIT_BRANCH ? { name, gitBranch: GIT_BRANCH } : { name }) });
    if (r.ok) added.push(name);
    else if (r.status === 400 || r.status === 409) { let code = ''; try { const e = await r.json() as { error?: { code?: string; message?: string } }; code = String((e.error && (e.error.code || e.error.message)) || ''); } catch { /* none */ } if (!/already|in_use|exists/i.test(code)) failed.push({ name, code: r.status + ' ' + code }); }
    else { let code = String(r.status); try { const e = await r.json() as { error?: { code?: string } }; code = (e.error && e.error.code) || code; } catch { /* keep the status */ } failed.push({ name, code }); }
  }
  return json({ ok: true, stores: rows.length, added, failed, listError, left: Math.max(0, missing.length - MAX_ADDS) });
});

// Jeere — Edge Function `sites-publish` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk).
//
// The only place that holds the GitHub token of « Mes sites » (Jeere Studio › Mes sites, studio/sites/).
// It commits the founder's edits to her websites (repository kreeative/kreeative-) in ONE atomic commit
// through the Git data API (blobs → tree → commit → ref update), several files and images at once.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/sites-publish
//   headers: apikey: <publishable key>, Authorization: Bearer <her Supabase session>
//   body: { action, ... }
//
// Actions
//   status                         → { github }                                anyone (says only whether the token is set)
//   whoami                         → { editor, email, github }                 signed in + on public.site_editors
//   publish { base, target, branch?, message, files: [{ path, encoding, content, baseSha? }] }
//                                  → { commit: { sha, url }, branch, files }   signed in + on public.site_editors + token
//        target 'live'  : commits on `base` (the default branch claude/kreeative-portfolio-design-n2a770 = kreeative.xyz,
//                         or the branch a site only lives on)
//        target 'draft' : commits on `branch` (studio/<name>), created from `base` when it does not exist yet
//   deploy-status { sha }          → { state, description, url }                Vercel's status on the commit (via GitHub)
//
// Checks: no session → 401; not on the allow-list → 403; no GITHUB_TOKEN → 503 « GitHub pas encore connecté »;
// every path is normalised and must sit in an allowed site folder of that branch (no `..`, no absolute path,
// no hidden file, only .html and image files), at most 40 files, 5 MB per file, 20 MB in all; a page edited
// from an older version than the branch's (baseSha ≠ the file's blob on the branch) → 409, nothing is written.
// The commit's author and committer are always Anne-Kelly Kouyate <annklyy@gmail.com>; the message is hers.
//
// Secrets (Supabase › Edge Functions › Secrets): GITHUB_TOKEN — a fine-grained token of the GitHub account
// `kreeative`, repository kreeative/kreeative- only, permission « Contents: Read and write » (README
// « Mes sites »). Deployed with verify_jwt = false: the publishable key is not a JWT, so the function checks
// the session itself (like `domains`).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GITHUB_TOKEN = (Deno.env.get('GITHUB_TOKEN') ?? '').trim();

const OWNER = 'kreeative';
const REPO = 'kreeative-';
const GH = 'https://api.github.com';
const DEFAULT_BRANCH = 'claude/kreeative-portfolio-design-n2a770';
const AUTHOR = { name: 'Anne-Kelly Kouyate', email: 'annklyy@gmail.com' };

// Where each branch may be written. The default branch serves kreeative.xyz: its home and pages, the
// case studies (websites/, portfolio/) and the client concepts. Jeere itself (concepts/jeere/), the
// workflows, the tools and the config are never writable from here.
const SITE_FOLDERS_DEFAULT: RegExp[] = [
  /^websites\/[a-z0-9][a-z0-9-]*\//,
  /^portfolio\/[a-z0-9][a-z0-9-]*\//,
  /^concepts\/(anse|jessicas-secrets|joshua-cooker|michou|nanawax|regard|ririfood|sao|seve|sonia-luxury-hair|soyeuse|vernie)\//,
  /^(index|404)\.html$/,
  /^(about|access|pricing|shop|signature|teach|the-kreeative-designer-newsletter)\//,
  /^assets\/img\/studio\//
];
const BRANCH_FOLDERS: Record<string, RegExp[]> = {
  [DEFAULT_BRANCH]: SITE_FOLDERS_DEFAULT,
  'claude/aissa-kee-personal-brand-rgrggx': [/^aissakee\//],
  'claude/add-tabouret-site': [/^websites\/the-ivory-sukundu\//, /^assets\/img\/studio\//]
};
const DRAFT_RE = /^studio\/[a-z0-9][a-z0-9-]{0,60}$/;
const EXT_TEXT = /\.html?$/i;
const EXT_IMAGE = /\.(png|jpe?g|webp|gif|svg|avif|ico)$/i;
const MAX_FILES = 40;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => json({ ok: false, code, message, ...extra }, status);
const NOT_CONNECTED = 'GitHub pas encore connecté : ajoutez le secret GITHUB_TOKEN dans Supabase › Jeere › Edge Functions › Secrets (voir le README « Mes sites »). En attendant, téléchargez les fichiers (.zip).';

/* ---------------------------------------------------------------- who is calling */

type User = { id: string; email: string };
async function currentUser(req: Request): Promise<User | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.startsWith('sb_') || token.split('.').length !== 3) return null; // the publishable key is not a session
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && typeof u.id === 'string' ? { id: u.id, email: String(u.email ?? '').toLowerCase() } : null;
}
function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { apikey: SECRET };
  if (SECRET && !SECRET.startsWith('sb_')) h.Authorization = 'Bearer ' + SECRET; // legacy service_role JWT
  return h;
}
async function isEditor(u: User): Promise<boolean> {
  if (!SECRET || !u.email) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_editors?email=eq.${encodeURIComponent(u.email)}&select=email`, { headers: adminHeaders() });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}
async function guard(req: Request): Promise<{ user: User } | { error: Response }> {
  const user = await currentUser(req);
  if (!user) return { error: fail(401, 'no_session', 'Connectez-vous avec votre compte Jeere (annklyy@gmail.com) pour publier vos sites.') };
  if (!(await isEditor(user))) return { error: fail(403, 'not_editor', 'Ce compte ne peut pas publier les sites de kreeative.', { editor: false }) };
  return { user };
}

/* ---------------------------------------------------------------- paths and contents */

function cleanPath(p: unknown): string | null {
  const s = String(p ?? '');
  if (!s || s.length > 200) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(s)) return null;
  if (s.startsWith('/') || s.includes('//')) return null;
  const parts = s.split('/');
  if (parts.some((x) => x === '' || x === '.' || x === '..' || x.startsWith('.'))) return null;
  if (!/^[A-Za-z0-9._\-\/]+$/.test(s)) return null;
  return s;
}
function allowedOn(branchBase: string, path: string): boolean {
  const rules = BRANCH_FOLDERS[branchBase];
  return !!rules && rules.some((re) => re.test(path)) && (EXT_TEXT.test(path) || EXT_IMAGE.test(path));
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function blobSha(bytes: Uint8Array): Promise<string> {
  const head = new TextEncoder().encode('blob ' + bytes.length + '\0');
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head, 0); all.set(bytes, head.length);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------------------- GitHub */

class GhError extends Error { constructor(public status: number, public body: any, public step: string) { super(step + ' ' + status); } }
async function gh(path: string, init: RequestInit = {}, step = path) {
  const r = await fetch(GH + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jeere-sites-publish', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {})
    }
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new GhError(r.status, body, step);
  return body as Record<string, any>;
}
const repo = (p: string) => `/repos/${OWNER}/${REPO}${p}`;
const refPath = (b: string) => b.split('/').map(encodeURIComponent).join('/');
async function headOf(branch: string): Promise<string | null> {
  try { return (await gh(repo('/git/ref/heads/' + refPath(branch)), {}, 'ref')).object.sha as string; }
  catch (e) { if (e instanceof GhError && e.status === 404) return null; throw e; }
}
function ghMessage(e: GhError): Response {
  if (e.status === 401) return fail(502, 'github_token', 'GitHub refuse le jeton (expiré ou révoqué ?) : créez-en un nouveau et remplacez le secret GITHUB_TOKEN.');
  if (e.status === 403 || e.status === 404) return fail(502, 'github_access', 'Le jeton GitHub n’a pas accès à kreeative/kreeative- en écriture (permission « Contents : Read and write »). Étape : ' + e.step + '.');
  if (e.status === 409 || e.status === 422) return fail(409, 'github_conflict', 'GitHub a refusé la mise à jour de la branche (quelqu’un a publié en même temps ?). Rechargez la page et réessayez.', { step: e.step });
  return fail(502, 'github', 'GitHub a répondu ' + e.status + ' (' + e.step + ') : ' + String(e.body?.message ?? ''));
}

type InFile = { path: string; encoding: 'utf-8' | 'base64'; content: string; baseSha?: string | null };

async function publish(b: Record<string, unknown>) {
  const base = String(b.base ?? DEFAULT_BRANCH);
  if (!BRANCH_FOLDERS[base]) return fail(400, 'base', 'Branche de départ inconnue : ' + base);
  const target = b.target === 'draft' ? 'draft' : 'live';
  const branch = target === 'draft' ? String(b.branch ?? '') : base;
  if (target === 'draft' && !DRAFT_RE.test(branch)) return fail(400, 'branch', 'Nom de brouillon invalide : « studio/ » puis des lettres minuscules, chiffres et tirets.');
  const message = String(b.message ?? '').replace(/\r/g, '').trim().slice(0, 4000);
  if (!message) return fail(400, 'message', 'Écrivez un message pour cette publication.');

  const raw = Array.isArray(b.files) ? b.files as InFile[] : [];
  if (!raw.length) return fail(400, 'files', 'Aucun fichier à publier.');
  if (raw.length > MAX_FILES) return fail(413, 'files', 'Trop de fichiers en une fois (' + raw.length + ', au plus ' + MAX_FILES + ').');
  const seen = new Set<string>();
  const files: { path: string; bytes: Uint8Array; baseSha: string | null; text: boolean }[] = [];
  let total = 0;
  for (const f of raw) {
    const path = cleanPath(f?.path);
    if (!path) return fail(400, 'path', 'Chemin refusé : ' + String(f?.path ?? '').slice(0, 120));
    if (!allowedOn(base, path)) return fail(403, 'path', 'Ce fichier n’est pas dans un dossier de site modifiable : ' + path);
    if (seen.has(path)) return fail(400, 'path', 'Fichier en double : ' + path);
    seen.add(path);
    const text = EXT_TEXT.test(path);
    if (text && f.encoding !== 'utf-8') return fail(400, 'encoding', 'Les pages arrivent en texte UTF-8 : ' + path);
    if (!text && f.encoding !== 'base64') return fail(400, 'encoding', 'Les images arrivent en base64 : ' + path);
    if (typeof f.content !== 'string') return fail(400, 'content', 'Contenu manquant : ' + path);
    let bytes: Uint8Array;
    try { bytes = text ? new TextEncoder().encode(f.content) : b64decode(f.content); } catch { return fail(400, 'content', 'Contenu illisible : ' + path); }
    if (bytes.length > MAX_FILE) return fail(413, 'size', 'Fichier trop lourd (' + Math.round(bytes.length / 1048576) + ' Mo, au plus 5 Mo) : ' + path);
    total += bytes.length;
    if (total > MAX_TOTAL) return fail(413, 'size', 'Publication trop lourde (au plus 20 Mo en tout) : publiez en plusieurs fois.');
    const baseSha = typeof f.baseSha === 'string' && /^[0-9a-f]{40}$/.test(f.baseSha) ? f.baseSha : null;
    files.push({ path, bytes, baseSha, text });
  }

  if (!GITHUB_TOKEN) return fail(503, 'github_not_connected', NOT_CONNECTED);

  try {
    // 1. the branch: its head, or (a new draft) the base's head
    const baseHead = await headOf(base);
    if (!baseHead) return fail(404, 'base', 'La branche ' + base + ' n’existe plus sur GitHub.');
    let head = await headOf(branch);
    const creating = !head;
    if (!head) head = baseHead;
    const commit = await gh(repo('/git/commits/' + head), {}, 'commit');
    const treeSha = commit.tree.sha as string;

    // 2. what the branch holds now, for the version check
    const current = new Map<string, string>();
    const tree = await gh(repo('/git/trees/' + treeSha + '?recursive=1'), {}, 'tree');
    if (tree.truncated) {
      for (const f of files) {
        try { const c = await gh(repo('/contents/' + f.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(creating ? base : branch)), {}, 'contents'); current.set(f.path, c.sha); }
        catch (e) { if (!(e instanceof GhError && e.status === 404)) throw e; }
      }
    } else {
      for (const t of tree.tree as any[]) if (t.type === 'blob' && seen.has(t.path)) current.set(t.path, t.sha);
    }
    const conflicts: string[] = [];
    const out: { path: string; sha: string; status: string }[] = [];
    const entries: Record<string, string>[] = [];
    for (const f of files) {
      const sha = await blobSha(f.bytes);
      const now = current.get(f.path) ?? null;
      if (now === sha) { out.push({ path: f.path, sha, status: 'unchanged' }); continue; }
      if (f.baseSha && now !== f.baseSha) { conflicts.push(f.path); continue; }
      if (!f.baseSha && now) { conflicts.push(f.path); continue; } // a « new » file that someone else created meanwhile
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: '' });
      out.push({ path: f.path, sha, status: now ? 'modified' : 'added' });
    }
    if (conflicts.length) {
      return fail(409, 'stale', 'Ces fichiers ont changé sur GitHub depuis que vous les avez ouverts : ' + conflicts.join(', ') + '. Rien n’a été publié ; rechargez le site pour repartir de la dernière version.', { conflicts });
    }
    if (!entries.length) return json({ ok: true, nothing: true, branch, files: out, message: 'Rien de nouveau : GitHub a déjà ces fichiers.' });

    // 3. blobs, tree, commit, ref — one atomic commit
    for (const e of entries) {
      const f = files.find((x) => x.path === e.path)!;
      const blob = await gh(repo('/git/blobs'), { method: 'POST', body: JSON.stringify({ content: b64encode(f.bytes), encoding: 'base64' }) }, 'blob');
      e.sha = blob.sha;
    }
    const newTree = await gh(repo('/git/trees'), { method: 'POST', body: JSON.stringify({ base_tree: treeSha, tree: entries }) }, 'tree-create');
    const date = new Date().toISOString();
    const made = await gh(repo('/git/commits'), {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [head], author: { ...AUTHOR, date }, committer: { ...AUTHOR, date } })
    }, 'commit-create');
    if (creating) {
      await gh(repo('/git/refs'), { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: made.sha }) }, 'ref-create');
    } else {
      await gh(repo('/git/refs/heads/' + refPath(branch)), { method: 'PATCH', body: JSON.stringify({ sha: made.sha, force: false }) }, 'ref-update');
    }
    return json({
      ok: true, branch, created: creating, target,
      commit: { sha: made.sha, url: `https://github.com/${OWNER}/${REPO}/commit/${made.sha}` },
      files: out
    });
  } catch (e) {
    if (e instanceof GhError) return ghMessage(e);
    throw e;
  }
}

async function deployStatus(b: Record<string, unknown>) {
  const sha = String(b.sha ?? '');
  if (!/^[0-9a-f]{40}$/.test(sha)) return fail(400, 'sha', 'Commit inconnu.');
  if (!GITHUB_TOKEN) return fail(503, 'github_not_connected', NOT_CONNECTED);
  try {
    const st = await gh(repo('/commits/' + sha + '/status'), {}, 'status');
    const vercel = (st.statuses as any[] ?? []).find((s) => /vercel/i.test(String(s.context ?? '')));
    let url = vercel?.target_url ?? null;
    let state = vercel?.state ?? 'pending';
    let description = vercel?.description ?? '';
    const deps = await gh(repo('/deployments?sha=' + sha + '&per_page=5'), {}, 'deployments');
    if (Array.isArray(deps) && deps[0]) {
      const ds = await gh(repo('/deployments/' + deps[0].id + '/statuses?per_page=1'), {}, 'deployment-status');
      if (Array.isArray(ds) && ds[0]) {
        const s = ds[0];
        state = s.state === 'success' ? 'success' : (s.state === 'failure' || s.state === 'error' ? 'failure' : 'pending');
        url = s.environment_url || s.target_url || url;
        description = s.description || description;
      }
    }
    return json({ ok: true, state, description, url });
  } catch (e) {
    if (e instanceof GhError) return ghMessage(e);
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'POST seulement.');
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return fail(400, 'json', 'Corps JSON attendu.'); }
  try {
    if (b.action === 'status') return json({ ok: true, github: !!GITHUB_TOKEN, message: GITHUB_TOKEN ? 'GitHub connecté.' : 'GitHub pas encore connecté.' });
    const g = await guard(req);
    if ('error' in g) return g.error;
    switch (b.action) {
      case 'whoami': return json({ ok: true, editor: true, email: g.user.email, github: !!GITHUB_TOKEN, defaultBranch: DEFAULT_BRANCH });
      case 'publish': return await publish(b);
      case 'deploy-status': return await deployStatus(b);
      default: return fail(400, 'action', 'Action inconnue.');
    }
  } catch (e) {
    return fail(500, 'error', 'Une erreur est survenue : ' + String((e as Error)?.message ?? e));
  }
});

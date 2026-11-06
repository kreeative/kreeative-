// Jeere Studio › Mes sites — builds sites.json, the list of every website Anne-Kelly has made in
// kreeative/kreeative-, from git alone (nothing is checked out). Run from the repository root:
//   git fetch origin && node concepts/jeere/studio/sites/build-manifest.mjs
// It reads the default branch (what kreeative.xyz serves) and every other remote branch, and keeps
// the site folders that exist only on another branch (e.g. aissakee/ on claude/aissa-kee-…).
// Per site: id, title, kind, commerce (sells online or not), path, branch, live URL, thumbnail, last change, the HTML pages (with
// their git blob sha, used by the editor to tell whether the copy it opens is the branch's) and the
// folders the Edge Function lets it write (same rules as supabase/functions/sites-publish).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const OUT = path.join(HERE, 'sites.json');
const DEFAULT = process.env.DEFAULT_BRANCH || 'claude/kreeative-portfolio-design-n2a770';
const JEERE_BRANCH = process.env.JEERE_BRANCH || 'claude/session-setup-kcwzk4';
const LIVE = 'https://kreeative.xyz/';

function git(...args) { return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
function gitBuf(...args) { return execFileSync('git', args, { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }); }
function refOf(branch) { return 'origin/' + branch; }
function tree(branch) {
  return git('ls-tree', '-r', '--long', refOf(branch)).split('\n').filter(Boolean).map((l) => {
    const m = /^(\d+) (\w+) ([0-9a-f]{40})\s+(-|\d+)\t(.*)$/.exec(l);
    return m ? { mode: m[1], type: m[2], sha: m[3], size: m[4] === '-' ? 0 : +m[4], path: m[5] } : null;
  }).filter(Boolean);
}
function lastChange(branch, paths) {
  const out = git('log', '-1', '--format=%cI%x09%h%x09%s', refOf(branch), '--', ...paths).trim();
  const [date, short, subject] = out.split('\t');
  return { date: date || null, commit: short || null, subject: subject || '' };
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', middot: '·', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
function titleOf(branch, p) {
  try {
    const html = gitBuf('show', refOf(branch) + ':' + p).toString('utf8');
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : '';
  } catch { return ''; }
}
// E-commerce or not, from the pages themselves: a site that sells through Jeere (Jeere Connect: it loads
// jeere-connect.js or marks a store with data-store) is a « Boutique en ligne », any other a « Site web ».
// COMMERCE forces the answer for a site that sells some other way (none yet). Never guessed from a title.
const COMMERCE = {};
function sellsOnJeere(branch, pages) {
  return pages.some((pg) => {
    try {
      const html = gitBuf('show', refOf(branch) + ':' + pg.path).toString('utf8');
      return /jeere-connect\.js/.test(html) || /\sdata-store=/.test(html);
    } catch { return false; }
  });
}
function shortTitle(t) { return t.replace(/\s+[—|·-]\s+(Kreeative|kreeative)\s*$/, '').trim(); }
function urlOf(p) { return p.replace(/(^|\/)index\.html$/, '$1'); }

// The separate deployments of some sites (their own Vercel projects, from other repositories): shown as a
// second link; « Mes sites » edits the copy in this repository, served by kreeative.xyz.
const EXTERNAL = {
  'websites/rich-and-friends': 'https://richandfriends.xyz/',
  'websites/keewal-meere': 'https://keewaomeere.vercel.app/',
  'websites/cameleon': 'https://cameleon-concept.vercel.app/',
  'websites/tabouret': 'https://tabouret.vercel.app/',
  'websites/guillemot': 'https://guillemot.vercel.app/',
  'websites/the-bakery': 'https://the-bakery-concept.vercel.app/',
  'websites/jessicas-secrets': 'https://kreeative.xyz/concepts/jessicas-secrets/'
};
// The last Vercel preview of a branch-only site (kreeative-site project): its assets are read from there.
const PREVIEW = {
  'claude/aissa-kee-personal-brand-rgrggx': 'https://kreeative-site-27rftjrcj-management-7548s-projects.vercel.app/'
};
const ROOT_FOLDERS = ['about', 'access', 'pricing', 'shop', 'signature', 'teach', 'the-kreeative-designer-newsletter'];
const CONCEPTS_EXCLUDE = new Set(['jeere']);
const KIND_LABEL = { kreeative: 'kreeative.xyz', client: 'Site client', concept: 'Concept', portfolio: 'Étude de cas', personal: 'Marque personnelle' };

const local = new Map(tree(JEERE_BRANCH).map((e) => [e.path, e.sha]));
const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin').split('\n').filter(Boolean)
  .map((r) => r.replace(/^origin\//, '')).filter((b) => b !== 'HEAD' && b !== 'origin');

function pagesIn(entries, branch, folder, filter) {
  return entries.filter((e) => e.type === 'blob' && /\.html?$/i.test(e.path) && filter(e.path)).map((e) => ({
    path: e.path,
    title: titleOf(branch, e.path),
    url: urlOf(e.path.slice(folder ? folder.length + 1 : 0)) || '',
    sha: e.sha,
    size: e.size,
    local: local.get(e.path) === e.sha
  })).sort((a, b) => (a.path.split('/').length - b.path.split('/').length) || a.path.localeCompare(b.path));
}
function siteFrom(branch, entries, folder, kind, extra = {}) {
  const pages = folder === ''
    ? pagesIn(entries, branch, '', (p) => p === 'index.html' || p === '404.html' || ROOT_FOLDERS.some((f) => p.startsWith(f + '/')))
    : pagesIn(entries, branch, folder, (p) => p.startsWith(folder + '/'));
  if (!pages.length) return null;
  const main = pages.find((p) => p.path === (folder ? folder + '/index.html' : 'index.html')) || pages[0];
  const id = folder === '' ? 'kreeative' : folder.replace(/\//g, '--');
  const lc = lastChange(branch, folder === '' ? ['index.html', '404.html', ...ROOT_FOLDERS] : [folder]);
  const images = entries.filter((e) => e.type === 'blob' && folder && e.path.startsWith(folder + '/') && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(e.path)).map((e) => e.path);
  const isDefault = branch === DEFAULT;
  const live = isDefault ? LIVE + (folder ? folder + '/' : '') : (PREVIEW[branch] ? PREVIEW[branch] + folder + '/' : null);
  return {
    id,
    title: shortTitle(main.title) || folder,
    kind, kindLabel: KIND_LABEL[kind],
    commerce: folder in COMMERCE ? !!COMMERCE[folder] : sellsOnJeere(branch, pages),
    path: folder,
    branch,
    onlyOnBranch: !isDefault,
    liveUrl: live,
    externalUrl: EXTERNAL[folder] || null,
    thumbnail: 'thumbs/' + id + '.webp',
    updated: lc,
    local: pages.every((p) => p.local),
    previewBase: isDefault ? null : (PREVIEW[branch] || null),
    writable: folder === '' ? ['index.html', '404.html', ...ROOT_FOLDERS.map((f) => f + '/'), 'assets/img/studio/'] : [folder + '/'],
    uploads: folder === '' ? 'assets/img/studio/' : folder + '/img/',
    pages,
    images: images.slice(0, 400),
    ...extra
  };
}

const sites = [];
const def = tree(DEFAULT);
const defPaths = new Set(def.map((e) => e.path));
const dirsOf = (entries, prefix) => [...new Set(entries.filter((e) => e.path.startsWith(prefix)).map((e) => e.path.slice(prefix.length).split('/')[0]))]
  .filter((d) => d && !d.includes('.'));

sites.push(siteFrom(DEFAULT, def, '', 'kreeative', { title: 'kreeative.xyz' }));
for (const d of dirsOf(def, 'websites/')) sites.push(siteFrom(DEFAULT, def, 'websites/' + d, 'client'));
for (const d of dirsOf(def, 'concepts/')) if (!CONCEPTS_EXCLUDE.has(d)) sites.push(siteFrom(DEFAULT, def, 'concepts/' + d, 'concept'));
for (const d of dirsOf(def, 'portfolio/')) sites.push(siteFrom(DEFAULT, def, 'portfolio/' + d, 'portfolio'));

// Sites that live only on another branch: a folder with an index.html that the default branch does not have
const KNOWN_TOP = new Set(def.map((e) => e.path.split('/')[0]));
for (const b of branches) {
  if (b === DEFAULT || b === JEERE_BRANCH) continue;
  const t = tree(b);
  const candidates = new Set();
  for (const e of t) {
    if (!/(^|\/)index\.html$/.test(e.path) || defPaths.has(e.path)) continue;
    const parts = e.path.split('/');
    if (parts.length === 2 && !KNOWN_TOP.has(parts[0]) && !parts[0].startsWith('.')) candidates.add(parts[0]);
    if (parts.length === 3 && ['websites', 'concepts', 'portfolio'].includes(parts[0]) && parts[1] !== 'jeere') candidates.add(parts[0] + '/' + parts[1]);
  }
  for (const folder of candidates) {
    if (sites.some((s) => s && s.path === folder)) continue;
    const kind = folder.startsWith('websites/') ? 'client' : folder.startsWith('concepts/') ? 'concept' : folder.startsWith('portfolio/') ? 'portfolio' : 'personal';
    sites.push(siteFrom(b, t, folder, kind, { headSha: git('rev-parse', refOf(b)).trim() }));
  }
}

const manifest = {
  version: 1,
  generated: new Date().toISOString(),
  repo: 'kreeative/kreeative-',
  defaultBranch: DEFAULT,
  defaultHead: git('rev-parse', refOf(DEFAULT)).trim(),
  branches,
  sites: sites.filter(Boolean)
};
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 1) + '\n');
console.log('sites.json:', manifest.sites.length, 'sites,', manifest.sites.reduce((n, s) => n + s.pages.length, 0), 'pages');
for (const s of manifest.sites) console.log(' ', s.id.padEnd(58), s.branch === DEFAULT ? '' : '[' + s.branch + ']', s.pages.length, 'page(s)', s.local ? '' : '(not in this checkout)');

/* Jeere Studio › Mes sites — « Publier »: the changed files of the open site go to GitHub in one
 * commit, through the Edge Function `sites-publish` (it alone holds the GitHub token: the browser
 * only sends her Supabase session). « Mettre en ligne » commits on the site's branch (the default
 * branch claude/kreeative-portfolio-design-n2a770 is what kreeative.xyz serves); « Brouillon » on a
 * branch studio/… of her choosing, created from it (Vercel builds a preview of it). Author: always
 * Anne-Kelly Kouyate <annklyy@gmail.com>, with her own message, no other trailer.
 *
 * When GitHub is not connected yet (no GITHUB_TOKEN secret), the dialog shows how to connect it,
 * and « Télécharger les fichiers (.zip) » gives the same files, built here in the « stored » zip
 * format (sites-core.js), to upload by hand on github.com.
 */
(function () {
  'use strict';
  var C = window.JeereSitesCore;
  var doc = document;
  function S() { return window.JeereSites; }
  function $(id) { return doc.getElementById(id); }
  var NB = ' ';
  var MAX_FILES = 40, MAX_TOTAL = 18 * 1024 * 1024;

  function stamp(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function defaultMessage(site, files) {
    var pages = files.filter(function (f) { return f.kind !== 'image'; }).map(function (f) { return f.path.split('/').slice(-2).join('/'); });
    var imgs = files.filter(function (f) { return f.kind === 'image'; }).length;
    return site.title + ' : mise à jour depuis Jeere Studio' + (pages.length ? ' (' + pages.slice(0, 3).join(', ') + (pages.length > 3 ? '…' : '') + ')' : '') + (imgs ? ', ' + imgs + ' image' + (imgs > 1 ? 's' : '') : '');
  }
  function setupSteps() {
    return '<ol class="sk-steps">' +
      '<li>Sur <b>github.com</b>, connectée au compte <b>kreeative</b> : <b>Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token</b>.</li>' +
      '<li>Nom : <code>Jeere Mes sites</code> · Expiration : <b>1 an</b> (notez la date : un nouveau jeton à créer avant) · Resource owner : <b>kreeative</b>.</li>' +
      '<li>Repository access : <b>Only select repositories</b> › <code>kreeative/kreeative-</code>.</li>' +
      '<li>Permissions › Repository permissions › <b>Contents : Read and write</b> (Metadata : Read-only s’ajoute tout seul). Rien d’autre.</li>' +
      '<li><b>Generate token</b>, puis copiez-le (il ne s’affiche qu’une fois).</li>' +
      '<li>Sur <b>supabase.com</b> : projet <b>Jeere</b> › <b>Edge Functions › Secrets</b> › <b>Add new secret</b> : nom <code>GITHUB_TOKEN</code>, valeur = le jeton › <b>Save</b>.</li>' +
      '<li>Revenez ici et cliquez <b>Réessayer</b>. Le jeton ne passe jamais par le navigateur.</li>' +
      '</ol>';
  }

  function downloadZip(site, files) {
    var bytes = C.zip(files.map(function (f) { return { path: f.path, bytes: f.bytes }; }));
    var blob = new Blob([bytes], { type: 'application/zip' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    var slug = C.slugify(site.title) || site.id;
    a.download = 'kreeative-' + (slug === 'kreeative' ? '' : slug + '-') + stamp(new Date()) + '.zip';
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return bytes;
  }

  function open() {
    var A = S();
    var site = A.site();
    if (!site) return;
    var list = A.changes();
    var M = A.manifest();
    var isDefault = site.branch === M.defaultBranch;
    var box = A.ce('div');
    box.appendChild(head(site, list));
    if (!list.length) {
      // nothing new: the site, its address and its state, and a way to open it
      var none = A.ce('div');
      none.innerHTML = '<p>Le site en ligne est à jour : aucune modification à publier. Modifiez une page, puis revenez ici.</p>' +
        '<div class="sk-actions"><button class="sk-ghost" type="button" data-close>Fermer</button>' +
        (site.liveUrl ? '<a class="sk-primary sk-btnlink" href="' + A.esc(site.liveUrl) + '" target="_blank" rel="noopener">Voir le site ↗</a>' : '') + '</div>';
      box.appendChild(none);
      A.openModal('Publier', box, { width: '560px' });
      return;
    }
    box.appendChild(A.ce('p', null, A.plural(list.length, 'fichier part', 'fichiers partent') + ' en <b>une seule</b> publication. Tout le reste du site reste identique.'));
    box.appendChild(A.fileRows(list, true));
    var draftName = 'studio/brouillon-' + (C.slugify(site.id).slice(0, 30) || 'site') + '-' + stamp(new Date());
    var dest = A.ce('div', 'sk-dest');
    dest.innerHTML =
      '<label><b><input type="radio" name="skTarget" value="live" checked> Mettre en ligne</b><small>' +
      (isDefault ? 'Sur kreeative.xyz : le site se met à jour en une ou deux minutes.' : 'Dans ' + A.esc(bl(site.branch)) + ', la seule où vit ce site (aperçu Vercel).') + '</small></label>' +
      '<label><b><input type="radio" name="skTarget" value="draft"> Brouillon</b><small>Une copie à part de ' + A.esc(bl(site.branch)) + ' : Vercel en fait un aperçu, le site en ligne ne change pas.</small></label>';
    box.appendChild(dest);
    var bwrap = A.ce('label', 'sk-field');
    bwrap.innerHTML = '<span>Nom du brouillon</span><input class="sk-input" id="skDraft" spellcheck="false" autocomplete="off">';
    bwrap.hidden = true;
    box.appendChild(bwrap);
    var msg = A.ce('label', 'sk-field');
    msg.style.marginTop = '12px';
    msg.innerHTML = '<span>Message de la publication</span><textarea class="sk-textarea" id="skMsg" rows="3" spellcheck="true"></textarea>';
    box.appendChild(msg);
    var auth = A.config.author;
    box.appendChild(A.ce('p', 'sk-note', 'Autrice : ' + A.esc(auth.name) + ' &lt;' + A.esc(auth.email) + '&gt; · dépôt ' + A.esc(M.repo) + (A.demo ? ' · <b>mode démo</b>' : '')));
    var status = A.ce('div');
    status.id = 'skPubStatus';
    status.style.marginTop = '12px';
    box.appendChild(status);
    var act = A.ce('div', 'sk-actions');
    act.innerHTML = '<button class="sk-ghost" type="button" id="skZip">Télécharger les fichiers (.zip)</button><button class="sk-primary" type="button" id="skGo">Publier</button>';
    box.appendChild(act);
    A.openModal('Publier ' + site.title, box, { width: '680px' });
    $('skDraft').value = draftName;
    $('skMsg').value = defaultMessage(site, list);
    dest.addEventListener('change', function () { bwrap.hidden = target() !== 'draft'; $('skGo').textContent = target() === 'draft' ? 'Publier le brouillon' : 'Publier'; });
    function target() { var r = dest.querySelector('input:checked'); return r ? r.value : 'live'; }
    function chosen() {
      var out = [];
      box.querySelectorAll('input[data-file]').forEach(function (c) { if (c.checked) out.push(list[+c.getAttribute('data-file')]); });
      return out;
    }
    $('skZip').addEventListener('click', function () {
      var files = chosen();
      if (!files.length) { A.toast('Cochez au moins un fichier.', 'info'); return; }
      downloadZip(site, files);
      A.toast('Fichiers téléchargés (.zip) : à déposer à leur place sur github.com (Add file › Upload files).', 'ok');
    });
    $('skGo').addEventListener('click', function () { send(site, chosen(), target()); });
  }

  // The top of the dialog: the site, its address (to open or copy), the open page, and where it stands
  function head(site, list) {
    var A = S();
    var live = site.liveUrl || null;
    var page = A.pageLiveUrl();
    var h = A.ce('div');
    var bar = A.ce('div', 'sk-pubhead');
    var state = !live ? '<i class="is-off"></i>Pas encore en ligne' + (site.onlyOnBranch ? ' · ' + A.esc(bl(site.branch)) : '') :
      list.length ? '<i class="is-warn"></i>En ligne · ' + A.plural(list.length, 'modification non publiée', 'modifications non publiées') :
      '<i></i>En ligne · à jour';
    bar.innerHTML = '<img class="sk-pubhead__img" alt="" src="' + A.esc(site.thumbnail) + '" onerror="this.remove()">' +
      '<div class="sk-pubhead__t"><b>' + A.esc(site.title) + '</b>' +
      (live ? '<div class="sk-pubhead__url"><a href="' + A.esc(live) + '" target="_blank" rel="noopener">' + A.esc(live.replace(/^https?:\/\//, '').replace(/\/$/, '')) + ' ↗</a>' +
        '<button class="sk-linkbtn" type="button" data-copy>Copier le lien</button></div>' : '') +
      '<div class="sk-pubhead__state">' + state + (site.updated && site.updated.date ? ' · dernière mise à jour le ' + A.esc(A.fmtDate(site.updated.date)) : '') + '</div></div>';
    h.appendChild(bar);
    if (page && page !== live) {
      var cur = A.page();
      h.appendChild(A.ce('p', 'sk-pubpage', 'Page ouverte : <a href="' + A.esc(page) + '" target="_blank" rel="noopener">' + A.esc(page.replace(/^https?:\/\//, '')) + ' ↗</a>' + (cur && cur.isNew ? ' (pas encore publiée)' : '')));
    }
    var cp = bar.querySelector('[data-copy]');
    if (cp) cp.addEventListener('click', function () {
      var done = function () { cp.textContent = 'Copié'; setTimeout(function () { cp.textContent = 'Copier le lien'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(live).then(done, function () { A.toast(live, 'info'); });
      else A.toast(live, 'info');
    });
    return h;
  }

  // several branches in one go (Kreeative and a client site not on kreeative.xyz yet): one status line each
  var multi = null;
  function bl(b) { return (window.JeereSitesBranchLabel || function (x) { return x; })(b); }
  function show(html) { var s = $('skPubStatus'); if (!s) return; if (multi) { var d = multi.lines[multi.k]; if (!d) { d = multi.lines[multi.k] = S().ce('div'); s.appendChild(d); } d.innerHTML = html; } else s.innerHTML = html; }
  function busy(on) { var g = $('skGo'); if (g) { g.disabled = on; g.innerHTML = on ? '<span class="sk-spin"></span> Publication…' : 'Réessayer'; } }

  function payloadFor(site, files, target) {
    var tgt = target === 'draft' ? 'draft' : 'live';
    return {
      action: 'publish', site: site.id, base: site.branch, target: tgt,
      branch: tgt === 'draft' ? String(($('skDraft') && $('skDraft').value) || '').trim() : site.branch,
      message: String(($('skMsg') && $('skMsg').value) || '').trim(),
      files: files.map(function (f) {
        return { path: f.path, encoding: f.encoding, content: f.encoding === 'utf-8' ? f.text : C.toBase64(f.bytes), baseSha: f.baseSha || null };
      })
    };
  }

  // One publication per branch: the files of each page go to the branch that page lives on
  function send(site, files, target) {
    var A = S();
    if (!files.length) { A.toast('Cochez au moins un fichier.', 'info'); return; }
    var groups = {}, keys = [];
    files.forEach(function (f) { var b = f.branch || site.branch; if (!groups[b]) { groups[b] = []; keys.push(b); } groups[b].push(f); });
    if (keys.length === 1) { multi = null; return sendOne(Object.assign({}, site, { branch: keys[0] }), files, target, ''); }
    multi = { lines: {}, k: 0 };
    var st = $('skPubStatus'); if (st) st.innerHTML = '';
    var i = 0;
    (function next() {
      if (i >= keys.length) return;
      var k = keys[i++];
      multi.k = k;
      sendOne(Object.assign({}, site, { branch: k }), groups[k], target, i > 1 ? '-' + i : '', next);
    })();
  }

  function sendOne(site, files, target, draftSuffix, then) {
    var A = S();
    if (files.length > MAX_FILES) { show('<div class="sk-alert sk-alert--warn">Au plus ' + MAX_FILES + ' fichiers par publication : décochez-en quelques-uns.</div>'); return; }
    var total = files.reduce(function (n, f) { return n + f.bytes.length; }, 0);
    if (total > MAX_TOTAL) { show('<div class="sk-alert sk-alert--warn">Publication trop lourde (' + Math.round(total / 1048576) + NB + 'Mo) : publiez les images en plusieurs fois.</div>'); return; }
    var body = payloadFor(site, files, target);
    if (draftSuffix && body.target === 'draft') body.branch = body.branch.slice(0, 60 - draftSuffix.length) + draftSuffix;
    if (!body.message) { show('<div class="sk-alert sk-alert--warn">Écrivez un message pour cette publication.</div>'); return; }
    if (body.target === 'draft' && !/^studio\/[a-z0-9][a-z0-9-]{0,60}$/.test(body.branch)) { show('<div class="sk-alert sk-alert--warn">Le nom du brouillon commence par « studio/ », puis des lettres minuscules, des chiffres et des tirets.</div>'); return; }
    busy(true);
    show('');
    var tokP = A.demo ? Promise.resolve(null) : A.sessionToken();
    tokP.then(function (tok) { return A.callFn(body, tok); }).then(function (r) {
      busy(false);
      if (r && r.ok && r.commit) { done(site, r, body); if (then) then(); return; }
      if (r && r.ok && r.nothing) { show('<div class="sk-alert sk-alert--ok">' + A.esc(r.message || 'GitHub a déjà ces fichiers.') + '</div>'); A.markPublished(r.files, body.target); if (then) then(); return; }
      fail(site, files, r || {});
    }, function () {
      busy(false);
      fail(site, files, { code: 'network', message: 'Le serveur de Jeere ne répond pas (connexion ?).' });
    });
  }

  function fail(site, files, r) {
    var A = S();
    var code = r.code || '', st = r.httpStatus;
    if (code === 'github_not_connected' || st === 503) {
      show('<div class="sk-alert sk-alert--warn"><div><b>GitHub pas encore connecté.</b> La publication directe attend le jeton GitHub (une seule fois, quelques minutes) :</div></div>' + setupSteps() +
        '<p class="sk-note">En attendant : « Télécharger les fichiers (.zip) », puis sur github.com › kreeative/kreeative- › ' + A.esc(bl(site.branch)) + ' › Add file › Upload files, en gardant les dossiers.</p>');
      return;
    }
    if (st === 401 || code === 'no_session') {
      show('<div class="sk-alert sk-alert--warn">' + (A.demo ? 'Mode démo : rien n’a été publié (pas de compte connecté). ' : 'Votre session a expiré. ') +
        '<a href="../../compte/?suite=studio#connexion" target="_blank" rel="noopener">Se connecter</a>, puis Réessayer — ou téléchargez les fichiers (.zip).</div>');
      return;
    }
    if (st === 403) { show('<div class="sk-alert sk-alert--err">' + A.esc(r.message || 'Ce compte ne peut pas publier ces sites.') + '</div>'); return; }
    if (code === 'stale') {
      show('<div class="sk-alert sk-alert--err"><div><b>La version en ligne a changé</b> depuis que vous avez ouvert ' + A.esc((r.conflicts || []).join(', ')) + '. Rien n’a été publié. Téléchargez vos fichiers (.zip) pour les garder, puis rechargez le site.</div></div>');
      return;
    }
    show('<div class="sk-alert sk-alert--err">' + A.esc(r.message || 'La publication a échoué.') + ' Vos modifications restent sur cet appareil ; le .zip reste possible.</div>');
  }

  function done(site, r, body) {
    var A = S();
    var live = body.target === 'live' && site.branch === A.manifest().defaultBranch ? A.pageLiveUrl() : null;
    show('<div class="sk-alert sk-alert--ok"><div><b>Publié.</b> ' + A.plural(r.files.filter(function (f) { return f.status !== 'unchanged'; }).length, 'fichier', 'fichiers') + ' en une seule publication' + (r.created ? ' (brouillon créé)' : '') + '. ' +
      '<a href="' + A.esc(r.commit.url) + '" target="_blank" rel="noopener">Voir le commit</a>' +
      (live ? ' · <a href="' + A.esc(live) + '" target="_blank" rel="noopener">Voir la page en ligne ↗</a>' : '') +
      '<div class="sk-note" id="skDeploy" style="margin-top:4px">Vercel : en attente du déploiement…</div></div></div>');
    var g = $('skGo');
    if (g) { var g2 = g.cloneNode(false); g2.textContent = 'Fermer'; g2.disabled = false; g.replaceWith(g2); g2.addEventListener('click', function () { A.closeModal(); }); }
    A.markPublished(r.files, body.target);
    A.toast(body.target === 'draft' ? 'Brouillon publié.' : 'Publié.', 'ok');
    pollDeploy(r.commit.sha, 0);
  }
  function pollDeploy(sha, n) {
    var A = S();
    var line = $('skDeploy');
    if (!line || n > 36) { if (line) line.textContent = 'Vercel : pas de nouvelles après 3 minutes — regardez le tableau de bord Vercel.'; return; }
    var tokP = A.demo ? Promise.resolve(null) : A.sessionToken();
    tokP.then(function (tok) { return A.callFn({ action: 'deploy-status', sha: sha }, tok); }).then(function (r) {
      line = $('skDeploy');
      if (!line) return;
      if (!r || !r.ok) { line.textContent = 'Vercel : statut indisponible' + (r && r.message ? ' (' + r.message + ')' : '') + '.'; return; }
      if (r.state === 'success') { line.innerHTML = 'Vercel : <b>déployé</b>' + (r.url ? ' · <a href="' + A.esc(r.url) + '" target="_blank" rel="noopener">aperçu ↗</a>' : '') + '.'; return; }
      if (r.state === 'failure' || r.state === 'error') { line.innerHTML = 'Vercel : <b>le déploiement a échoué</b>' + (r.url ? ' · <a href="' + A.esc(r.url) + '" target="_blank" rel="noopener">détails ↗</a>' : '') + '.'; return; }
      line.textContent = 'Vercel : déploiement en cours' + (r.description ? ' (' + r.description + ')' : '') + '…';
      setTimeout(function () { pollDeploy(sha, n + 1); }, 5000);
    }, function () { setTimeout(function () { pollDeploy(sha, n + 1); }, 5000); });
  }

  window.JeereSitesPublish = { open: open, downloadZip: downloadZip, payloadFor: payloadFor, setupSteps: setupSteps };
})();

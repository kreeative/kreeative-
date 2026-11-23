/*
 * Jehre — atlas.js: « Atlas », the founder's own space (jehre.com/atlas/). In Jehre's own light look, apart from the sellers'
 * dashboard: who signed up, their stores and plans, what was bought, who is on jehre.com right now.
 * Read-only. The server decides who may see it: public.jeere_accounts() and public.site_visits_live() answer only an
 * account listed in public.site_editors; anyone else gets the « réservé » screen.
 */
(function () {
  'use strict';
  var SB = 'https://aezchxfvzfoqlvzchqyk.supabase.co', KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var NB = ' ';
  var root = document.getElementById('atlas');
  var S = { tab: 'vue', accounts: null, live: null, q: '', filter: 'tous', email: '' };
  var PLAN = { gratuit: 'Gratuit', essentiel: 'Essentiel', pro: 'Pro', business: 'Business' };
  var PRICE = { essentiel: 3500, pro: 10000, business: 25000 };
  var TABS = [['vue', 'Vue d’ensemble'], ['comptes', 'Inscrits'], ['boutiques', 'Boutiques'], ['achats', 'Achats'], ['direct', 'En direct']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NB); }
  function fcfa(n) { return num(n) + NB + 'FCFA'; }
  function day(v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'; }
  function ago(v) {
    var d = v ? new Date(v) : null; if (!d || isNaN(d)) return '—';
    var m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (m < 1) return 'à l’instant'; if (m < 60) return 'il y a ' + m + NB + 'min';
    var h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + NB + 'h';
    var j = Math.round(h / 24); return j < 31 ? 'il y a ' + j + NB + 'j' : day(v);
  }
  function session() { var A = window.JeereAuth; return Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).catch(function () { return null; }); }
  function rpc(name, body) {
    return session().then(function (ses) {
      if (!ses || !ses.access_token) return { status: 0 };
      return fetch(SB + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + ses.access_token }, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, ok: r.ok, data: j }; }); });
    }).catch(function () { return { status: -1 }; });
  }
  // the founder's own stores (the demos, the models) are set to Business for free: they are not customers
  function mine(a) { return !!(a && S.email && String(a.email || '').toLowerCase() === S.email.toLowerCase()); }
  function paying(x, a) { return !!(x.plan && x.plan !== 'gratuit' && !x.plan_promo && !mine(a)); }
  function offered(x, a) { return !!(x.plan && x.plan !== 'gratuit' && x.plan_promo && !mine(a)); }
  function allStores() { var out = []; arr(S.accounts).forEach(function (a) { arr(a.stores).forEach(function (x) { out.push({ s: x, a: a }); }); }); return out; }
  function allBuys() { var out = []; arr(S.accounts).forEach(function (a) { arr(a.models).forEach(function (m) { out.push({ m: m, a: a }); }); }); return out.sort(function (x, y) { return String(y.m.at).localeCompare(String(x.m.at)); }); }

  function gate(title, text, btn) {
    root.innerHTML = '<div class="at-gate"><p class="at-brand" style="justify-content:center;margin:0 0 26px"><img class="at-brand__j" src="../img/brand/jehre-wordmark.png" alt="Jehre"><span class="at-brand__a">Atlas</span></p><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p>' + (btn || '') + '</div>';
  }

  function shell(inner) {
    return '<header class="at-top"><p class="at-brand" style="margin:0 auto 0 0"><img class="at-brand__j" src="../img/brand/jehre-wordmark.png" alt="Jehre"><span class="at-brand__a">Atlas</span></p>' +
      '<span class="at-me">' + esc(S.email) + '</span><a class="at-btn" href="../admin/">Ma boutique</a><button class="at-btn" type="button" data-refresh>Actualiser</button></header>' +
      '<nav class="at-tabs" role="tablist">' + TABS.map(function (t) { return '<button class="at-tab" role="tab" type="button" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + esc(t[1]) + '</button>'; }).join('') + '</nav>' + inner;
  }
  function kpi(label, value, sub) { return '<div class="at-kpi"><dt>' + esc(label) + '</dt><dd>' + esc(value) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</dd></div>'; }

  function vue() {
    var A = arr(S.accounts), st = allStores(), buys = allBuys();
    var pay = st.filter(function (x) { return paying(x.s, x.a); }), off = st.filter(function (x) { return offered(x.s, x.a); });
    var mrr = pay.reduce(function (n, x) { return n + (PRICE[x.s.plan] || 0); }, 0);
    var sold = buys.reduce(function (n, x) { return n + (Number(x.m.amount) || 0); }, 0);
    var since = function (h) { var t = Date.now() - h * 3600000; return A.filter(function (a) { return new Date(a.created_at).getTime() > t; }).length; };
    var days = [];
    for (var i = 13; i >= 0; i--) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ d: d, n: 0 }); }
    A.forEach(function (a) { var t = new Date(a.created_at); t.setHours(0, 0, 0, 0); days.forEach(function (x) { if (x.d.getTime() === t.getTime()) x.n++; }); });
    var max = Math.max.apply(null, [1].concat(days.map(function (x) { return x.n; })));
    var src = {}; A.forEach(function (a) { var k = a.source || 'direct'; src[k] = (src[k] || 0) + 1; });
    var srcs = Object.keys(src).sort(function (x, y) { return src[y] - src[x]; });
    var todo = buys.filter(function (x) { return x.m.install && !x.m.installed_at; });
    return '<dl class="at-kpis">' +
      kpi('Inscrits', num(A.length), '+' + since(24) + ' en 24' + NB + 'h · +' + since(168) + ' en 7' + NB + 'j') +
      kpi('E-mail confirmé', num(A.filter(function (a) { return a.confirmed; }).length)) +
      kpi('Boutiques', num(st.length), num(st.filter(function (x) { return x.s.published; }).length) + ' en ligne') +
      kpi('Formules payées', num(pay.length), fcfa(mrr) + ' / mois') +
      kpi('En offre de lancement', num(off.length), 'gratuit pour l’instant') +
      kpi('Modèles vendus', num(buys.length), fcfa(sold)) +
      kpi('Installations à faire', num(todo.length)) + '</dl>' +
      '<div class="at-grid"><div><section class="at-card"><h2>Inscriptions<span>14 derniers jours</span></h2><div class="at-bars">' +
      days.map(function (x) { return '<div><b>' + (x.n || '') + '</b><i style="height:' + Math.round(100 * x.n / max) + '%"></i><span>' + x.d.getDate() + '</span></div>'; }).join('') + '</div></section>' +
      '<section class="at-card"><h2>Derniers inscrits</h2><ul class="at-list">' + A.slice(0, 8).map(function (a) {
        return '<li><span><strong>' + esc(a.first_name || a.email || '—') + '</strong><small>' + esc(a.email || '') + (a.source ? ' · via ' + esc(a.source) : '') + '</small></span><span class="r">' + esc(ago(a.created_at)) + '<br>' + (arr(a.stores).length ? esc(arr(a.stores)[0].name) : 'pas de boutique') + '</span></li>';
      }).join('') + '</ul></section></div>' +
      '<div><section class="at-card"><h2>D’où ils viennent</h2><ul class="at-list">' + srcs.map(function (k) { return '<li><span>' + esc(k === 'direct' ? 'Direct' : k.charAt(0).toUpperCase() + k.slice(1)) + '</span><span class="r">' + src[k] + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="at-card"><h2>Installations à faire</h2>' + (todo.length ? '<ul class="at-list">' + todo.map(function (x) {
        return '<li><span><strong>' + esc(String(x.m.model).toUpperCase()) + '</strong><small>' + esc(x.a.first_name || '') + ' · ' + esc(x.a.email || '') + '</small></span><span class="r">' + esc(day(x.m.at)) + '</span></li>';
      }).join('') + '</ul>' : '<p class="at-none">Rien en attente.</p>') + '</section></div></div>';
  }

  var FILTERS = [['tous', 'Tous'], ['boutique', 'Avec boutique'], ['sans', 'Sans boutique'], ['payant', 'Formule payée'], ['nonconf', 'Non confirmé']];
  function match(a) {
    var st = arr(a.stores);
    if (S.filter === 'boutique' && !st.length) return false;
    if (S.filter === 'sans' && st.length) return false;
    if (S.filter === 'payant' && !st.some(function (x) { return paying(x, a); })) return false;
    if (S.filter === 'nonconf' && a.confirmed) return false;
    if (!S.q) return true;
    var hay = [a.first_name, a.email, a.phone, a.source].concat(st.map(function (x) { return x.name + ' ' + x.slug; })).join(' ').toLowerCase();
    return hay.indexOf(S.q) !== -1;
  }
  function planCell(x, a) {
    return '<span class="at-pill' + (paying(x, a) ? ' at-pill--gold' : '') + '">' + esc(PLAN[x.plan] || x.plan || 'Gratuit') + (x.plan_promo ? ' · offert' : mine(a) && x.plan !== 'gratuit' ? ' · à vous' : '') + '</span>' + (x.plan_until && x.plan && x.plan !== 'gratuit' ? '<small>jusqu’au ' + esc(day(x.plan_until)) + '</small>' : '');
  }
  function tools() {
    return '<div class="at-tools"><input class="at-input" type="search" data-q value="' + esc(S.q) + '" placeholder="Chercher un nom, un e-mail, une boutique" aria-label="Chercher" autocomplete="off">' +
      FILTERS.map(function (f) { return '<button class="at-chipbtn" type="button" data-filter="' + f[0] + '" aria-pressed="' + (S.filter === f[0]) + '">' + esc(f[1]) + '</button>'; }).join('') + '</div>';
  }
  function comptes() {
    var list = arr(S.accounts).filter(match);
    return tools() + '<section class="at-card"><h2>Inscrits<span>' + list.length + '</span></h2><div class="at-wrap"><table class="at-t"><thead><tr><th>Personne</th><th>Inscrit</th><th>Dernière visite</th><th>Boutiques et formules</th><th>Modèles</th></tr></thead><tbody>' +
      list.map(function (a) {
        return '<tr><td><strong>' + esc(a.first_name || '—') + '</strong> ' + (a.confirmed ? '' : '<span class="at-pill at-pill--warn">non confirmé</span>') + '<small>' + esc(a.email || '') + (a.phone ? ' · ' + esc(a.phone) : '') + (a.source ? ' · via ' + esc(a.source) : '') + '</small></td>' +
          '<td>' + esc(day(a.created_at)) + '</td><td>' + esc(ago(a.last_sign_in_at)) + '</td>' +
          '<td>' + (arr(a.stores).length ? arr(a.stores).map(function (x) { return '<div style="margin-bottom:6px"><a href="https://jehre.com/b/' + esc(x.slug) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a> ' + planCell(x, a) + '</div>'; }).join('') : '<span class="at-none">—</span>') + '</td>' +
          '<td>' + (arr(a.models).length ? arr(a.models).map(function (m) { return '<div><strong>' + esc(String(m.model).toUpperCase()) + '</strong>' + (m.install ? ' + installation' : '') + '</div>'; }).join('') : '<span class="at-none">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (list.length ? '' : '<p class="at-none">Personne ne correspond.</p>') + '</section>';
  }
  function boutiques() {
    var q = S.q, list = allStores().filter(function (x) { return !q || (x.s.name + ' ' + x.s.slug + ' ' + (x.a.email || '') + ' ' + (x.a.first_name || '')).toLowerCase().indexOf(q) !== -1; })
      .sort(function (x, y) { return String(y.s.created_at).localeCompare(String(x.s.created_at)); });
    return '<div class="at-tools"><input class="at-input" type="search" data-q value="' + esc(S.q) + '" placeholder="Chercher une boutique ou sa propriétaire" aria-label="Chercher" autocomplete="off"></div>' +
      '<section class="at-card"><h2>Boutiques<span>' + list.length + '</span></h2><div class="at-wrap"><table class="at-t"><thead><tr><th>Boutique</th><th>Propriétaire</th><th>Formule</th><th>État</th><th>Créée</th></tr></thead><tbody>' +
      list.map(function (x) {
        var s = x.s;
        return '<tr><td><a href="https://jehre.com/b/' + esc(s.slug) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a><small>' + esc(s.domain || s.slug + '.store.jehre.com') + '</small></td>' +
          '<td>' + esc(x.a.first_name || '—') + '<small>' + esc(x.a.email || '') + '</small></td><td>' + planCell(s, x.a) + '</td>' +
          '<td>' + (s.published ? '<span class="at-pill at-pill--ok">en ligne</span>' : '<span class="at-pill">brouillon</span>') + '</td><td>' + esc(day(s.created_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }
  function achats() {
    var list = allBuys(), sold = list.reduce(function (n, x) { return n + (Number(x.m.amount) || 0); }, 0);
    return '<dl class="at-kpis">' + kpi('Modèles vendus', num(list.length)) + kpi('Encaissé', fcfa(sold)) + kpi('Avec installation', num(list.filter(function (x) { return x.m.install; }).length)) + '</dl>' +
      '<section class="at-card"><h2>Achats de modèles</h2>' + (list.length ? '<div class="at-wrap"><table class="at-t"><thead><tr><th>Modèle</th><th>Qui</th><th>Montant</th><th>Installation</th><th>Date</th></tr></thead><tbody>' +
      list.map(function (x) {
        var m = x.m;
        return '<tr><td><strong>' + esc(String(m.model).toUpperCase()) + '</strong></td><td>' + esc(x.a.first_name || '—') + '<small>' + esc(x.a.email || '') + (x.a.phone ? ' · ' + esc(x.a.phone) : '') + '</small></td><td>' + esc(fcfa(m.amount || 0)) + '</td>' +
          '<td>' + (!m.install ? '<span class="at-pill">elle remplit elle-même</span>' : m.installed_at ? '<span class="at-pill at-pill--ok">faite le ' + esc(day(m.installed_at)) + '</span>' : '<span class="at-pill at-pill--warn">à faire</span>') + '</td><td>' + esc(day(m.at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="at-none">Aucun achat pour l’instant.</p>') + '</section>';
  }
  function pageName(p) {
    var m = { '/': 'Accueil', '/creer/': 'Créer une boutique', '/compte/': 'Compte', '/admin/': 'Tableau de bord', '/abonnements/': 'Tarifs du Studio', '/studio/': 'Studio', '/a-propos/': 'À propos', '/pitch/': 'Pitch' };
    var k = String(p || '/').split('?')[0].split('#')[0].replace(/index\.html$/, ''); if (k.charAt(k.length - 1) !== '/') k += '/';
    return m[k] || (k.length > 40 ? k.slice(0, 40) + '…' : k);
  }
  function direct() {
    var LV = window.JeereAdminLive;
    if (!LV) return '<section class="at-card"><p class="at-none">Le globe n’a pas pu se charger.</p></section>';
    LV.site('jehre-com');
    return LV.view();
  }

  function draw(keepFocus) {
    var view = { vue: vue, comptes: comptes, boutiques: boutiques, achats: achats, direct: direct }[S.tab] || vue;
    root.innerHTML = shell(view());
    if (keepFocus) { var q = root.querySelector('[data-q]'); if (q) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch (e) { /* fine */ } } }
  }
  function load() {
    return rpc('jeere_accounts').then(function (r) {
      if (r.status === 0) return gate('Espace réservé', 'Connectez-vous avec votre compte Jehre pour ouvrir Atlas.', '<a class="at-btn at-btn--gold" href="../compte/#connexion">Me connecter</a>');
      if (!r.ok || !Array.isArray(r.data)) return gate('Espace réservé', r.status === 403 || r.status === 401 ? 'Atlas est réservé à la fondatrice de Jehre.' : 'Atlas n’a pas pu se charger. Réessayez dans un instant.', '<a class="at-btn" href="../admin/">Retour au tableau de bord</a>');
      S.accounts = r.data;
      draw();
    });
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-tab],[data-filter],[data-refresh]') : null;
    if (!t) return;
    if (t.hasAttribute('data-tab')) { S.tab = t.getAttribute('data-tab'); S.q = ''; S.filter = 'tous'; try { history.replaceState(null, '', '#' + S.tab); } catch (x) { /* fine */ } draw(); }
    else if (t.hasAttribute('data-filter')) { S.filter = t.getAttribute('data-filter'); draw(); }
    else { t.textContent = 'Actualisation…'; load(); }
  });
  root.addEventListener('input', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-q')) { S.q = String(e.target.value || '').trim().toLowerCase(); draw(true); } });
  setInterval(function () { if (S.accounts && S.tab !== 'direct' && !document.hidden && !S.q) load(); }, 120000);

  var h = (location.hash || '').slice(1);
  if (TABS.some(function (t) { return t[0] === h; })) S.tab = h;
  session().then(function (ses) { S.email = ses && ses.user && ses.user.email ? ses.user.email : ''; load(); });
})();

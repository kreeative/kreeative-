/*
 * Jeere — domains.js: a seller's own domain name (classic script, no DOM, no library).
 * Global: window.JeereDomains. Loaded by the dashboard (../admin/) and the checkout (../abonnements/),
 * after data.js (and publish.js for the session). README « Domaines » explains the whole flow.
 *
 *   validate(input)        → { ok, domain, apex, kind: 'apex' | 'www' | 'sub', message }
 *   records(domain)        → the DNS records to add at her registrar: [{ id, type, name, value, host, required }]
 *   REGISTRARS             → short step-by-step guides (GoDaddy, Namecheap, Hostinger, OVHcloud, Cloudflare)
 *   check(domain)          → Promise: each record looked up with DNS-over-HTTPS (dns.google) → [{ …record, ok, found }]
 *   fn(action, body)       → Promise: the `domains` Edge Function (Supabase), with her session when she has one
 *   search(name)           → Promise { configured, label, results: [{ domain, tld, status: 'free' | 'taken' |
 *                            'likely' | 'unknown', buy, renew, via }] } — Vercel's real availability when the
 *                            server has its token, else a DNS heuristic (« vérification finale par l’équipe »)
 *   price(tld) / fcfa(usd) → the resale price in FCFA (PRICES: Vercel's registrar prices on 6 November 2026)
 */
(function (root) {
  'use strict';

  var D = root.JEERE_DATA || {};
  var A_RECORD = D.DNS_APEX_A || '76.76.21.21';
  var CNAME = D.DNS_TARGET || 'cname.vercel-dns.com';
  var FN_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/domains';
  var SB_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var DOH = 'https://dns.google/resolve';
  var NB = ' ';
  var PROTECTED = /(^|\.)(kreeative\.xyz|vercel\.app|vercel\.com|jeere\.shop|supabase\.co|localhost)$/;
  var TWO_LEVEL = /\.(co|com|net|org|gouv|edu|ac|or|go)\.[a-z]{2}$/;

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }

  /* ---------------------------------------------------------------- names */

  function clean(v) {
    var s = str(v).trim().toLowerCase();
    if (s.normalize) s = s.normalize('NFC');
    return s.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '').replace(/\s+/g, '');
  }
  function apexOf(d) {
    var parts = d.split('.');
    return parts.slice(-(TWO_LEVEL.test(d) ? 3 : 2)).join('.');
  }
  function validate(input) {
    var d = clean(input);
    var bad = function (m) { return { ok: false, domain: d, message: m.replace(/ ([:;!?»])/g, NB + '$1') }; };
    if (!d) return bad('Écrivez votre nom de domaine, par exemple awabeaute.com.');
    if (/[^a-z0-9.-]/.test(d)) return bad('Lettres sans accent, chiffres, points et tirets seulement : par exemple awabeaute.com.');
    if (d.indexOf('.') === -1) return bad('Il manque l’extension : awabeaute.com, awabeaute.ci, awabeaute.shop…');
    if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) || d.length > 253) return bad('Ce nom de domaine n’est pas valide : vérifiez les points et les tirets.');
    if (PROTECTED.test(d)) return bad('Ce domaine appartient à Jeere ou à son hébergeur : utilisez le vôtre.');
    var apex = apexOf(d);
    var kind = d === apex ? 'apex' : (d === 'www.' + apex ? 'www' : 'sub');
    return { ok: true, domain: d, apex: apex, kind: kind, message: '' };
  }

  // What to add at her registrar. The record of the address she typed is required; the other one
  // (apex ⇄ www) is recommended so both addresses lead to her store.
  function records(domain) {
    var v = validate(domain);
    if (!v.ok) return [];
    var out = [
      { id: 'a', type: 'A', name: '@', value: A_RECORD, host: v.apex, required: v.kind === 'apex' },
      { id: 'www', type: 'CNAME', name: 'www', value: CNAME, host: 'www.' + v.apex, required: v.kind === 'www' }
    ];
    if (v.kind === 'sub') {
      out = [{ id: 'sub', type: 'CNAME', name: v.domain.slice(0, -v.apex.length - 1), value: CNAME, host: v.domain, required: true }];
    }
    return out;
  }

  var REGISTRARS = [
    { id: 'godaddy', name: 'GoDaddy', steps: [
      'Connectez-vous, puis Mon compte › Mes produits (ou « Domaines »).',
      'À côté de votre domaine, choisissez « DNS » (Gérer le DNS).',
      'Supprimez l’enregistrement A « @ » qui pointe vers « Parked », s’il existe.',
      '« Ajouter un nouvel enregistrement » : type A, nom @, valeur ' + A_RECORD + ', TTL par défaut. Enregistrez.',
      'Modifiez (ou ajoutez) l’enregistrement CNAME « www » : valeur ' + CNAME + '. Enregistrez.'
    ] },
    { id: 'namecheap', name: 'Namecheap', steps: [
      'Domain List › « Manage » à côté du domaine › onglet « Advanced DNS ».',
      'Supprimez le « URL Redirect Record » et le CNAME « parkingpage » mis par défaut.',
      '« Add New Record » : A Record, Host @, Value ' + A_RECORD + '. Validez avec la coche verte.',
      '« Add New Record » : CNAME Record, Host www, Value ' + CNAME + '. Validez.'
    ] },
    { id: 'hostinger', name: 'Hostinger', steps: [
      'hPanel › Domaines › « Gérer » à côté du domaine › « DNS / Serveurs de noms ».',
      'Dans « Gérer les enregistrements DNS », supprimez l’ancien A « @ » et l’ancien CNAME « www ».',
      'Ajoutez : type A, nom @, pointe vers ' + A_RECORD + '.',
      'Ajoutez : type CNAME, nom www, cible ' + CNAME + '.'
    ] },
    { id: 'ovh', name: 'OVHcloud', steps: [
      'Espace client › Web Cloud › Noms de domaine › votre domaine › onglet « Zone DNS ».',
      'Supprimez les anciennes entrées A (sous-domaine vide) et CNAME « www ».',
      '« Ajouter une entrée » › A : sous-domaine vide, cible ' + A_RECORD + '.',
      '« Ajouter une entrée » › CNAME : sous-domaine www, cible ' + CNAME + '. (avec le point final si OVH le demande).'
    ] },
    { id: 'cloudflare', name: 'Cloudflare', steps: [
      'Tableau de bord › votre domaine › DNS › Records.',
      '« Add record » : type A, Name @, IPv4 ' + A_RECORD + ', Proxy status « DNS only » (nuage gris).',
      '« Add record » : type CNAME, Name www, Target ' + CNAME + ', « DNS only » (nuage gris).',
      'Important : laissez le nuage gris, sinon le cadenas https de votre boutique ne peut pas être créé.'
    ] }
  ];

  /* ---------------------------------------------------------------- DNS-over-HTTPS */

  function doh(name, type) {
    return fetch(DOH + '?name=' + encodeURIComponent(name) + '&type=' + type, { headers: { Accept: 'application/dns-json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var want = type === 'A' ? 1 : (type === 'CNAME' ? 5 : (type === 'NS' ? 2 : 6));
        var ans = Array.isArray(j.Answer) ? j.Answer : [];
        return {
          status: typeof j.Status === 'number' ? j.Status : -1,
          values: ans.filter(function (a) { return a.type === want; }).map(function (a) { return str(a.data).replace(/\.$/, '').toLowerCase(); }),
          any: ans.length > 0 || (Array.isArray(j.Authority) && j.Authority.length > 0)
        };
      }, function () { return { status: -1, values: [], any: false, error: true }; });
  }
  function vercelCname(v) { return v === CNAME || /(^|\.)vercel-dns(-\d+)?\.com$/.test(v); }

  // Each record: is it there? (A: the Vercel IP among the answers; CNAME: a Vercel target, or the A itself)
  function check(domain) {
    var list = records(domain);
    return Promise.all(list.map(function (rec) {
      if (rec.type === 'A') {
        return doh(rec.host, 'A').then(function (r) {
          return { rec: rec, ok: r.values.indexOf(A_RECORD) !== -1, found: r.values, error: !!r.error };
        });
      }
      return doh(rec.host, 'CNAME').then(function (r) {
        if (r.values.some(vercelCname)) return { rec: rec, ok: true, found: r.values };
        return doh(rec.host, 'A').then(function (a) {
          return { rec: rec, ok: a.values.indexOf(A_RECORD) !== -1, found: r.values.length ? r.values : a.values, error: !!(r.error && a.error) };
        });
      });
    })).then(function (rows) {
      var out = rows.map(function (x) {
        var o = {};
        Object.keys(x.rec).forEach(function (k) { o[k] = x.rec[k]; });
        o.ok = x.ok; o.found = x.found; o.error = x.error;
        return o;
      });
      return { records: out, ok: out.filter(function (r) { return r.required; }).every(function (r) { return r.ok; }), all: out.every(function (r) { return r.ok; }), error: out.some(function (r) { return r.error; }) };
    });
  }

  /* ---------------------------------------------------------------- prices (Vercel registrar, USD → FCFA) */

  // Vercel's registrar prices for one year, read with its API (get_tld_price) on 6 November 2026.
  // The first year of some TLDs is a promotion: the renewal is the real yearly price.
  var PRICES_AS_OF = '2026-11-06';
  var PRICES = {
    com: { buy: 12.03, renew: 12.03 },
    shop: { buy: 2.99, renew: 38.39 },
    store: { buy: 1.49, renew: 44 },
    online: { buy: 1.49, renew: 27 },
    net: { buy: 13.5, renew: 13.5 },
    co: { buy: 29.99, renew: 24.8 },
    site: { buy: 1.49, renew: 27 },
    boutique: { buy: 3.99, renew: 33 }
  };
  var TLDS = ['com', 'shop', 'store', 'online', 'net', 'co', 'site', 'boutique'];
  // Not sold by Vercel: through an accredited Ivorian registrar (ARTCI), by the team, on request
  var LOCAL = { ci: { label: '.ci', approx: 15000, note: 'Par un bureau d’enregistrement agréé par l’ARTCI (NIC.CI) : l’équipe s’en occupe, écrivez-nous.' } };
  // Jeere's price: USD × 600 FCFA (a safety margin on ~575), + 25 %, + 1 500 FCFA of handling, rounded up to 500 FCFA.
  // Same formula as the Edge Function (supabase/functions/domains).
  var FX = 600, MARGIN = 0.25, FIXED = 1500;
  function fcfa(usd) {
    var n = Number(usd);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.ceil((n * FX * (1 + MARGIN) + FIXED) / 500) * 500;
  }
  function price(tld) {
    var p = PRICES[str(tld).replace(/^\./, '')];
    return p ? { buy: fcfa(p.buy), renew: fcfa(p.renew), buyUsd: p.buy, renewUsd: p.renew } : null;
  }
  function money(n) {
    try { if (D.formatPrice) return D.formatPrice(n); } catch (e) { /* fallback */ }
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + 'FCFA';
  }

  /* ---------------------------------------------------------------- the Edge Function */

  function fn(action, body) {
    var sess = root.JeerePublish && root.JeerePublish.session ? root.JeerePublish.session() : Promise.resolve(null);
    return sess.then(function (s) {
      var h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
      if (s && s.token) h.Authorization = 'Bearer ' + s.token;
      var b = { action: action };
      Object.keys(body || {}).forEach(function (k) { b[k] = body[k]; });
      return fetch(FN_URL, { method: 'POST', headers: h, body: JSON.stringify(b) })
        .then(function (r) { return r.json().then(function (j) { j.httpStatus = r.status; return j; }, function () { return { ok: false, code: 'server', httpStatus: r.status, message: 'Le serveur Jeere ne répond pas comme prévu.' }; }); },
          function () { return { ok: false, code: 'network', message: 'Pas de connexion au serveur Jeere : réessayez.' }; });
    });
  }

  function labelOf(name) {
    var s = str(name).trim().toLowerCase();
    if (s.normalize) s = s.normalize('NFD');
    return s.replace(/[̀-ͯ]/g, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\.[a-z.]*$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
  }

  // Availability: Vercel's answer when the server has its token, else a guess from the DNS: a name the DNS
  // does not know (NXDOMAIN) is « probablement libre », one with name servers is taken.
  function search(name) {
    var label = labelOf(name);
    if (label.length < 2) return Promise.resolve({ ok: false, message: 'Écrivez au moins deux lettres, par exemple awabeaute.' });
    var local = Object.keys(LOCAL).map(function (t) { return { domain: label + '.' + t, tld: t, status: 'request', buy: LOCAL[t].approx, renew: LOCAL[t].approx, via: 'artci', note: LOCAL[t].note }; });
    return fn('search', { name: label }).then(function (r) {
      if (r && r.ok && r.configured && Array.isArray(r.results)) {
        return { ok: true, configured: true, label: label, results: r.results.map(function (x) {
          var tld = x.domain.slice(label.length + 1);
          return { domain: x.domain, tld: tld, status: x.available ? 'free' : 'taken', buy: x.purchaseFcfa || (price(tld) || {}).buy, renew: x.renewalFcfa || (price(tld) || {}).renew, via: 'vercel' };
        }).concat(local) };
      }
      return Promise.all(TLDS.map(function (t) {
        var d = label + '.' + t;
        return doh(d, 'NS').then(function (x) {
          var p = price(t) || {};
          var status = x.error || x.status < 0 ? 'unknown' : (x.status === 3 ? 'likely' : (x.status === 0 ? (x.any ? 'taken' : 'likely') : 'unknown'));
          return { domain: d, tld: t, status: status, buy: p.buy, renew: p.renew, via: 'vercel' };
        });
      })).then(function (rows) { return { ok: true, configured: false, label: label, results: rows.concat(local) }; });
    });
  }

  root.JeereDomains = {
    A_RECORD: A_RECORD, CNAME: CNAME, FN_URL: FN_URL, REGISTRARS: REGISTRARS,
    PRICES: PRICES, PRICES_AS_OF: PRICES_AS_OF, TLDS: TLDS, LOCAL: LOCAL, FX: FX, MARGIN: MARGIN, FIXED: FIXED,
    clean: clean, apexOf: apexOf, validate: validate, records: records, check: check, doh: doh,
    fcfa: fcfa, price: price, money: money, fn: fn, search: search, labelOf: labelOf
  };
})(typeof window !== 'undefined' ? window : globalThis);

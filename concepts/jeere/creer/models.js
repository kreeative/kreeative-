/*
 * Jehre — models.js: the designer models (the custom-designed shops of concepts/), in one place.
 *
 *   window.JeereModels = { LIST, bySlug(slug), match({ niche, rdv, text }), priceLabel(m), thumb(slug, base),
 *                          demo(slug), want(slug), wanted(), forget(), buy(slug, ctx) }
 *
 * match() answers « which model fits what she sells » for the assistant: a slug, or null when no model
 * fits (food, home, crafts: she is offered a made-to-measure site instead).
 * buy() opens the card payment of a model (the `billing` function, action 'model'). Without a real
 * account it remembers the model (localStorage 'jeere-model-wanted') and sends her to create her account;
 * the dashboard then offers the payment again (admin.js). The prices are checked by the server.
 */
(function (root) {
  'use strict';
  var NB = ' ';
  var KEY = 'jeere-model-wanted';
  // the installation by the team, an option paid once on top of the model (the server has the same price)
  var INSTALL = 50000;
  var LIST = [
    { slug: 'seve', name: 'SÈVE', kind: 'Soins et cosmétiques', desc: 'Flacons sur fond crème, titres serif, filtres par catégorie.', price: 25000, was: 50000 },
    { slug: 'soyeuse', name: 'SOYEUSE', kind: 'Perruques et tissages', desc: 'Rose bonbon, logo à lettres ornées, mannequin en pied.', price: 25000, was: 50000 },
    { slug: 'michou', name: 'MICHOU', kind: 'Streetwear', desc: 'Police machine à écrire, grandes photos, choix de taille sur la carte.', price: 50000, was: 100000, install: 100000 },
    { slug: 'anse', name: 'ANSE', kind: 'Maroquinerie', desc: 'Chaque sac dans son cadre pastel, les anses qui s’en échappent.', price: 300000, note: 'installation assistée incluse', installIncluded: true },
    { slug: 'regard', name: 'REGARD', kind: 'Cils et sourcils · rendez-vous', desc: 'Vos clientes réservent en ligne : prestation, jour, heure, acompte.', price: 25000, was: 50000, rdv: true },
    { slug: 'vernie', name: 'VERNIE', kind: 'Ongles · rendez-vous', desc: 'Carte des prestations, demandes à confirmer, rappel la veille.', price: 25000, was: 50000, rdv: true },
    { slug: 'minuit', name: 'MINUIT', kind: 'Cils et ongles · rendez-vous', desc: 'Noir et champagne, tarifs, conditions, offre du mois.', price: 25000, was: 50000, rdv: true }
  ];
  function bySlug(slug) { for (var i = 0; i < LIST.length; i++) if (LIST[i].slug === slug) return LIST[i]; return null; }
  function fcfa(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + 'FCFA'; }
  // the installation by the team: 50 000, except a clothes shop (sizes, colours, many photos): 100 000
  function installPrice(m) { return (m && m.install) || INSTALL; }
  function priceLabel(m) { return m ? fcfa(m.price) : ''; }
  function plain(s) { try { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return String(s || '').toLowerCase(); } }

  // what she sells → the model made for it
  function match(a) {
    a = a || {};
    var t = ' ' + plain(a.text) + ' ';
    var lash = /\b(cils?|sourcils?|lash|rehaussement|microblading)\b/.test(t);
    var nail = /\b(ongles?|onglerie|manucure|pedicure|nails?|gel|capsules?)\b/.test(t);
    var service = !!a.rdv || /\b(pose|poses|extensions? de cils|rehaussement|manucure|pedicure|onglerie|salon|institut|rendez|rdv|prestations?|seances?|microblading)\b/.test(t);
    if (service && lash && nail) return 'minuit';
    if (service && lash) return 'regard';
    if (service && nail) return 'vernie';
    if (a.rdv) return 'minuit';
    if (/\b(sacs?|sacoches?|maroquinerie|pochettes?|portefeuilles?|cabas)\b/.test(t)) return 'anse';
    if (/\b(perruques?|meches?|tissages?|wigs?|closures?|frontales?|lace)\b/.test(t)) return 'soyeuse';
    switch (a.niche) {
      case 'beauty': return 'seve';
      case 'hair': return 'soyeuse';
      case 'fashion': return 'michou';
      case 'jewellery': case 'shoes': return 'anse';
      default: return null;
    }
  }

  function want(slug) { try { if (bySlug(slug)) root.localStorage.setItem(KEY, slug); } catch (e) { /* no storage */ } }
  function wanted() { try { var s = root.localStorage.getItem(KEY); return bySlug(s) ? s : null; } catch (e) { return null; } }
  function forget() { try { root.localStorage.removeItem(KEY); } catch (e) { /* no storage */ } }
  function adminUrl() { try { return new URL('../admin/', root.location.href).href.replace(/[?#].*$/, ''); } catch (e) { return 'https://jehre.com/admin/'; } }

  // → Promise { ok, redirect } | { ok: false, reason: 'account' | …, message }. With reason 'account' she is being sent to sign up.
  function buy(slug, ctx) {
    var m = bySlug(slug), c = ctx || {}, B = root.JeereBilling;
    if (!m) return Promise.resolve({ ok: false, reason: 'model', message: 'Ce modèle n’existe pas.' });
    if (!B || typeof B.buyModel !== 'function' || !B.isReal()) {
      want(slug);
      try { root.location.assign(new URL('../compte/', root.location.href).href.replace(/[?#].*$/, '') + '#inscription'); } catch (e) { /* stay */ }
      return Promise.resolve({ ok: false, reason: 'account', message: 'Créez votre compte Jehre (gratuit), puis payez votre modèle.' });
    }
    try { root.localStorage.setItem(KEY + '-install', c.install === true || m.installIncluded ? '1' : '0'); } catch (e) { /* no storage */ }
    return Promise.resolve(B.buyModel(slug, { install: c.install === true, storeId: c.storeId || '', shopName: c.shopName || '', sells: c.sells || '', returnUrl: adminUrl() }))
      .then(function (r) { if (r && r.ok) forget(); return r; });
  }

  // The model this account bought, kept on the device so every page (the dashboard, the editor) shows it at once;
  // refreshMine() asks the server (public.my_models) and corrects it.
  var MINE = 'jeere-my-model';
  function mine() { try { var s = root.localStorage.getItem(MINE); return bySlug(s) ? s : null; } catch (e) { return null; } }
  function setMine(slug) { try { if (bySlug(slug)) root.localStorage.setItem(MINE, slug); else root.localStorage.removeItem(MINE); } catch (e) { /* no storage */ } }
  function refreshMine() {
    var A = root.JeereAuth;
    return Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).then(function (ses) {
      if (!ses || !ses.access_token) return mine();
      return fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/rpc/my_models', { method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', Authorization: 'Bearer ' + ses.access_token }, body: '{}' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (Array.isArray(j)) { var cur = mine(), owned = j.map(function (x) { return x.model; }); if (!cur || owned.indexOf(cur) === -1) setMine(j[0] ? j[0].model : ''); }
          return mine();
        });
    }).catch(function () { return mine(); });
  }

  /* The products of a shop model. A seller who takes MICHOU while her list is still the example of a base template
   * (jewellery, say) would see those in a clothes shop: her list becomes the model's own products (names, prices,
   * photos), which she then replaces with hers. Never done once she has changed a product herself.
   * productsFor(slug, cfg) → Promise<products | null> (null: nothing to change). */
  var PHOTOS = {"michou": {"p1": "tshirt-levres.webp", "p2": "tshirt-masque.webp", "p3": "tshirt-console.webp", "p4": "tshirt-racing.webp", "p5": "tshirt-croix.webp", "p6": "jort-noir.webp", "p7": "jort-brun.webp", "p8": "casquette-etoile.webp"}, "seve": {"p1": "gel-vanille.webp", "p2": "gel-santal.webp", "p3": "gel-musc.webp", "p4": "gel-bergamote.webp", "p5": "creme-corps-santal.webp", "p6": "creme-corps-bergamote.webp", "p7": "creme-mains.webp", "p8": "deodorant.webp", "p9": "huile-parfum-santal.webp", "p10": "gel-lune.webp", "p11": "deodorant-vanille.webp", "p12": "huile-corps-vanille.webp"}, "soyeuse": {"p1": "tissage-ondule.webp", "p2": "tissage-lisse.webp", "p3": "tissage-loose.webp", "p4": "perruque-ondulee.webp", "p5": "peigne.webp"}, "anse": {"p1": "sac-citrine.webp", "p2": "sac-dragee.webp", "p3": "sac-brume.webp", "p4": "sac-ruban.webp", "p5": "sac-olivier.webp", "p6": "sac-anneau.webp", "p7": "sac-cacao.webp", "p8": "sac-menthe.webp"}};
  var ADOPT = 'jeere-model-products';
  function names(list) { return (list || []).map(function (p) { return String(p && p.name || '').trim().toLowerCase(); }).sort().join('|'); }
  function exampleNames() {
    var D = root.JEERE_DATA || {}, set = {};
    try { D.niches.forEach(function (t) { (t.products || []).forEach(function (p) { set[String(p.name || '').trim().toLowerCase()] = true; }); }); } catch (e) { /* none */ }
    return set;
  }
  function productsFor(slug, cfg) {
    var m = bySlug(slug);
    if (!m || m.rdv || !PHOTOS[slug] || !cfg || !Array.isArray(cfg.products)) return Promise.resolve(null);
    var last = null;
    try { last = JSON.parse(root.localStorage.getItem(ADOPT) || 'null'); } catch (e) { last = null; }
    var mine = names(cfg.products);
    if (last && last.slug === slug) return Promise.resolve(null);   // already done for this model
    var ex = exampleNames();
    var untouched = cfg.products.length > 0 && (cfg.products.every(function (p) { return ex[String(p.name || '').trim().toLowerCase()]; }) || (last && last.names && last.names === mine));
    if (!untouched) return Promise.resolve(null);                    // her own products: never replaced
    return fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/stores?slug=eq.' + encodeURIComponent(slug) + '&published=is.true&select=fiche',
      { headers: { apikey: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        var src = rows && rows[0] && rows[0].fiche && Array.isArray(rows[0].fiche.products) ? rows[0].fiche.products : null;
        if (!src || !src.length) return null;
        var out = src.map(function (p) {
          var file = PHOTOS[slug][p.id];
          return { id: p.id, name: p.name, price: p.price, category: p.category || '', badge: p.badge || null, art: p.art || 'box', color: p.color || '#E9D8BD',
            description: p.description || '', image: file ? 'https://kreeative.xyz/concepts/' + slug + '/img/' + file : null, photo: null };
        });
        try { root.localStorage.setItem(ADOPT, JSON.stringify({ slug: slug, names: names(out) })); } catch (e) { /* no storage */ }
        return out;
      }).catch(function () { return null; });
  }

  root.JeereModels = {
    productsFor: productsFor,
    LIST: LIST, INSTALL: INSTALL, installPrice: installPrice, bySlug: bySlug, match: match, priceLabel: priceLabel, fcfa: fcfa,
    thumb: function (slug, base) { return (base || '../') + 'studio/sites/thumbs/concepts--' + slug + '.webp'; },
    demo: function (slug) { return 'https://kreeative.xyz/concepts/' + slug + '/'; },
    want: want, wanted: wanted, forget: forget, buy: buy, mine: mine, setMine: setMine, refreshMine: refreshMine,
    // once, on the way back from the payment: did she pay for the installation?
    paidInstall: function () { var v = null; try { v = root.localStorage.getItem(KEY + '-install'); root.localStorage.removeItem(KEY + '-install'); } catch (e) { /* no storage */ } return v === '1'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

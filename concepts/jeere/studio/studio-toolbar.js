/* Jeere Studio — the UI3 layer: the floating tool bar (bottom centre), the section insert
 * popover (S), the contextual bar pinned on the selection, styled tooltips (name + shortcut after
 * 400 ms), local comment pins (C) and the first-run « three gestures » card.
 *
 * Loaded after studio.js and studio-power.js; builds on window.JeereStudio._internals and plugs
 * into its hooks (chained, never overwritten). Comments live in 'jeere-studio-ui' (ui.comments):
 * local to this browser — sharing them with a team needs the Jeere backend.
 */
(function () {
  'use strict';

  function boot() {
    var JS = window.JeereStudio;
    if (!JS || !JS._internals) return;
    var S = JS._internals;
    var hooks = S.hooks, D = S.D;
    var ce = S.ce, esc = S.esc, toast = S.toast, clamp = S.clamp;
    function $(id) { return document.getElementById(id); }
    function state() { return S.state(); }
    function ui() { return S.ui(); }
    var stage = S.stage();
    if (!stage) return;

    /* hooks are shared with studio-power.js: chain, never replace */
    function chain(name, fn) {
      var prev = hooks[name];
      hooks[name] = function () {
        var r;
        if (prev) { try { r = prev.apply(null, arguments); } catch (e) { /* the other module */ } }
        var r2 = fn.apply(null, arguments);
        return r2 !== undefined ? r2 : r;
      };
    }

    var SVG16 = function (d) { return '<svg viewBox="0 0 16 16" aria-hidden="true">' + d + '</svg>'; };
    var I = {
      up: SVG16('<path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/>'),
      down: SVG16('<path d="M8 3.5v9M4.5 9L8 12.5 11.5 9"/>'),
      plus: SVG16('<path d="M8 3.5v9M3.5 8h9"/>'),
      dup: SVG16('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.2V3a1 1 0 00-1-1H3.5a1 1 0 00-1 1v6a1 1 0 001 1h.3"/>'),
      eye: SVG16('<path d="M1.8 8S4 3.9 8 3.9 14.2 8 14.2 8 12 12.1 8 12.1 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>'),
      eyeOff: SVG16('<path d="M3 13L13 3M5.8 11.4A6.7 6.7 0 011.8 8S4 3.9 8 3.9c.8 0 1.5.2 2.2.4M12 5.7A11 11 0 0114.2 8S12 12.1 8 12.1"/>'),
      trash: SVG16('<path d="M2.8 4.3h10.4M6.3 4.3V2.8h3.4v1.5M4.2 4.3l.6 8.8a1 1 0 001 .9h4.4a1 1 0 001-.9l.6-8.8"/>'),
      more: SVG16('<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>'),
      text: SVG16('<path d="M3.5 4.8V3.2h9v1.6M8 3.2v9.6M6 12.8h4"/>'),
      parent: SVG16('<path d="M6 9.5L2.8 6.3 6 3.1M3 6.3h6.2a3.8 3.8 0 010 7.6H7"/>'),
      image: SVG16('<rect x="2" y="2.8" width="12" height="10.4" rx="1.6"/><circle cx="6" cy="6.6" r="1.2"/><path d="M2.4 11.6l3.4-3 2.4 2 2.1-1.8 3.3 2.9"/>'),
      design: SVG16('<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6"/><circle cx="10" cy="4.5" r="1.5"/><circle cx="6" cy="11.5" r="1.5"/>')
    };
    /* « Design » on every single selection: the Design tab of the inspector (studio-design.js) */
    function designBtn() {
      return btn(I.design, 'Design de la sélection', '', function () { if (hooks.openDesign) hooks.openDesign(); });
    }

    /* ================================================================ tooltips
     * Every control with data-tip (and the old title= ones, converted on the fly) gets a dark
     * styled tooltip: name, shortcut chip, one line of help — after 400 ms, then « warm »
     * (instant) while you slide along a bar, like Figma. */

    var tipEl = $('tip');
    var tipTimer = null, tipFor = null, warmUntil = 0;
    function hideTip() {
      if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
      if (tipEl && !tipEl.hidden) { tipEl.hidden = true; warmUntil = Date.now() + 500; }
      tipFor = null;
    }
    function showTip(el) {
      if (!tipEl || !document.contains(el)) return;
      var name = el.getAttribute('data-tip') || '';
      var kbdTxt = el.getAttribute('data-kbd') || '';
      var sub = el.getAttribute('data-sub') || '';
      if (!name) return;
      tipEl.innerHTML = '<span class="st-tip__main"><span>' + esc(name) + '</span>' +
        (kbdTxt ? '<kbd>' + esc(kbdTxt) + '</kbd>' : '') + '</span>' + (sub ? '<span class="st-tip__sub">' + esc(sub) + '</span>' : '');
      tipEl.hidden = false;
      var r = el.getBoundingClientRect();
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var above = !!el.closest('.st-ftb, .st-selbar, .st-pop');
      var top = above ? r.top - h - 8 : r.bottom + 8;
      if (top + h > window.innerHeight - 4) top = r.top - h - 8;
      if (top < 4) top = r.bottom + 8;
      tipEl.style.left = clamp(r.left + r.width / 2 - w / 2, 6, window.innerWidth - w - 6) + 'px';
      tipEl.style.top = top + 'px';
    }
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch') return;
      var el = e.target && e.target.closest ? e.target.closest('[data-tip], .st button[title], .st-drawer button[title]') : null;
      if (el && el.hasAttribute('title') && !el.hasAttribute('data-tip')) {
        el.setAttribute('data-tip', el.getAttribute('title'));
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.getAttribute('title'));
        el.removeAttribute('title');
      }
      if (el === tipFor) return;
      hideTip();
      if (!el || el.disabled) return;
      tipFor = el;
      tipTimer = setTimeout(function () { tipTimer = null; showTip(el); }, Date.now() < warmUntil ? 40 : 400);
    }, true);
    document.addEventListener('pointerout', function (e) {
      if (!tipFor) return;
      var to = e.relatedTarget;
      if (to && tipFor.contains(to)) return;
      if (e.target && tipFor.contains(e.target)) hideTip();
    }, true);
    ['pointerdown', 'keydown', 'wheel', 'blur'].forEach(function (ev) {
      window.addEventListener(ev, function () { hideTip(); }, true);
    });

    /* ================================================================ selection colour
     * The Indigo palette's accent IS the selection blue: then the selection turns magenta. */
    function hexRgb(h) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
      if (!m) return null;
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function syncSelColour() {
      var c = state().config || {}, th = c.theme || {}, accent = null;
      if (th.colors && th.colors.accent) accent = th.colors.accent;
      if (!accent) {
        try { D.palettes.forEach(function (p) { if (p.id === th.palette && p.colors) accent = p.colors.accent; }); } catch (e) { /* none */ }
      }
      var a = hexRgb(accent), b = [54, 87, 255];
      var near = !!a && Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)) < 70;
      stage.classList.toggle('st-sel-alt', near);
    }

    /* ================================================================ section popover (S) */

    var pop = $('secPop'), secBtn = $('ftbSection');
    var popActive = 0;
    function sectionTypes() {
      var list = [];
      try { D.sectionTypes.forEach(function (t) { if (t && t.id) list.push(t); }); } catch (e) {
        if (D.sectionTypes) Object.keys(D.sectionTypes).forEach(function (k) { var t = D.sectionTypes[k]; if (t && t.id) list.push(t); });
      }
      return list;
    }
    function popOpen() { return pop && !pop.hidden; }
    function closePop() {
      if (!pop || pop.hidden) return;
      pop.hidden = true;
      pop.classList.remove('is-leaving');
      if (secBtn) secBtn.setAttribute('aria-expanded', 'false');
      S.hideTypePreview();
    }
    function whereLabel() {
      var sel = state().sel;
      var ids = S.selectedSectionIds();
      if (ids.length) {
        var s = S.sectionById(ids[ids.length - 1]);
        return 'après « ' + S.sectionName(s) + ' »';
      }
      return 'à la fin de l’accueil';
    }
    function openPop() {
      if (!pop) return;
      S.closeCtx();
      hideTip();
      pop.innerHTML = '';
      var head = ce('div', 'st-pop__head', '<b>Insérer une section</b><span>' + esc(whereLabel()) + '</span>');
      pop.appendChild(head);
      var grid = ce('div', 'st-pop__grid');
      sectionTypes().forEach(function (t, i) {
        var card = ce('button', 'st-pop__card' + (i === popActive ? ' is-active' : ''), (S.TYPE_GLYPHS[t.id] || S.TYPE_GLYPHS.about) + '<span>' + esc(t.name || t.id) + '</span>');
        card.type = 'button';
        card.setAttribute('data-type', t.id);
        card.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return;
          /* the popover steps aside (still in the DOM: the gesture's click must not land on the
           * canvas, where it would deselect the section just inserted) */
          var t0 = Date.now();
          window.addEventListener('click', function eat(ev) {
            window.removeEventListener('click', eat, true);
            if (Date.now() - t0 < 4000) { ev.stopPropagation(); ev.preventDefault(); }
            closePop();
          }, true);
          pop.classList.add('is-leaving');
          S.hideTypePreview();
          S.startInsertDrag(e, t); // a click inserts after the selection, a drag shows the blue line
        });
        card.addEventListener('click', function (e) {
          if (e.detail !== 0) return; // keyboard only (Entrée / Espace): the pointer path is above
          closePop();
          S.insertSection(t.id);
        });
        card.addEventListener('mouseenter', function () {
          var pr = pop.getBoundingClientRect(), cr = card.getBoundingClientRect();
          S.showTypePreview(card, t, { left: cr.left + cr.width / 2 - 115, top: pr.top });
        });
        card.addEventListener('mouseleave', function () { S.hideTypePreview(); });
        grid.appendChild(card);
      });
      pop.appendChild(grid);
      var foot = ce('div', 'st-pop__foot', '<span>Glissez une carte sur un aperçu pour choisir l’endroit.</span>');
      var all = ce('button', 'st-linkbtn', 'Mes blocs et le panneau Insérer →');
      all.type = 'button';
      all.addEventListener('click', function () { closePop(); S.switchLeftTab('insert'); });
      foot.appendChild(all);
      pop.appendChild(foot);
      pop.hidden = false;
      if (secBtn) secBtn.setAttribute('aria-expanded', 'true');
      var first = pop.querySelector('.st-pop__card.is-active') || pop.querySelector('.st-pop__card');
      if (first) first.focus({ preventScroll: true });
    }
    function togglePop() { if (popOpen()) closePop(); else openPop(); }
    if (secBtn) secBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePop(); });
    if (pop) pop.addEventListener('keydown', function (e) {
      var cards = Array.prototype.slice.call(pop.querySelectorAll('.st-pop__card'));
      var i = cards.indexOf(document.activeElement);
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
      if (step && i !== -1) {
        e.preventDefault();
        e.stopPropagation();
        var j = clamp(i + step, 0, cards.length - 1);
        cards.forEach(function (c, k) { c.classList.toggle('is-active', k === j); });
        popActive = j;
        cards[j].focus();
      }
    });
    document.addEventListener('pointerdown', function (e) {
      if (popOpen() && !pop.contains(e.target) && !(secBtn && secBtn.contains(e.target))) closePop();
    }, true);
    hooks.sectionPopover = togglePop;

    /* ================================================================ image (I) */
    var imgBtn = $('ftbImage');
    if (imgBtn) imgBtn.addEventListener('click', function () { S.pickImageForSelection(); });

    /* ================================================================ contextual bar on the selection */

    var bar = $('selbar');
    var barKey = '';
    function selKey() {
      var sel = state().sel;
      if (!sel) return '';
      if (S.isMulti(sel)) return 'm:' + sel.ids.join(',');
      var extra = '';
      if (sel.kind === 'section') { var s = S.sectionById(sel.id); extra = s ? (s.enabled === false ? 'off' : 'on') + ':' + S.sectionName(s) : ''; }
      if (sel.kind === 'product') { var p = S.productById(sel.id); extra = p ? p.name : ''; }
      return sel.kind + ':' + sel.id + ':' + (sel.field || '') + ':' + (sel.el || '') + ':' + extra + ':' + S.sections().map(function (x) { return x.id; }).join(',');
    }
    function btn(icon, tip, kbdTxt, fn, cls, label) {
      var b = ce('button', cls || '', icon + (label ? '<span>' + esc(label) + '</span>' : ''));
      b.type = 'button';
      b.setAttribute('data-tip', tip);
      b.setAttribute('aria-label', tip);
      if (kbdTxt) b.setAttribute('data-kbd', kbdTxt);
      b.addEventListener('click', function (e) { e.stopPropagation(); hideTip(); fn(e, b); });
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      return b;
    }
    function sep() { return ce('span', 'st-selbar__sep'); }
    var FIELD_LABELS = { title: 'Titre', text: 'Texte', kicker: 'Petit titre', button: 'Bouton' };
    function buildBar() {
      var sel = state().sel;
      bar.innerHTML = '';
      if (!sel) return;
      var list = S.sections();
      if (S.isMulti(sel)) {
        bar.appendChild(ce('span', 'st-selbar__name', '<span>' + sel.ids.length + ' sections</span>'));
        bar.appendChild(sep());
        bar.appendChild(btn(I.up, 'Monter', '↑', function () { S.moveSelection(-1, true); }));
        bar.appendChild(btn(I.down, 'Descendre', '↓', function () { S.moveSelection(1, true); }));
        bar.appendChild(sep());
        bar.appendChild(btn(I.dup, 'Dupliquer', 'Ctrl D', function () { S.duplicateSelection(); }));
        bar.appendChild(btn(I.eye, 'Masquer / afficher', 'Ctrl ⇧ H', function () { S.toggleHideSelected(); }));
        bar.appendChild(btn(I.trash, 'Supprimer', 'Suppr', function () { S.deleteSelection(); }, 'is-danger'));
        return;
      }
      if (sel.kind === 'section') {
        var s = S.sectionById(sel.id);
        if (!s) return;
        var def = S.sectionDef(s.type);
        var typeName = def && def.name ? def.name : s.type;
        var ico = S.icon(s.type);
        if (sel.field || sel.el) {
          var edef = sel.el && S.esElements ? S.esElements(s.type).filter(function (d) { return d.key === sel.el; })[0] : null;
          var subLabel = edef ? edef.label : (FIELD_LABELS[sel.field] || sel.field);
          bar.appendChild(ce('span', 'st-selbar__name', ico + '<span>' + esc(S.sectionName(s)) + '</span><small>› ' + esc(subLabel) + '</small>'));
          bar.appendChild(sep());
          if (sel.field) bar.appendChild(btn(I.text, 'Modifier le texte sur place', 'Entrée', function () { S.enterSelection(); }, '', 'Modifier'));
          bar.appendChild(designBtn());
          bar.appendChild(btn(I.parent, 'Sélectionner la section', '⇧ Entrée', function () { S.select({ kind: 'section', id: s.id }); }));
          bar.appendChild(sep());
          bar.appendChild(btn(I.more, 'Plus d’actions', '', function (e, b) { var r = b.getBoundingClientRect(); S.openSelectionMenu(r.left, r.bottom + 6); }));
          return;
        }
        var idx = -1;
        list.forEach(function (x, i) { if (x.id === s.id) idx = i; });
        var name = S.sectionName(s);
        bar.appendChild(ce('span', 'st-selbar__name', ico + '<span>' + esc(name) + '</span>' + (name !== typeName && name.length < 16 ? '<small>' + esc(typeName) + '</small>' : '')));
        bar.appendChild(sep());
        var up = btn(I.up, 'Monter', '↑', function () { S.moveSelection(-1, true); });
        up.disabled = idx <= 0;
        var dn = btn(I.down, 'Descendre', '↓', function () { S.moveSelection(1, true); });
        dn.disabled = idx === -1 || idx >= list.length - 1;
        bar.appendChild(up);
        bar.appendChild(dn);
        bar.appendChild(btn(I.plus, 'Insérer une section dessous', 'S', function () { openPop(); }));
        bar.appendChild(sep());
        bar.appendChild(designBtn());
        if (S.imageSlotForSelection()) bar.appendChild(btn(I.image, 'Changer la photo', 'I', function () { S.pickImageForSelection(); }));
        bar.appendChild(btn(I.dup, 'Dupliquer', 'Ctrl D', function () { S.duplicateSelection(); }));
        bar.appendChild(btn(s.enabled === false ? I.eyeOff : I.eye, s.enabled === false ? 'Afficher la section' : 'Masquer la section', 'Ctrl ⇧ H', function () { S.toggleHideSelected(); }));
        bar.appendChild(btn(I.trash, 'Supprimer', 'Suppr', function () { S.deleteSelection(); }, 'is-danger'));
        bar.appendChild(btn(I.more, 'Plus d’actions', '', function (e, b) { var r = b.getBoundingClientRect(); S.openSelectionMenu(r.left, r.bottom + 6); }));
        return;
      }
      if (sel.kind === 'product') {
        var p = S.productById(sel.id);
        if (!p) return;
        bar.appendChild(ce('span', 'st-selbar__name', S.icon('product') + '<span>' + esc(p.name || 'Produit') + '</span>'));
        bar.appendChild(sep());
        bar.appendChild(btn(I.text, 'Modifier le nom sur place', 'Entrée', function () { S.enterSelection(); }));
        bar.appendChild(designBtn());
        bar.appendChild(btn(I.image, 'Changer la photo', 'I', function () { S.pickImageForSelection(); }));
        bar.appendChild(btn(I.dup, 'Dupliquer', 'Ctrl D', function () { S.duplicateSelection(); }));
        bar.appendChild(btn(I.trash, 'Supprimer', 'Suppr', function () { S.deleteSelection(); }, 'is-danger'));
        bar.appendChild(btn(I.parent, 'Sélectionner la section Produits', 'Échap', function () {
          var sec = S.sections().filter(function (x) { return x.type === 'products'; })[0];
          if (sec) S.select({ kind: 'section', id: sec.id });
        }));
      }
      if (sel.kind === 'chrome') {
        var cdef = sel.el && S.esElements ? S.esElements(sel.id).filter(function (d) { return d.key === sel.el; })[0] : null;
        bar.appendChild(ce('span', 'st-selbar__name', S.icon('page') + '<span>' + esc(S.chromeName ? S.chromeName(sel.id) : '') + '</span>' + (cdef && cdef.sel ? '<small>› ' + esc(cdef.label) + '</small>' : '')));
        bar.appendChild(sep());
        bar.appendChild(designBtn());
        if (cdef && cdef.sel) bar.appendChild(btn(I.parent, 'Sélectionner le bloc entier', 'Échap', function () { S.select({ kind: 'chrome', id: sel.id }); }));
      }
    }
    function barAnchor() {
      var sel = state().sel;
      if (!sel || sel.kind === 'page') return null;
      var key = S.primaryKey();
      var root = S.roots()[key];
      var ab = S.abEls()[key];
      if (!root || !ab || ab.classList.contains('is-hidden')) return null;
      var ts = S.selectionTargets(root).filter(function (t) { return !t.sub; });
      if (!ts.length) return null;
      var r = null;
      ts.forEach(function (t) {
        var q = t.el.getBoundingClientRect();
        if (!q.width && !q.height) return;
        r = r ? { left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
      });
      return r;
    }
    function positionBar() {
      if (!bar) return;
      var st = state();
      var show = !!st.sel && (st.tool === 'select' || st.tool === 'text') && !S.anyModalOpen();
      var r = show ? barAnchor() : null;
      var sr = stage.getBoundingClientRect();
      if (r && (r.bottom < sr.top + 20 || r.top > sr.bottom - 90 || r.right < sr.left + 20 || r.left > sr.right - 20)) r = null;
      if (!r) { bar.hidden = true; document.body.classList.remove('st-has-selbar'); return; }
      var k = selKey();
      if (k !== barKey || !bar.firstChild) { barKey = k; buildBar(); }
      if (!bar.firstChild) { bar.hidden = true; document.body.classList.remove('st-has-selbar'); return; }
      bar.hidden = false;
      document.body.classList.add('st-has-selbar');
      var bw = bar.offsetWidth, bh = bar.offsetHeight || 34;
      var top = Math.max(8, r.top - sr.top - bh - 8);     // above; pinned to the top edge when scrolled past
      top = Math.min(top, sr.height - bh - 76);            // never over the tool bar
      var left = clamp(r.left - sr.left, 8, Math.max(8, sr.width - bw - 8));
      bar.style.left = Math.round(left) + 'px';
      bar.style.top = Math.round(top) + 'px';
    }
    var barQueued = false;
    function queueBar() {
      if (barQueued) return;
      barQueued = true;
      requestAnimationFrame(function () { barQueued = false; positionBar(); });
    }

    /* ================================================================ comments (C) */

    var composer = $('pinComposer');
    var draft = null;          // { ab, x, y, sectionId }
    var activeComment = null;
    var showResolved = false;
    function comments() {
      var u = ui();
      if (!Array.isArray(u.comments)) u.comments = [];
      return u.comments;
    }
    function openCount() { return comments().filter(function (c) { return !c.resolved; }).length; }
    function presetName(key) {
      var p = (S.presets || []).filter(function (x) { return x.key === key; })[0];
      return p ? p.name + ' ' + p.width : key;
    }
    function fmtRel(iso) {
      var t = Date.parse(iso);
      if (!isFinite(t)) return '';
      var s = Math.round((Date.now() - t) / 1000);
      if (s < 45) return 'à l’instant';
      if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
      if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
      return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
    function updateCount() {
      var n = openCount(), el = $('commentCount');
      if (!el) return;
      el.textContent = String(n);
      el.hidden = n === 0;
    }
    function renderPins() {
      var abs = S.abEls();
      Object.keys(abs).forEach(function (key) {
        var ab = abs[key];
        if (!ab) return;
        var layer = ab.querySelector('.st-pins');
        if (!layer) { layer = ce('div', 'st-pins'); ab.appendChild(layer); }
        layer.innerHTML = '';
        comments().forEach(function (c) {
          if (c.ab !== key || (c.resolved && !showResolved)) return;
          var pin = ce('button', 'st-pin' + (c.resolved ? ' is-resolved' : '') + (activeComment === c.id ? ' is-active' : ''), esc(String(c.n)));
          pin.type = 'button';
          pin.setAttribute('data-comment', c.id);
          pin.setAttribute('aria-label', 'Commentaire ' + c.n);
          pin.style.left = c.x + 'px';
          pin.style.top = c.y + 'px';
          pin.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); focusComment(c.id, false); });
          pin.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          layer.appendChild(pin);
        });
        if (draft && draft.ab === key) {
          var d = ce('div', 'st-pin is-draft', '+');
          d.style.left = draft.x + 'px';
          d.style.top = draft.y + 'px';
          layer.appendChild(d);
        }
      });
      updateCount();
    }
    function drawerOpen() { var d = $('commentsPanel'); return !!(d && !d.hidden); }
    function openDrawer() {
      var d = $('commentsPanel');
      if (!d) return;
      ['tokensPanel', 'versionsPanel'].forEach(function (id) { var x = $(id); if (x && !x.hidden) { var b = x.querySelector('[data-closedrawer]'); if (b) b.click(); else x.hidden = true; } });
      d.hidden = false;
      document.body.classList.add('st-comments-open');
      renderList();
    }
    function closeDrawer() {
      var d = $('commentsPanel');
      if (d) d.hidden = true;
      document.body.classList.remove('st-comments-open');
    }
    function renderList() {
      var body = $('commentsBody');
      if (!body) return;
      body.innerHTML = '';
      body.appendChild(ce('div', 'st-comments__note', '<b>Local à ce navigateur.</b> Ces notes ne partent nulle part : le partage avec votre équipe (et les réponses) arrive avec le backend Jeere.'));
      var all = comments();
      var open = all.filter(function (c) { return !c.resolved; });
      var done = all.filter(function (c) { return c.resolved; });
      var tabs = ce('div', 'st-comments__tabs');
      [['open', 'Ouverts (' + open.length + ')'], ['done', 'Résolus (' + done.length + ')']].forEach(function (t) {
        var b = ce('button', (t[0] === 'done') === showResolved ? 'is-on' : '', esc(t[1]));
        b.type = 'button';
        b.addEventListener('click', function () { showResolved = t[0] === 'done'; renderPins(); renderList(); });
        tabs.appendChild(b);
      });
      body.appendChild(tabs);
      var list = showResolved ? done : open;
      if (!list.length) {
        body.appendChild(ce('div', 'st-comments__empty', showResolved ? 'Aucun commentaire résolu.' :
          'Aucun commentaire. Avec l’outil Commentaire (C), cliquez n’importe où sur un aperçu pour y poser une note : « photo plus claire ici », « vérifier le prix »…'));
        return;
      }
      list.slice().reverse().forEach(function (c) {
        var card = ce('div', 'st-comment' + (c.resolved ? ' is-resolved' : '') + (activeComment === c.id ? ' is-active' : ''));
        card.setAttribute('data-comment-row', c.id);
        var shown = (S.activePresets() || []).some(function (p) { return p.key === c.ab; });
        card.appendChild(ce('div', 'st-comment__head', '<span class="st-comment__num">' + esc(String(c.n)) + '</span><span>' +
          esc(presetName(c.ab)) + (shown ? '' : ' (aperçu masqué)') + ' · ' + esc(fmtRel(c.at)) + '</span>'));
        card.appendChild(ce('p', '', esc(c.text)));
        var row = ce('div', 'st-comment__row');
        var res = ce('button', 'st-ghostbtn', c.resolved ? 'Rouvrir' : 'Résoudre');
        res.type = 'button';
        res.addEventListener('click', function (e) {
          e.stopPropagation();
          c.resolved = !c.resolved;
          S.saveUI();
          renderPins();
          renderList();
          toast(c.resolved ? 'Commentaire ' + c.n + ' résolu.' : 'Commentaire ' + c.n + ' rouvert.', 'ok');
        });
        var del = ce('button', 'st-ghostbtn', 'Supprimer');
        del.type = 'button';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          ui().comments = comments().filter(function (x) { return x.id !== c.id; });
          S.saveUI();
          renderPins();
          renderList();
          toast('Commentaire supprimé.', 'info');
        });
        row.appendChild(res);
        row.appendChild(del);
        card.appendChild(row);
        card.addEventListener('click', function () { focusComment(c.id, true); });
        body.appendChild(card);
      });
    }
    function focusComment(id, pan) {
      activeComment = id;
      var c = comments().filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      if (c.resolved && !showResolved) showResolved = true;
      if (!drawerOpen()) openDrawer();
      renderPins();
      renderList();
      var row = $('commentsBody') && $('commentsBody').querySelector('[data-comment-row="' + S.cssEsc(id) + '"]');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      if (!pan) return;
      var pin = stage.querySelector('[data-comment="' + S.cssEsc(id) + '"]');
      if (!pin) { toast('Cet aperçu est masqué : ajoutez-le avec les puces « Aperçus » pour voir la note.', 'info'); return; }
      var pr = pin.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      var st = state();
      S.camera(function () {
        st.panX += (sr.left + sr.width / 2) - (pr.left + pr.width / 2);
        st.panY += (sr.top + sr.height / 2) - (pr.top + pr.height / 2);
        S.applyTransform();
      });
    }
    function closeComposer() {
      if (composer) { composer.hidden = true; composer.innerHTML = ''; }
      draft = null;
      renderPins();
    }
    function positionComposer() {
      if (!composer || composer.hidden || !draft) return;
      var ab = S.abEls()[draft.ab];
      var frame = ab && ab.querySelector('.st-ab__frame');
      if (!frame) return;
      var fr = frame.getBoundingClientRect(), k = fr.width / (frame.offsetWidth || 1);
      var sr = stage.getBoundingClientRect();
      var x = fr.left + draft.x * k - sr.left + 22, y = fr.top + draft.y * k - sr.top - 30;
      composer.style.left = clamp(x, 8, sr.width - 274) + 'px';
      composer.style.top = clamp(y, 8, sr.height - 170) + 'px';
    }
    function openComposer(d) {
      draft = d;
      renderPins();
      composer.innerHTML = '';
      var ta = document.createElement('textarea');
      ta.placeholder = 'Votre note (Entrée pour publier, Maj+Entrée : nouvelle ligne)';
      ta.maxLength = 500;
      ta.setAttribute('aria-label', 'Texte du commentaire');
      composer.appendChild(ta);
      var row = ce('div', 'st-pinlayer__row', '<small>Local — partage avec le backend</small>');
      var acts = ce('div', 'st-comment__row');
      var cancel = ce('button', 'st-ghostbtn', 'Annuler');
      cancel.type = 'button';
      cancel.addEventListener('click', closeComposer);
      var ok = ce('button', 'st-primary', 'Publier');
      ok.type = 'button';
      ok.addEventListener('click', function () { saveDraft(ta.value); });
      acts.appendChild(cancel);
      acts.appendChild(ok);
      row.appendChild(acts);
      composer.appendChild(row);
      ta.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDraft(ta.value); }
        else if (e.key === 'Escape') { e.preventDefault(); closeComposer(); }
      });
      composer.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      composer.hidden = false;
      positionComposer();
      setTimeout(function () { ta.focus(); }, 0);
    }
    function saveDraft(text) {
      text = String(text || '').trim();
      if (!draft) return;
      if (!text) { toast('Écrivez votre note, ou Échap pour annuler.', 'warn'); return; }
      var n = comments().reduce(function (m, c) { return Math.max(m, c.n || 0); }, 0) + 1;
      var c = { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), n: n, ab: draft.ab,
        x: Math.round(draft.x), y: Math.round(draft.y), sectionId: draft.sectionId || null, text: text.slice(0, 500),
        at: new Date().toISOString(), resolved: false };
      comments().push(c);
      S.saveUI();
      activeComment = c.id;
      draft = null;
      composer.hidden = true;
      composer.innerHTML = '';
      showResolved = false;
      renderPins();
      if (!drawerOpen()) openDrawer(); else renderList();
      toast('Commentaire ' + n + ' posé — local à ce navigateur.', 'ok');
    }
    hooks.commentAt = function (e) {
      var frame = e.target.closest ? e.target.closest('.st-ab__frame') : null;
      var ab = frame && frame.closest('.st-ab');
      if (!frame || !ab) return;
      var fr = frame.getBoundingClientRect(), k = fr.width / (frame.offsetWidth || 1);
      var sec = e.target.closest('[data-section-id]');
      openComposer({ ab: ab.getAttribute('data-ab'), x: (e.clientX - fr.left) / k, y: (e.clientY - fr.top) / k,
        sectionId: sec ? sec.getAttribute('data-section-id') : null });
    };
    ['tokensBtn', 'versionsBtn'].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener('click', function () { if (drawerOpen()) { closeDrawer(); if (state().tool === 'comment') S.setTool('select'); } }, true);
    });
    var cClose = $('commentsPanel') && $('commentsPanel').querySelector('[data-closedrawer]');
    if (cClose) cClose.addEventListener('click', function () { closeDrawer(); if (state().tool === 'comment') S.setTool('select'); });

    /* ================================================================ first run: the three gestures */

    var coach = null;
    function closeCoach() {
      if (!coach) return;
      coach.remove();
      coach = null;
      ui().coachSeen = true;
      S.saveUI();
    }
    function showCoach() {
      if (ui().coachSeen || coach) return;
      coach = ce('div', 'st-coach');
      coach.setAttribute('role', 'note');
      coach.innerHTML = '<h3>Le Studio en trois gestes</h3><ul>' +
        '<li><kbd>S</kbd><span><b>Insérer une section</b> : elle s’adapte toute seule de 360 à 1440 px.</span></li>' +
        '<li><kbd>Glisser</kbd><span><b>Déplacer une section</b> sur l’aperçu : la ligne bleue montre où elle tombe.</span></li>' +
        '<li><kbd>2 × clic</kbd><span><b>Réécrire un texte</b> sur place (ou l’outil Texte, <kbd>T</kbd>).</span></li></ul>' +
        '<div class="st-coach__row"><small>Le modèle reste juste sur chaque téléphone ; pour composer librement, détachez une section (<kbd>Ctrl Alt B</kbd>). <kbd>?</kbd> pour tous les raccourcis.</small></div>';
      var okB = ce('button', 'st-primary', 'Compris');
      okB.type = 'button';
      okB.addEventListener('click', closeCoach);
      coach.querySelector('.st-coach__row').appendChild(okB);
      stage.appendChild(coach);
      setTimeout(closeCoach, 14000);
    }
    hooks.onboarding = function () {
      if (ui().coachSeen) toast('Bienvenue dans le Studio. Appuyez sur ? pour les raccourcis.', 'ok');
      else showCoach();
    };
    stage.addEventListener('pointerdown', function (e) { if (coach && !coach.contains(e.target)) closeCoach(); });

    /* ================================================================ wiring */

    chain('afterDecor', function () { queueBar(); });
    chain('viewChanged', function () { queueBar(); positionComposer(); hideTip(); });
    chain('afterChange', function () { syncSelColour(); barKey = ''; queueBar(); if (popOpen()) { var w = pop.querySelector('.st-pop__head span'); if (w) w.textContent = whereLabel(); } });
    chain('afterRender', function () { renderPins(); queueBar(); });
    chain('toolChanged', function (t, prev) {
      if (t === 'comment') { openDrawer(); renderPins(); hintTool(); }
      if (prev === 'comment' && t !== 'comment') { closeComposer(); closeDrawer(); }
      queueBar();
    });
    chain('escapeOverlay', function () {
      if (popOpen()) { closePop(); return true; }
      if (composer && !composer.hidden) { closeComposer(); return true; }
      if (coach) { closeCoach(); return true; }
      return undefined;
    });
    function hintTool() { S.hintOnce('tool-comment', 'Commentaire : cliquez sur un aperçu pour poser une note. Échap pour revenir.', 20000); }
    window.addEventListener('resize', queueBar);
    stage.addEventListener('scroll', queueBar);
    syncSelColour();
    renderPins();
    queueBar();

    window.JeereStudioToolbar = {
      openSectionPopover: openPop,
      closeSectionPopover: closePop,
      sectionPopoverOpen: popOpen,
      comments: function () { return S.clone(comments()); },
      selbarVisible: function () { return !!(bar && !bar.hidden); },
      selbarText: function () { return bar ? bar.innerText : ''; },
      showCoach: function () { ui().coachSeen = false; showCoach(); },
      tooltip: function () { return tipEl && !tipEl.hidden ? tipEl.innerText : ''; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

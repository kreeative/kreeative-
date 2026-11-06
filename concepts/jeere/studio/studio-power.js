/* Jeere Studio — the power module, loaded after studio.js. One classic IIFE, built entirely on
 * window.JeereStudio._internals (the studio's bridge) and on the same contract (JEERE_DATA,
 * JeereRender), feature-detected like everything else.
 *
 *   1. Command palette (Ctrl K) — fuzzy search over every studio action, recent-first.
 *   2. « Mes blocs » — sections saved as presets in 'jeere-studio-ui' (cap 20, size guard).
 *   3. « Jetons » — the store's live design tokens; colours editable when the contract
 *      supports theme.colors (D.setColorKey), read-only with « Modifiable bientôt » otherwise.
 *   4. « Historique » — named versions in 'jeere-studio-versions' (cap 15, auto-snapshot
 *      every 20 saves, restore through the undo history).
 *   5. « Code » tab — the selection's fiche JSON, live, with a copy button.
 *   6. « Images » panel — every image of the fiche + the demo-photo catalogue, with weights;
 *      fills inspector image slots, drags onto the artboards.
 *   7. Contrast overlay (Ctrl ⇧ C) — texts that do not read, outlined in red with the ratio.
 *   8. Measure overlay (Alt + hover) — Figma-style red measurements between sections.
 *   9. PNG export — the artboard serialized into an <svg foreignObject>, rasterised on canvas.
 */
(function () {
  'use strict';

  function boot() {
    var J = window.JeereStudio;
    var S = J && J._internals;
    if (!S) return;
    var D = S.D, R = S.R;
    var esc = S.esc, ce = S.ce, clamp = S.clamp, cssEsc = S.cssEsc, clone = S.clone;
    var toast = S.toast, commit = S.commit, hooks = S.hooks;

    function $(id) { return document.getElementById(id); }
    function state() { return S.state(); }
    function ui() { return S.ui(); }
    function cfg() { return state().config; }
    /* « Abonnements Studio » (studio-plans.js, loaded later): S.gate(feature, { count }) opens the
     * upgrade sheet and returns false when the plan does not include it; absent = everything open */
    function gate(feature, opts) { return typeof S.gate === 'function' ? S.gate(feature, opts) : true; }
    function planLimit(name, cap) { var l = typeof S.limit === 'function' ? S.limit(name) : Infinity; return Math.min(cap, typeof l === 'number' ? l : cap); }

    function copyText(text, okMsg) {
      var done = function () { toast(okMsg || 'Copié dans le presse-papiers.', 'ok'); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { toast('La copie a été bloquée par le navigateur.', 'warn'); });
          return;
        }
      } catch (e) { /* fall through */ }
      toast('La copie a été bloquée par le navigateur.', 'warn');
    }

    function downloadBlob(blob, name) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }

    function kb(bytes) {
      if (!(bytes > 0)) return '';
      return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(bytes / 1024)) + ' Ko';
    }
    function dataUrlBytes(s) { return Math.round(String(s).length * 3 / 4); }

    /* ================================================================ 5. « Code » (inspect) */

    var inspMode = 'settings';

    function selectionForCode() {
      var st = state();
      var sel = st.sel;
      if (sel && sel.kind === 'multi') {
        var secs = sel.ids.map(S.sectionById).filter(Boolean);
        return { label: sel.ids.length + ' sections (fiche)', obj: secs };
      }
      if (sel && sel.kind === 'section') {
        var s = S.sectionById(sel.id);
        if (s) return { label: 'Section « ' + S.sectionName(s) + ' »', obj: s };
      }
      if (sel && sel.kind === 'product') {
        var p = S.productById(sel.id);
        if (p) return { label: 'Produit « ' + (p.name || p.id) + ' »', obj: p };
      }
      if (sel && sel.kind === 'page') {
        var pg = S.pageById(sel.id);
        if (pg) return { label: 'Page « ' + (pg.title || pg.id) + ' »', obj: pg };
      }
      var whole = cfg();
      try { whole = D.normalizeConfig(whole); } catch (e) { /* raw is fine */ }
      return { label: 'Fiche boutique complète', obj: whole };
    }

    /* « CSS » (the element styles of the selection, studio-design.js) or « JSON » (the fiche) */
    function codeMode() { return ui().codeMode === 'css' && hooks.selectionCss ? 'css' : 'json'; }
    function syncCodeMode() {
      document.querySelectorAll('#inspCodeMode [data-codemode]').forEach(function (b) {
        var on = b.getAttribute('data-codemode') === codeMode();
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      var pre = $('inspCodePre');
      if (pre) pre.setAttribute('aria-label', codeMode() === 'css' ? 'CSS de la sélection' : 'JSON de la sélection');
    }
    document.querySelectorAll('#inspCodeMode [data-codemode]').forEach(function (b) {
      b.addEventListener('click', function () { ui().codeMode = b.getAttribute('data-codemode'); S.saveUI(); syncCodeMode(); renderCode(); });
    });
    function renderCode() {
      var box = $('inspectorCode');
      if (!box || box.hidden) return;
      syncCodeMode();
      if (codeMode() === 'css') {
        var cs = null;
        try { cs = hooks.selectionCss(); } catch (e) { cs = null; }
        if ($('inspCodeLabel')) $('inspCodeLabel').textContent = cs && cs.label ? cs.label : 'CSS';
        if ($('inspCodePre')) $('inspCodePre').textContent = cs && cs.css ? cs.css : '/* Aucun style d’élément ici.\n   Réglez le design dans l’onglet Design :\n   le CSS généré s’affiche ici, en direct. */';
        return;
      }
      var c = selectionForCode();
      var label = $('inspCodeLabel');
      if (label) label.textContent = c.label;
      var pre = $('inspCodePre');
      if (pre) {
        var json = '';
        try { json = JSON.stringify(c.obj, null, 2); } catch (e) { json = 'La sélection n’a pas pu être sérialisée.'; }
        if (json.length > 200000) json = json.slice(0, 200000) + '\n… (tronqué)';
        pre.textContent = json;
      }
    }

    function switchInspTab(mode) {
      inspMode = mode;
      var tabs = [['settings', 'inspTabSettings', 'inspector'], ['design', 'inspTabDesign', 'inspectorDesign'], ['code', 'inspTabCode', 'inspectorCode']];
      tabs.forEach(function (t) {
        var btn = $(t[1]), panel = $(t[2]);
        if (!btn || !panel) return;
        var on = mode === t[0];
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', String(on));
        panel.hidden = !on;
      });
      if (mode === 'code') renderCode();
      if (hooks.inspTabChanged) { try { hooks.inspTabChanged(mode); } catch (e) { /* module error */ } }
    }
    S.switchInspTab = switchInspTab;
    S.inspMode = function () { return inspMode; };
    S.renderCode = renderCode;

    if ($('inspTabSettings')) $('inspTabSettings').addEventListener('click', function () { switchInspTab('settings'); });
    if ($('inspTabCode')) $('inspTabCode').addEventListener('click', function () { switchInspTab('code'); });
    if ($('inspTabDesign')) $('inspTabDesign').addEventListener('click', function () { switchInspTab('design'); });
    if ($('inspCodeCopy')) $('inspCodeCopy').addEventListener('click', function () {
      if (codeMode() === 'css') {
        var cs = null;
        try { cs = hooks.selectionCss(); } catch (e) { cs = null; }
        if (cs && cs.css) copyText(cs.css, 'CSS copié (' + cs.label + ').'); else toast('Aucun style d’élément à copier ici.');
        return;
      }
      var c = selectionForCode();
      var json = '';
      try { json = JSON.stringify(c.obj, null, 2); } catch (e) { json = ''; }
      copyText(json, 'JSON copié (' + c.label + ').');
    });

    /* ================================================================ 2. « Mes blocs » */

    var BLOCKS_CAP = 20;
    var HEAVY_IMAGE = 100 * 1024; // strip data-URL images above this when saving a block

    function blocks() {
      var u = ui();
      if (!Array.isArray(u.blocks)) u.blocks = [];
      return u.blocks;
    }

    function stripHeavyImages(value, counter) {
      if (typeof value === 'string') {
        if (value.indexOf('data:') === 0 && dataUrlBytes(value) > HEAVY_IMAGE) { counter.n++; return null; }
        return value;
      }
      if (Array.isArray(value)) return value.map(function (v) { return stripHeavyImages(v, counter); });
      if (value && typeof value === 'object') {
        var out = {};
        Object.keys(value).forEach(function (k) { out[k] = stripHeavyImages(value[k], counter); });
        return out;
      }
      return value;
    }

    /* cut on a word boundary with an ellipsis: « … des soins simples et… », never « nature » */
    function shortName(text, max) {
      text = String(text || '').replace(/\s+/g, ' ').trim();
      if (text.length <= max) return text;
      var cut = text.slice(0, max - 1);
      var sp = cut.lastIndexOf(' ');
      if (sp > max * 0.5) cut = cut.slice(0, sp);
      return cut.replace(/[\s,;:.\-–—]+$/, '') + '…';
    }

    function saveBlock(section, ask) {
      if (!section) { toast('Sélectionnez une section à enregistrer.'); return; }
      if (!gate('blocks', { count: blocks().length })) return;
      if (blocks().length >= BLOCKS_CAP) { toast(BLOCKS_CAP + ' blocs au maximum : supprimez-en un d’abord (clic droit sur le bloc).', 'warn'); return; }
      var counter = { n: 0 };
      var settings = stripHeavyImages(clone(section.settings || {}), counter);
      var block = {
        id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 999),
        name: shortName(S.sectionName(section), 40),
        type: section.type,
        at: new Date().toISOString(),
        settings: settings
      };
      var next = blocks().concat([block]);
      if (JSON.stringify(next).length > 1500 * 1024) { toast('Plus de place pour ce bloc : la réserve « Mes blocs » est pleine.', 'err'); return; }
      ui().blocks = next;
      S.saveUI();
      S.buildInsertPanel();
      toast(counter.n
        ? 'Bloc « ' + block.name + ' » enregistré — ' + (counter.n === 1 ? '1 photo trop lourde (plus de 100 Ko) non incluse.' : counter.n + ' photos trop lourdes (plus de 100 Ko) non incluses.')
        : (ask ? 'Bloc enregistré dans « Mes blocs » : donnez-lui un nom (Entrée pour valider).' : 'Bloc « ' + block.name + ' » enregistré dans « Mes blocs » (onglet Ajouter).'), counter.n ? 'warn' : 'ok');
      /* the naming step: from the canvas menu, the new card opens straight in rename mode */
      if (ask) {
        S.switchLeftTab('insert');
        var card = document.querySelector('#blocksGrid [data-block="' + cssEsc(block.id) + '"]');
        if (card) {
          if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
          renameBlockInline(card, block);
        }
      }
    }

    function deleteBlock(id) {
      ui().blocks = blocks().filter(function (b) { return b.id !== id; });
      S.saveUI();
      S.buildInsertPanel();
      toast('Bloc supprimé.', 'info');
    }

    function renameBlockInline(card, b) {
      var nameEl = card.querySelector('b');
      if (!nameEl) return;
      var input = document.createElement('input');
      input.value = b.name || '';
      input.maxLength = 40;
      input.setAttribute('aria-label', 'Nom du bloc');
      input.className = 'st-blockcard__rename';
      input.style.width = '90%';
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus();
      input.select();
      var fin = false;
      function finish(apply) {
        if (fin) return;
        fin = true;
        var v = input.value.trim();
        if (apply && v) {
          blocks().forEach(function (x) { if (x.id === b.id) x.name = v.slice(0, 40); });
          S.saveUI();
        }
        S.buildInsertPanel();
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', function () { finish(true); });
      input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      input.addEventListener('click', function (e) { e.stopPropagation(); }); // never inserts the block
    }

    function exportBlocks() {
      var json = JSON.stringify({ kind: 'jeere-studio-blocks', version: 1, blocks: blocks() }, null, 2);
      downloadBlob(new Blob([json], { type: 'application/json' }), 'mes-blocs.json');
      toast('Blocs exportés (mes-blocs.json).', 'ok');
    }

    function importBlocksFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed = null;
        try { parsed = JSON.parse(String(reader.result)); } catch (e) { toast('Ce fichier n’est pas un JSON valide.', 'err'); return; }
        var list = parsed && Array.isArray(parsed.blocks) ? parsed.blocks : (Array.isArray(parsed) ? parsed : null);
        if (!list) { toast('Ce fichier ne contient pas de blocs.', 'err'); return; }
        var added = 0, capped = 0;
        var cap = planLimit('blocks', BLOCKS_CAP);
        list.forEach(function (b) {
          if (!b || typeof b.type !== 'string' || !S.sectionDef(b.type)) return;
          if (blocks().length >= cap) { capped++; return; }
          var counter = { n: 0 };
          ui().blocks = blocks().concat([{
            id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 9999) + added,
            name: String(b.name || S.sectionDef(b.type).name || b.type).slice(0, 40),
            type: b.type,
            at: new Date().toISOString(),
            settings: stripHeavyImages(clone(b.settings || {}), counter)
          }]);
          added++;
        });
        S.saveUI();
        S.buildInsertPanel();
        toast(added ? added + ' bloc(s) importé(s) dans « Mes blocs ».' : 'Aucun bloc compatible dans ce fichier.', added ? 'ok' : 'warn');
        if (capped && cap < BLOCKS_CAP) gate('blocks', { count: blocks().length });
      };
      reader.readAsText(file);
    }

    var blocksFileInput = document.createElement('input');
    blocksFileInput.type = 'file';
    blocksFileInput.accept = 'application/json,.json';
    blocksFileInput.hidden = true;
    document.body.appendChild(blocksFileInput);
    blocksFileInput.addEventListener('change', function () {
      importBlocksFile(blocksFileInput.files && blocksFileInput.files[0]);
      blocksFileInput.value = '';
    });

    hooks.sectionCtxItems = function (items, s) {
      items.push(null);
      items.push(['Enregistrer dans « Mes blocs »…', '', function () { saveBlock(s, true); }]);
      return items;
    };

    var BLOCK_GLYPH = '<svg viewBox="0 0 44 32"><path d="M22 4l14 7-14 7-14-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 16.5l14 7 14-7M8 22l14 7 14-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

    hooks.insertPanelBuilt = function (panel) {
      var head = ce('div', 'st-blocks__title');
      var bcap = planLimit('blocks', BLOCKS_CAP);
      head.appendChild(ce('span', '', bcap < BLOCKS_CAP ? 'Mes blocs · ' + Math.min(blocks().length, 99) + ' / ' + bcap : 'Mes blocs'));
      var btns = ce('span', '');
      var ex = ce('button', 'st-ghostbtn', 'Exporter');
      ex.type = 'button';
      ex.id = 'blocksExport';
      /* nothing to export yet: greyed, like « Dupliquer » without a selection */
      ex.disabled = !blocks().length;
      ex.title = blocks().length ? 'Télécharger mes blocs (JSON)' : 'Aucun bloc à exporter pour l’instant';
      ex.addEventListener('click', function () { if (blocks().length) exportBlocks(); });
      var im = ce('button', 'st-ghostbtn', 'Importer');
      im.type = 'button';
      im.style.marginLeft = '4px';
      im.addEventListener('click', function () { blocksFileInput.click(); });
      btns.appendChild(ex);
      btns.appendChild(im);
      head.appendChild(btns);
      panel.appendChild(head);
      var list = blocks();
      if (!list.length) {
        panel.appendChild(ce('div', 'st-blocks__empty', 'Enregistrez n’importe quelle section avec ses réglages : clic droit sur la section → « Enregistrer dans Mes blocs ». Elle s’insère ensuite comme un type de section.'));
        return;
      }
      var grid = ce('div', 'st-insert__grid');
      grid.id = 'blocksGrid';
      list.forEach(function (b) {
        var def = S.sectionDef(b.type);
        var card = ce('div', 'st-typecard st-blockcard');
        card.setAttribute('data-block', b.id);
        card.innerHTML = BLOCK_GLYPH + '<b>' + esc(b.name || (def && def.name) || b.type) + '</b><small>' + esc((def && def.name) || b.type) + '</small>';
        card.title = 'Cliquez pour insérer après la sélection. Clic droit : renommer, supprimer.';
        card.addEventListener('click', function () {
          if (!def) { toast('Ce type de section n’existe plus dans le contrat.', 'warn'); return; }
          S.insertSection(b.type, undefined, b.settings, b.name);
        });
        card.addEventListener('mouseenter', function () {
          /* no hover preview under an open context menu or while renaming: never two popups */
          if (document.querySelector('.st-ctx') || card.querySelector('input')) return;
          S.showTypePreview(card, { id: b.type, settings: b.settings, blockId: b.id, name: b.name, description: 'Bloc enregistré — ' + ((def && def.name) || b.type) + '.' });
        });
        card.addEventListener('mouseleave', S.hideTypePreview);
        card.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          S.hideTypePreview();
          S.openCtx(e.clientX, e.clientY, [
            ['Insérer le bloc', '', function () { if (def) S.insertSection(b.type, undefined, b.settings, b.name); }],
            ['Renommer', '', function () { S.hideTypePreview(); renameBlockInline(card, b); }],
            null,
            ['Supprimer le bloc', '', function () { deleteBlock(b.id); }]
          ]);
        });
        grid.appendChild(card);
      });
      panel.appendChild(grid);
    };

    /* ================================================================ 3. « Jetons » */

    var tokensOpen = false;
    var canEditColors = typeof D.setColorKey === 'function' && typeof D.themeColors === 'function' &&
      Array.isArray(D.PALETTE_COLOR_KEYS) && D.PALETTE_COLOR_KEYS.length > 0;

    var TOKEN_LABELS = {
      bg: 'Fond de la page', surface: 'Fond des cartes', text: 'Texte', muted: 'Texte secondaire',
      accent: 'Couleur principale', onAccent: 'Texte des boutons', line: 'Lignes et bordures'
    };

    function liveColors() {
      try {
        if (typeof D.themeColors === 'function') {
          var tc = D.themeColors(cfg());
          if (tc && tc.base) return tc.base;
        }
      } catch (e) { /* fall back to the palette */ }
      try {
        var th = cfg().theme || {};
        var pal = D.palettes && th.palette && D.palettes[th.palette];
        return (pal && pal.colors) || {};
      } catch (e2) { return {}; }
    }

    function buildTokens() {
      var body = $('tokensBody');
      if (!body) return;
      body.innerHTML = '';
      var base = liveColors();
      var th = cfg().theme || {};
      var set = {};
      try { set = (typeof D.colorOverrides === 'function' && D.colorOverrides(th.colors)) || {}; } catch (e) { set = {}; }

      body.appendChild(ce('div', 'st-group__title', 'Couleurs du thème'));
      var keys = ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent', 'line'];
      keys.forEach(function (key) {
        var val = base[key] == null ? '' : String(base[key]);
        var editable = canEditColors && (D.PALETTE_COLOR_KEYS || []).indexOf(key) !== -1;
        var row = ce('button', 'st-token');
        row.type = 'button';
        row.setAttribute('data-token', key);
        var label = (D.COLOR_LABELS && D.COLOR_LABELS[key]) || TOKEN_LABELS[key] || key;
        row.innerHTML = '<span class="st-token__swatch" style="background:' + esc(val || '#888') + '"></span>' +
          '<span class="st-token__name">' + esc(label) + '<small>' + esc(key) + (set[key] ? ' · personnalisé' : '') + '</small></span>' +
          (editable ? '<span class="st-token__val">' + esc(val.toUpperCase()) + '</span>'
                    : '<span class="st-token__soon">' + (/^#/.test(val) ? 'Modifiable bientôt' : esc(val)) + '</span>');
        if (editable) {
          row.title = 'Cliquer pour choisir une autre couleur';
          row.addEventListener('click', function () {
            /* the Studio's own colour picker (jcolor.js), never the native one */
            function setToken(v) {
              var hx = String(v || '').slice(0, 7);
              if (!/^#[0-9A-Fa-f]{6}$/.test(hx)) return;
              commit('Jeton « ' + label + ' » modifié', function (c) {
                c.theme = c.theme || {};
                if (!D.setColorKey(c, 'theme:' + key, hx)) {
                  c.theme.colors = c.theme.colors || {};
                  c.theme.colors[key] = hx;
                }
              }, { coalesce: 'token:' + key, structure: true });
            }
            if (!window.JeereColor) return;
            window.JeereColor.open({
              anchor: row, title: label, theme: (window.JeereStudioTheme && window.JeereStudioTheme.get()) || 'light', value: /^#[0-9a-fA-F]{6}$/.test(val) ? val : '#888888',
              onChange: function (v) { setToken(v); },
              place: function (el) {
                var rr = row.getBoundingClientRect();
                el.style.left = Math.max(8, rr.left - el.offsetWidth - 8) + 'px';
                el.style.top = Math.max(56, Math.min(window.innerHeight - el.offsetHeight - 8, rr.top - 40)) + 'px';
              },
              toast: toast
            });
          });
        } else {
          row.disabled = !editable && key !== 'line' ? false : false;
          row.title = editable ? '' : 'Ce jeton suit la palette ; il n’est pas encore modifiable ici.';
        }
        body.appendChild(row);
      });

      /* the reset only touches the 7 palette keys shown here: the element colours set in the
       * simple editor (announcement, header, footer, badge…) are kept, and the button only
       * appears when a PALETTE key really is customised */
      var palOverridden = Object.keys(set).filter(function (k) {
        return (D.PALETTE_COLOR_KEYS || []).indexOf(k) !== -1;
      });
      if (palOverridden.length && canEditColors) {
        var reset = ce('button', 'st-addbtn', 'Revenir aux couleurs de la palette');
        reset.type = 'button';
        reset.addEventListener('click', function () {
          commit('Couleurs de la palette restaurées', function (c) {
            if (!c.theme || !c.theme.colors) return;
            (D.PALETTE_COLOR_KEYS || []).forEach(function (k) { delete c.theme.colors[k]; });
            if (!Object.keys(c.theme.colors).length) delete c.theme.colors;
          }, { structure: true });
        });
        body.appendChild(reset);
      }

      body.appendChild(ce('div', 'st-group__title', 'Typographie et formes'));
      var pair = null;
      try { pair = (D.fontPairs && th.fonts && D.fontPairs[th.fonts]) || null; } catch (e) { pair = null; }
      /* one glyph per kind of token: Aa only for the typography row */
      var GLYPHS = {
        fonts: 'Aa',
        radius: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-8a8 8 0 0 1 8-8h8"/></svg>',
        intensity: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 7.5h4.6M12 12h6M12 16.5h4.6"/></svg>',
        buttons: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="10" x="2" y="7" rx="5"/></svg>'
      };
      function infoRow(name, small, val, glyph) {
        var r = ce('div', 'st-token');
        r.innerHTML = '<span class="st-token__swatch" style="background:var(--st-chrome-3);display:flex;align-items:center;justify-content:center;color:var(--st-ink);font-size:11px">' + (GLYPHS[glyph] || GLYPHS.fonts) + '</span>' +
          '<span class="st-token__name">' + esc(name) + '<small>' + esc(small) + '</small></span>' +
          '<span class="st-token__val">' + esc(val) + '</span>';
        return r;
      }
      body.appendChild(infoRow('Polices', pair && pair.display ? String(pair.display.family).split(',')[0].replace(/'/g, '') : 'fonts', pair ? pair.name : String(th.fonts || '—'), 'fonts'));
      var rad = null;
      (D.RADIUS_OPTIONS || []).forEach(function (o) { if (o.value === th.radius) rad = o.label; });
      body.appendChild(infoRow('Angles', 'radius', rad || String(th.radius || '—'), 'radius'));
      var inten = null;
      (D.INTENSITY_OPTIONS || []).forEach(function (o) { if (o.value === th.intensity) inten = o.label; });
      body.appendChild(infoRow('Intensité', 'intensity', inten || String(th.intensity || '—'), 'intensity'));
      var btn = null;
      (D.BUTTON_OPTIONS || []).forEach(function (o) { if (o.value === th.buttons) btn = o.label; });
      body.appendChild(infoRow('Boutons', 'buttons', btn || String(th.buttons || '—'), 'buttons'));
      body.appendChild(ce('p', 'st-insp__empty', canEditColors
        ? 'Cliquez sur une couleur pour la modifier : le changement passe par l’historique (Ctrl Z) et la fiche (theme.colors).'
        : 'Cette version du contrat ne prend pas encore les couleurs personnalisées : les jetons sont en lecture seule.'));
    }

    function toggleTokens(force) {
      var p = $('tokensPanel');
      if (!p) return;
      tokensOpen = force != null ? !!force : p.hidden;
      if (tokensOpen && $('versionsPanel')) $('versionsPanel').hidden = true;
      p.hidden = !tokensOpen;
      if ($('tokensBtn')) $('tokensBtn').setAttribute('aria-pressed', String(tokensOpen));
      if ($('versionsBtn') && tokensOpen) $('versionsBtn').setAttribute('aria-pressed', 'false');
      if (tokensOpen) buildTokens();
    }

    /* ================================================================ 4. « Historique » (versions) */

    var VERSIONS_KEY = 'jeere-studio-versions';
    var VERSIONS_CAP = 15;
    var AUTO_EVERY = 20;

    function loadVersions() {
      try {
        var v = JSON.parse(localStorage.getItem(VERSIONS_KEY) || '{}');
        if (!v || typeof v !== 'object') v = {};
        if (!Array.isArray(v.items)) v.items = [];
        if (typeof v.saves !== 'number') v.saves = 0;
        return v;
      } catch (e) { return { items: [], saves: 0 }; }
    }

    function saveVersions(store) {
      for (var tries = 0; tries < 6; tries++) {
        try {
          localStorage.setItem(VERSIONS_KEY, JSON.stringify(store));
          return true;
        } catch (e) {
          if (store.items.length) store.items.shift(); // quota: evict the oldest and retry
          else { toast('Plus de place pour l’historique des versions dans ce navigateur.', 'err'); return false; }
        }
      }
      toast('Plus de place pour l’historique des versions dans ce navigateur.', 'err');
      return false;
    }

    function takeSnapshot(name, auto, named) {
      var cap = planLimit('versions', VERSIONS_CAP);
      if (cap < VERSIONS_CAP && loadVersions().items.length >= cap) {
        /* Découverte: never evict her own versions to make room; an automatic snapshot simply waits */
        if (auto) return false;
        if (!gate('versions', { count: loadVersions().items.length })) return false;
      }
      var out;
      try { out = D.normalizeConfig(cfg()); } catch (e) { out = clone(cfg()); }
      var store = loadVersions();
      store.items.push({
        id: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 999),
        name: String(name || 'Sans titre').slice(0, 60),
        at: new Date().toISOString(),
        auto: !!auto,
        config: out
      });
      while (store.items.length > cap) store.items.shift();
      var ok = saveVersions(store);
      if (ok && !auto) toast(named === false ? 'Instantané pris (« ' + String(name).slice(0, 40) + ' »).' : 'Version « ' + String(name || 'Sans titre').slice(0, 40) + ' » enregistrée.', 'ok');
      buildVersions();
      return ok;
    }

    /* the save counter lives in its own tiny key: a routine save must never re-serialise the
     * 15 snapshot blobs (multi-MB with data-URL photos), and a quota error on a counter bump
     * must never evict a real version */
    var SAVES_KEY = 'jeere-studio-versions-saves';
    hooks.afterSave = function () {
      var n = 0;
      try { n = parseInt(localStorage.getItem(SAVES_KEY), 10) || 0; } catch (e) { n = 0; }
      n++;
      if (n >= AUTO_EVERY) {
        n = 0;
        takeSnapshot('Auto — ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), true);
      }
      try { localStorage.setItem(SAVES_KEY, String(n)); } catch (e2) { /* counter only: nothing lost */ }
    };

    function fmtRel(iso) {
      var t = Date.parse(iso);
      if (!isFinite(t)) return '';
      var d = Math.max(0, Date.now() - t);
      var m = Math.round(d / 60000);
      if (m < 1) return 'à l’instant';
      if (m < 60) return 'il y a ' + m + ' min';
      var h = Math.round(m / 60);
      if (h < 24) return 'il y a ' + h + ' h';
      var j = Math.round(h / 24);
      return j === 1 ? 'hier' : 'il y a ' + j + ' jours';
    }

    function restoreVersion(item) {
      commit('Restauration de « ' + item.name + ' »', function (c) {
        var normalized;
        try { normalized = D.normalizeConfig(item.config); } catch (e) { normalized = clone(item.config); }
        Object.keys(c).forEach(function (k) { delete c[k]; });
        Object.keys(normalized).forEach(function (k) { c[k] = normalized[k]; });
      }, { structure: true });
      S.select(null);
      S.showPage('home');
      toast('Version « ' + item.name + ' » restaurée. Ctrl Z pour revenir.', 'ok');
    }

    function buildVersions() {
      var body = $('versionsBody');
      if (!body || $('versionsPanel').hidden) return;
      body.innerHTML = '';
      var bar = ce('div', 'st-version__row');
      var nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.id = 'versionName';
      nameIn.placeholder = 'avant la promo Tabaski…';
      nameIn.maxLength = 60;
      nameIn.style.cssText = 'flex:1;background:var(--st-chrome-2);border:1px solid var(--st-line-d);border-radius:7px;color:var(--st-ink);font:400 12px var(--st-font);padding:6px 8px;min-width:0';
      var snapBtn = ce('button', 'st-primary', 'Instantané');
      snapBtn.type = 'button';
      snapBtn.id = 'versionSnap';
      snapBtn.addEventListener('click', function () {
        /* date AND time: two unnamed snapshots of the same day stay distinguishable */
        var given = nameIn.value.trim();
        var now = new Date();
        var dflt = 'Version du ' + now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
          ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        takeSnapshot(given || dflt, false, !!given);
        nameIn.value = '';
      });
      nameIn.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') snapBtn.click();
      });
      bar.appendChild(nameIn);
      bar.appendChild(snapBtn);
      body.appendChild(bar);
      var vcap = planLimit('versions', VERSIONS_CAP);
      body.appendChild(ce('p', 'st-insp__empty', vcap < VERSIONS_CAP
        ? 'Découverte : ' + vcap + ' versions au maximum (' + Math.min(loadVersions().items.length, vcap) + ' / ' + vcap + '). Avec un abonnement Studio : ' + VERSIONS_CAP + ' versions et un instantané automatique tous les ' + AUTO_EVERY + ' enregistrements.'
        : 'Un instantané automatique est pris tous les ' + AUTO_EVERY + ' enregistrements. ' + VERSIONS_CAP + ' versions au maximum — la plus ancienne s’efface.'));

      var items = loadVersions().items.slice().reverse();
      if (!items.length) {
        body.appendChild(ce('div', 'st-tree__empty', 'Aucune version pour l’instant. Donnez un nom et prenez un instantané.'));
        return;
      }
      items.forEach(function (item) {
        var card = ce('div', 'st-version');
        card.setAttribute('data-version', item.id);
        var head = ce('div', 'st-version__head');
        head.appendChild(ce('span', 'st-version__name', esc(item.name)));
        if (item.auto) head.appendChild(ce('span', 'st-version__auto', 'auto'));
        head.appendChild(ce('span', 'st-version__date', esc(fmtRel(item.at))));
        card.appendChild(head);
        var row = ce('div', 'st-version__row');
        var prev = ce('button', 'st-ghostbtn', 'Aperçu');
        prev.type = 'button';
        prev.addEventListener('click', function () {
          var open = card.classList.toggle('is-open');
          var shot = card.querySelector('.st-version__shot');
          if (open && shot && !shot.firstChild) {
            var rootEl = document.createElement('div');
            try { R.render(item.config, rootEl, { device: 'phone', page: 'home' }); shot.appendChild(rootEl); }
            catch (e) { shot.textContent = 'Aperçu indisponible.'; }
          }
        });
        row.appendChild(prev);
        var rest = ce('button', 'st-ghostbtn', 'Restaurer');
        rest.type = 'button';
        rest.addEventListener('click', function () { restoreVersion(item); });
        row.appendChild(rest);
        var del = ce('button', 'st-ghostbtn', 'Supprimer');
        del.type = 'button';
        del.addEventListener('click', function () {
          var store = loadVersions();
          store.items = store.items.filter(function (x) { return x.id !== item.id; });
          saveVersions(store);
          buildVersions();
        });
        row.appendChild(del);
        card.appendChild(row);
        card.appendChild(ce('div', 'st-version__shot'));
        body.appendChild(card);
      });
    }

    function toggleVersions(force) {
      var p = $('versionsPanel');
      if (!p) return;
      var open = force != null ? !!force : p.hidden;
      if (open && $('tokensPanel')) { $('tokensPanel').hidden = true; tokensOpen = false; if ($('tokensBtn')) $('tokensBtn').setAttribute('aria-pressed', 'false'); }
      p.hidden = !open;
      if ($('versionsBtn')) $('versionsBtn').setAttribute('aria-pressed', String(open));
      if (open) buildVersions();
    }

    /* ================================================================ 7. contrast overlay */

    var contrastOn = false;
    var contrastMarks = [];
    var lastContrastCount = 0;

    function parseColor(s) {
      var m = String(s || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      var a = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
      return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 };
    }
    function lum(c) {
      function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function blend(top, bot) {
      var a = top.a;
      return { r: top.r * a + bot.r * (1 - a), g: top.g * a + bot.g * (1 - a), b: top.b * a + bot.b * (1 - a), a: 1 };
    }
    function ratioOf(fg, bg) {
      var l1 = lum(fg), l2 = lum(bg);
      var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }
    function effectiveBg(el) {
      var stack = [];
      for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
        var cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none' && cs.backgroundImage.indexOf('url(') !== -1) return null; // a photo behind: skip
        var bc = parseColor(cs.backgroundColor);
        if (bc && bc.a > 0) { stack.push(bc); if (bc.a >= 1) break; }
      }
      var base = { r: 255, g: 255, b: 255, a: 1 };
      for (var i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
      return base;
    }
    function hasOwnText(el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && String(n.nodeValue).trim().length > 1) return true;
      }
      return false;
    }

    function clearContrast() {
      contrastMarks.forEach(function (n) { n.remove(); });
      contrastMarks = [];
    }

    function fmtRatio(x) { return x.toFixed(2).replace('.', ','); }

    var lastScanZoom = null;

    function scanContrast() {
      clearContrast();
      if (!contrastOn) return 0;
      var failures = 0;
      var z = state().zoom || 1;
      lastScanZoom = z;
      var placed = []; // screen rects of the tags already on the canvas (all artboards)
      S.activePresets().forEach(function (p) {
        var rootEl = S.roots()[p.key];
        var ab = S.abEls()[p.key];
        if (!rootEl || !ab || ab.classList.contains('is-hidden')) return;
        var abRect = ab.getBoundingClientRect();
        var flaggedParents = [];
        var found = [];
        var nodes = rootEl.querySelectorAll('h1,h2,h3,h4,p,a,span,button,li,small,b,strong,em,figcaption,td,th,label,dt,dd');
        var count = 0;
        for (var i = 0; i < nodes.length && count < 500; i++) {
          var el = nodes[i];
          if (!hasOwnText(el)) continue;
          count++;
          var r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          var skip = false;
          for (var fp = 0; fp < flaggedParents.length; fp++) { if (flaggedParents[fp].contains(el)) { skip = true; break; } }
          if (skip) continue;
          var cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
          var fg = parseColor(cs.color);
          var bg = effectiveBg(el);
          if (!fg || !bg) continue;
          if (fg.a < 1) fg = blend(fg, bg);
          var fs = parseFloat(cs.fontSize) || 0;
          var fw = parseInt(cs.fontWeight, 10) || 400;
          var large = fs >= 24 || (fs >= 18.66 && fw >= 700);
          var min = large ? 3 : 4.5;
          var ratio = ratioOf(fg, bg);
          if (ratio >= min - 0.001) continue;
          failures++;
          flaggedParents.push(el);
          var box = ce('div', 'st-contrast-box');
          box.style.left = (r.left - abRect.left) / z + 'px';
          box.style.top = (r.top - abRect.top) / z + 'px';
          box.style.width = r.width / z + 'px';
          box.style.height = r.height / z + 'px';
          ab.appendChild(box);
          contrastMarks.push(box);
          var sec = el.closest ? el.closest('[data-section-id]') : null;
          found.push({ r: r, ratio: ratio, large: large, sec: sec ? sec.getAttribute('data-section-id') : '' });
        }

        /* the tags are fixed-size while the artboard scales: at fit zooms (below 60 %) one tag
         * per section (« 3 textes · pire 1,16 : 1 »), above it one per text; in both cases a
         * tag that would land on another one is merged into it (« +2 ») instead of piling up */
        var groups = [];
        if (z < 0.6) {
          var bySec = {};
          found.forEach(function (f) {
            var g = bySec[f.sec];
            if (!g) { g = bySec[f.sec] = { items: [], r: f.r }; groups.push(g); }
            g.items.push(f);
          });
        } else {
          found.forEach(function (f) { groups.push({ items: [f], r: f.r }); });
        }
        groups.forEach(function (g) {
          var worst = g.items.reduce(function (a, b) { return b.ratio < a.ratio ? b : a; });
          var label = g.items.length > 1
            ? g.items.length + ' textes · pire ' + fmtRatio(worst.ratio) + ' : 1'
            : fmtRatio(worst.ratio) + ' : 1 — min ' + (worst.large ? '3' : '4,5');
          var tag = ce('div', 'st-contrast-tag', esc(label));
          tag.style.left = (g.r.left - abRect.left) / z + 'px';
          tag.style.top = (g.r.top - abRect.top) / z + 'px';
          ab.appendChild(tag);
          var tr = tag.getBoundingClientRect();
          var hit = null;
          for (var k = 0; k < placed.length; k++) {
            var o = placed[k].rect;
            if (tr.left < o.right + 2 && tr.right > o.left - 2 && tr.top < o.bottom + 2 && tr.bottom > o.top - 2) { hit = placed[k]; break; }
          }
          if (hit) {
            tag.remove();
            hit.extra += g.items.length;
            hit.el.textContent = hit.label + ' · +' + hit.extra;
            hit.rect = hit.el.getBoundingClientRect();
            return;
          }
          contrastMarks.push(tag);
          placed.push({ el: tag, label: label, extra: 0, rect: tr });
        });
      });
      lastContrastCount = failures;
      return failures;
    }

    var contrastTimer = null;
    function scheduleContrast() {
      if (!contrastOn) return;
      if (contrastTimer) clearTimeout(contrastTimer);
      contrastTimer = setTimeout(scanContrast, 160);
    }
    /* the grouping depends on the zoom: re-scan when it changes (a pan alone does not) */
    (function watchZoom() {
      var w = S.world && S.world();
      if (!w || typeof MutationObserver !== 'function') return;
      new MutationObserver(function () {
        if (contrastOn && lastScanZoom !== (state().zoom || 1)) scheduleContrast();
      }).observe(w, { attributes: true, attributeFilter: ['style'] });
    })();

    function toggleContrast(force) {
      contrastOn = force != null ? !!force : !contrastOn;
      if ($('contrastBtn')) {
        $('contrastBtn').classList.toggle('is-on', contrastOn);
        $('contrastBtn').setAttribute('aria-pressed', String(contrastOn));
      }
      if (!contrastOn) { clearContrast(); toast('Vérification des contrastes désactivée.', 'info'); return; }
      var n = scanContrast();
      toast(n === 0 ? 'Aucun problème de contraste détecté.' : (n === 1 ? '1 texte difficile à lire — encadré' : n + ' textes difficiles à lire — encadrés') + ' en rouge avec leur ratio.', n === 0 ? 'ok' : 'warn');
    }
    hooks.toggleContrast = toggleContrast;

    /* ================================================================ 8. measure overlay (Alt) */

    var altDown = false;
    var measureNodes = [];

    function clearMeasure() {
      measureNodes.forEach(function (n) { n.remove(); });
      measureNodes = [];
    }

    function measureAt(clientX, clientY) {
      clearMeasure();
      if (!altDown) return;
      var t = document.elementFromPoint(clientX, clientY);
      if (!t || !t.closest) return;
      var hovSec = t.closest('[data-section-id]');
      if (!hovSec) return;
      var abHost = t.closest('.st-ab');
      if (!abHost) return;
      var key = abHost.getAttribute('data-ab');
      var ab = S.abEls()[key];
      var rootEl = S.roots()[key];
      if (!ab || !rootEl) return;
      var z = state().zoom || 1;
      var abRect = ab.getBoundingClientRect();
      var hr = hovSec.getBoundingClientRect();

      /* the hovered section's height badge, always */
      var hTag = ce('div', 'st-measure__h', Math.round(hr.height / z) + ' px');
      hTag.style.left = (hr.right - abRect.left) / z - 8 + 'px';
      hTag.style.top = (hr.top - abRect.top) / z + 6 + 'px';
      var wrap = ce('div', 'st-measure');
      /* pinned at the artboard origin: without top/left the absolute wrapper sat at its static
       * position, i.e. BELOW the artboard's in-flow frame — a whole page height off screen */
      wrap.style.left = '0';
      wrap.style.top = '0';
      wrap.appendChild(hTag);

      /* the red gap measurement, when another section is selected in the same artboard */
      var sel = state().sel;
      var selId = sel && sel.kind === 'section' ? sel.id : (sel && sel.kind === 'multi' ? sel.ids[0] : null);
      var hovId = hovSec.getAttribute('data-section-id');
      if (selId && selId !== hovId) {
        var selEl = rootEl.querySelector('[data-section-id="' + cssEsc(selId) + '"]');
        if (selEl) {
          var sr = selEl.getBoundingClientRect();
          var top = Math.min(sr.bottom, hr.bottom), bottom = Math.max(sr.top, hr.top);
          var gap = sr.bottom <= hr.top ? hr.top - sr.bottom : (hr.bottom <= sr.top ? sr.top - hr.bottom : 0);
          var y1 = sr.bottom <= hr.top ? sr.bottom : (hr.bottom <= sr.top ? hr.bottom : Math.max(sr.top, hr.top));
          var y2 = sr.bottom <= hr.top ? hr.top : (hr.bottom <= sr.top ? sr.top : Math.max(sr.top, hr.top));
          var x = Math.max(sr.left, hr.left) + Math.min(sr.width, hr.width) / 2;
          var line = ce('div', 'st-measure__line');
          line.style.left = (x - abRect.left) / z - 0.5 + 'px';
          line.style.top = (Math.min(y1, y2) - abRect.top) / z + 'px';
          line.style.width = Math.max(1.5 / z, 1) + 'px';
          line.style.height = Math.max(Math.abs(y2 - y1) / z, 2) + 'px';
          wrap.appendChild(line);
          var tag = ce('div', 'st-measure__tag', Math.round(gap / z) + ' px');
          tag.style.left = (x - abRect.left) / z + 'px';
          tag.style.top = ((Math.min(y1, y2) + Math.abs(y2 - y1) / 2) - abRect.top) / z + 'px';
          wrap.appendChild(tag);
        }
      }
      ab.appendChild(wrap);
      measureNodes.push(wrap);
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Alt') { altDown = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.key === 'Alt') { altDown = false; clearMeasure(); e.preventDefault(); }
    });
    window.addEventListener('blur', function () { altDown = false; clearMeasure(); });
    var stageEl = S.stage();
    if (stageEl) {
      stageEl.addEventListener('pointermove', function (e) {
        if (altDown) measureAt(e.clientX, e.clientY);
      });
      stageEl.addEventListener('pointerleave', clearMeasure);
    }

    /* ================================================================ 9. PNG export */

    var storeCssText = null;
    function fetchStoreCss() {
      if (storeCssText != null) return Promise.resolve(storeCssText);
      return fetch('../creer/store.css').then(function (r) { return r.text(); }).then(function (t) {
        storeCssText = t;
        return t;
      }).catch(function () { storeCssText = ''; return ''; });
    }

    function imgToDataURL(img) {
      try {
        if (!img.complete || !img.naturalWidth) return null;
        var cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        return cv.toDataURL('image/png');
      } catch (e) { return null; } // tainted (cross-origin): the caller drops the image
    }

    /* the store's web fonts, inlined as data: @font-face rules — an SVG rasterised through an
     * <img> cannot fetch anything, so without this the headline font fell back to a generic sans */
    var fontCssCache = {};
    function blobToDataURL(b) {
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { resolve(''); };
        fr.readAsDataURL(b);
      });
    }
    function embeddedFontCss() {
      var th = cfg().theme || {};
      var pair = null;
      try { pair = D.fontPairs[th.fonts] || null; } catch (e) { pair = null; }
      var url = pair && pair.googleUrl;
      if (!url || typeof fetch !== 'function') return Promise.resolve('');
      if (fontCssCache[url] != null) return Promise.resolve(fontCssCache[url]);
      return fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).then(function (css) {
        /* keep the latin faces only (the store is in French): a handful of small woff2 files */
        var blocks = String(css).match(/@font-face\s*{[^}]*}/g) || [];
        blocks = blocks.filter(function (b) { return /unicode-range:[^;]*U\+0000-00FF/i.test(b) || !/unicode-range/i.test(b); });
        return Promise.all(blocks.map(function (b) {
          var m = /url\(([^)]+)\)/.exec(b);
          if (!m) return Promise.resolve('');
          var src = m[1].replace(/["']/g, '');
          return fetch(src).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
            return blob ? blobToDataURL(blob) : '';
          }).then(function (data) { return data ? b.replace(m[0], 'url(' + data + ')') : ''; }).catch(function () { return ''; });
        })).then(function (out) {
          fontCssCache[url] = out.join('\n');
          return fontCssCache[url];
        });
      }).catch(function () { fontCssCache[url] = ''; return ''; });
    }

    function exportPNG(key, scale) {
      if (!gate('png')) return Promise.resolve(false);
      key = key || S.primaryKey();
      scale = scale || 2;
      var preset = null;
      S.presets.forEach(function (p) { if (p.key === key) preset = p; });
      var rootEl = S.roots()[key];
      if (!preset || !rootEl) { toast('Aucun artboard à exporter.', 'warn'); return Promise.resolve(false); }
      toast('Export de l’artboard ' + preset.width + ' en PNG…', 'info');
      return Promise.all([fetchStoreCss(), embeddedFontCss()]).then(function (both) {
        var css = both[1] + '\n' + both[0];
        var W = preset.width;
        var H = Math.max(200, rootEl.offsetHeight);
        var copy = rootEl.cloneNode(true);
        copy.removeAttribute('id');
        var origImgs = rootEl.querySelectorAll('img');
        var copyImgs = copy.querySelectorAll('img');
        var dropped = 0;
        for (var i = 0; i < copyImgs.length; i++) {
          var src = copyImgs[i].getAttribute('src') || '';
          if (src.indexOf('data:') === 0) continue;
          var data = origImgs[i] ? imgToDataURL(origImgs[i]) : null;
          if (data) copyImgs[i].setAttribute('src', data);
          else { copyImgs[i].remove(); dropped++; }
        }
        copy.querySelectorAll('script, link, iframe').forEach(function (n) { n.remove(); });
        var wrap = document.createElement('div');
        wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrap.style.cssText = 'width:' + W + 'px;margin:0;background:#fff;font-family:system-ui,sans-serif';
        var styleEl = document.createElement('style');
        styleEl.textContent = String(css).replace(/</g, ' ');
        wrap.appendChild(styleEl);
        wrap.appendChild(copy);
        var xml;
        try { xml = new XMLSerializer().serializeToString(wrap); }
        catch (e) { toast('L’aperçu n’a pas pu être sérialisé pour l’export.', 'err'); return false; }
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
          '<foreignObject width="100%" height="100%">' + xml + '</foreignObject></svg>';
        /* a data: URL, not a blob: — Chromium taints the canvas for blob-served foreignObject
         * SVGs, and a tainted canvas refuses toBlob (tested) */
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        return new Promise(function (resolve) {
          var img = new Image();
          img.onload = function () {
            try {
              var cv = document.createElement('canvas');
              /* 2x by default (sharp on a phone screen), within the canvas limits of the browsers */
              var k = scale;
              while (k > 1 && (Math.max(W, H) * k > 32000 || W * H * k * k > 60000000)) k--;
              cv.width = W * k;
              cv.height = H * k;
              var ctx = cv.getContext('2d');
              ctx.scale(k, k);
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, W, H);
              ctx.drawImage(img, 0, 0, W, H);
              cv.toBlob(function (png) {
                if (!png) { toast('Le navigateur a refusé de rastériser l’aperçu.', 'err'); resolve(false); return; }
                var name = 'boutique-' + preset.width + (k > 1 ? '@' + k + 'x' : '');
                try { if (D.slugify && cfg().store && cfg().store.name) name = (D.slugify(cfg().store.name) || 'boutique') + '-' + preset.width + (k > 1 ? '@' + k + 'x' : ''); } catch (e) { /* default */ }
                downloadBlob(png, name + '.png');
                toast('Image exportée (' + name + '.png)' + (dropped ? ' — ' + dropped + ' photo(s) non embarquable(s) laissée(s) de côté.' : '.'), dropped ? 'warn' : 'ok');
                resolve(true);
              }, 'image/png');
            } catch (e) {
              toast('Une photo a bloqué l’export (sécurité du navigateur). Retirez-la ou réessayez.', 'err');
              resolve(false);
            }
          };
          img.onerror = function () {
            toast('L’aperçu n’a pas pu être rastérisé en image.', 'err');
            resolve(false);
          };
          img.src = url;
        });
      });
    }
    hooks.exportPNG = function () { exportPNG(); };

    /* ================================================================ 6. « Images » (assets) */

    var pickTarget = null;
    var weightCache = {};
    var weightQueue = [];
    var weightBusy = false;

    function queueWeight(src, el) {
      if (weightCache[src] != null) { paintWeight(el, weightCache[src]); return; }
      weightQueue.push([src, el]);
      pumpWeights();
    }
    function pumpWeights() {
      if (weightBusy || !weightQueue.length) return;
      weightBusy = true;
      var job = weightQueue.shift();
      fetch(job[0]).then(function (r) { return r.blob(); }).then(function (b) {
        weightCache[job[0]] = b.size;
        paintWeight(job[1], b.size);
      }).catch(function () { weightCache[job[0]] = 0; }).then(function () {
        weightBusy = false;
        pumpWeights();
      });
    }
    function paintWeight(el, bytes) {
      if (!el || !el.isConnected || !bytes) return;
      el.textContent = kb(bytes);
      el.classList.toggle('is-heavy', bytes > 300 * 1024);
      el.title = bytes > 300 * 1024 ? 'Plus de 300 Ko : cette image ralentit la boutique.' : '';
    }

    function ficheAssets() {
      var c = cfg();
      var out = [];
      if (c.store && typeof c.store.logo === 'string' && c.store.logo.indexOf('data:') === 0) {
        out.push({ src: c.store.logo, label: 'Logo de la boutique', ref: { image: c.store.logo }, bytes: dataUrlBytes(c.store.logo) });
      }
      (Array.isArray(c.sections) ? c.sections : []).forEach(function (s) {
        if (!s || !s.settings) return;
        if (typeof s.settings.image === 'string' && s.settings.image.indexOf('data:') === 0) {
          out.push({ src: s.settings.image, label: S.sectionName(s), ref: { image: s.settings.image }, bytes: dataUrlBytes(s.settings.image) });
        } else if (s.settings.photo && R.photoInfo) {
          var info = null;
          try { info = R.photoInfo(s.settings.photo); } catch (e) { info = null; }
          if (info) out.push({ src: info.src, label: S.sectionName(s), ref: { photo: info.id }, file: true });
        }
      });
      (Array.isArray(c.products) ? c.products : []).forEach(function (p) {
        if (!p) return;
        if (typeof p.image === 'string' && p.image.indexOf('data:') === 0) {
          out.push({ src: p.image, label: p.name || 'Produit', ref: { image: p.image }, bytes: dataUrlBytes(p.image) });
        } else if (p.photo && R.photoInfo) {
          var info2 = null;
          try { info2 = R.photoInfo(p.photo); } catch (e) { info2 = null; }
          if (info2) out.push({ src: info2.src, label: p.name || 'Produit', ref: { photo: info2.id }, file: true });
        }
      });
      return out;
    }

    function demoAssets() {
      var out = [];
      if (!D.DEMO_PHOTOS || !R.photoInfo) return out;
      Object.keys(D.DEMO_PHOTOS).forEach(function (id) {
        var info = null;
        try { info = R.photoInfo(id); } catch (e) { info = null; }
        if (info) out.push({ src: info.src, label: info.alt || id, ref: { photo: id }, credit: info.credit, file: true });
      });
      return out;
    }

    function applyAssetTo(ref, targetEl) {
      /* drop on the artboard: a product card gets the image; a section with an image field too */
      var card = targetEl && targetEl.closest ? targetEl.closest('[data-product-id]') : null;
      if (card) {
        var pid = card.getAttribute('data-product-id');
        if (S.productById(pid)) {
          commit('Photo du produit', function (c) {
            var t = (c.products || []).filter(function (x) { return x.id === pid; })[0];
            if (!t) return;
            if (ref.image) { t.image = ref.image; t.photo = null; }
            else if (ref.photo) { t.photo = ref.photo; t.image = null; }
          }, { structure: true });
          toast('Photo appliquée au produit.', 'ok');
          return true;
        }
      }
      var secEl = targetEl && targetEl.closest ? targetEl.closest('[data-section-id]') : null;
      if (secEl) {
        var sid = secEl.getAttribute('data-section-id');
        var type = secEl.getAttribute('data-section-type') || '';
        if (S.sectionById(sid) && S.hasField(type, 'image')) {
          var hasPhoto = S.hasField(type, 'photo');
          commit('Image de la section', function (c) {
            var t = (c.sections || []).filter(function (x) { return x.id === sid; })[0];
            if (!t) return;
            t.settings = t.settings || {};
            if (ref.image) { t.settings.image = ref.image; if (hasPhoto) t.settings.photo = null; }
            else if (ref.photo && hasPhoto) { t.settings.photo = ref.photo; t.settings.image = null; }
          }, { structure: true });
          toast('Image appliquée à la section.', 'ok');
          return true;
        }
        toast('Cette section n’a pas de champ image dans la fiche.', 'warn');
        return false;
      }
      return false;
    }

    function assetCard(a) {
      var fig = document.createElement('figure');
      fig.className = 'st-asset';
      fig.setAttribute('data-asset', a.ref.photo || 'image');
      fig.style.margin = '0';
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = a.src;
      fig.appendChild(img);
      var kbEl = ce('span', 'st-asset__kb', a.bytes ? '' : '…');
      if (a.bytes) paintWeight(kbEl, a.bytes);
      fig.appendChild(kbEl);
      if (a.file) queueWeight(a.src, kbEl);
      var cap = document.createElement('figcaption');
      cap.innerHTML = '<b>' + esc(String(a.label).slice(0, 60)) + '</b>' +
        (a.credit && a.credit.name
          ? '<span class="st-asset__credit"><a href="' + esc(a.credit.profileUrl || '#') + '" target="_blank" rel="noopener">' + esc(a.credit.name) + '</a> / Unsplash</span>'
          : '');
      fig.appendChild(cap);

      /* click fills the armed inspector slot; drag drops it on an artboard image element */
      fig.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        var startX = e.clientX, startY = e.clientY, moved = false;
        function mv(ev) {
          if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
          if (!moved) { moved = true; S.showGhost('🖼 ' + String(a.label).slice(0, 24), ev.clientX, ev.clientY); document.body.style.cursor = 'copy'; }
          S.moveGhost(ev.clientX, ev.clientY);
        }
        function up(ev) {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
          S.hideGhost();
          document.body.style.cursor = '';
          if (moved) {
            var t = document.elementFromPoint(ev.clientX, ev.clientY);
            if (t && t.closest && t.closest('.st-ab__frame')) applyAssetTo(a.ref, t);
            return;
          }
          if (pickTarget) {
            var tgt = pickTarget;
            pickTarget = null;
            tgt.set(a.ref.image ? { image: a.ref.image } : { photo: a.ref.photo, src: a.src });
            buildAssets();
            toast('Image choisie pour « ' + tgt.label + ' ».', 'ok');
          } else {
            toast('Glissez l’image sur un aperçu, ou cliquez d’abord « Choisir dans Images » dans l’inspecteur.', 'info');
          }
        }
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        e.preventDefault();
      });
      return fig;
    }

    function buildAssets() {
      var panel = $('assetsPanel');
      if (!panel || panel.hidden) return;
      panel.innerHTML = '';
      if (pickTarget) {
        var pickBox = ce('div', 'st-assets__pick');
        pickBox.id = 'assetsPickBanner';
        pickBox.appendChild(ce('span', '', 'Choisissez une image pour « ' + esc(pickTarget.label) + ' ». '));
        var cancel = ce('button', 'st-ghostbtn', 'Annuler');
        cancel.type = 'button';
        cancel.style.marginLeft = '6px';
        cancel.addEventListener('click', function () { pickTarget = null; buildAssets(); });
        pickBox.appendChild(cancel);
        panel.appendChild(pickBox);
      } else {
        panel.appendChild(ce('div', 'st-assets__hint', 'Toutes les images de la fiche, puis la photothèque de démonstration (créditée). Cliquez pour remplir un champ image choisi dans l’inspecteur, ou glissez une image sur un aperçu. Les images de plus de 300 Ko sont signalées.'));
      }
      var mine = ficheAssets();
      panel.appendChild(ce('div', 'st-assets__title', 'Dans la boutique (' + mine.length + ')'));
      var g1 = ce('div', 'st-assets__grid');
      g1.id = 'assetsFiche';
      if (!mine.length) panel.appendChild(ce('div', 'st-blocks__empty', 'Aucune image dans la fiche pour l’instant.'));
      mine.forEach(function (a) { g1.appendChild(assetCard(a)); });
      panel.appendChild(g1);
      var demo = demoAssets();
      panel.appendChild(ce('div', 'st-assets__title', 'Photothèque Jeere (' + demo.length + ')'));
      var g2 = ce('div', 'st-assets__grid');
      g2.id = 'assetsDemo';
      demo.forEach(function (a) { g2.appendChild(assetCard(a)); });
      panel.appendChild(g2);
    }

    hooks.assetsShown = buildAssets;
    hooks.pickAsset = function (target) {
      pickTarget = target;
      S.switchLeftTab('assets');
      buildAssets();
    };

    /* ================================================================ 1. command palette (Ctrl K) */

    S.registerOverlay('cmdk');

    function deaccent(s) {
      try { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
      catch (e) { return String(s).toLowerCase(); }
    }

    /* subsequence fuzzy match: returns { score, marks } or null */
    function fuzzy(query, text) {
      var q = deaccent(query), t = deaccent(text);
      if (!q) return { score: 0, marks: [] };
      var qi = 0, score = 0, marks = [], last = -2;
      for (var i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) {
          marks.push(i);
          score += (i === last + 1 ? 4 : 1) + (i === 0 || t[i - 1] === ' ' ? 3 : 0);
          last = i;
          qi++;
        }
      }
      if (qi < q.length) return null;
      return { score: score - t.length * 0.01, marks: marks };
    }

    function isWordStart(t, i) { return i === 0 || !/[a-z0-9]/.test(t[i - 1]); }

    /* Ranking, Figma/Linear-style. Tiers (higher wins outright):
     *   4  the title contains the query as a substring (bonus at a word start / title start)
     *   3  every query word is a substring of the title
     *   2  the query is a substring of the category (« aide » → the Aide group, below tier 4)
     *   1  scattered subsequence over the title, then over « category title » */
    function rankCommand(query, c) {
      var q = deaccent(query).trim();
      if (!q) return { tier: 0, score: 0, marks: [] };
      var t = deaccent(c.title), cat = deaccent(c.cat);
      var i, k, marks = [];
      var at = -1, best = -1;
      for (i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
        if (best === -1 || (isWordStart(t, i) && !isWordStart(t, best))) best = i;
        if (isWordStart(t, i)) break;
      }
      at = best;
      if (at !== -1) {
        for (k = 0; k < q.length; k++) marks.push(at + k);
        return { tier: 4, score: (isWordStart(t, at) ? 50 : 0) + (at === 0 ? 20 : 0) - at * 0.5 - t.length * 0.05, marks: marks };
      }
      var words = q.split(/\s+/).filter(Boolean);
      if (words.length > 1 && words.every(function (w) { return t.indexOf(w) !== -1; })) {
        words.forEach(function (w) { var p = t.indexOf(w); for (k = 0; k < w.length; k++) marks.push(p + k); });
        return { tier: 3, score: -t.length * 0.05, marks: marks };
      }
      if (cat.indexOf(q) !== -1) return { tier: 2, score: -t.length * 0.05, marks: [] };
      var m = fuzzy(q, c.title);
      if (m) return { tier: 1, score: m.score + 5, marks: m.marks };
      m = fuzzy(q, c.cat + ' ' + c.title);
      if (m) return { tier: 1, score: m.score, marks: m.marks.map(function (j) { return j - c.cat.length - 1; }).filter(function (j) { return j >= 0; }) };
      return null;
    }

    function markTitle(title, marks) {
      if (!marks || !marks.length) return esc(title);
      var out = '';
      var set = {};
      marks.forEach(function (i) { set[i] = true; });
      for (var i = 0; i < title.length; i++) out += set[i] ? '<b>' + esc(title[i]) + '</b>' : esc(title[i]);
      return out;
    }

    function buildCommands() {
      var cmds = [];
      function add(id, cat, title, kbdTxt, run) { cmds.push({ id: id, cat: cat, title: title, kbd: kbdTxt || '', run: run }); }

      try {
        D.sectionTypes.forEach(function (t) {
          if (t && t.id) add('add:' + t.id, 'Ajouter', 'Ajouter : ' + (t.name || t.id), '', function () { S.insertSection(t.id); });
        });
      } catch (e) { /* contract moving */ }
      blocks().forEach(function (b) {
        if (S.sectionDef(b.type)) add('block:' + b.id, 'Mes blocs', 'Insérer le bloc : ' + b.name, '', function () { S.insertSection(b.type, undefined, b.settings, b.name); });
      });
      S.PAGES.forEach(function (pg, i) {
        add('page:' + pg.id, 'Aller à', 'Aller à : ' + pg.label, 'Alt ' + (i + 1), function () { S.showPage(pg.id); });
      });
      S.customPages().forEach(function (pg) {
        add('cpage:' + pg.id, 'Aller à', 'Aller à la page : ' + (pg.title || 'Page'), '', function () { S.showPage('page', pg.id); });
      });
      try {
        D.templates.forEach(function (t) {
          add('tpl:' + t.id, 'Modèle', 'Modèle : ' + t.name + (t.style ? ' · ' + t.style : ''), '', function () {
            commit('Changement de modèle', function (c) { c.template = t.id; }, { structure: true });
          });
        });
      } catch (e) { /* none */ }
      try {
        D.palettes.forEach(function (p) {
          add('pal:' + p.id, 'Palette', 'Palette : ' + p.name, '', function () {
            commit('Changement de palette', function (c) { c.theme = c.theme || {}; c.theme.palette = p.id; }, { structure: true });
          });
        });
      } catch (e) { /* none */ }
      (D.INTENSITY_OPTIONS || []).forEach(function (o) {
        add('int:' + o.value, 'Palette', 'Intensité : ' + o.label, '', function () {
          commit('Intensité des couleurs', function (c) { c.theme = c.theme || {}; c.theme.intensity = o.value; }, { structure: true });
        });
      });
      try {
        D.fontPairs.forEach(function (f) {
          add('font:' + f.id, 'Style', 'Polices : ' + f.name, '', function () {
            commit('Changement de polices', function (c) { c.theme = c.theme || {}; c.theme.fonts = f.id; }, { structure: true });
          });
        });
      } catch (e) { /* none */ }
      [['phone', 'Téléphone seul'], ['both', 'Les deux aperçus'], ['desktop', 'Ordinateur seul']].forEach(function (d) {
        add('dev:' + d[0], 'Appareils', 'Afficher : ' + d[1], 'D', function () { S.setDeviceFocus(d[0]); });
      });
      S.presets.forEach(function (p) {
        var on = ui().artboards.indexOf(p.key) !== -1;
        add('ab:' + p.key, 'Appareils', (on ? 'Retirer l’artboard ' : 'Ajouter l’artboard ') + p.width + ' (' + p.name + ')', '', function () { S.toggleArtboard(p.key); });
      });
      add('panel:layers', 'Panneaux', 'Panneau : Calques', '', function () { S.switchLeftTab('layers'); });
      add('panel:insert', 'Panneaux', 'Panneau : Ajouter une section', '', function () { S.switchLeftTab('insert'); });
      add('panel:assets', 'Panneaux', 'Panneau : Images (fiche + photothèque)', '', function () { S.switchLeftTab('assets'); });
      add('panel:tokens', 'Panneaux', 'Jetons de design (couleurs, polices, angles)', '', function () { toggleTokens(); });
      add('panel:versions', 'Panneaux', 'Historique — versions nommées', '', function () { toggleVersions(); });
      add('panel:code', 'Panneaux', 'Inspecteur : onglet Code (JSON de la sélection)', '', function () { switchInspTab('code'); });
      add('ov:contrast', 'Vérifier', (contrastOn ? 'Désactiver' : 'Activer') + ' la vérification des contrastes', 'Ctrl ⇧ C', function () { toggleContrast(); });
      add('sel:all', 'Sélection', 'Sélectionner toutes les sections', 'Ctrl A', function () { S.selectAllSections(); });
      add('edit:undo', 'Historique', 'Annuler', 'Ctrl Z', S.undo);
      add('edit:redo', 'Historique', 'Rétablir', 'Ctrl ⇧ Z', S.redo);
      add('ver:snap', 'Historique', 'Prendre un instantané (version nommée)', '', function () { toggleVersions(true); setTimeout(function () { var i = $('versionName'); if (i) i.focus(); }, 30); });
      add('file:save', 'Fiche', 'Enregistrer maintenant', 'Ctrl S', function () { S.saveNow(); toast('Enregistré dans ce navigateur.', 'ok'); });
      add('file:export', 'Fiche', 'Exporter la fiche (JSON)', 'Ctrl E', S.exportJSON);
      add('file:import', 'Fiche', 'Importer une fiche (JSON)', '', function () { var f = $('importFile'); if (f) f.click(); });
      add('file:png', 'Fiche', 'Exporter en image (PNG de l’artboard)', '', function () { exportPNG(); });
      add('file:share', 'Fiche', 'Partager la fiche', '', function () { S.openShare(false); });
      add('file:publish', 'Fiche', 'Publier la boutique', '', function () { S.openShare(true); });
      add('view:fit', 'Affichage', 'Ajuster à l’écran', 'Ctrl 0', S.fit);
      add('view:100', 'Affichage', 'Zoom à 100 %', 'Ctrl 1', function () { S.setZoom(1); });
      add('view:selzoom', 'Affichage', 'Zoomer sur la sélection', '⇧ 2', S.zoomToSelection);
      [['select', 'Déplacer', 'V'], ['hand', 'Main', 'H'], ['text', 'Texte (modifier sur place)', 'T'], ['comment', 'Commentaire', 'C']].forEach(function (t) {
        add('tool:' + t[0], 'Outils', 'Outil : ' + t[1], t[2], function () { S.setTool(t[0]); });
      });
      add('tool:section', 'Outils', 'Outil : Section (insérer)', 'S', function () { if (hooks.sectionPopover) hooks.sectionPopover(); });
      add('tool:image', 'Outils', 'Outil : Image (photo de la sélection)', 'I', function () { S.pickImageForSelection(); });
      (S.nicheList ? S.nicheList() : []).forEach(function (n) {
        var cur = cfg().store && cfg().store.niche === n.id;
        add('niche:' + n.id, 'Boutique', 'Changer de métier : ' + n.label + (cur ? ' (actuel)' : ''), '', function () { S.changeNiche(n.id); });
      });
      // the DualEngine nodes (studio-canvas.js), when the selection is in a detached section
      function eng() { var C = window.JeereStudioCanvas; return C && C.current && C.current() && !C.current().root ? C : null; }
      add('sel:rename', 'Sélection', 'Renommer la sélection', 'F2 · Ctrl R', function () { var C = eng(); if (C) C.renameNode(C.current()); else S.renameSelection(); });
      add('sel:lock', 'Sélection', 'Verrouiller / déverrouiller la sélection', 'Ctrl ⇧ L', function () { var C = eng(); if (C) C.toggleLocked(C.current()); else S.toggleLockSelected(); });
      add('sel:hide', 'Sélection', 'Masquer / afficher la sélection', 'Ctrl ⇧ H', function () { var C = eng(); if (C) C.toggleVisible(C.current()); else if (S.toggleHideSelected) S.toggleHideSelected(); });
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach(function (d) {
        var pct = d === 0 ? 100 : d * 10;
        add('sel:op' + pct, 'Sélection', 'Opacité de la sélection : ' + pct + ' %', String(d), function () { if (S.setSelectionOpacity) S.setSelectionOpacity(pct); });
      });
      [['left', 'Aligner à gauche', 'Alt A'], ['hcenter', 'Centrer horizontalement', 'Alt H'], ['right', 'Aligner à droite', 'Alt D'],
        ['top', 'Aligner en haut', 'Alt W'], ['vcenter', 'Centrer verticalement', 'Alt V'], ['bottom', 'Aligner en bas', 'Alt S']].forEach(function (a) {
        add('align:' + a[0], 'Aligner', a[1] + ' (éléments libres)', a[2], function () { var C = eng(); if (C) C.align(C.current(), a[0]); else toast('Aligner : sélectionnez des éléments d’une section détachée (Ctrl Alt B).', 'info'); });
      });
      add('dist:h', 'Aligner', 'Répartir l’espacement horizontal', 'Alt ⇧ H', function () { var C = eng(); if (C) C.distribute(C.current(), 'h'); else toast('Répartir : sélectionnez 3 éléments d’une section détachée.', 'info'); });
      add('dist:v', 'Aligner', 'Répartir l’espacement vertical', 'Alt ⇧ V', function () { var C = eng(); if (C) C.distribute(C.current(), 'v'); else toast('Répartir : sélectionnez 3 éléments d’une section détachée.', 'info'); });
      add('eng:detach', 'Édition libre', 'Détacher / rattacher la section sélectionnée', 'Ctrl Alt B', function () {
        var E2 = window.JeereStudioEngine, sel = S.state().sel;
        if (!E2 || !sel || sel.kind !== 'section') { toast('Sélectionnez une section à détacher.', 'info'); return; }
        if (E2.isDetached(sel.id)) E2.attach(sel.id); else E2.detach(sel.id);
      });
      [['frame', 'Cadre', 'F'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O']].forEach(function (t) {
        add('tool:' + t[0], 'Outils', 'Outil : ' + t[1] + ' (dessiner, détache la section)', t[2], function () { S.setTool(t[0]); });
      });
      add('eng:autolayout', 'Édition libre', 'Auto Layout : ajouter / retirer', '⇧ A', function () { var C = eng(); if (C) C.autoLayout(C.current()); else toast('Auto Layout : sélectionnez un cadre d’une section détachée.', 'info'); });
      add('eng:group', 'Édition libre', 'Grouper la sélection', 'Ctrl G', function () { var C = eng(); if (C) C.group(C.current()); });
      add('eng:ungroup', 'Édition libre', 'Dissocier', 'Ctrl ⇧ G', function () { var C = eng(); if (C) C.ungroup(C.current()); });
      add('eng:rulers', 'Affichage', 'Afficher / masquer les règles', '⇧ R', function () { var C = window.JeereStudioCanvas; if (C) C.toggleRulers(); });
      add('eng:grid', 'Affichage', 'Grille de mise en page', '⇧ G', function () { var C = window.JeereStudioCanvas; if (C) C.toggleGrid(); });
      add('eng:pixgrid', 'Affichage', 'Grille de pixels (dès 800 %)', 'Ctrl ⇧ \'', function () { var C = window.JeereStudioCanvas; if (C) C.togglePixelGrid(); });
      add('view:left', 'Panneaux', 'Replier / afficher le panneau de gauche', 'Ctrl Alt [', function () { if (S.setPanel) S.setPanel('left', !document.body.classList.contains('st-left-off')); });
      add('view:right', 'Panneaux', 'Replier / afficher le panneau de droite', 'Ctrl Alt ]', function () { if (S.setPanel) S.setPanel('right', !document.body.classList.contains('st-right-off')); });
      add('view:chrome', 'Affichage', 'Masquer / afficher les panneaux', 'Ctrl \\', function () { S.toggleChrome(); });
      add('view:help', 'Aide', 'Raccourcis clavier (aide)', '?', function () { S.toggleHelp(); });
      add('view:simple', 'Aide', 'Ouvrir l’éditeur simple (même fiche)', 'Ctrl Alt P', function () { if (S.goSimple) S.goSimple(); else window.location.href = '../creer/#editeur'; });
      // commands of optional extensions (sites/entry.js: « Mes sites », for the founder only)
      (window.JeereStudioExtraCommands || []).forEach(function (f) { try { f(add); } catch (e) { /* the extension */ } });
      return cmds;
    }

    var cmdkIndex = 0;
    var cmdkItems = [];

    function cmdkRecent() {
      var u = ui();
      if (!Array.isArray(u.cmdkRecent)) u.cmdkRecent = [];
      return u.cmdkRecent;
    }

    function openPalette() {
      var box = $('cmdk');
      if (!box) return;
      if (!box.hidden) { closePalette(); return; }
      S.closeModals();
      S.closeCtx();
      box.hidden = false;
      var input = $('cmdkInput');
      input.value = '';
      renderPalette('');
      input.focus();
    }
    function closePalette() {
      var box = $('cmdk');
      if (box) box.hidden = true;
      /* release the focus: a hidden input that kept it swallowed the next Ctrl K */
      var input = $('cmdkInput');
      if (input && document.activeElement === input) input.blur();
    }

    function renderPalette(query) {
      var list = $('cmdkList');
      if (!list) return;
      var all = buildCommands();
      var rows = [];
      if (!query) {
        var rec = cmdkRecent();
        var recent = [];
        rec.forEach(function (id) {
          var c = all.filter(function (x) { return x.id === id; })[0];
          if (c) recent.push({ cmd: c, marks: [], recent: true });
        });
        rows = recent.concat(all.filter(function (c) { return rec.indexOf(c.id) === -1; }).map(function (c) { return { cmd: c, marks: [] }; }));
      } else {
        all.forEach(function (c) {
          var r = rankCommand(query, c);
          if (r) rows.push({ cmd: c, score: r.score, tier: r.tier, marks: r.marks });
        });
        /* a scattered subsequence never outranks a real match, and once anything really
         * matches (substring or every word), scatter-only rows are dropped altogether */
        var bestTier = rows.reduce(function (m, r) { return Math.max(m, r.tier); }, 0);
        if (bestTier >= 2) rows = rows.filter(function (r) { return r.tier >= 2; });
        rows.sort(function (a, b) { return (b.tier - a.tier) || (b.score - a.score); });
      }
      rows = rows.slice(0, 60);
      cmdkItems = rows;
      cmdkIndex = 0;
      list.innerHTML = '';
      if (!rows.length) {
        list.appendChild(ce('div', 'st-cmdk__empty', 'Aucune commande ne correspond à « ' + esc(query) + ' ».'));
        return;
      }
      /* browsing (no query): category headers, the title without its repeated « Catégorie : »
       * prefix; searching: one ranked list, the category as a dim label on the right */
      var header = null;
      rows.forEach(function (r, i) {
        if (!query) {
          var h = r.recent ? 'Récentes' : r.cmd.cat;
          if (h !== header) { list.appendChild(ce('div', 'st-cmdk__recent', esc(h))); header = h; }
        }
        var b = ce('button', 'st-cmdk__item' + (i === 0 ? ' is-active' : ''));
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.setAttribute('data-cmd', r.cmd.id);
        var ttl = r.cmd.title;
        var pre = r.cmd.cat + ' : ';
        var shown = (!query && ttl.indexOf(pre) === 0) ? esc(ttl.slice(pre.length)) : markTitle(ttl, r.marks);
        b.innerHTML = '<span class="st-cmdk__ico">' + cmdIcon(r.cmd) + '</span>' +
          '<span class="st-cmdk__ttl">' + shown + '</span>' +
          ((query || r.recent) ? '<span class="st-cmdk__cat">' + esc(r.cmd.cat) + '</span>' : '') +
          (r.cmd.kbd ? '<kbd>' + esc(r.cmd.kbd) + '</kbd>' : '');
        b.addEventListener('click', function () { runCommand(r.cmd); });
        b.addEventListener('mousemove', function () { setActive(i); });
        list.appendChild(b);
      });
    }

    /* the palette's glyphs, one per category: 24 × 24 grid, 1.5 stroke, round caps and joins */
    var CMD_ICONS = {
      'Ajouter': '<path d="M5 12h14M12 5v14"/>',
      'Mes blocs': '<path d="M3 12C3 5.25 5.25 3 12 3C18.75 3 21 5.25 21 12C21 18.75 18.75 21 12 21C5.25 21 3 18.75 3 12Z"/><path d="M3 9h18"/>',
      'Aller à': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
      'Modèle': '<path d="M3 12C3 5.25 5.25 3 12 3C18.75 3 21 5.25 21 12C21 18.75 18.75 21 12 21C5.25 21 3 18.75 3 12Z"/><path d="M3 9h18M9 21V9"/>',
      'Palette': '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6 17.46 2 12 2z"/>',
      'Style': '<path d="m4 20 8-16 8 16"/><path d="M7.5 13h9"/>',
      'Appareils': '<path d="M2 9C2 5.25 3.75 4 9 4C14.25 4 16 5.25 16 9C16 12.75 14.25 14 9 14C3.75 14 2 12.75 2 9Z"/><path d="M17 14C17 10.25 17.62 9 19.5 9C21.38 9 22 10.25 22 14C22 17.75 21.38 19 19.5 19C17.62 19 17 17.75 17 14Z"/><path d="M6 18h6"/>',
      'Panneaux': '<path d="M3 12C3 5.25 5.25 3 12 3C18.75 3 21 5.25 21 12C21 18.75 18.75 21 12 21C5.25 21 3 18.75 3 12Z"/><path d="M9 3v18"/>',
      'Vérifier': '<path d="M20 6 9 17l-5-5"/>',
      'Sélection': '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/>',
      'Historique': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/>',
      'Fiche': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
      'Affichage': '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
      'Aide': '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
      'Outils': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
      'Boutique': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20v2a3 3 0 0 1-6 0 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-6 0z"/>'
    };
    function cmdIcon(cmd) {
      var d = CMD_ICONS[cmd.cat] || '<circle cx="12" cy="12" r="3"/>';
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    }

    function setActive(i) {
      cmdkIndex = clamp(i, 0, cmdkItems.length - 1);
      var list = $('cmdkList');
      var items = list.querySelectorAll('.st-cmdk__item');
      items.forEach(function (n, j) { n.classList.toggle('is-active', j === cmdkIndex); });
      var active = items[cmdkIndex];
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }

    function runCommand(cmd) {
      closePalette();
      var rec = cmdkRecent().filter(function (id) { return id !== cmd.id; });
      rec.unshift(cmd.id);
      ui().cmdkRecent = rec.slice(0, 8);
      S.saveUI();
      try { cmd.run(); } catch (e) { toast('La commande n’a pas pu être exécutée.', 'err'); }
    }

    (function wirePalette() {
      var box = $('cmdk');
      if (!box) return;
      var input = $('cmdkInput');
      input.addEventListener('input', function () { renderPalette(input.value.trim()); });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); closePalette(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(cmdkIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(cmdkIndex - 1); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          var r = cmdkItems[cmdkIndex];
          if (r) runCommand(r.cmd);
        } else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      });
      box.addEventListener('click', function (e) { if (e.target === box) closePalette(); });
    })();

    hooks.commandPalette = openPalette;

    /* ================================================================ wiring + live refresh */

    /* touch (iPad): hover-only affordances (layer eye/padlock) become always visible and every
     * target grows towards 44 px — on a coarse pointer at load, or at the first finger touch */
    function markTouch() { document.documentElement.classList.add('st-touch'); }
    try {
      if ((window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches)) &&
          (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) markTouch();
    } catch (e) { /* no matchMedia */ }
    window.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') markTouch(); }, true);

    if ($('tokensBtn')) $('tokensBtn').addEventListener('click', function () { toggleTokens(); });
    if ($('versionsBtn')) $('versionsBtn').addEventListener('click', function () { toggleVersions(); });
    if ($('contrastBtn')) $('contrastBtn').addEventListener('click', function () { toggleContrast(); });
    document.querySelectorAll('[data-closedrawer]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.closest('.st-drawer');
        if (d) d.hidden = true;
        if (d && d.id === 'tokensPanel') { tokensOpen = false; if ($('tokensBtn')) $('tokensBtn').setAttribute('aria-pressed', 'false'); }
        if (d && d.id === 'versionsPanel' && $('versionsBtn')) $('versionsBtn').setAttribute('aria-pressed', 'false');
      });
    });
    /* Échap closes an open drawer before touching the selection */
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      /* the palette (or a modal) sits on top of the drawer: Échap belongs to it first */
      var ck = $('cmdk');
      if ((ck && !ck.hidden) || (S.anyModalOpen && S.anyModalOpen()) || document.querySelector('.st-ctx')) return;
      var t = $('tokensPanel'), v = $('versionsPanel');
      if (t && !t.hidden) { t.hidden = true; tokensOpen = false; if ($('tokensBtn')) $('tokensBtn').setAttribute('aria-pressed', 'false'); e.stopPropagation(); }
      else if (v && !v.hidden) { v.hidden = true; if ($('versionsBtn')) $('versionsBtn').setAttribute('aria-pressed', 'false'); e.stopPropagation(); }
    }, true);

    hooks.afterChange = function (opts) {
      renderCode();
      /* a design value scrubbed at 60 fps: only what shows styles follows (not the tokens, the images) */
      if (opts && opts.styleOnly) { scheduleContrast(); clearMeasure(); return; }
      if (tokensOpen) buildTokens();
      var ap = $('assetsPanel');
      if (ap && !ap.hidden) buildAssets();
      scheduleContrast();
      clearMeasure();
    };
    hooks.inspectorBuilt = function () { renderCode(); };
    hooks.afterRender = function () { scheduleContrast(); };

    /* the first build of the insert panel ran before this module: rebuild it so « Mes blocs »
     * appears, and refresh the inspector tab state */
    S.buildInsertPanel();
    switchInspTab('settings');

    /* exposed for the tests */
    window.JeereStudioPower = {
      openPalette: openPalette,
      closePalette: closePalette,
      commands: function () { return buildCommands().map(function (c) { return { id: c.id, cat: c.cat, title: c.title, kbd: c.kbd }; }); },
      runCommandById: function (id) {
        var c = buildCommands().filter(function (x) { return x.id === id; })[0];
        if (c) runCommand(c);
        return !!c;
      },
      saveBlockById: function (sectionId) { saveBlock(S.sectionById(sectionId)); },
      blocks: function () { return clone(blocks()); },
      takeSnapshot: takeSnapshot,
      versions: function () { return loadVersions(); },
      restoreVersionById: function (id) {
        var it = loadVersions().items.filter(function (x) { return x.id === id; })[0];
        if (it) restoreVersion(it);
        return !!it;
      },
      toggleTokens: toggleTokens,
      toggleVersions: toggleVersions,
      toggleContrast: toggleContrast,
      contrastCount: function () { return lastContrastCount; },
      canEditColors: canEditColors,
      exportPNG: exportPNG,
      measureAt: measureAt,
      setAlt: function (v) { altDown = !!v; if (!v) clearMeasure(); },
      measureCount: function () { return measureNodes.length; },
      pickArmed: function () { return !!pickTarget; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

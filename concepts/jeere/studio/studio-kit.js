/*
 * Jehre Studio — studio-kit.js: the behaviour of the shared controls (studio-kit.css).
 * Global: window.JeereKit = { init(root), select(el), close() }.
 *
 *   - a list (select.jk-select) opens OUR menu, never the browser's box: the native <select> stays in the
 *     page, hidden, and still fires « change », so the code that listens to it does not change;
 *   - a figure is dragged by its letter (.jk-num__pre): left / right, Maj ×10, Alt ÷10;
 *   - a colour row (.jk-color) opens the Studio's own picker (JeereColor) from its swatch, and its code
 *     can be typed;
 *   - a group folds (.jk-group__head), a switch flips (.jk-switch), a choice is made (.jk-seg).
 * Every control answers the keyboard. Nothing here knows about a panel: a panel listens to « input » and
 * « change » on its own fields, as before.
 */
(function () {
  'use strict';
  var W = window, D = document;
  function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) { /* old browser */ } }
  function ce(tag, cls, text) { var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.3 5 8.7 9.5 3.6"/></svg>';

  /* ------------------------------------------------------------------ the list */
  var open = null; // { sel, btn, menu, items, at }
  function label(sel) { var o = sel.options[sel.selectedIndex]; return o ? o.textContent : ''; }
  function sync(sel) { var b = sel._jkBtn; if (b) { b.firstChild.textContent = label(sel); b.disabled = sel.disabled; } }
  function close(focus) {
    if (!open) return;
    var o = open; open = null;
    o.menu.remove();
    o.btn.setAttribute('aria-expanded', 'false');
    if (focus) o.btn.focus();
  }
  function mark(i) {
    if (!open) return;
    open.at = i;
    open.items.forEach(function (it, k) { it.classList.toggle('is-at', k === i); });
    var it = open.items[i];
    if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    if (!open) return;
    var sel = open.sel, it = open.items[i];
    if (!it || it.getAttribute('aria-disabled') === 'true') return;
    var idx = +it.getAttribute('data-i');
    close(true);
    if (sel.selectedIndex !== idx) { sel.selectedIndex = idx; sync(sel); fire(sel, 'input'); fire(sel, 'change'); }
  }
  function show(sel) {
    if (open && open.sel === sel) { close(true); return; }
    close(false);
    var btn = sel._jkBtn, menu = ce('div', 'jk-menu');
    menu.setAttribute('role', 'listbox');
    var items = [];
    [].forEach.call(sel.options, function (o, i) {
      if (o.hidden) return;
      var it = ce('div', 'jk-menu__item' + (i === sel.selectedIndex ? ' is-on' : ''));
      it.setAttribute('role', 'option'); it.setAttribute('data-i', i);
      it.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
      if (o.disabled) it.setAttribute('aria-disabled', 'true');
      it.innerHTML = '<span class="jk-menu__check">' + (i === sel.selectedIndex ? CHECK : '') + '</span>';
      var t = ce('span', 'jk-menu__text', o.textContent);
      if (sel.hasAttribute('data-jk-fonts') && o.value) t.style.fontFamily = o.value;
      it.appendChild(t);
      menu.appendChild(it); items.push(it);
    });
    D.body.appendChild(menu);
    var r = btn.getBoundingClientRect(), vh = W.innerHeight, vw = W.innerWidth;
    menu.style.minWidth = Math.max(r.width, 140) + 'px';
    var mh = Math.min(menu.scrollHeight + 8, 320), below = vh - r.bottom - 8, up = below < Math.min(mh, 160) && r.top > below;
    menu.style.maxHeight = Math.max(120, Math.min(320, (up ? r.top : below) - 8)) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, vw - menu.offsetWidth - 8)) + 'px';
    if (up) menu.style.bottom = (vh - r.top + 4) + 'px'; else menu.style.top = (r.bottom + 4) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    open = { sel: sel, btn: btn, menu: menu, items: items, at: -1 };
    var cur = items.findIndex(function (it) { return it.classList.contains('is-on'); });
    mark(cur < 0 ? 0 : cur);
    menu.addEventListener('mousemove', function (e) { var it = e.target.closest('.jk-menu__item'); if (it) mark(items.indexOf(it)); });
    menu.addEventListener('click', function (e) { var it = e.target.closest('.jk-menu__item'); if (it) choose(items.indexOf(it)); });
  }
  var typed = '', typedAt = 0;
  function keys(e, sel) {
    var k = e.key;
    if (!open || open.sel !== sel) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); show(sel); }
      return;
    }
    var n = open.items.length;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (k === 'ArrowDown') { e.preventDefault(); mark((open.at + 1) % n); }
    else if (k === 'ArrowUp') { e.preventDefault(); mark((open.at - 1 + n) % n); }
    else if (k === 'Home') { e.preventDefault(); mark(0); }
    else if (k === 'End') { e.preventDefault(); mark(n - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(open.at); }
    else if (k === 'Tab') close(false);
    else if (k.length === 1) {   // type the first letters of a choice
      var now = Date.now(); typed = (now - typedAt > 700 ? '' : typed) + k.toLowerCase(); typedAt = now;
      var hit = open.items.findIndex(function (it) { return it.textContent.trim().toLowerCase().indexOf(typed) === 0; });
      if (hit >= 0) mark(hit);
    }
  }
  function select(sel) {
    if (!sel || sel._jkBtn || sel.multiple) return sel && sel._jkBtn;
    var btn = ce('button', ('jk-select jk-select--btn ' + sel.className.replace(/\bjk-select\b/, '')).replace(/\s+/g, ' ').trim());
    btn.type = 'button';
    btn.appendChild(ce('span', 'jk-select__text', label(sel)));
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    var name = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] && sel.labels[0].textContent.trim());
    if (name) btn.setAttribute('aria-label', name);
    sel._jkBtn = btn;
    sel.classList.add('jk-select--native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(btn, sel);
    btn.addEventListener('click', function () { show(sel); });
    btn.addEventListener('keydown', function (e) { keys(e, sel); });
    sel.addEventListener('change', function () { sync(sel); });
    ['value', 'selectedIndex'].forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k);
      if (d && d.set) Object.defineProperty(sel, k, { configurable: true, get: function () { return d.get.call(sel); }, set: function (v) { d.set.call(sel, v); sync(sel); } });
    });
    new MutationObserver(function () { sync(sel); }).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'disabled'] });
    sync(sel);
    return btn;
  }
  D.addEventListener('mousedown', function (e) { if (open && !open.menu.contains(e.target) && !open.btn.contains(e.target)) close(false); }, true);
  W.addEventListener('resize', function () { close(false); });
  W.addEventListener('blur', function () { close(false); });
  D.addEventListener('scroll', function (e) { if (open && !open.menu.contains(e.target)) close(false); }, true);

  /* ------------------------------------------------------------------ a figure dragged by its letter */
  D.addEventListener('pointerdown', function (e) {
    var pre = e.target.closest && e.target.closest('.jk-num__pre');
    if (!pre || e.button !== 0) return;
    var input = pre.parentNode.querySelector('input');
    if (!input || input.disabled) return;
    e.preventDefault();
    var x0 = e.clientX, v0 = parseFloat(String(input.value).replace(',', '.')) || 0, base = parseFloat(input.step) || 1, moved = false;
    var min = input.min === '' ? -Infinity : +input.min, max = input.max === '' ? Infinity : +input.max;
    function move(ev) {
      var dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true; D.documentElement.classList.add('jk-scrubbing');
      var step = base * (ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1);
      var v = Math.min(max, Math.max(min, v0 + Math.round(dx / 2) * step));
      var dec = Math.max((String(step).split('.')[1] || '').length, (String(v0).split('.')[1] || '').length);
      input.value = String(+v.toFixed(Math.min(dec, 3)));
      fire(input, 'input');
    }
    function up() {
      D.removeEventListener('pointermove', move); D.removeEventListener('pointerup', up); D.removeEventListener('pointercancel', up);
      D.documentElement.classList.remove('jk-scrubbing');
      if (moved) fire(input, 'change'); else { input.focus(); if (input.select) input.select(); }
    }
    D.addEventListener('pointermove', move); D.addEventListener('pointerup', up); D.addEventListener('pointercancel', up);
  });

  /* ------------------------------------------------------------------ a colour: the swatch opens the picker, the code is typed */
  function norm(v) {
    v = String(v || '').trim().replace(/^#?/, '#').toUpperCase();
    if (/^#[0-9A-F]{3}$/.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return /^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(v) ? v : null;
  }
  function paint(row, v) {
    var sw = row.querySelector('.jk-swatch');
    if (!sw) return;
    sw.classList.toggle('jk-swatch--none', !v);
    if (v) sw.style.setProperty('--c', v); else sw.style.removeProperty('--c');
  }
  D.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var sw = t.closest('.jk-color .jk-swatch');
    if (sw) {
      e.preventDefault();
      var row = sw.closest('.jk-color'), input = row.querySelector('input');
      if (!W.JeereColor || !input) { if (input) input.focus(); return; }
      W.JeereColor.open({
        anchor: sw, theme: 'light', title: row.getAttribute('data-jk-title') || 'Couleur', value: norm(input.value) || '#FFFFFF',
        onChange: function (v, live) { input.value = v; paint(row, v); fire(input, live ? 'input' : 'change'); }
      });
      return;
    }
    var head = t.closest('.jk-group__head');
    if (head) { head.setAttribute('aria-expanded', head.getAttribute('aria-expanded') === 'false' ? 'true' : 'false'); return; }
    var swi = t.closest('.jk-switch');
    if (swi && !swi.disabled) { swi.setAttribute('aria-checked', swi.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); fire(swi, 'change'); return; }
    var seg = t.closest('.jk-seg > button');
    if (seg && seg.getAttribute('aria-pressed') !== 'true') {
      [].forEach.call(seg.parentNode.children, function (b) { b.setAttribute('aria-pressed', b === seg ? 'true' : 'false'); });
      seg.parentNode.setAttribute('data-value', seg.value || seg.getAttribute('data-value') || '');
      fire(seg.parentNode, 'change');
    }
  });
  D.addEventListener('change', function (e) {
    var input = e.target;
    if (!input.matches || !input.matches('.jk-color > input')) return;
    var v = norm(input.value);
    if (v) input.value = v;
    paint(input.closest('.jk-color'), input.value.trim() ? v : '');
  });
  // left / right move inside a choice, like radio buttons
  D.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var b = e.target.closest && e.target.closest('.jk-seg > button');
    if (!b) return;
    var all = [].slice.call(b.parentNode.children), n = all[(all.indexOf(b) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
    e.preventDefault(); n.focus(); n.click();
  });

  // every list of the editors gets the kit's menu: the ones already there and the ones a panel draws later
  // (a list that must stay the browser's own carries data-jk-native)
  function want(el) { return el.tagName === 'SELECT' && !el.multiple && !el._jkBtn && !el.hasAttribute('data-jk-native') && !(el.size > 1); }
  function init(root) { [].forEach.call((root || D).querySelectorAll('select'), function (el) { if (want(el) && el.parentNode) select(el); }); }
  var queued = false;
  new MutationObserver(function (list) {
    if (queued) return;
    for (var i = 0; i < list.length; i++) if (list[i].addedNodes.length) { queued = true; break; }
    if (queued) (W.queueMicrotask || setTimeout)(function () { queued = false; init(D); });
  }).observe(D.documentElement, { childList: true, subtree: true });
  W.JeereKit = { init: init, select: select, close: function () { close(false); } };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { init(D); }); else init(D);
})();

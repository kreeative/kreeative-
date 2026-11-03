/*
 * Jeere — tour.js: the guided tour shared by the Studio (../creer/) and the dashboard (../admin/).
 * Classic script, no library. One global: window.JeereTour
 *   start(def)       shows a tour; def = { id, label, steps, onEnd(reason, index), insets() }. Returns true when
 *                    a first step could be shown. A step = { target, title, text, prepare(dir) }:
 *                      target   a CSS selector, an element, an array of them (the spotlight covers them all) or a
 *                               function returning one of those. A step whose target is missing or hidden is skipped.
 *                      prepare  called before the step is measured (switch a tab, a view…); may return a Promise.
 *                    insets() → { top, bottom }: the sticky bars of the page, kept clear when a target is scrolled in.
 *   stop(reason)     closes it ('skip' by default); onEnd gets 'done' | 'skip' | 'esc' | 'outside' | reason.
 *   next(), back(), isOpen(), current() → { id, index, total, targets } | null (targets: the elements in the spotlight)
 *   seen(id), markSeen(id), forget(id)    the tours already shown in this browser ('jeere-tour', STORAGE_KEYS.tour)
 *
 * The tour never blocks the page: the dimmed layer lets every click through, and a click or a tap anywhere
 * outside the bubble closes the tour (reason 'outside') before it reaches what was touched; on a touch screen only
 * a real tap does, so the page can still be scrolled with the tour open. Inside the bubble:
 * « Suivant », « Retour », « Passer », Échap closes, the arrow keys move, Tab stays in the bubble, each step is
 * announced (aria-live; the first one by the focus on the bubble, a non-modal dialog). Rotating or resizing the
 * screen scrolls the target back into view. Phones (< 600 px): the bubble is a bottom sheet (a top sheet when the target sits at the
 * bottom of the screen) and the target is scrolled into the free part of the screen. Desktop: a bubble next to
 * the target. prefers-reduced-motion: no transition, no smooth scroll.
 * Styles: tour.css (scoped to .jt). The avatar is the Jeere cloud (<symbol id="cloud"> of the page's sprite).
 */
(function () {
  'use strict';

  var D = window.JEERE_DATA || null;
  var KEY = (D && D.STORAGE_KEYS && D.STORAGE_KEYS.tour) || 'jeere-tour'; // { version: 1, seen: { editor: iso, admin: iso } }
  var NB = ' ';
  var GAP = 12; // between the target and the bubble, and from the edges of the screen
  var PAD = 6;  // around the target, inside the spotlight
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var isSheet = function () { return mq('(max-width: 599.98px)').matches; };
  var reduced = function () { return mq('(prefers-reduced-motion: reduce)').matches; };

  /* ---------------------------------------------------------------- storage */

  function read() {
    try {
      var o = JSON.parse(window.localStorage.getItem(KEY));
      if (o && typeof o === 'object' && o.seen && typeof o.seen === 'object') return o;
    } catch (e) { /* blocked or corrupted: nothing seen */ }
    return { version: 1, seen: {} };
  }
  function write(o) { try { window.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* blocked storage: the tour may show again */ } }
  function seen(id) { return !!read().seen[id]; }
  function markSeen(id) { var o = read(); o.version = 1; o.seen[id] = new Date().toISOString(); write(o); }
  function forget(id) { var o = read(); delete o.seen[id]; write(o); }

  /* ---------------------------------------------------------------- state and DOM */

  var T = null; // the open tour: { def, i, els, prev, busy, raf, token }
  var root = null;
  var E = {};

  function h(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function build() {
    if (root) return;
    root = h('div', 'jt', { hidden: '' });
    // The veil: the whole screen minus a rounded hole (one SVG path, even-odd), the ring around the hole on top
    E.veil = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    E.veil.setAttribute('class', 'jt__veil');
    E.veil.setAttribute('aria-hidden', 'true');
    E.veil.setAttribute('focusable', 'false');
    E.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    E.path.setAttribute('fill-rule', 'evenodd');
    E.veil.appendChild(E.path);
    root.appendChild(E.veil);
    E.hole = h('div', 'jt__hole', { 'aria-hidden': 'true' });
    E.bubble = h('div', 'jt__bubble', { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'jt-count jt-title', 'aria-describedby': 'jt-text', tabindex: '-1' });
    var head = h('div', 'jt__head');
    var av = h('span', 'jt__av', { 'aria-hidden': 'true' });
    av.innerHTML = '<svg class="jt__cloud" viewBox="0 0 600 446" focusable="false"><use href="#cloud"/></svg>';
    E.count = h('p', 'jt__count', { id: 'jt-count' });
    E.skip = h('button', 'jt__skip', { type: 'button', 'data-jt': 'skip' });
    E.skip.textContent = 'Passer';
    head.appendChild(av); head.appendChild(E.count); head.appendChild(E.skip);
    E.title = h('h2', 'jt__title', { id: 'jt-title' });
    E.text = h('p', 'jt__text', { id: 'jt-text' });
    E.bar = h('div', 'jt__bar', { 'aria-hidden': 'true' });
    E.fill = h('i', 'jt__fill');
    E.bar.appendChild(E.fill);
    var foot = h('div', 'jt__foot');
    E.back = h('button', 'jt__btn jt__btn--ghost', { type: 'button', 'data-jt': 'back' });
    E.back.textContent = 'Retour';
    E.next = h('button', 'jt__btn jt__btn--primary', { type: 'button', 'data-jt': 'next' });
    foot.appendChild(E.back); foot.appendChild(E.next);
    E.bubble.appendChild(head); E.bubble.appendChild(E.title); E.bubble.appendChild(E.text); E.bubble.appendChild(E.bar); E.bubble.appendChild(foot);
    E.live = h('p', 'jt__live', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    root.appendChild(E.hole); root.appendChild(E.bubble); root.appendChild(E.live);
    document.body.appendChild(root);
    E.bubble.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-jt]') : null;
      if (!b) return;
      var a = b.getAttribute('data-jt');
      if (a === 'next') next(); else if (a === 'back') back(); else stop('skip');
    });
  }

  /* ---------------------------------------------------------------- targets */

  function visibleEl(n) {
    if (!n || !n.getClientRects || !n.isConnected) return false;
    if (!n.getClientRects().length) return false;
    var r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function resolve(step) {
    var t = step && step.target;
    try { if (typeof t === 'function') t = t(); } catch (e) { t = null; }
    var list = Array.isArray(t) ? t : [t];
    var out = [];
    list.forEach(function (x) {
      var n = typeof x === 'string' ? Array.prototype.find.call(document.querySelectorAll(x), visibleEl) : x;
      if (visibleEl(n)) out.push(n);
    });
    return out;
  }
  function union(els) {
    var r = null;
    els.forEach(function (n) {
      var b = n.getBoundingClientRect();
      if (!r) r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      else { r.left = Math.min(r.left, b.left); r.top = Math.min(r.top, b.top); r.right = Math.max(r.right, b.right); r.bottom = Math.max(r.bottom, b.bottom); }
    });
    if (r) { r.width = r.right - r.left; r.height = r.bottom - r.top; }
    return r;
  }
  function insets() {
    var v = { top: 0, bottom: 0 };
    try { var x = T && T.def.insets ? T.def.insets() : null; if (x) { v.top = +x.top || 0; v.bottom = +x.bottom || 0; } } catch (e) { /* keep 0 */ }
    return v;
  }

  // Scroll the target into the free part of the screen: under the sticky bars, above the bottom sheet
  function reveal(els) {
    var vh = window.innerHeight;
    var ins = insets();
    var sheet = isSheet() ? E.bubble.offsetHeight : 0;
    var topFree = ins.top + GAP;
    var botFree = vh - Math.max(sheet, ins.bottom) - GAP;
    var r = union(els);
    if (!r) return;
    if (r.top >= topFree && r.bottom <= botFree && r.left >= 0 && r.right <= window.innerWidth) return;
    // Nested scroll areas first (the editor's panel and preview on a computer), then the page
    try { els[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); } catch (e) { els[0].scrollIntoView(false); }
    r = union(els);
    var delta = 0;
    if (r.height > botFree - topFree || r.top < topFree) delta = r.top - topFree;
    else if (r.bottom > botFree) delta = r.bottom - botFree;
    if (delta) window.scrollBy(0, delta);
  }

  /* ---------------------------------------------------------------- layout */

  function place() {
    if (!T || !T.els) return;
    var els = T.els.filter(visibleEl);
    if (!els.length) { els = resolve(T.def.steps[T.i]); T.els = els; }
    var r = union(els);
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = window.innerHeight;
    if (!r) { E.hole.style.opacity = '0'; return; }
    var hl = { left: Math.max(2, r.left - PAD), top: Math.max(2, r.top - PAD) };
    hl.right = Math.min(vw - 2, r.right + PAD); hl.bottom = Math.min(vh - 2, r.bottom + PAD);
    var b = E.bubble;
    var sheet = isSheet();
    if (sheet) {
      b.style.left = ''; b.style.top = ''; b.style.width = '';
      root.classList.add('jt--sheet');
      root.classList.remove('jt--top'); // measured as a bottom sheet, then moved if needed
      var bh = b.offsetHeight;
      // A target at the bottom of the screen (a tab bar): the sheet goes to the top instead
      var top = r.bottom > vh - bh - 4 && r.top > bh + 4;
      root.classList.toggle('jt--top', top);
      // A target taller than the free part of the screen: the spotlight shows the part that can be seen
      if (top) hl.top = Math.max(hl.top, bh + 4); else hl.bottom = Math.min(hl.bottom, vh - bh - 4);
    } else root.classList.remove('jt--sheet', 'jt--top');
    drawHole(hl, vw, vh);
    if (sheet) return;
    var w = Math.min(360, vw - 2 * GAP);
    b.style.width = w + 'px';
    var bhd = b.offsetHeight;
    var spaceBelow = vh - hl.bottom - GAP;
    var spaceAbove = hl.top - GAP;
    var x;
    var y;
    if (spaceBelow >= bhd + GAP) { y = hl.bottom + GAP; x = r.left + r.width / 2 - w / 2; }
    else if (spaceAbove >= bhd + GAP) { y = hl.top - GAP - bhd; x = r.left + r.width / 2 - w / 2; }
    else if (vw - hl.right - GAP >= w + GAP) { x = hl.right + GAP; y = r.top + r.height / 2 - bhd / 2; }
    else if (hl.left - GAP >= w + GAP) { x = hl.left - GAP - w; y = r.top + r.height / 2 - bhd / 2; }
    else { x = vw - w - GAP; y = vh - bhd - GAP; } // a target as big as the screen: the bubble sits in a corner
    x = Math.max(GAP, Math.min(vw - w - GAP, x));
    y = Math.max(GAP, Math.min(vh - bhd - GAP, y));
    b.style.left = Math.round(x) + 'px';
    b.style.top = Math.round(y) + 'px';
  }
  function drawHole(hl, vw, vh) {
    var x = Math.round(hl.left), y = Math.round(hl.top);
    var w = Math.max(0, Math.round(hl.right - hl.left)), hh = Math.max(0, Math.round(hl.bottom - hl.top));
    var rad = Math.min(14, w / 2, hh / 2);
    E.veil.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    E.veil.setAttribute('width', vw);
    E.veil.setAttribute('height', vh);
    E.path.setAttribute('d', 'M0 0H' + vw + 'V' + vh + 'H0Z' +
      'M' + (x + rad) + ' ' + y + 'H' + (x + w - rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + (x + w) + ' ' + (y + rad) +
      'V' + (y + hh - rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + (x + w - rad) + ' ' + (y + hh) +
      'H' + (x + rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + x + ' ' + (y + hh - rad) +
      'V' + (y + rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + (x + rad) + ' ' + y + 'Z');
    E.hole.style.opacity = '1';
    E.hole.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    E.hole.style.width = w + 'px';
    E.hole.style.height = hh + 'px';
  }
  function schedule() {
    if (!T || T.raf) return;
    T.raf = requestAnimationFrame(function () { if (T) { T.raf = 0; place(); } });
  }
  var frames = function () { return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(res, 60); }); }); }); };

  /* ---------------------------------------------------------------- steps */

  function show(i, dir) {
    if (!T) return Promise.resolve(false);
    var steps = T.def.steps;
    var token = ++T.token;
    T.busy = true;
    var tryStep = function (k) {
      if (!T || token !== T.token) return Promise.resolve(false);
      if (k < 0 || k >= steps.length) return Promise.resolve(false);
      var st = steps[k];
      var p;
      try { p = Promise.resolve(st.prepare ? st.prepare(dir) : null); } catch (e) { p = Promise.resolve(null); }
      return p.catch(function () { return null; }).then(frames).then(function () {
        if (!T || token !== T.token) return false;
        var els = resolve(st);
        if (!els.length) return tryStep(k + (dir < 0 ? -1 : 1)); // missing or hidden: skip it
        T.i = k;
        T.els = els;
        fill(k);
        // First step: no slide from the corner of the screen
        var first = root.hidden;
        if (first) root.classList.add('jt--still');
        root.hidden = false;
        reveal(els);
        place();
        if (first && !reduced()) requestAnimationFrame(function () { requestAnimationFrame(function () { if (root) root.classList.remove('jt--still'); }); });
        return true;
      });
    };
    return tryStep(i).then(function (ok) {
      if (T && token === T.token) T.busy = false;
      return ok;
    });
  }
  function fill(k) {
    var steps = T.def.steps;
    var st = steps[k];
    var n = steps.length;
    var last = k === n - 1;
    E.count.innerHTML = '';
    var vis = h('span', null, { 'aria-hidden': 'true' });
    vis.textContent = (k + 1) + '/' + n;
    var sr = h('span', 'jt__sr');
    sr.textContent = 'Étape ' + (k + 1) + ' sur ' + n;
    E.count.appendChild(vis); E.count.appendChild(sr);
    E.title.textContent = st.title || '';
    E.text.textContent = st.text || '';
    E.fill.style.width = Math.round(((k + 1) / n) * 100) + '%';
    E.back.hidden = k === 0;
    E.next.textContent = last ? (T.def.doneLabel || 'Terminer') : 'Suivant';
    E.skip.hidden = last;
    E.skip.setAttribute('aria-label', 'Passer la visite');
    E.live.textContent = '';
    // The first step is read when the focus lands on the bubble (its label and description): announced once only
    if (!T.quiet) {
      var msg = 'Étape ' + (k + 1) + ' sur ' + n + NB + ': ' + (st.title || '') + '. ' + (st.text || '');
      setTimeout(function () { if (T) E.live.textContent = msg; }, 60);
    }
    T.quiet = false;
    // The focus stays on the button just pressed; « Retour » disappears on the first step
    var a = document.activeElement;
    if (a !== E.bubble && (!E.bubble.contains(a) || a.hidden)) focus(E.next);
  }
  function focus(n) { if (!n) return; try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }

  function next() {
    if (!T || T.busy) return;
    if (T.i >= T.def.steps.length - 1) { stop('done'); return; }
    var from = T.i;
    show(T.i + 1, 1).then(function (ok) { if (!ok && T && T.i === from) stop('done'); });
  }
  function back() {
    if (!T || T.busy || T.i <= 0) return;
    show(T.i - 1, -1);
  }

  /* ---------------------------------------------------------------- events */

  function focusables() {
    return Array.prototype.filter.call(E.bubble.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'), function (n) { return !n.hidden && !n.disabled && n.getClientRects().length; });
  }
  function onKey(e) {
    if (!T) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); stop('esc'); return; }
    if (e.key === 'Tab') {
      var f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      var a = document.activeElement;
      var first = f[0];
      var last = f[f.length - 1];
      if (!E.bubble.contains(a)) { e.preventDefault(); focus(e.shiftKey ? last : first); }
      else if (e.shiftKey && (a === first || a === E.bubble)) { e.preventDefault(); focus(last); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); focus(first); }
      e.stopPropagation();
      return;
    }
    if (E.bubble.contains(document.activeElement) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'ArrowRight') next(); else back();
    }
  }
  // A click or a tap outside the bubble: the tour gets out of the way, the click goes on to what was touched.
  // A mouse closes it on press. A finger closes it only on a real tap (lifted where it went down): scrolling
  // the page to read the rest of a tall target keeps the tour open (the browser cancels the pointer then).
  var press = null;
  var TAP = 10;
  function onPointer(e) {
    if (!T || !root || root.hidden) return;
    if (E.bubble.contains(e.target)) { press = null; return; }
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { press = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    stop('outside');
  }
  function onPointerUp(e) {
    var p = press;
    press = null;
    if (!p || p.id !== e.pointerId || !T || !root || root.hidden) return;
    if (Math.abs(e.clientX - p.x) > TAP || Math.abs(e.clientY - p.y) > TAP) return;
    stop('outside');
  }
  function onPointerCancel() { press = null; }
  // The screen turned or was resized: scroll the target back into view, then place the spotlight and the bubble
  var resizeTimer = 0;
  function onResize() {
    schedule();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!T || T.busy || !root || root.hidden) return;
      var els = (T.els || []).filter(visibleEl);
      if (!els.length) els = resolve(T.def.steps[T.i]);
      if (!els.length) return;
      T.els = els;
      root.classList.remove('jt--top');
      place();
      reveal(els);
      place();
    }, 150);
  }
  // The focus moved outside the bubble by something else than the tour (a script, a test): close it
  function onFocusIn(e) {
    if (!T || T.busy || root.hidden) return;
    if (E.bubble.contains(e.target) || e.target === document.body) return;
    stop('outside');
  }

  /* ---------------------------------------------------------------- start / stop */

  function start(def) {
    if (!def || !Array.isArray(def.steps) || !def.steps.length || !document.body) return Promise.resolve(false);
    if (T) stop('replaced');
    build();
    T = { def: def, i: 0, els: null, prev: document.activeElement, busy: false, raf: 0, token: 0, quiet: true };
    root.setAttribute('data-tour', def.id || '');
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', schedule, true);
    var startAt = Math.max(0, Math.min(def.steps.length - 1, def.startAt || 0));
    return show(startAt, 1).then(function (ok) {
      if (!T || T.def !== def) return false;
      if (!ok) { stop('empty'); return false; }
      if (def.id) markSeen(def.id);
      focus(E.bubble);
      return true;
    });
  }
  function stop(reason) {
    if (!T) return;
    var t = T;
    T = null;
    if (t.raf) cancelAnimationFrame(t.raf);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerCancel, true);
    document.removeEventListener('focusin', onFocusIn, true);
    window.removeEventListener('resize', onResize);
    clearTimeout(resizeTimer);
    press = null;
    window.removeEventListener('scroll', schedule, true);
    var hadFocus = root && root.contains(document.activeElement);
    if (root) { root.hidden = true; root.classList.remove('jt--sheet', 'jt--top'); E.live.textContent = ''; }
    var why = reason || 'skip';
    if (typeof t.def.onEnd === 'function') { try { t.def.onEnd(why, t.i); } catch (e) { /* the page carries on */ } }
    // Back to where the seller was (unless she clicked elsewhere: the focus is going there)
    if (why !== 'outside' && hadFocus) {
      var back = t.def.returnFocus || t.prev;
      if (typeof back === 'function') { try { back = back(); } catch (e) { back = null; } }
      if (back && back.isConnected && back.getClientRects().length) focus(back);
    }
  }

  window.JeereTour = {
    start: start,
    stop: function (reason) { stop(reason || 'skip'); },
    next: next,
    back: back,
    isOpen: function () { return !!T; },
    current: function () { return T ? { id: T.def.id, index: T.i, total: T.def.steps.length, targets: (T.els || []).slice() } : null; },
    seen: seen,
    markSeen: markSeen,
    forget: forget,
    KEY: KEY
  };
})();

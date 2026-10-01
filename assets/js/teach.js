/* Kreeative — Teach by Kreeative (course platform)
   Needs supabase-js (UMD) loaded first. Pages opt in with <body data-teach="landing|welcome|login|learn">.
   Data lives in Supabase (project "Kreeative Teach"); access is enforced there by row level security. */
(function () {
  'use strict';
  var SB_URL = 'https://frhhbxawqungjjnrljhy.supabase.co';
  var SB_KEY = 'sb_publishable_1cUmug1Bsk1WOw_oTe-lwA_3ksOJapg';
  var COURSE = 'ugc-creator';
  var page = document.body.getAttribute('data-teach');
  if (!page || !window.supabase) return;
  var sb = window.supabase.createClient(SB_URL, SB_KEY);
  var base = document.body.getAttribute('data-teach-base') || './';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function show(el, on) { if (el) el.hidden = !on; }
  function msg(el, text, bad) { if (!el) return; el.textContent = text; el.classList.toggle('is-error', !!bad); el.hidden = !text; }

  /* checkout needs an account: the Stripe link carries the user's id and email so the payment lands on that account */
  function checkoutUrl(link, user) {
    var u = new URL(link);
    u.searchParams.set('client_reference_id', user.id);
    if (user.email) u.searchParams.set('prefilled_email', user.email);
    return u.toString();
  }
  function goCheckout(user, errEl) {
    return Promise.all([sb.from('courses').select('payment_link').eq('id', COURSE).single(), sb.from('enrollments').select('course_id').eq('course_id', COURSE)]).then(function (r) {
      if ((r[1].data || []).length) { location.href = base + 'learn/'; return; }
      if (!r[0].data || !r[0].data.payment_link) { msg(errEl, 'Checkout is unavailable right now. Please try again in a few minutes.', true); return; }
      location.href = checkoutUrl(r[0].data.payment_link, user);
    });
  }

  function loadOutline() {
    return Promise.all([
      sb.from('courses').select('id,title,subtitle,price_cents,payment_link').eq('id', COURSE).single(),
      sb.from('modules').select('id,position,title').eq('course_id', COURSE).order('position'),
      sb.from('lessons').select('id,module_id,position,title,duration_min,is_preview').eq('course_id', COURSE).order('position')
    ]).then(function (r) {
      var mods = (r[1].data || []).map(function (m) {
        m.lessons = (r[2].data || []).filter(function (l) { return l.module_id === m.id; });
        return m;
      });
      return { course: r[0].data, modules: mods, lessons: mods.reduce(function (a, m) { return a.concat(m.lessons); }, []) };
    });
  }

  /* ---- landing: live curriculum + buy button -------------------------- */
  function landing() {
    var card = $('.tc-hero__card');
    if (card && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) && window.matchMedia('(hover: hover)').matches) {
      card.addEventListener('mousemove', function (e) { var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; card.style.transform = 'perspective(900px) rotateY(' + (x * 10) + 'deg) rotateX(' + (-y * 10) + 'deg) translateY(-4px)'; });
      card.addEventListener('mouseleave', function () { card.style.transform = ''; });
    }
    loadOutline().then(function (o) {
      var box = $('[data-curriculum]');
      if (box && o.modules.length) {
        box.innerHTML = o.modules.map(function (m, i) {
          return '<details class="tc-mod"' + (i === 0 ? ' open' : '') + '><summary><span class="tc-mod__n t-mono">' + String(m.position).padStart(2, '0') + '</span><span class="tc-mod__t">' + esc(m.title) + '</span><span class="tc-mod__c t-caption">' + m.lessons.length + ' lessons</span></summary><ul>' +
            m.lessons.map(function (l) { return '<li><span>' + esc(l.title) + '</span>' + (l.is_preview ? '<em>Free preview</em>' : '') + '</li>'; }).join('') + '</ul></details>';
        }).join('');
        var n = $('[data-lesson-count]'); if (n) n.textContent = o.lessons.length;
      }
    });
    document.querySelectorAll('[data-buy]').forEach(function (a) { a.href = base + 'signup/'; });
    sb.auth.getSession().then(function (r) {
      if (!r.data.session) return;
      document.querySelectorAll('[data-if-student]').forEach(function (el) { el.hidden = false; });
      document.querySelectorAll('[data-buy]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); goCheckout(r.data.session.user); }; });
    });
  }

  /* ---- welcome: after Stripe checkout, set a password ------------------ */
  function welcome() {
    var sid = new URLSearchParams(location.search).get('session_id');
    var status = $('[data-status]'), form = $('[data-claim-form]'), err = $('[data-error]');
    sb.auth.getSession().then(function (r) {
      if (!r.data.session) return legacy();
      msg(status, 'Confirming your payment…');
      var n = 0;
      (function wait() {
        sb.rpc('claim_my_purchases').then(function () { return sb.from('enrollments').select('course_id').eq('course_id', COURSE); }).then(function (e) {
          if ((e.data || []).length) { msg(status, 'Payment confirmed 🎉 Opening your course…'); return setTimeout(function () { location.href = base + 'learn/'; }, 900); }
          if (n++ < 30) return setTimeout(wait, 2000);
          msg(status, 'We couldn’t confirm this payment yet. Refresh in a minute, or email partnerships@kreeative.xyz with your receipt.', true);
        });
      })();
    });
    function legacy() {
    if (!sid) { msg(status, 'This page opens right after checkout. Already bought the course? Log in instead.'); show($('[data-login-link]'), true); return; }
    function call(body) {
      return fetch(SB_URL + '/functions/v1/teach-claim', { method: 'POST', headers: { 'content-type': 'application/json', apikey: SB_KEY }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    }
    var tries = 0;
    (function poll() {
      call({ session_id: sid, check: true }).then(function (r) {
        if (r.status === 'waiting' && tries++ < 20) { msg(status, 'Confirming your payment…'); return setTimeout(poll, 2000); }
        if (r.status === 'needs_password') { msg(status, ''); $('[data-email]').textContent = r.email; show(form, true); return; }
        if (r.status === 'ready') { msg(status, 'Your access is ready. Log in with ' + (r.email || 'your email') + '.'); show($('[data-login-link]'), true); return; }
        msg(status, 'We couldn’t confirm this payment yet. Refresh in a minute, or email partnerships@kreeative.xyz with your receipt.', true);
      }).catch(function () { msg(status, 'Connection problem. Refresh the page to try again.', true); });
    })();
    form && form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = form.password.value, pw2 = form.password2.value;
      if (pw.length < 8) return msg(err, 'Use at least 8 characters.', true);
      if (pw !== pw2) return msg(err, 'The two passwords don’t match.', true);
      form.querySelector('button').disabled = true; msg(err, '');
      call({ session_id: sid, password: pw }).then(function (r) {
        if (r.error) throw new Error(r.error);
        if (r.status === 'exists') { msg(status, 'You already have an account with ' + r.email + '. The course was added to it: log in with your existing password.'); show(form, false); show($('[data-login-link]'), true); return; }
        return sb.auth.signInWithPassword({ email: r.email, password: pw }).then(function (s) {
          if (s.error) throw s.error;
          location.href = base + 'learn/';
        });
      }).catch(function (e2) { form.querySelector('button').disabled = false; msg(err, e2.message || 'Something went wrong. Try again.', true); });
    });
    }
  }


  /* ---- signup: account first, then checkout --------------------------- */
  function signup() {
    var q = new URLSearchParams(location.search), err = $('[data-error]');
    var steps = { form: $('[data-step=form]'), sent: $('[data-step=sent]'), ready: $('[data-step=ready]') };
    function step(k) { Object.keys(steps).forEach(function (x) { show(steps[x], x === k); }); }
    function ready(session) {
      step('ready');
      $('[data-ready-email]').textContent = session.user.email;
      $('[data-checkout]').onclick = function (e) { e.preventDefault(); goCheckout(session.user, $('[data-ready-error]')); };
      $('[data-logout]').onclick = function () { sb.auth.signOut().then(function () { location.href = base + 'signup/'; }); };
      // already a student? straight to the course
      sb.rpc('claim_my_purchases').then(function () { return sb.from('enrollments').select('course_id').eq('course_id', COURSE); }).then(function (r) { if ((r.data || []).length) location.href = base + 'learn/'; });
    }
    var th = q.get('token_hash'), type = q.get('type');
    if (th) {
      history.replaceState(null, '', location.pathname);
      sb.auth.verifyOtp({ token_hash: th, type: type === 'magiclink' ? 'magiclink' : 'signup' }).then(function (r) {
        if (r.error || !r.data.session) { step('form'); msg(err, 'This confirmation link has expired or was already used. Sign up again to get a new one, or log in.', true); return; }
        ready(r.data.session);
      });
      return;
    }
    sb.auth.getSession().then(function (r) { if (r.data.session) ready(r.data.session); else step('form'); });
    var form = $('[data-signup-form]');
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg(err, '');
      if (form.password.value !== form.password2.value) return msg(err, 'The two passwords don’t match.', true);
      var btn = form.querySelector('button'); btn.disabled = true;
      var email = form.email.value.trim();
      fetch(SB_URL + '/functions/v1/teach-signup', { method: 'POST', headers: { 'content-type': 'application/json', apikey: SB_KEY },
        body: JSON.stringify({ name: form.name.value, email: email, password: form.password.value, lang: (navigator.language || '').slice(0, 2) }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          btn.disabled = false;
          if (d.status === 'sent') { $('[data-sent-email]').textContent = email; return step('sent'); }
          if (d.status === 'exists') { err.innerHTML = 'You already have an account with this email. <a class="tc-link" href="../login/?next=checkout">Log in to continue</a>.'; err.classList.add('is-error'); err.hidden = false; return; }
          var m = { invalid_email: 'Enter a valid email address.', weak_password: 'Use at least 8 characters.', name_required: 'Enter your first and last name.', too_many: 'Too many attempts. Wait an hour, or check your inbox for the last link.' };
          msg(err, m[d.error] || 'Something went wrong. Try again in a minute.', true);
        }).catch(function () { btn.disabled = false; msg(err, 'Connection problem. Try again.', true); });
    });
  }

  /* ---- login ----------------------------------------------------------- */
  function login() {
    var form = $('[data-login-form]'), err = $('[data-error]');
    var next = new URLSearchParams(location.search).get('next');
    function after(session) { if (next === 'checkout') return goCheckout(session.user, err); location.href = base + 'learn/'; }
    sb.auth.getSession().then(function (r) { if (r.data.session) after(r.data.session); });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg(err, '');
      form.querySelector('button').disabled = true;
      sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value }).then(function (r) {
        if (r.error) throw r.error;
        return after(r.data.session);
      }).catch(function () { form.querySelector('button').disabled = false; msg(err, 'Wrong email or password.', true); });
    });
  }

  /* ---- confetti (tiny, no dependency) ---------------------------------- */
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'), x = c.getContext('2d'), W = c.width = innerWidth, H = c.height = innerHeight;
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
    document.body.appendChild(c);
    var cols = ['#ff0090', '#ff66be', '#ffe0f7', '#0f0f0f', '#f3c969'], ps = [];
    for (var i = 0; i < 140; i++) ps.push({ x: W / 2 + (Math.random() - .5) * 200, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function f(t) {
      x.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(f); else c.remove();
    })(t0);
  }

  /* ---- learn: dashboard + lessons + module quizzes + progress ---------- */
  function learn() {
    var app = $('[data-learn]');
    sb.auth.getSession().then(function (r) {
      var session = r.data.session;
      if (!session) { location.href = base + 'login/'; return; }
      $('[data-user]').textContent = session.user.email;
      $('[data-logout]').addEventListener('click', function () { sb.auth.signOut().then(function () { location.href = base; }); });
      return sb.rpc('claim_my_purchases').then(function () {
        return Promise.all([loadOutline(), sb.from('enrollments').select('course_id').eq('course_id', COURSE),
          sb.from('lesson_progress').select('lesson_id').eq('course_id', COURSE),
          sb.from('quiz_questions').select('id,module_id,position,question,options').order('position'),
          sb.from('quiz_attempts').select('module_id,passed,score,total'),
          sb.from('flashcards').select('id,module_id,position,front,back').order('position'),
          sb.from('final_questions').select('id,position,question,options').eq('course_id', COURSE).order('position'),
          sb.from('final_attempts').select('score,total,passed').eq('course_id', COURSE),
          sb.from('certificates').select('id,full_name,score,total,issued_at').eq('course_id', COURSE)]);
      }).then(function (res) {
        var o = res[0], enrolled = (res[1].data || []).length > 0;
        if (!enrolled) { show($('[data-not-enrolled]'), true); show(app, false); var b = $('[data-buy]'); if (b && o.course && o.course.payment_link) b.href = checkoutUrl(o.course.payment_link, session.user); return; }
        var st = { done: new Set((res[2].data || []).map(function (x) { return x.lesson_id; })), passed: new Set(), best: {}, qs: {}, cards: {}, seen: new Set(), final: res[6].data || [], finalBest: null, cert: (res[8].data || [])[0] || null };
        (res[3].data || []).forEach(function (q) { (st.qs[q.module_id] = st.qs[q.module_id] || []).push(q); });
        (res[4].data || []).forEach(function (t) { if (t.passed) st.passed.add(t.module_id); var b0 = st.best[t.module_id]; if (!b0 || t.score > b0.score) st.best[t.module_id] = t; });
        (res[5].data || []).forEach(function (c) { (st.cards[c.module_id] = st.cards[c.module_id] || []).push(c); });
        (res[7].data || []).forEach(function (t) { if (!st.finalBest || t.score > st.finalBest.score) st.finalBest = t; });
        try { JSON.parse(localStorage.getItem('kt-cards-seen') || '[]').forEach(function (id) { st.seen.add(id); }); } catch (e) {}
        // one ordered path: each module's lessons, its flashcards, its quiz; then the final exam
        st.steps = [];
        o.modules.forEach(function (m) {
          m.lessons.forEach(function (l) { st.steps.push({ kind: 'lesson', id: l.id, lesson: l, mod: m }); });
          if (st.cards[m.id]) st.steps.push({ kind: 'cards', id: m.id, mod: m });
          if (st.qs[m.id]) st.steps.push({ kind: 'quiz', id: m.id, mod: m });
        });
        if (st.final.length) st.steps.push({ kind: 'final', id: 'exam', mod: { id: 'final', position: o.modules.length + 1, title: 'Final exam & certificate' } });
        show(app, true);
        render(o, st);
        loadBonus();
        window.addEventListener('popstate', function () { render(o, st); });
      });
    });

    /* free media kit bonus: pick once, then keep the Canva link here */
    function loadBonus() {
      var box = $('[data-bonus]');
      Promise.all([sb.rpc('my_bonus', { p_course: COURSE }), sb.from('bonus_kits').select('id,name,image').eq('course_id', COURSE).order('position')]).then(function (r) {
        var mine = r[0].data, kits = r[1].data || [];
        if (!kits.length) return;
        show(box, true);
        if (mine && mine.url) {
          box.innerHTML = '<p class="t-mono">🎁 YOUR FREE MEDIA KIT</p><div class="tl-bonus__mine"><img src="' + esc(mine.image) + '" alt=""><div><b>' + esc(mine.name) + '</b><p class="t-body-m">Open it, click “Use template”, and a copy is saved to your Canva.</p><a class="btn btn--accent" href="' + esc(mine.url) + '" target="_blank" rel="noopener noreferrer"><span class="btn__label t-body-l">Open in Canva</span></a></div></div>';
          return;
        }
        box.innerHTML = '<p class="t-mono">🎁 YOUR FREE BONUS</p><h2 class="t-h3">Choose your media kit</h2><p class="t-body-m">Pick one of my 6 Canva media kits. You can only choose once, so pick your favorite.</p><div class="tl-bonus__grid">' +
          kits.map(function (k, i) { return '<button type="button" class="tl-kit" style="--d:' + (i * 60) + 'ms" data-kit="' + esc(k.id) + '"><img src="' + esc(k.image) + '" alt=""><span>' + esc(k.name) + '</span></button>'; }).join('') + '</div>';
        box.querySelectorAll('[data-kit]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Choose ' + b.textContent + ' as your free media kit? You can only pick once.')) return;
            b.disabled = true;
            sb.rpc('claim_bonus', { p_kit: b.getAttribute('data-kit') }).then(function (res) { if (!res.error) { confetti(); loadBonus(); } else b.disabled = false; });
          });
        });
      });
    }

    function isDone(st, step) {
      if (step.kind === 'lesson') return st.done.has(step.id);
      if (step.kind === 'cards') return st.seen.has(step.id);
      if (step.kind === 'final') return !!st.cert;
      return st.passed.has(step.id);
    }
    function go(o, st, href) { history.pushState(null, '', href); render(o, st); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function hrefOf(step) { return { lesson: '?lesson=', quiz: '?quiz=', cards: '?cards=', final: '?final=' }[step.kind] + step.id; }
    function stepName(s) { return s.kind === 'quiz' ? 'Module ' + s.mod.position + ' quiz' : s.kind === 'cards' ? 'Module ' + s.mod.position + ' flashcards' : s.kind === 'final' ? 'Final exam' : s.lesson.title; }
    function counted(st) { return st.steps.filter(function (s) { return s.kind !== 'cards'; }); } // flashcards are optional practice

    function progress(o, st) {
      var all = counted(st), n = all.filter(function (s) { return isDone(st, s); }).length, pct = all.length ? Math.round(n / all.length * 100) : 0;
      var quizzes = st.steps.filter(function (s) { return s.kind === 'quiz'; });
      $('[data-progress-bar]').style.width = pct + '%';
      $('[data-progress-label]').textContent = pct + '% · ' + st.done.size + '/' + o.lessons.length + ' lessons · ' + st.passed.size + '/' + quizzes.length + ' quizzes' + (st.cert ? ' · certified 🎓' : '');
      return n;
    }
    function allQuizzesPassed(st) { return st.steps.every(function (s) { return s.kind !== 'quiz' || st.passed.has(s.id); }); }

    function render(o, st) {
      var q = new URLSearchParams(location.search);
      var cur = { lesson: q.get('lesson'), quiz: q.get('quiz'), cards: q.get('cards'), final: q.get('final') };
      var n = progress(o, st);
      var next = st.steps.filter(function (s) { return !isDone(st, s); })[0];
      var cont = $('[data-continue]');
      if (next) { cont.href = hrefOf(next); cont.querySelector('.btn__label').textContent = n ? 'Continue: ' + stepName(next) : 'Start the course'; }
      else { cont.href = '../certificate/?id=' + encodeURIComponent(st.cert.id); cont.querySelector('.btn__label').textContent = 'Course complete 🎓 View my certificate'; }
      var groups = o.modules.slice();
      if (st.final.length) groups.push(st.steps[st.steps.length - 1].mod);
      $('[data-outline]').innerHTML = groups.map(function (m) {
        var items = st.steps.filter(function (s) { return s.mod.id === m.id; });
        return '<div class="tl-mod"><p class="tl-mod__t"><span class="t-mono">' + String(m.position).padStart(2, '0') + '</span>' + esc(m.title) + '</p><ul>' + items.map(function (s) {
          var isCur = cur[s.kind] === String(s.id);
          var label = s.kind === 'lesson' ? esc(s.lesson.title) : s.kind === 'quiz' ? 'Module quiz' : s.kind === 'cards' ? 'Flashcards' : 'Final exam';
          var meta = s.kind === 'lesson' ? (s.lesson.duration_min || '') + ' min'
            : s.kind === 'quiz' ? (st.best[s.id] ? st.best[s.id].score + '/' + st.best[s.id].total : st.qs[s.id].length + ' Q')
            : s.kind === 'cards' ? st.cards[s.id].length + ' cards'
            : (st.cert ? '🎓' : allQuizzesPassed(st) ? st.final.length + ' Q' : '🔒');
          return '<li><a href="' + hrefOf(s) + '" class="is-' + s.kind + ' ' + (isCur ? 'is-current ' : '') + (isDone(st, s) ? 'is-done' : '') + '"><i aria-hidden="true"></i><span>' + label + '</span><small>' + meta + '</small></a></li>';
        }).join('') + '</ul></div>';
      }).join('');
      document.querySelectorAll('[data-outline] a').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); go(o, st, a.getAttribute('href')); }); });

      var views = { lesson: $('[data-lesson]'), quiz: $('[data-quiz]'), cards: $('[data-cards]'), final: $('[data-final]') }, home = $('[data-home]');
      var step = st.steps.filter(function (s) { return cur[s.kind] === String(s.id); })[0];
      Object.keys(views).forEach(function (k) { show(views[k], false); });
      show(home, !step);
      if (!step) return;
      var idx = st.steps.indexOf(step), prev = st.steps[idx - 1], nxt = st.steps[idx + 1];
      var target = views[step.kind];
      show(target, true); target.classList.remove('is-entering'); void target.offsetWidth; target.classList.add('is-entering');
      [['[data-prev]', prev], ['[data-next]', nxt]].forEach(function (pair) {
        target.querySelectorAll(pair[0]).forEach(function (a) {
          var s = pair[1]; a.hidden = !s; if (!s) return;
          a.href = hrefOf(s); a.querySelector('[data-step-title]').textContent = stepName(s);
          a.setAttribute('aria-label', (pair[0] === '[data-prev]' ? 'Previous: ' : 'Next: ') + stepName(s));
          a.onclick = function (e) { e.preventDefault(); go(o, st, hrefOf(s)); };
        });
      });
      var kicker = step.kind === 'final' ? 'Final · ' + step.mod.title : 'Module ' + String(step.mod.position).padStart(2, '0') + ' · ' + step.mod.title;
      if (step.kind === 'lesson') return renderLesson(o, st, step, kicker, nxt);
      if (step.kind === 'cards') return renderCards(o, st, step, kicker);
      if (step.kind === 'final') return renderFinal(o, st, step, kicker);
      renderQuiz(o, st, step, kicker);
    }

    function renderLesson(o, st, step, kicker, nxt) {
      var lesson = step.lesson;
      $('[data-lesson-kicker]').textContent = kicker;
      $('[data-lesson-title]').textContent = lesson.title;
      var body = $('[data-lesson-body]'); body.innerHTML = '<p class="t-caption">Loading…</p>';
      sb.from('lesson_content').select('body_html,video_url').eq('lesson_id', lesson.id).single().then(function (c) {
        var d = c.data || { body_html: '<p>This lesson isn’t available.</p>' };
        var video = '';
        if (d.video_url) {
          var yt = d.video_url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/), vm = d.video_url.match(/vimeo\.com\/(\d+)/);
          var src = yt ? 'https://www.youtube-nocookie.com/embed/' + yt[1] : vm ? 'https://player.vimeo.com/video/' + vm[1] : null;
          video = src ? '<div class="tl-video"><iframe src="' + src + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Lesson video"></iframe></div>'
                      : '<video class="tl-video" controls playsinline src="' + esc(d.video_url) + '"></video>';
        }
        body.innerHTML = video + d.body_html;
        enhance(body);
      });
      var btn = $('[data-complete]');
      var on0 = st.done.has(lesson.id);
      btn.classList.toggle('is-done', on0); btn.querySelector('.btn__label').textContent = on0 ? 'Completed ✓' : 'Mark as complete';
      btn.onclick = function () {
        btn.disabled = true;
        var on = st.done.has(lesson.id);
        sb.auth.getUser().then(function (u) {
          return on ? sb.from('lesson_progress').delete().eq('lesson_id', lesson.id)
                    : sb.from('lesson_progress').insert({ user_id: u.data.user.id, lesson_id: lesson.id, course_id: COURSE });
        }).then(function (res) {
          btn.disabled = false;
          if (res.error) return;
          on ? st.done.delete(lesson.id) : st.done.add(lesson.id);
          if (!on) { btn.classList.add('is-pop'); setTimeout(function () { btn.classList.remove('is-pop'); if (nxt) go(o, st, hrefOf(nxt)); else render(o, st); }, 420); btn.classList.add('is-done'); btn.querySelector('.btn__label').textContent = 'Completed ✓'; return; }
          render(o, st);
        });
      };
    }

    /* flip cards: one at a time, tap or Space to flip, arrows to move */
    function renderCards(o, st, step, kicker) {
      var cards = st.cards[step.id].slice(), i = 0, box = $('[data-cards-body]');
      $('[data-cards-kicker]').textContent = kicker;
      function markSeen() {
        if (st.seen.has(step.id)) return;
        st.seen.add(step.id);
        try { localStorage.setItem('kt-cards-seen', JSON.stringify(Array.from(st.seen))); } catch (e) {}
        var link = document.querySelector('[data-outline] a[href="?cards=' + step.id + '"]'); if (link) link.classList.add('is-done');
      }
      function draw() {
        var c = cards[i];
        box.innerHTML = '<div class="fc-count t-mono">' + (i + 1) + ' / ' + cards.length + '</div>' +
          '<button type="button" class="fc" aria-label="Flip card"><span class="fc__in"><span class="fc__face fc__front"><small class="t-mono">TERM</small><b>' + esc(c.front) + '</b><em>Tap to flip</em></span>' +
          '<span class="fc__face fc__back"><small class="t-mono">ANSWER</small><span>' + esc(c.back) + '</span></span></span></button>' +
          '<div class="fc-ctrl"><button type="button" data-fc="prev"' + (i ? '' : ' disabled') + '>← Previous</button><button type="button" data-fc="shuffle">Shuffle</button><button type="button" data-fc="next">' + (i < cards.length - 1 ? 'Next →' : 'Done ✓') + '</button></div>';
        var card = box.querySelector('.fc');
        card.onclick = function () { card.classList.toggle('is-flipped'); };
        box.querySelector('[data-fc=prev]').onclick = function () { if (i) { i--; draw(); } };
        box.querySelector('[data-fc=shuffle]').onclick = function () { for (var k = cards.length - 1; k > 0; k--) { var r = Math.floor(Math.random() * (k + 1)), t = cards[k]; cards[k] = cards[r]; cards[r] = t; } i = 0; draw(); };
        box.querySelector('[data-fc=next]').onclick = function () {
          if (i < cards.length - 1) { i++; draw(); return; }
          markSeen(); confetti();
          var nx = st.steps[st.steps.indexOf(step) + 1]; if (nx) go(o, st, hrefOf(nx));
        };
        if (i === cards.length - 1) markSeen();
      }
      box.onkeydown = function (e) {
        if (e.key === 'ArrowRight' && i < cards.length - 1) { i++; draw(); box.querySelector('.fc').focus(); }
        if (e.key === 'ArrowLeft' && i) { i--; draw(); box.querySelector('.fc').focus(); }
      };
      draw();
    }

    function quizFields(qs) {
      return qs.map(function (q, i) {
        return '<fieldset class="tq" style="--i:' + Math.min(i, 8) + '"><legend><span class="t-mono">' + String(i + 1).padStart(2, '0') + '</span>' + esc(q.question) + '</legend>' +
          q.options.map(function (op, j) { return '<label class="tq__opt"><input type="radio" name="q' + i + '" value="' + j + '" required><span>' + esc(op) + '</span></label>'; }).join('') +
          '<p class="tq__why" hidden></p></fieldset>';
      }).join('');
    }
    function answersOf(box, qs) { return qs.map(function (_, i) { var c = box.querySelector('input[name=q' + i + ']:checked'); return c ? Number(c.value) : -1; }); }
    function showFeedback(box, fb) {
      fb.forEach(function (f, i) {
        var fs = box.querySelectorAll('.tq')[i]; if (!fs) return;
        fs.classList.add(f.ok ? 'is-right' : 'is-wrong');
        fs.querySelectorAll('.tq__opt').forEach(function (l, j) { if (f.correct !== undefined) l.classList.toggle('is-answer', j === f.correct); l.querySelector('input').disabled = true; });
        var why = fs.querySelector('.tq__why');
        if (f.explanation) { why.textContent = (f.ok ? '✓ ' : '✗ ') + f.explanation; why.hidden = false; }
        else if (f.correct === undefined) { why.textContent = f.ok ? '✓ Correct' : '✗ Not quite'; why.hidden = false; }
      });
    }

    function renderQuiz(o, st, step, kicker) {
      var qs = st.qs[step.id], box = $('[data-quiz-body]'), res = $('[data-quiz-result]');
      $('[data-quiz-kicker]').textContent = kicker;
      show(res, false);
      var best = st.best[step.id];
      $('[data-quiz-intro]').textContent = st.passed.has(step.id) ? 'Passed with ' + best.score + '/' + best.total + '. You can retake it anytime.' : qs.length + ' questions. Score 70% or more to complete the module.';
      box.innerHTML = quizFields(qs) + '<button class="btn btn--accent" type="submit"><span class="btn__label t-body-l">Submit answers</span></button>';
      box.onsubmit = function (e) {
        e.preventDefault();
        var sub = box.querySelector('button[type=submit]'); sub.disabled = true;
        sb.rpc('submit_quiz', { p_module: step.id, p_answers: answersOf(box, qs) }).then(function (r) {
          sub.disabled = false;
          if (r.error) { res.textContent = 'Couldn’t submit. Try again.'; show(res, true); return; }
          var d = r.data;
          showFeedback(box, d.feedback);
          var b0 = st.best[step.id]; if (!b0 || d.score > b0.score) st.best[step.id] = { score: d.score, total: d.total, passed: d.passed };
          if (d.passed) { st.passed.add(step.id); confetti(); }
          res.innerHTML = '<b>' + d.score + '/' + d.total + '</b> ' + (d.passed ? 'Module complete. Nice work!' + (allQuizzesPassed(st) && !st.cert ? ' Every module is done: the final exam is unlocked 🎓' : '') : 'Almost! Review the lessons and flashcards, then try again.');
          res.className = 'tq-result ' + (d.passed ? 'is-pass' : 'is-fail'); show(res, true);
          sub.querySelector('.btn__label').textContent = 'Retake quiz'; sub.type = 'button';
          sub.onclick = function () { renderQuiz(o, st, step, kicker); window.scrollTo({ top: 0, behavior: 'smooth' }); };
          progress(o, st);
          var link = document.querySelector('[data-outline] a[href="?quiz=' + step.id + '"]'); if (link) { link.classList.toggle('is-done', st.passed.has(step.id)); link.querySelector('small').textContent = st.best[step.id].score + '/' + st.best[step.id].total; }
          var fin = document.querySelector('[data-outline] a.is-final small'); if (fin && allQuizzesPassed(st) && !st.cert) fin.textContent = st.final.length + ' Q';
          res.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      };
    }

    /* final exam: unlocked once every module quiz is passed; 80% earns the certificate */
    function renderFinal(o, st, step, kicker) {
      var box = $('[data-final-body]'), res = $('[data-final-result]'), intro = $('[data-final-intro]');
      $('[data-final-kicker]').textContent = kicker;
      show(res, false);
      if (st.cert) {
        intro.textContent = 'You passed the final exam with ' + st.cert.score + '/' + st.cert.total + '. Congratulations, ' + st.cert.full_name + '!';
        box.innerHTML = certCard(st.cert);
        return;
      }
      if (!allQuizzesPassed(st)) {
        var left = st.steps.filter(function (s) { return s.kind === 'quiz' && !st.passed.has(s.id); });
        intro.textContent = 'Pass every module quiz to unlock the final exam. ' + left.length + ' to go:';
        box.innerHTML = '<ul class="fx-left">' + left.map(function (s) { return '<li><a href="' + hrefOf(s) + '">Module ' + s.mod.position + ' · ' + esc(s.mod.title) + '</a></li>'; }).join('') + '</ul>';
        box.querySelectorAll('a').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); go(o, st, a.getAttribute('href')); }; });
        box.onsubmit = function (e) { e.preventDefault(); };
        return;
      }
      intro.textContent = st.final.length + ' questions on the whole formation. Score 80% or more (' + Math.ceil(st.final.length * 0.8) + '/' + st.final.length + ') to earn your certificate. You can retake it as many times as you need.' + (st.finalBest ? ' Best so far: ' + st.finalBest.score + '/' + st.finalBest.total + '.' : '');
      box.innerHTML = '<label class="fx-name"><span class="t-mono">YOUR NAME FOR THE CERTIFICATE</span><input name="fullname" required minlength="2" maxlength="80" autocomplete="name" placeholder="First and last name"></label>' +
        quizFields(st.final) + '<button class="btn btn--accent" type="submit"><span class="btn__label t-body-l">Submit my exam</span></button>';
      box.onsubmit = function (e) {
        e.preventDefault();
        var name = box.fullname.value.trim();
        if (name.length < 2) { box.fullname.focus(); return; }
        var sub = box.querySelector('button[type=submit]'); sub.disabled = true;
        sb.rpc('submit_final', { p_course: COURSE, p_answers: answersOf(box, st.final), p_name: name }).then(function (r) {
          sub.disabled = false;
          if (r.error) { res.textContent = 'Couldn’t submit: ' + (r.error.message || 'try again.'); res.className = 'tq-result is-fail'; show(res, true); return; }
          var d = r.data;
          showFeedback(box, d.feedback);
          box.fullname.disabled = true;
          if (!st.finalBest || d.score > st.finalBest.score) st.finalBest = d;
          if (d.passed) {
            st.cert = { id: d.certificate, full_name: name, score: d.score, total: d.total, issued_at: new Date().toISOString() };
            confetti(); setTimeout(confetti, 700);
            res.innerHTML = '<b>' + d.score + '/' + d.total + '</b> You passed! Your certificate is ready 🎓';
            res.className = 'tq-result is-pass'; show(res, true);
            sub.remove();
            res.insertAdjacentHTML('afterend', '');
            box.insertAdjacentHTML('afterend', '<div class="fx-cert-after">' + certCard(st.cert) + '</div>');
            progress(o, st);
            var fin = document.querySelector('[data-outline] a.is-final'); if (fin) { fin.classList.add('is-done'); fin.querySelector('small').textContent = '🎓'; }
          } else {
            var wrong = d.feedback.filter(function (f) { return !f.ok; }).length;
            res.innerHTML = '<b>' + d.score + '/' + d.total + '</b> Not yet: you need ' + Math.ceil(d.total * 0.8) + '. ' + wrong + ' answers to review. The correct answers stay hidden until you pass, so revisit the flashcards and try again.';
            res.className = 'tq-result is-fail'; show(res, true);
            sub.querySelector('.btn__label').textContent = 'Retake the exam'; sub.type = 'button';
            sub.onclick = function () { renderFinal(o, st, step, kicker); window.scrollTo({ top: 0, behavior: 'smooth' }); };
          }
          res.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      };
    }
    function certCard(c) {
      var url = base + 'certificate/?id=' + encodeURIComponent(c.id);
      return '<div class="fx-cert"><p class="t-mono">🎓 CERTIFICATE EARNED</p><b>' + esc(c.full_name) + '</b><p>UGC Creator Formation · ' + c.score + '/' + c.total + ' · ID ' + esc(c.id) + '</p>' +
        '<a class="btn btn--accent" href="' + url + '" target="_blank" rel="noopener"><span class="btn__label t-body-l">View & download my certificate</span></a></div>';
    }
  }

  /* ---- lesson extras: copy buttons on templates, rate calculator ------- */
  function enhance(body) {
    body.querySelectorAll('[data-copy]').forEach(function (el) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mail__copy'; b.textContent = 'Copy';
      b.onclick = function () {
        var text = Array.prototype.map.call(el.querySelectorAll('p:not(.mail__t)'), function (x) { return x.innerText; }).join('\n\n');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); }, function () { b.textContent = 'Select & copy'; });
      };
      el.appendChild(b);
    });
    body.querySelectorAll('[data-calc]').forEach(calc);
  }
  function calc(el) {
    var f = function (lbl, name, val, extra) { return '<label><span>' + lbl + '</span><input type="number" min="0" step="1" name="' + name + '" value="' + val + '"' + (extra || '') + '></label>'; };
    el.innerHTML = '<form class="calc__f">' +
      f('Base price per video ($)', 'base', 120) + f('Number of videos', 'n', 3) + f('Hooks per video', 'hooks', 2) + f('Price per extra hook ($)', 'hookp', 25) +
      '<label><span>Paid-ad usage</span><select name="usage"><option value="0">Organic only</option><option value="30">30 days (+30%)</option><option value="50" selected>90 days (+50%)</option><option value="100">Perpetual (+100%)</option></select></label>' +
      f('Whitelisting months', 'wl', 0) + f('Whitelisting % per month', 'wlp', 50) +
      '<label class="calc__c"><input type="checkbox" name="raw"> Raw footage (+40%)</label><label class="calc__c"><input type="checkbox" name="rush"> Rush delivery (+30%)</label>' +
      '</form><div class="calc__out" aria-live="polite"></div>';
    var form = el.querySelector('form'), out = el.querySelector('.calc__out');
    function money(x) { return '$' + Math.round(x).toLocaleString('en-US'); }
    function upd() {
      var v = function (k) { return Math.max(0, Number(form[k].value) || 0); };
      var videos = v('base') * v('n'), lines = [['Videos (' + v('n') + ' × ' + money(v('base')) + ')', videos]];
      var extraHooks = Math.max(0, v('hooks') - 1) * v('n') * v('hookp'); if (extraHooks) lines.push(['Extra hooks', extraHooks]);
      var u = Number(form.usage.value); if (u) lines.push(['Usage rights (+' + u + '%)', videos * u / 100]);
      if (v('wl')) lines.push(['Whitelisting (' + v('wl') + ' mo × ' + v('wlp') + '%)', videos * v('wlp') / 100 * v('wl')]);
      if (form.raw.checked) lines.push(['Raw footage (+40%)', videos * 0.4]);
      if (form.rush.checked) lines.push(['Rush (+30%)', videos * 0.3]);
      var total = lines.reduce(function (a, l) { return a + l[1]; }, 0);
      out.innerHTML = lines.map(function (l) { return '<p><span>' + l[0] + '</span><b>' + money(l[1]) + '</b></p>'; }).join('') +
        '<p class="calc__t"><span>Your quote</span><b>' + money(total) + '</b></p><p class="calc__d">Deposit (50%): ' + money(total / 2) + ' · Per video: ' + money(v('n') ? total / v('n') : 0) + '</p>';
    }
    form.addEventListener('input', upd); upd();
  }

  /* ---- certificate: public page, verified from the database ------------- */
  function certificate() {
    var id = new URLSearchParams(location.search).get('id') || '', box = $('[data-cert]'), err = $('[data-cert-error]');
    if (!id) { msg(err, 'No certificate ID in this link.', true); return; }
    sb.rpc('get_certificate', { p_id: id }).then(function (r) {
      var c = r.data;
      if (r.error || !c) { msg(err, 'We couldn’t find a certificate with the ID “' + id + '”. Check the link and try again.', true); return; }
      var d = new Date(c.issued_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
      $('[data-cert-name]').textContent = c.name;
      $('[data-cert-course]').textContent = c.course;
      $('[data-cert-score]').textContent = Math.round(c.score / c.total * 100) + '% on the final exam';
      $('[data-cert-date]').textContent = d;
      $('[data-cert-id]').textContent = c.id;
      document.title = c.name + ' · ' + c.course + ' certificate — Teach by Kreeative';
      show(box, true);
      var pr = $('[data-print]'); if (pr) pr.onclick = function () { window.print(); };
      var cp = $('[data-copy-link]'); if (cp) cp.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(location.href).then(function () { cp.textContent = 'Link copied ✓'; }); };
    });
  }

  /* ---- reset: request a link, then set a new password ------------------- */
  function reset() {
    var q = new URLSearchParams(location.search), err = $('[data-error]');
    var th = q.get('token_hash');
    if (th) {
      show($('[data-request]'), false);
      sb.auth.verifyOtp({ token_hash: th, type: 'recovery' }).then(function (r) {
        if (r.error) { msg(err, 'This link has expired or was already used. Ask for a new one below.', true); show($('[data-request]'), true); history.replaceState(null, '', location.pathname); return; }
        var f = $('[data-reset-form]'); show(f, true);
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          if (f.password.value.length < 8) return msg(err, 'Use at least 8 characters.', true);
          if (f.password.value !== f.password2.value) return msg(err, 'The two passwords don’t match.', true);
          f.querySelector('button').disabled = true;
          sb.auth.updateUser({ password: f.password.value }).then(function (u) {
            if (u.error) { f.querySelector('button').disabled = false; return msg(err, u.error.message, true); }
            location.href = base + 'learn/';
          });
        });
      });
      return;
    }
    var rf = $('[data-reset-request]');
    rf.addEventListener('submit', function (e) {
      e.preventDefault(); rf.querySelector('button').disabled = true;
      fetch(SB_URL + '/functions/v1/teach-reset', { method: 'POST', headers: { 'content-type': 'application/json', apikey: SB_KEY }, body: JSON.stringify({ email: rf.email.value }) })
        .finally(function () { show(rf, false); msg(err, 'If an account exists for this email, a reset link is on its way. Check your inbox (and spam).'); err.classList.remove('is-error'); });
    });
  }

  ({ landing: landing, welcome: welcome, login: login, signup: signup, learn: learn, reset: reset, certificate: certificate })[page]();
})();

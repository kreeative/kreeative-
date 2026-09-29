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
      if (o.course && o.course.payment_link) document.querySelectorAll('[data-buy]').forEach(function (a) { a.href = o.course.payment_link; });
    });
    sb.auth.getSession().then(function (r) {
      if (r.data.session) document.querySelectorAll('[data-if-student]').forEach(function (el) { el.hidden = false; });
    });
  }

  /* ---- welcome: after Stripe checkout, set a password ------------------ */
  function welcome() {
    var sid = new URLSearchParams(location.search).get('session_id');
    var status = $('[data-status]'), form = $('[data-claim-form]'), err = $('[data-error]');
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

  /* ---- login ----------------------------------------------------------- */
  function login() {
    var form = $('[data-login-form]'), err = $('[data-error]');
    sb.auth.getSession().then(function (r) { if (r.data.session) location.href = base + 'learn/'; });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg(err, '');
      form.querySelector('button').disabled = true;
      sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value }).then(function (r) {
        if (r.error) throw r.error;
        location.href = base + 'learn/';
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
          sb.from('quiz_attempts').select('module_id,passed,score,total')]);
      }).then(function (res) {
        var o = res[0], enrolled = (res[1].data || []).length > 0;
        if (!enrolled) { show($('[data-not-enrolled]'), true); show(app, false); var b = $('[data-buy]'); if (b && o.course) b.href = o.course.payment_link; return; }
        var st = { done: new Set((res[2].data || []).map(function (x) { return x.lesson_id; })), passed: new Set(), best: {}, qs: {} };
        (res[3].data || []).forEach(function (q) { (st.qs[q.module_id] = st.qs[q.module_id] || []).push(q); });
        (res[4].data || []).forEach(function (t) { if (t.passed) st.passed.add(t.module_id); var b0 = st.best[t.module_id]; if (!b0 || t.score > b0.score) st.best[t.module_id] = t; });
        // one ordered path: each module's lessons, then its quiz
        st.steps = [];
        o.modules.forEach(function (m) {
          m.lessons.forEach(function (l) { st.steps.push({ kind: 'lesson', id: l.id, lesson: l, mod: m }); });
          if (st.qs[m.id]) st.steps.push({ kind: 'quiz', id: m.id, mod: m });
        });
        show(app, true);
        render(o, st);
        window.addEventListener('popstate', function () { render(o, st); });
      });
    });

    function isDone(st, step) { return step.kind === 'lesson' ? st.done.has(step.id) : st.passed.has(step.id); }
    function go(o, st, href) { history.pushState(null, '', href); render(o, st); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function hrefOf(step) { return step.kind === 'lesson' ? '?lesson=' + step.id : '?quiz=' + step.id; }

    function render(o, st) {
      var q = new URLSearchParams(location.search), lid = q.get('lesson'), qid = q.get('quiz');
      var total = st.steps.length, n = st.steps.filter(function (s) { return isDone(st, s); }).length, pct = total ? Math.round(n / total * 100) : 0;
      $('[data-progress-bar]').style.width = pct + '%';
      var quizzes = st.steps.filter(function (s) { return s.kind === 'quiz'; });
      $('[data-progress-label]').textContent = pct + '% · ' + st.done.size + '/' + o.lessons.length + ' lessons · ' + st.passed.size + '/' + quizzes.length + ' quizzes';
      var next = st.steps.filter(function (s) { return !isDone(st, s); })[0];
      var cont = $('[data-continue]');
      if (next) { cont.href = hrefOf(next); cont.querySelector('.btn__label').textContent = n ? 'Continue: ' + (next.kind === 'quiz' ? 'Module ' + next.mod.position + ' quiz' : next.lesson.title) : 'Start the course'; }
      else { cont.href = hrefOf(st.steps[0]); cont.querySelector('.btn__label').textContent = 'Course complete 🎉 Review lessons'; }
      $('[data-outline]').innerHTML = o.modules.map(function (m) {
        var items = st.steps.filter(function (s) { return s.mod.id === m.id; });
        return '<div class="tl-mod"><p class="tl-mod__t"><span class="t-mono">' + String(m.position).padStart(2, '0') + '</span>' + esc(m.title) + '</p><ul>' + items.map(function (s) {
          var cur = (s.kind === 'lesson' && s.id === lid) || (s.kind === 'quiz' && s.id === qid);
          var label = s.kind === 'lesson' ? esc(s.lesson.title) : 'Module quiz', meta = s.kind === 'lesson' ? (s.lesson.duration_min || '') + ' min' : (st.best[s.id] ? st.best[s.id].score + '/' + st.best[s.id].total : st.qs[s.id].length + ' Q');
          return '<li><a href="' + hrefOf(s) + '" class="' + (s.kind === 'quiz' ? 'is-quiz ' : '') + (cur ? 'is-current ' : '') + (isDone(st, s) ? 'is-done' : '') + '"><i aria-hidden="true"></i><span>' + label + '</span><small>' + meta + '</small></a></li>';
        }).join('') + '</ul></div>';
      }).join('');
      document.querySelectorAll('[data-outline] a').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); go(o, st, a.getAttribute('href')); }); });

      var view = $('[data-lesson]'), home = $('[data-home]'), quizEl = $('[data-quiz]');
      var step = st.steps.filter(function (s) { return (s.kind === 'lesson' && s.id === lid) || (s.kind === 'quiz' && s.id === qid); })[0];
      show(view, false); show(quizEl, false); show(home, !step);
      if (!step) return;
      var idx = st.steps.indexOf(step), prev = st.steps[idx - 1], nxt = st.steps[idx + 1];
      var target = step.kind === 'lesson' ? view : quizEl;
      show(target, true); target.classList.remove('is-entering'); void target.offsetWidth; target.classList.add('is-entering');
      target.querySelectorAll('[data-prev]').forEach(function (a) { a.hidden = !prev; if (prev) a.onclick = function (e) { e.preventDefault(); go(o, st, hrefOf(prev)); }; });
      target.querySelectorAll('[data-next]').forEach(function (a) { a.hidden = !nxt; if (nxt) a.onclick = function (e) { e.preventDefault(); go(o, st, hrefOf(nxt)); }; });
      var kicker = 'Module ' + String(step.mod.position).padStart(2, '0') + ' · ' + step.mod.title;
      if (step.kind === 'lesson') return renderLesson(o, st, step, kicker, nxt);
      renderQuiz(o, st, step, kicker, nxt);
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

    function renderQuiz(o, st, step, kicker) {
      var qs = st.qs[step.id], box = $('[data-quiz-body]'), res = $('[data-quiz-result]');
      $('[data-quiz-kicker]').textContent = kicker;
      show(res, false);
      var best = st.best[step.id];
      $('[data-quiz-intro]').textContent = st.passed.has(step.id) ? 'Passed with ' + best.score + '/' + best.total + '. You can retake it anytime.' : qs.length + ' questions. Score 70% or more to complete the module.';
      box.innerHTML = qs.map(function (q, i) {
        return '<fieldset class="tq" style="--i:' + i + '"><legend><span class="t-mono">' + String(i + 1).padStart(2, '0') + '</span>' + esc(q.question) + '</legend>' +
          q.options.map(function (op, j) { return '<label class="tq__opt"><input type="radio" name="q' + i + '" value="' + j + '" required><span>' + esc(op) + '</span></label>'; }).join('') +
          '<p class="tq__why" hidden></p></fieldset>';
      }).join('') + '<button class="btn btn--accent" type="submit"><span class="btn__label t-body-l">Submit answers</span></button>';
      box.onsubmit = function (e) {
        e.preventDefault();
        var answers = qs.map(function (_, i) { var c = box.querySelector('input[name=q' + i + ']:checked'); return c ? Number(c.value) : -1; });
        var sub = box.querySelector('button[type=submit]'); sub.disabled = true;
        sb.rpc('submit_quiz', { p_module: step.id, p_answers: answers }).then(function (r) {
          sub.disabled = false;
          if (r.error) { res.textContent = 'Couldn’t submit. Try again.'; show(res, true); return; }
          var d = r.data;
          d.feedback.forEach(function (f, i) {
            var fs = box.querySelectorAll('.tq')[i]; fs.classList.add(f.ok ? 'is-right' : 'is-wrong');
            fs.querySelectorAll('.tq__opt').forEach(function (l, j) { l.classList.toggle('is-answer', j === f.correct); l.querySelector('input').disabled = true; });
            var why = fs.querySelector('.tq__why'); if (f.explanation) { why.textContent = (f.ok ? '✓ ' : '✗ ') + f.explanation; why.hidden = false; }
          });
          var b0 = st.best[step.id]; if (!b0 || d.score > b0.score) st.best[step.id] = { score: d.score, total: d.total, passed: d.passed };
          if (d.passed) { st.passed.add(step.id); confetti(); }
          res.innerHTML = '<b>' + d.score + '/' + d.total + '</b> ' + (d.passed ? 'Module complete. Nice work!' : 'Almost! Review the lessons and try again.');
          res.className = 'tq-result ' + (d.passed ? 'is-pass' : 'is-fail'); show(res, true);
          sub.querySelector('.btn__label').textContent = 'Retake quiz'; sub.type = 'button';
          sub.onclick = function () { renderQuiz(o, st, step, kicker); window.scrollTo({ top: 0, behavior: 'smooth' }); };
          var lbl = $('[data-progress-label]'), total = st.steps.length, n = st.steps.filter(function (s) { return isDone(st, s); }).length;
          $('[data-progress-bar]').style.width = Math.round(n / total * 100) + '%';
          lbl.textContent = Math.round(n / total * 100) + '% · ' + st.done.size + '/' + o.lessons.length + ' lessons · ' + st.passed.size + '/' + st.steps.filter(function (s) { return s.kind === 'quiz'; }).length + ' quizzes';
          var link = document.querySelector('[data-outline] a[href="?quiz=' + step.id + '"]'); if (link) { link.classList.toggle('is-done', st.passed.has(step.id)); link.querySelector('small').textContent = st.best[step.id].score + '/' + st.best[step.id].total; }
          res.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      };
    }
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

  ({ landing: landing, welcome: welcome, login: login, learn: learn, reset: reset })[page]();
})();

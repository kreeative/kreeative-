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

  /* ---- learn: dashboard + lesson player + progress --------------------- */
  function learn() {
    var app = $('[data-learn]');
    sb.auth.getSession().then(function (r) {
      var session = r.data.session;
      if (!session) { location.href = base + 'login/'; return; }
      $('[data-user]').textContent = session.user.email;
      $('[data-logout]').addEventListener('click', function () { sb.auth.signOut().then(function () { location.href = base; }); });
      return sb.rpc('claim_my_purchases').then(function () {
        return Promise.all([loadOutline(), sb.from('enrollments').select('course_id').eq('course_id', COURSE), sb.from('lesson_progress').select('lesson_id').eq('course_id', COURSE)]);
      }).then(function (res) {
        var o = res[0], enrolled = (res[1].data || []).length > 0;
        var done = new Set((res[2].data || []).map(function (x) { return x.lesson_id; }));
        if (!enrolled) { show($('[data-not-enrolled]'), true); show(app, false); var b = $('[data-buy]'); if (b && o.course) b.href = o.course.payment_link; return; }
        show(app, true);
        render(o, done);
        window.addEventListener('popstate', function () { render(o, done); });
      });
    });

    function render(o, done) {
      var id = new URLSearchParams(location.search).get('lesson');
      var total = o.lessons.length, n = o.lessons.filter(function (l) { return done.has(l.id); }).length, pct = total ? Math.round(n / total * 100) : 0;
      $('[data-progress-bar]').style.width = pct + '%';
      $('[data-progress-label]').textContent = n + ' of ' + total + ' lessons · ' + pct + '%';
      var next = o.lessons.filter(function (l) { return !done.has(l.id); })[0] || o.lessons[0];
      var cont = $('[data-continue]'); cont.href = '?lesson=' + next.id; cont.querySelector('.btn__label').textContent = n ? 'Continue: ' + next.title : 'Start the course';
      $('[data-outline]').innerHTML = o.modules.map(function (m) {
        return '<div class="tl-mod"><p class="tl-mod__t"><span class="t-mono">' + String(m.position).padStart(2, '0') + '</span>' + esc(m.title) + '</p><ul>' + m.lessons.map(function (l) {
          return '<li><a href="?lesson=' + l.id + '" class="' + (l.id === id ? 'is-current ' : '') + (done.has(l.id) ? 'is-done' : '') + '"><i aria-hidden="true"></i><span>' + esc(l.title) + '</span><small>' + (l.duration_min || '') + ' min</small></a></li>';
        }).join('') + '</ul></div>';
      }).join('');
      document.querySelectorAll('[data-outline] a').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); render(o, done); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      });
      var view = $('[data-lesson]'), home = $('[data-home]');
      var lesson = o.lessons.filter(function (l) { return l.id === id; })[0];
      if (!lesson) { show(view, false); show(home, true); return; }
      show(home, false); show(view, true);
      var mod = o.modules.filter(function (m) { return m.id === lesson.module_id; })[0];
      var idx = o.lessons.indexOf(lesson);
      $('[data-lesson-kicker]').textContent = 'Module ' + String(mod.position).padStart(2, '0') + ' · ' + mod.title;
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
      function paint() { var on = done.has(lesson.id); btn.classList.toggle('is-done', on); btn.querySelector('.btn__label').textContent = on ? 'Completed ✓' : 'Mark as complete'; }
      paint();
      btn.onclick = function () {
        btn.disabled = true;
        var on = done.has(lesson.id);
        sb.auth.getUser().then(function (u) {
          return on ? sb.from('lesson_progress').delete().eq('lesson_id', lesson.id)
                    : sb.from('lesson_progress').insert({ user_id: u.data.user.id, lesson_id: lesson.id, course_id: COURSE });
        }).then(function (res) {
          btn.disabled = false;
          if (res.error) return;
          on ? done.delete(lesson.id) : done.add(lesson.id);
          if (!on && o.lessons[idx + 1]) { history.pushState(null, '', '?lesson=' + o.lessons[idx + 1].id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
          render(o, done);
        });
      };
      var prev = o.lessons[idx - 1], nxt = o.lessons[idx + 1];
      $('[data-prev]').hidden = !prev; if (prev) $('[data-prev]').href = '?lesson=' + prev.id;
      $('[data-next]').hidden = !nxt; if (nxt) $('[data-next]').href = '?lesson=' + nxt.id;
      [$('[data-prev]'), $('[data-next]')].forEach(function (a) { a.onclick = function (e) { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); render(o, done); window.scrollTo({ top: 0, behavior: 'smooth' }); }; });
    }
  }

  ({ landing: landing, welcome: welcome, login: login, learn: learn })[page]();
})();

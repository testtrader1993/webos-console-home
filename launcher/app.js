(function () {
  'use strict';

  var CONFIG = window.HOME_CONFIG || {};

  // Date language: config.locale if set, otherwise the TV's menu language.
  var LOCALE = CONFIG.locale || navigator.language || 'en';
  var DATE_OPTS = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

  var URI_A = 'luna://com.webos.applicationManager/launch';
  var URI_B = 'luna://com.webos.service.applicationManager/launch';
  var URI_OFF = 'luna://com.webos.service.tvpower/power/turnOffScreen';

  var ACTIONS = {
    hdmi1: { label: 'XBOX', run: function () { lunaLaunch('com.webos.app.hdmi1'); } },
    hdmi2: { label: 'HDMI 2', run: function () { lunaLaunch('com.webos.app.hdmi2'); } },
    settings: { label: 'Instellingen', run: function () { lunaLaunch('com.palm.app.settings'); } },
    screenoff: { label: 'Tv uit', run: function () { screenOff(); } }
  };

  var tiles = [];
  var focusIdx = 0;
  var busy = false;
  var toastTimer = null;

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show';
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { t.className = ''; }, 3000);
  }

  /* ---------- luna ---------- */
  function lunaCall(uri, params, cb) {
    var done = false;
    function finish(res) { if (!done) { done = true; cb(res); } }
    try {
      var b = new window.PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var res;
        try { res = JSON.parse(msg); } catch (e) { res = { returnValue: false, errorText: 'parse' }; }
        finish(res);
      };
      b.call(uri, JSON.stringify(params));
    } catch (e) {
      finish({ returnValue: false, errorText: String(e) });
      return;
    }
    setTimeout(function () { finish(null); }, 2000);
  }

  function lunaLaunch(appId) {
    var params = { id: appId };
    if (!window.PalmServiceBridge) {
      console.log('ACTION', 'launch', appId);
      toast('Preview: ' + appId + ' starten');
      return;
    }
    lunaCall(URI_A, params, function (res) {
      if (res && res.returnValue !== false) { return; }
      lunaCall(URI_B, params, function (res2) {
        if (res2 && res2.returnValue !== false) { return; }
        console.log('launch mislukt', appId, JSON.stringify(res2));
        toast('Starten mislukt: ' + appId);
      });
    });
  }

  function screenOff() {
    if (!window.PalmServiceBridge) {
      console.log('ACTION', 'turnOffScreen');
      toast('Preview: scherm uit');
      return;
    }
    function fallback() {
      lunaCall(URI_OFF, {}, function (res) {
        if (res && res.returnValue !== false) { return; }
        toast('Tv uitzetten mislukt');
      });
    }
    if (!CONFIG.hubUrl) { fallback(); return; }
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('timeout')); }, 3000);
    });
    var req = fetch(CONFIG.hubUrl + '/off').then(function (r) {
      if (!r.ok) { throw new Error('http ' + r.status); }
    });
    Promise.race([req, timeout]).then(function () {
      clearTimeout(timer);
    }, function () {
      clearTimeout(timer);
      fallback();
    });
  }

  /* ---------- focus ---------- */
  function setFocus(i) {
    if (i === focusIdx && tiles[i].className.indexOf('focused') >= 0) { return; }
    var k;
    for (k = 0; k < tiles.length; k++) { tiles[k].classList.remove('focused'); }
    focusIdx = i;
    tiles[i].classList.add('focused');
    parX = (tiles[i].offsetLeft + tiles[i].offsetWidth / 2 - 960) / 960;
    parY = (tiles[i].offsetTop + tiles[i].offsetHeight / 2 - 540) / 540;
  }

  function centers() {
    var out = [], k, r;
    for (k = 0; k < tiles.length; k++) {
      r = tiles[k].getBoundingClientRect();
      out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    return out;
  }

  function move(dir) {
    var c = centers(), cur = c[focusIdx], best = -1, bestScore = 1e12, k, dx, dy, along, across, score;
    for (k = 0; k < c.length; k++) {
      if (k === focusIdx) { continue; }
      dx = c[k].x - cur.x; dy = c[k].y - cur.y;
      if (dir === 37) { along = -dx; across = Math.abs(dy); }
      else if (dir === 39) { along = dx; across = Math.abs(dy); }
      else if (dir === 38) { along = -dy; across = Math.abs(dx); }
      else { along = dy; across = Math.abs(dx); }
      if (along <= 5) { continue; }
      score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    if (best >= 0) { setFocus(best); }
  }

  function activate(i) {
    if (busy) { return; }
    var el = tiles[i], act = ACTIONS[el.getAttribute('data-action')];
    if (!act) { return; }
    busy = true;
    setFocus(i);
    el.classList.add('launching');
    $('flash').className = 'on';
    setTimeout(function () {
      act.run();
      $('flash').className = '';
      el.classList.remove('launching');
      busy = false;
    }, 400);
  }

  function onKey(e) {
    var k = e.keyCode;
    if (k >= 37 && k <= 40) { e.preventDefault(); if (!busy) { move(k); } }
    else if (k === 13) { e.preventDefault(); activate(focusIdx); }
    else if (k === 461 || k === 27) { e.preventDefault(); }
  }

  /* ---------- clock ---------- */
  function tick() {
    var d = new Date();
    $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var s;
    try { s = d.toLocaleDateString(LOCALE, DATE_OPTS); } catch (e) { s = d.toLocaleDateString('en', DATE_OPTS); }
    $('date').textContent = s;
  }

  /* ---------- particles ---------- */
  var cv, ctx, parts = [], parX = -0.5, parY = 0, curX = 0, curY = 0;
  var showFps = /[?&]fps=1/.test(location.search);
  var frames = 0, lastFps = 0;

  function initParticles() {
    cv = $('stars');
    ctx = cv.getContext('2d');
    var n = 70, i, z;
    for (i = 0; i < n; i++) {
      z = Math.random();
      parts.push({
        x: Math.random() * 1920, y: Math.random() * 1080, z: z,
        r: 1 + z * 2.2, vx: (Math.random() - 0.3) * 8 * (0.4 + z), vy: -(4 + Math.random() * 10) * (0.4 + z),
        a: 0.25 + z * 0.55, ph: Math.random() * 6.28
      });
    }
  }

  var lastT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastT = 0; return; }
    var dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0.016;
    lastT = t;
    curX += (parX - curX) * Math.min(dt * 2, 1);
    curY += (parY - curY) * Math.min(dt * 2, 1);
    ctx.clearRect(0, 0, 1920, 1080);
    var i, p, x, y, tw;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -10) { p.y = 1090; p.x = Math.random() * 1920; }
      if (p.x < -10) { p.x = 1930; } else if (p.x > 1930) { p.x = -10; }
      x = p.x - curX * 40 * p.z;
      y = p.y - curY * 24 * p.z;
      tw = 0.7 + 0.3 * Math.sin(t / 900 + p.ph);
      ctx.globalAlpha = p.a * tw;
      ctx.fillStyle = p.z > 0.7 ? '#b8ffb8' : '#cfe6ff';
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (CONFIG.name) { $('brand').textContent = CONFIG.name; $('brand').hidden = false; }
    if (showFps) {
      frames++;
      if (t - lastFps >= 1000) {
        $('fps').textContent = Math.round(frames * 1000 / (t - lastFps)) + ' fps';
        window.__fps = Math.round(frames * 1000 / (t - lastFps));
        frames = 0; lastFps = t;
      }
    }
  }

  /* ---------- init ---------- */
  function init() {
    var els = document.querySelectorAll('.tile'), k;
    for (k = 0; k < els.length; k++) { tiles.push(els[k]); }

    for (k = 0; k < tiles.length; k++) {
      (function (idx) {
        tiles[idx].addEventListener('mouseover', function () { if (!busy) { setFocus(idx); } });
        tiles[idx].addEventListener('click', function () { activate(idx); });
      })(k);
    }
    document.addEventListener('keydown', onKey);

    if (CONFIG.name) { $('brand').textContent = CONFIG.name; $('brand').hidden = false; }
    if (showFps) { $('fps').style.display = 'block'; }
    tick();
    setInterval(tick, 10000);
    initParticles();
    requestAnimationFrame(frame);

    // intro: staggered (~0.85 s in total)
    for (k = 0; k < tiles.length; k++) { tiles[k].classList.add('pre'); }
    setFocus(0);
    setTimeout(function () {
      for (k = 0; k < tiles.length; k++) {
        (function (el, delay) {
          setTimeout(function () {
            el.classList.add('intro');
            el.classList.remove('pre');
            el.classList.add('in');
            setTimeout(function () { el.classList.remove('intro'); }, 520);
          }, delay);
        })(tiles[k], k * 90);
      }
    }, 30);
  }

  window.lunaLaunch = lunaLaunch;
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();

/* ============================================================================
   Chasing Flow — scroll-driven scene (sky → peaks → water → Eden light),
   flow-meter HUD, pointer ripples & particle swirl, reveal-on-scroll.
   Vanilla JS, zero dependencies, one requestAnimationFrame loop.

   World anchors (per handoff):
     WATER = document Y of #waterMark  → the water surface's world position
     surf  = WATER − H/2               → scroll offset where the crossing plays
     co    = clamp(scrollY / surf)     → descent progress (0 morning → 1 surface)
     deepF = progress below the surface toward the deepest scroll (Eden)
   ============================================================================ */

(function () {
  'use strict';

  // Global motion multiplier (handoff default: 1).
  var M = 1;

  // --- reduced motion --------------------------------------------------------
  var rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(rmq && rmq.matches);
  if (rmq && rmq.addEventListener) {
    rmq.addEventListener('change', function (e) { reduced = e.matches; });
  }

  // --- reveal-on-scroll --------------------------------------------------------
  // Hidden state is set from JS, not CSS: content stays visible if JS never runs.
  if (!reduced && 'IntersectionObserver' in window) {
    var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    revealEls.forEach(function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px) scale(0.985)';
      el.style.transition = 'opacity .85s ease, transform .85s cubic-bezier(.2,.7,.2,1)';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        setTimeout(function () {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0) scale(1)';
        }, 60);
        io.unobserve(el);
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  // --- contact form: AJAX submit to Web3Forms --------------------------------------
  // Posts in-page so the visitor never leaves the scene. The <form> action/method
  // stay as a no-JS fallback. The inbox address lives in a Web3Forms access key,
  // never in the page source.
  var cform = document.getElementById('contactForm');
  if (cform) {
    var cstatus = cform.querySelector('.contact-status');
    var csend = cform.querySelector('.contact-send');
    var setStatus = function (msg, state) {
      if (!cstatus) return;
      cstatus.textContent = msg || '';
      if (state) cstatus.setAttribute('data-state', state);
      else cstatus.removeAttribute('data-state');
    };
    cform.addEventListener('submit', function (e) {
      e.preventDefault();
      var hp = cform.elements.botcheck;
      if (hp && hp.checked) return; // honeypot tripped — drop it, say nothing
      var data = {};
      new FormData(cform).forEach(function (v, k) { data[k] = v; });
      if (csend) csend.disabled = true;
      setStatus('Sending…');
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (res) {
          if (csend) csend.disabled = false;
          if (res && res.success) {
            cform.reset();
            setStatus('Thanks — your message is on its way. We’ll reply by email.', 'ok');
          } else {
            setStatus((res && res.message) || 'Something went wrong. Please try again in a moment.', 'error');
          }
        })
        .catch(function () {
          if (csend) csend.disabled = false;
          setStatus('Network hiccup — please try again in a moment.', 'error');
        });
    });
  }

  // --- scene ---------------------------------------------------------------------
  var canvas = document.getElementById('cv');
  if (!canvas || !canvas.getContext) return; // page remains a readable document

  var waterMark = document.getElementById('waterMark');
  var flowEl = document.getElementById('flowV');
  var zoneEl = document.getElementById('zoneC');
  var cueWrap = document.getElementById('cueWrap');
  var hls = [document.getElementById('hl1'), document.getElementById('hl2'),
             document.getElementById('hl3'), document.getElementById('hl4')];

  var ctx = null;
  var t0 = performance.now();
  var lastNow = t0;

  var bubbles = [];
  var parts = [];
  var partArea = 0;
  var ripples = [];
  var drops = [];
  var burst = [];
  var bloomDone = false;
  var bloomT = -99;
  var gust = 0;
  var lastSc = null;
  var ptr = { x: -999, y: -999, on: false, lx: -999, ly: -999 };

  var clouds = [];
  for (var ci = 0; ci < 6; ci++) {
    clouds.push({
      fx: Math.random(),
      fy: 0.5 + ci * 0.55 + Math.random() * 0.3,
      s: 0.7 + Math.random() * 0.9,
      sp: 1.2 + Math.random() * 2.4,
      pl: 0.18 + Math.random() * 0.2
    });
  }
  var birds = [];
  for (var bi = 0; bi < 12; bi++) {
    birds.push({
      x0: Math.random() * 2000,
      fy: Math.random(),
      sp: 26 + Math.random() * 34,
      fl: Math.random() * 6.28,
      s: 0.65 + Math.random() * 0.7
    });
  }
  var fish = [];
  for (var fi = 0; fi < 10; fi++) {
    fish.push({ i: fi, ph: Math.random() * 6.28, s: 0.75 + Math.random() * 0.6 });
  }

  // cached DOM state — write only when the value changes
  var cueState = null;
  var lastFlowTxt = null;
  var lastZone = null;

  // --- pointer: touch ripples + particle swirl --------------------------------------
  function spawnRipple(px, py, a) {
    if (reduced) return;
    if (ripples.length > 9) ripples.shift();
    ripples.push({ x: px, y: py, r: 6, a: a });
  }
  window.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
    var dx = ptr.x - ptr.lx, dy = ptr.y - ptr.ly;
    if (dx * dx + dy * dy > 4900) { // a small ring every ≥70px traveled
      spawnRipple(ptr.x, ptr.y, 0.3);
      ptr.lx = ptr.x; ptr.ly = ptr.y;
    }
  }, { passive: true });
  window.addEventListener('pointerdown', function (e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
    spawnRipple(e.clientX, e.clientY, 0.55);
  }, { passive: true });
  window.addEventListener('pointerup', function () { ptr.on = false; }, { passive: true });

  // --- helpers ------------------------------------------------------------------------
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function lerp(a, b, t) { return a + (b - a) * clamp01(t); }
  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(h1, h2, t) {
    var a = hexRgb(h1), b = hexRgb(h2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
  }
  function ramp(stops, v) {
    if (v <= stops[0][0]) return stops[0][1];
    for (var i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return stops[stops.length - 1][1];
  }
  function initParts(W, H) {
    var n = Math.min(180, Math.round(W * H / 8200));
    parts.length = 0;
    for (var i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        sp: 0.6 + Math.random() * 0.9,
        ph: Math.random() * 6.283,
        r: 1 + Math.random() * 1.6
      });
    }
    partArea = W * H;
  }
  // water crest world→screen curve (uses raw gust so amplitude follows scroll energy)
  function crestY(px, WL, t) {
    var g = gust;
    return WL + Math.sin(px * 0.02 + t * 1.6 * M) * 9 * (1 + g * 0.5)
              + Math.sin(px * 0.011 - t * 1.1 * M + 2) * 6 * (1 + g * 0.4);
  }

  // --- render loop -----------------------------------------------------------------------
  function tick(now) {
    try { draw(now); } catch (e) { /* keep the loop alive */ }
    requestAnimationFrame(tick);
  }

  function draw(now) {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { // resize only on actual change
      canvas.width = bw; canvas.height = bh;
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var x = ctx || (ctx = canvas.getContext('2d'));
    if (Math.abs(W * H - partArea) > partArea * 0.3) initParts(W, H);

    var dt = Math.min(0.05, (now - lastNow) / 1000) || 0.016;
    lastNow = now;
    var t = reduced ? 0 : (now - t0) / 1000;
    var sc = window.scrollY || document.documentElement.scrollTop || 0;

    // scroll gust — wind from scroll velocity
    if (lastSc === null) lastSc = sc;
    var rawV = Math.abs(sc - lastSc);
    lastSc = sc;
    gust = gust * 0.93 + Math.min(1.8, rawV * 0.016) * 0.07;
    var g = reduced ? 0 : gust;

    // world anchors (one layout read: the marker rect)
    var WATER = waterMark ? waterMark.getBoundingClientRect().top + sc : H * 3;
    var HC = Math.max(1, document.documentElement.scrollHeight - H);
    var surf = Math.max(1, WATER - H * 0.5);
    var WL = WATER - sc;
    var co = clamp01(sc / surf);
    var ez = co * co * (3 - 2 * co);
    var deepF = clamp01((sc - surf) / Math.max(1, HC - surf));

    // 1 — sky ramp: morning blue → golden hour
    x.fillStyle = ramp([[0, '#aee4ff'], [surf * 0.35, '#c9ecff'], [surf * 0.65, '#ffe9b3'], [surf * 0.98, '#ffd08a']], sc);
    x.fillRect(0, 0, W, H);

    // 2 — sun: climbs and grows on descent; rays rotate; lens flare past 10%
    var sr0 = Math.min(64, Math.max(42, W * 0.1));
    var sr = sr0 * (1 + 0.25 * co);
    var sy = H * 0.3 - co * H * 0.12 + Math.sin(t * 0.4 * M) * 4;
    var sx = W * 0.74;
    if (sy < WL + 60) {
      var sg = x.createRadialGradient(sx, sy, 5, sx, sy, sr * 4);
      sg.addColorStop(0, 'rgba(255,214,110,' + (0.42 + 0.16 * co) + ')');
      sg.addColorStop(1, 'rgba(255,214,110,0)');
      x.fillStyle = sg; x.fillRect(0, 0, W, H);
      x.lineCap = 'round';
      for (var ri = 0; ri < 12; ri++) {
        var ra = t * 0.06 * M + ri * 0.5236;
        var r1 = sr * 1.18, r2 = sr * (2.1 + 0.35 * Math.sin(t * 0.7 * M + ri * 1.7));
        x.beginPath();
        x.moveTo(sx + Math.cos(ra) * r1, sy + Math.sin(ra) * r1);
        x.lineTo(sx + Math.cos(ra) * r2, sy + Math.sin(ra) * r2);
        x.strokeStyle = 'rgba(255,215,120,' + (0.07 + 0.04 * Math.sin(t * M + ri)) + ')';
        x.lineWidth = 9; x.stroke();
      }
      x.beginPath(); x.arc(sx, sy, sr, 0, 6.2832);
      x.fillStyle = mix('#ffdf7e', '#ffb340', co); x.fill();
      if (co > 0.1) { // lens flare dots stepped toward viewport center
        var fa = 0.12 * Math.min(1, (co - 0.1) * 3);
        var cxm = W * 0.5 - sx, cym = H * 0.5 - sy;
        var fl = [[0.35, 7], [0.6, 12], [0.85, 5]];
        for (var fj = 0; fj < fl.length; fj++) {
          x.beginPath(); x.arc(sx + cxm * fl[fj][0] * 2, sy + cym * fl[fj][0] * 2, fl[fj][1], 0, 6.2832);
          x.fillStyle = 'rgba(255,255,235,' + fa.toFixed(3) + ')'; x.fill();
        }
      }
    }

    // 3 — clouds: slow parallax drift, hidden below the waterline
    for (var cj = 0; cj < clouds.length; cj++) {
      var cl = clouds[cj];
      var cy = cl.fy * H - sc * cl.pl;
      if (cy < -80 || cy > H + 80 || cy > WL + 30) continue;
      var cx = ((cl.fx * (W + 300) + t * (cl.sp + g * 5) * M) % (W + 300)) - 150;
      x.fillStyle = 'rgba(255,255,255,0.75)';
      var cs = cl.s;
      x.beginPath(); x.ellipse(cx, cy, 58 * cs, 19 * cs, 0, 0, 6.2832); x.fill();
      x.beginPath(); x.ellipse(cx - 22 * cs, cy - 10 * cs, 26 * cs, 14 * cs, 0, 0, 6.2832); x.fill();
      x.beginPath(); x.ellipse(cx + 20 * cs, cy - 12 * cs, 30 * cs, 16 * cs, 0, 0, 6.2832); x.fill();
    }

    // 4 — alpine peaks: rise from below the horizon between 12% and ~38% of the descent
    var pf0 = clamp01((co - 0.12) / 0.26);
    var pf = pf0 * pf0 * (3 - 2 * pf0);
    if (pf > 0.01 && WL > H * 0.13) {
      var tri01 = function (u) { var fr = u - Math.floor(u); return 1 - Math.abs(2 * fr - 1); };
      var ranges = [
        { yb: H * 0.6 - sc * 0.045 + (1 - pf) * H * 0.62, amp: H * 0.2, lam: W * 0.46, off: 0.18, c: 'rgba(129,158,180,' + (0.45 * pf).toFixed(3) + ')', snow: 0.75 },
        { yb: H * 0.72 - sc * 0.06 + (1 - pf) * H * 0.68, amp: H * 0.28, lam: W * 0.34, off: 0.62, c: 'rgba(82,108,124,' + (0.6 * pf).toFixed(3) + ')', snow: 0.7 }
      ];
      for (var rgi = 0; rgi < ranges.length; rgi++) {
        var rg = ranges[rgi];
        var rY = (function (r) {
          return function (px) {
            return r.yb - r.amp * (0.72 * tri01(px / r.lam + r.off) + 0.28 * tri01(px / (r.lam * 0.37) + r.off * 2.1));
          };
        })(rg);
        x.beginPath(); x.moveTo(0, H);
        for (var px1 = 0; px1 <= W; px1 += 8) x.lineTo(px1, rY(px1));
        x.lineTo(W, H); x.closePath(); x.fillStyle = rg.c; x.fill();
        // snow caps with a zigzag melt line at each main apex
        var k0 = Math.floor(rg.off - 0.5), k1 = Math.ceil(W / rg.lam + rg.off - 0.5);
        for (var k = k0; k <= k1; k++) {
          var ax = (k + 0.5 - rg.off) * rg.lam;
          if (ax < -40 || ax > W + 40) continue;
          var ay = rY(ax);
          var wHalf = rg.lam * 0.085, hCap = rg.amp * 0.16;
          x.beginPath();
          x.moveTo(ax, ay - 1);
          x.lineTo(ax - wHalf, ay + hCap);
          x.lineTo(ax - wHalf * 0.3, ay + hCap * 0.72);
          x.lineTo(ax, ay + hCap * 0.95);
          x.lineTo(ax + wHalf * 0.35, ay + hCap * 0.68);
          x.lineTo(ax + wHalf, ay + hCap);
          x.closePath();
          x.fillStyle = 'rgba(255,255,255,' + (rg.snow * pf).toFixed(3) + ')';
          x.fill();
        }
      }
    }

    // 5 — birds: flapping silhouettes drifting rightward, only in the sky band
    if (!reduced) {
      x.lineCap = 'round'; x.lineWidth = 1.7;
      for (var bj = 0; bj < birds.length; bj++) {
        var b = birds[bj];
        var bx = ((b.x0 + t * (b.sp + g * 30) * M) % (W + 360)) - 180;
        var by = H * (0.08 + b.fy * 0.34) - sc * 0.32 + Math.sin(t * 0.7 * M + b.fl) * 9;
        if (by < -30 || by > Math.min(H * 0.8, WL - 50)) continue;
        var flap = 0.25 + 0.75 * Math.abs(Math.sin(t * (5.5 + g * 3) * M + b.fl));
        var bs = b.s;
        x.beginPath();
        x.moveTo(bx - 9 * bs, by);
        x.quadraticCurveTo(bx - 4 * bs, by - 7 * bs * flap, bx, by);
        x.quadraticCurveTo(bx + 4 * bs, by - 7 * bs * flap, bx + 9 * bs, by);
        x.strokeStyle = 'rgba(16,60,60,0.5)';
        x.stroke();
      }
    }

    // 6 — meadow hills: three soft rolling parallax layers
    if (WL > H * 0.13) {
      var hillR = [
        { pl: 0.08, fr: 0.62, amp: 50, c: 'rgba(205,235,166,0.85)' },
        { pl: 0.14, fr: 0.72, amp: 70, c: 'rgba(159,219,126,0.9)' },
        { pl: 0.22, fr: 0.82, amp: 90, c: 'rgba(108,196,100,0.95)' }
      ];
      for (var hi = 0; hi < hillR.length; hi++) {
        var hr = hillR[hi], yb = H * hr.fr - sc * hr.pl;
        x.beginPath(); x.moveTo(0, H);
        for (var px2 = 0; px2 <= W; px2 += 12) {
          var hn = Math.sin(px2 * 0.006 + hi * 5) * 0.5 + Math.sin(px2 * 0.013 + hi * 11) * 0.25;
          x.lineTo(px2, yb + hn * hr.amp);
        }
        x.lineTo(W, H); x.closePath(); x.fillStyle = hr.c; x.fill();
      }
    }

    // 7 — underwater current ribbons (anchored in world space below the surface)
    if (!reduced) {
      var ribs = [
        { y: WATER + H * 0.8 - sc, w: 58, amp: 30, ts: 0.45, ph: 4, col: 'rgba(255,255,255,0.12)' },
        { y: WATER + H * 2.0 - sc, w: 80, amp: 40, ts: 0.35, ph: 1, col: 'rgba(255,255,255,0.1)' }
      ];
      x.lineCap = 'round';
      for (var rj = 0; rj < ribs.length; rj++) {
        var rb = ribs[rj];
        if (rb.y < -160 || rb.y > H + 160) continue;
        var am = rb.amp * (1 + g * 0.5);
        x.beginPath();
        for (var px3 = 0; px3 <= W; px3 += 14) {
          var ryy = rb.y + Math.sin(px3 * 0.013 + t * rb.ts * M + rb.ph) * am + Math.sin(px3 * 0.006 - t * rb.ts * 0.7 * M + rb.ph * 2) * am * 0.6;
          if (px3 === 0) x.moveTo(px3, ryy); else x.lineTo(px3, ryy);
        }
        x.strokeStyle = rb.col; x.lineWidth = rb.w; x.stroke();
      }
    }

    // 8 — water: animated crest, gradient turning golden with depth (Eden, not darkness)
    var crestAt = null;
    if (WL < H + 30) {
      var wg = x.createLinearGradient(0, Math.max(0, WL - 40), 0, H);
      wg.addColorStop(0, mix('#2fcabe', '#7fe9d9', deepF));
      wg.addColorStop(1, mix('#18a99e', '#ffe9b8', deepF));
      x.beginPath(); x.moveTo(0, H);
      var crest = [];
      for (var px4 = 0; px4 <= W; px4 += 8) {
        var cwy = crestY(px4, WL, t);
        crest.push([px4, cwy]); x.lineTo(px4, cwy);
      }
      x.lineTo(W, H); x.closePath(); x.fillStyle = wg; x.fill();
      x.beginPath();
      for (var cvi = 0; cvi < crest.length; cvi++) {
        if (cvi === 0) x.moveTo(crest[cvi][0], crest[cvi][1]); else x.lineTo(crest[cvi][0], crest[cvi][1]);
      }
      x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2; x.lineCap = 'round'; x.stroke();
      crestAt = WL;

      // 9 — surface glitter: twinkling dashes drifting along the crest
      if (WL > -H * 0.3 && !reduced) {
        for (var gi = 0; gi < 24; gi++) {
          var gx = ((gi * 97.3 + t * 30 * M) % (W + 40)) - 20;
          var gy = WL + 14 + (gi % 5) * 9 + Math.sin(t * 1.3 * M + gi) * 3;
          if (gy < 0 || gy > H) continue;
          var ga = 0.25 + 0.3 * Math.sin(t * 2.4 * M + gi * 2.1);
          if (ga <= 0.05) continue;
          x.beginPath();
          x.moveTo(gx - 3 - 2 * Math.sin(gi), gy); x.lineTo(gx + 3 + 2 * Math.sin(gi), gy);
          x.strokeStyle = 'rgba(255,255,255,' + ga.toFixed(3) + ')'; x.lineWidth = 2; x.stroke();
        }
      }

      // 10 — sailboat riding the crest, tilted by the local wave slope
      if (!reduced && WL > -50 && WL < H + 20) {
        var sbx = W * 0.32 + Math.sin(t * 0.05 * M) * W * 0.07;
        var sby = crestY(sbx, WL, t) + 1;
        var slope = (crestY(sbx + 12, WL, t) - crestY(sbx - 12, WL, t)) / 24;
        x.save();
        x.translate(sbx, sby);
        x.rotate(Math.atan(slope) * 0.8);
        x.beginPath();
        x.moveTo(-24, -4); x.lineTo(24, -4); x.lineTo(15, 7); x.lineTo(-17, 7); x.closePath();
        x.fillStyle = 'rgba(8,60,56,0.92)'; x.fill();
        x.beginPath(); x.moveTo(1, -6); x.lineTo(1, -42); x.strokeStyle = 'rgba(8,60,56,0.9)'; x.lineWidth = 2; x.stroke();
        var bil = Math.sin(t * 1.8 * M) * 2.5;
        x.beginPath(); x.moveTo(2, -40); x.quadraticCurveTo(16 + bil, -26, 20 + bil, -8); x.lineTo(2, -8); x.closePath();
        x.fillStyle = 'rgba(255,255,255,0.95)'; x.fill();
        x.beginPath(); x.moveTo(0, -38); x.quadraticCurveTo(-10 - bil * 0.6, -24, -14 - bil * 0.6, -8); x.lineTo(0, -8); x.closePath();
        x.fillStyle = 'rgba(255,255,255,0.8)'; x.fill();
        x.beginPath(); x.moveTo(1, -42); x.lineTo(10, -39); x.lineTo(1, -36); x.closePath();
        x.fillStyle = '#ff8a3d'; x.fill();
        x.restore();
      }

      // 11 — splash droplets off the crest (rate rises with the scroll gust)
      if (!reduced && WL > 0 && WL < H) {
        var rate = 0.1 + g * 0.9;
        if (drops.length < 46 && Math.random() < rate) {
          var dx0 = Math.random() * W;
          drops.push({ x: dx0, y: crestY(dx0, WL, t) - 2, vx: (Math.random() - 0.5) * 70, vy: -(60 + Math.random() * 170) * (0.5 + g), l: 1 });
        }
      }
      for (var di = drops.length - 1; di >= 0; di--) {
        var dr = drops[di];
        dr.vy += 420 * dt; dr.x += dr.vx * dt; dr.y += dr.vy * dt; dr.l -= dt * 1.1;
        if (dr.l <= 0 || dr.y > H + 20) { drops.splice(di, 1); continue; }
        x.beginPath(); x.arc(dr.x, dr.y, 1.7, 0, 6.2832);
        x.fillStyle = 'rgba(255,255,255,' + (0.75 * dr.l).toFixed(3) + ')'; x.fill();
      }

      // 12 — underwater sunbeams, swaying slowly
      if (WL < H * 0.55) {
        var beamTop = Math.max(0, WL);
        for (var sbi = 0; sbi < 5; sbi++) {
          var bmx = W * (0.08 + 0.21 * sbi) + Math.sin(t * 0.2 * M + sbi * 2) * 30;
          var wTop = 26 + sbi * 8, wBot = wTop * 3.2;
          var bg2 = x.createLinearGradient(0, beamTop, 0, H);
          var ba2 = 0.12 * (1 - 0.4 * deepF);
          bg2.addColorStop(0, 'rgba(255,255,240,' + ba2.toFixed(3) + ')');
          bg2.addColorStop(1, 'rgba(255,255,240,0)');
          x.beginPath();
          x.moveTo(bmx - wTop, beamTop); x.lineTo(bmx + wTop, beamTop);
          x.lineTo(bmx + wBot + 40, H); x.lineTo(bmx - wBot + 40, H);
          x.closePath(); x.fillStyle = bg2; x.fill();
        }
      }

      // 13 — fish school swimming left below the crest
      if (!reduced && WL < H * 0.9) {
        for (var fj2 = 0; fj2 < fish.length; fj2++) {
          var f = fish[fj2];
          var fx = W + 60 - (((t * 44 * M) + f.i * 72) % (W + 240));
          var fy = WATER + H * 0.85 - sc + Math.sin(t * 0.9 * M + f.i * 0.7) * 26 + (f.i % 3) * 34;
          if (fy < Math.max(crestAt + 50, 0) || fy > H + 30) continue;
          var wig = Math.sin(t * 7 * M + f.ph) * 0.35;
          x.save(); x.translate(fx, fy); x.scale(f.s, f.s);
          x.beginPath(); x.ellipse(0, 0, 8.5, 3.1, 0, 0, 6.2832);
          x.fillStyle = 'rgba(235,255,250,0.6)'; x.fill();
          x.beginPath(); x.moveTo(8, 0); x.lineTo(13.5, -3.4 + wig * 4); x.lineTo(13.5, 3.4 + wig * 4); x.closePath();
          x.fillStyle = 'rgba(235,255,250,0.45)'; x.fill();
          x.restore();
        }
      }

      // 14 — bubbles rising to the surface
      if (WL < H * 0.55 && bubbles.length < 36 && Math.random() < 0.3 && !reduced) {
        bubbles.push({ x: Math.random() * W, wy: sc + H + 30 + Math.random() * 60, r: 1.2 + Math.random() * 3, ph: Math.random() * 6 });
      }
      for (var bbi = bubbles.length - 1; bbi >= 0; bbi--) {
        var bb = bubbles[bbi];
        bb.wy -= (0.5 + bb.r * 0.18) * M;
        var bby = bb.wy - sc, bbx = bb.x + Math.sin(t * 1.2 * M + bb.ph) * 6;
        if (bby < Math.max(WL + 10, -20)) { bubbles.splice(bbi, 1); continue; } // pop at the surface
        if (bby > H + 40) continue;
        x.beginPath(); x.arc(bbx, bby, bb.r, 0, 6.2832);
        x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 1; x.stroke();
      }

      // 15 — Eden light pool + gold twinkles at the deepest scroll
      if (deepF > 0.4) {
        var era = (deepF - 0.4) / 0.6;
        var erg = x.createRadialGradient(W * 0.5, H * 1.15, 10, W * 0.5, H * 1.15, H * 1.3);
        erg.addColorStop(0, 'rgba(255,246,214,' + (era * 0.85).toFixed(3) + ')');
        erg.addColorStop(1, 'rgba(255,246,214,0)');
        x.fillStyle = erg; x.fillRect(0, 0, W, H);
        if (!reduced) {
          for (var ti = 0; ti < 16; ti++) {
            var txx = W * (0.5 + 0.46 * Math.sin(ti * 2.4));
            var tyy = H * (0.55 + 0.4 * Math.cos(ti * 1.7)) - Math.sin(t * 0.5 * M + ti) * 8;
            var ta = era * (0.3 + 0.35 * Math.sin(t * 2.6 * M + ti * 2.2));
            if (ta <= 0.04) continue;
            x.beginPath(); x.arc(txx, tyy, 1.6 + (ti % 3) * 0.7, 0, 6.2832);
            x.fillStyle = 'rgba(255,240,190,' + ta.toFixed(3) + ')'; x.fill();
          }
        }
      }
    } else if (bubbles.length) { bubbles.length = 0; }

    // 16 — foreground grass, swaying with the gust, fading as the water approaches
    var grassA = clamp01((WL - H * 0.9) / 120) * (1 - Math.min(1, sc / (surf * 1.02)) * 0.25);
    if (grassA > 0.02 && !reduced) {
      x.lineCap = 'round';
      for (var gbi = 0; gbi < 26; gbi++) {
        var gbx = (gbi / 26) * W + Math.sin(gbi * 7.3) * 14;
        var gh = 36 + ((gbi * 13) % 5) * 14;
        var sway = Math.sin(t * 1.1 * M + gbi * 0.9) * 6 * (1 + g * 1.6) + g * 8;
        x.beginPath();
        x.moveTo(gbx, H + 2);
        x.quadraticCurveTo(gbx + sway * 0.3, H - gh * 0.55, gbx + sway, H - gh);
        x.strokeStyle = 'rgba(38,120,64,' + (0.5 * grassA).toFixed(3) + ')';
        x.lineWidth = 2.6; x.stroke();
      }
    }

    // 17 — pollen flow-field: chaotic at the top, laminar streamlines with depth;
    //      pointer swirls it, strong gusts leave motion-blur streaks
    if (!reduced) {
      var spdBase = (0.4 + 1.7 * ez) * (1 - 0.35 * deepF) * (1 + g * 1.3) * M;
      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        var oldX = p.x, oldY = p.y;
        var turb = Math.sin(p.x * 0.021 + t * 1.6 * M) * 1.9 + Math.cos(p.y * 0.017 - t * 1.2 * M + p.ph) * 1.7;
        var lam = Math.sin(p.y * 0.006 + t * 0.35 * M + p.x * 0.0016) * 0.32;
        var ang = lam + turb * (1 - ez);
        var spd = spdBase * p.sp;
        p.x += Math.cos(ang) * spd; p.y += Math.sin(ang) * spd;
        if (ptr.on) { // swirl: push away + tangential within 140px of the pointer
          var pdx = p.x - ptr.x, pdy = p.y - ptr.y;
          var d2 = pdx * pdx + pdy * pdy;
          if (d2 < 19600 && d2 > 1) {
            var dd = Math.sqrt(d2), pf2 = (1 - dd / 140) * 3.2;
            p.x += (pdx / dd) * pf2 - (pdy / dd) * pf2 * 0.7;
            p.y += (pdy / dd) * pf2 + (pdx / dd) * pf2 * 0.7;
          }
        }
        var wrapped = false;
        if (p.x > W + 30) { p.x = -30; wrapped = true; } else if (p.x < -30) { p.x = W + 30; wrapped = true; }
        if (p.y > H + 30) { p.y = -30; wrapped = true; } else if (p.y < -30) { p.y = H + 30; wrapped = true; }
        var under = crestAt !== null && p.y > crestAt;
        if (!wrapped && g > 0.25) {
          x.beginPath(); x.moveTo(oldX, oldY); x.lineTo(p.x, p.y);
          x.strokeStyle = under ? 'rgba(255,248,225,0.3)' : 'rgba(255,175,60,0.3)';
          x.lineWidth = 1; x.stroke();
        }
        if (under) {
          var ua = (0.3 + 0.25 * Math.sin(t * 2.2 * M + p.ph)) * (0.55 + 0.45 * ez);
          if (ua > 0.04) {
            x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.2832);
            x.fillStyle = 'rgba(255,248,225,' + ua.toFixed(3) + ')'; x.fill();
          }
        } else {
          var oa = (0.28 + 0.24 * Math.sin(t * 2.6 * M + p.ph)) * (0.5 + 0.5 * ez);
          if (oa > 0.04) {
            x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.2832);
            x.fillStyle = 'rgba(255,175,60,' + oa.toFixed(3) + ')'; x.fill();
          }
        }
      }
    }

    // 18 — touch ripples: expanding rings with exponential fade
    for (var rpi = ripples.length - 1; rpi >= 0; rpi--) {
      var rp = ripples[rpi];
      rp.r += 130 * dt; rp.a *= Math.pow(0.03, dt);
      if (rp.a < 0.02) { ripples.splice(rpi, 1); continue; }
      x.beginPath(); x.arc(rp.x, rp.y, rp.r, 0, 6.2832);
      x.strokeStyle = 'rgba(255,255,255,' + rp.a.toFixed(3) + ')';
      x.lineWidth = 1.6; x.stroke();
    }

    // 19 — FLOW 100% bloom: one-time golden flash, ring and confetti burst
    var prog = Math.min(1, sc / HC);
    var pct = prog >= 0.99 ? 100 : Math.round(100 * (prog * prog * (3 - 2 * prog)));
    if (pct >= 100 && !bloomDone && !reduced) {
      bloomDone = true;
      bloomT = t;
      var cols = ['#ffd66e', '#ff9e5e', '#ff6f9c', '#ffffff', '#7fe9d9'];
      for (var bri = 0; bri < 44; bri++) {
        var bra = Math.random() * 6.2832, brs = 90 + Math.random() * 260;
        burst.push({ x: W * 0.5, y: H * 0.58, vx: Math.cos(bra) * brs, vy: Math.sin(bra) * brs - 40, l: 1.15 + Math.random() * 0.5, c: cols[bri % 5], r: 1.6 + Math.random() * 2.4 });
      }
    }
    var bloomAge = t - bloomT;
    if (bloomAge >= 0 && bloomAge < 1.4) {
      var ba = (1 - bloomAge / 1.4) * 0.55;
      var bg3 = x.createRadialGradient(W * 0.5, H * 0.58, 5, W * 0.5, H * 0.58, H * (0.25 + bloomAge * 0.9));
      bg3.addColorStop(0, 'rgba(255,250,225,' + ba.toFixed(3) + ')');
      bg3.addColorStop(1, 'rgba(255,250,225,0)');
      x.fillStyle = bg3; x.fillRect(0, 0, W, H);
      x.beginPath(); x.arc(W * 0.5, H * 0.58, 30 + bloomAge * H * 0.7, 0, 6.2832);
      x.strokeStyle = 'rgba(255,240,200,' + (ba * 0.8).toFixed(3) + ')'; x.lineWidth = 2; x.stroke();
    }
    for (var bui = burst.length - 1; bui >= 0; bui--) {
      var bp = burst[bui];
      bp.l -= dt; bp.vx *= 0.985; bp.vy = bp.vy * 0.985 + 26 * dt;
      bp.x += bp.vx * dt; bp.y += bp.vy * dt;
      if (bp.l <= 0) { burst.splice(bui, 1); continue; }
      x.beginPath(); x.arc(bp.x, bp.y, bp.r, 0, 6.2832);
      x.globalAlpha = Math.min(1, bp.l);
      x.fillStyle = bp.c; x.fill();
      x.globalAlpha = 1;
    }

    // wind-carried headline: floats every frame, amplitude rises with the gust
    if (!reduced) {
      for (var hli = 1; hli <= 4; hli++) {
        var hl = hls[hli - 1];
        if (!hl) break;
        var amp = 1 + g * 2.2;
        var htx = Math.sin(t * (0.4 + hli * 0.07) + hli * 1.7) * 5 * amp;
        var hty = Math.sin(t * (0.55 + hli * 0.05) + hli * 2.3) * 3 * amp;
        var hsk = Math.sin(t * 0.3 + hli) * 1.1 * amp;
        hl.style.transform = 'translate(' + htx.toFixed(1) + 'px,' + hty.toFixed(1) + 'px) skewX(' + hsk.toFixed(2) + 'deg)';
      }
    }

    // scroll cue fades once the journey starts
    if (cueWrap) {
      var cueV = sc > 60 ? '0' : '1';
      if (cueState !== cueV) { cueState = cueV; cueWrap.style.opacity = cueV; }
    }

    // HUD — write DOM text only when the string changes
    var txt = 'FLOW ' + pct + '%';
    var zone;
    if (sc < surf * 0.3) zone = 'THE NOISE';
    else if (sc < surf * 0.48) zone = 'ENTERING FLOW';
    else if (sc < surf * 0.8) zone = '2,000 M · THE HUNT';
    else if (sc < surf) zone = 'GOLDEN HOUR';
    else if (deepF < 0.02) zone = 'OPEN WATER · SURFACE';
    else if (deepF < 0.75) zone = 'INTO THE BLUE';
    else zone = 'DEEP WATER';
    if (flowEl && lastFlowTxt !== txt) { lastFlowTxt = txt; flowEl.textContent = txt; }
    if (zoneEl && lastZone !== zone) { lastZone = zone; zoneEl.textContent = zone; }
  }

  requestAnimationFrame(tick);
})();

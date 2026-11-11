/* Modra site: the kernel band. A stepped shaft with a cross hole, built from its own analytic
 * geometry: shaft  y² + z² = R1²,  hole  (x − XC)² + y² = r².  A pen traces their exact
 * intersection, x = XC + r cos θ, y = r sin θ, z = ±√(R1² − r² sin² θ), and an inset shows the
 * same two curves on the hole's surface unrolled (u = r θ, v = z), with its iso-lines.
 * Also the count-up of the stat strip. tools/build_kernel_svg.py mirrors the still pose. */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var doc = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var band = document.getElementById("kernel");
  var canvas = document.getElementById("kernel-canvas");
  if (!band) return;

  var G = { X0: -50, X1: 12, X2: 50, R1: 20, R2: 13, XC: -18, r: 14 }; // mm
  var POSE = { yaw: 0.62, pitch: 0.42, theta: 2.2 }; // the still pose (reduced motion, no script)
  var WIRE_IN = 900, DRAW_IN = 3600, LOOP = 5200, TAIL = 0.32, SWAY = 0.38, SWAY_T = 17000; // ms

  /* ---------- geometry ---------- */

  function zOn(t, s) { var y = G.r * Math.sin(t); return s * Math.sqrt(G.R1 * G.R1 - y * y); }
  function onCurve(t, s) { return [G.XC + G.r * Math.cos(t), G.r * Math.sin(t), zOn(t, s)]; }
  function seg(a, b, n) {
    var p = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      p.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
    return p;
  }
  function ring(x, R) {
    var p = [];
    for (var i = 0; i <= 72; i++) { var a = i / 72 * TAU; p.push([x, R * Math.cos(a), R * Math.sin(a)]); }
    return p;
  }
  // A shaft ruling at angle f, trimmed exactly where it crosses the hole.
  function ruling(E, f, k) {
    var c = Math.cos(f), s = Math.sin(f), y = G.R1 * c, z = G.R1 * s;
    if (Math.abs(y) < G.r) {
      var w = Math.sqrt(G.r * G.r - y * y);
      E.push({ p: seg([G.X0, y, z], [G.XC - w, y, z], 3), k: k });
      E.push({ p: seg([G.XC + w, y, z], [G.X1, y, z], 4), k: k });
    } else E.push({ p: seg([G.X0, y, z], [G.X1, y, z], 8), k: k });
    E.push({ p: seg([G.X1, G.R2 * c, G.R2 * s], [G.X2, G.R2 * c, G.R2 * s], 5), k: k });
  }
  // k: 0 edge, 1 shaft iso-line, 2 hole iso-line, 3 axis
  function wire() {
    var E = [], i;
    [[G.X0, G.R1, 0], [-41, G.R1, 1], [3, G.R1, 1], [G.X1, G.R1, 0], [G.X1, G.R2, 0], [31, G.R2, 1], [G.X2, G.R2, 0]]
      .forEach(function (c) { E.push({ p: ring(c[0], c[1]), k: c[2] }); });
    for (i = 0; i < 24; i++) ruling(E, (i + 0.5) / 24 * TAU, 1);
    for (i = 0; i < 16; i++) { var t = i / 16 * TAU; E.push({ p: seg(onCurve(t, -1), onCurve(t, 1), 6), k: 2 }); }
    E.push({ p: [[G.X0 - 9, 0, 0], [G.X2 + 9, 0, 0]], k: 3 });
    E.push({ p: [[G.XC, 0, -G.R1 - 9], [G.XC, 0, G.R1 + 9]], k: 3 });
    return E;
  }
  var WIRE = wire();

  /* ---------- drawing ---------- */

  var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  var W = 0, H = 0, dpr = 1, C = { line: "#8dbaff", dim: "#4d6a94", pen: "#ffa257" };
  var yaw = POSE.yaw, pitch = POSE.pitch, ca, sa, cb, sb, sc, cx, cy;

  function readColors() {
    var cs = getComputedStyle(band);
    C.line = cs.getPropertyValue("--kv-line").trim() || C.line;
    C.dim = cs.getPropertyValue("--kv-dim").trim() || C.dim;
    C.pen = cs.getPropertyValue("--kv-pen").trim() || C.pen;
  }
  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  function proj(p) {
    var x1 = p[0] * ca - p[1] * sa, y1 = p[0] * sa + p[1] * ca;
    var y2 = y1 * cb - p[2] * sb, z2 = y1 * sb + p[2] * cb, k = 400 / (400 + y2);
    return [cx + x1 * k * sc, cy - z2 * k * sc, y2];
  }
  function depth(d) { return 1 - 0.68 * Math.max(0, Math.min(1, (d + 30) / 60)); }
  // A polyline in chunks, each with its own depth alpha (a light hidden-line cue).
  function strokeDepth(pts, a, w) {
    ctx.lineWidth = w;
    for (var i = 0; i < pts.length - 1; i += 4) {
      var j = Math.min(pts.length - 1, i + 4), d = (pts[i][2] + pts[j][2]) / 2;
      ctx.globalAlpha = a * depth(d);
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      for (var q = i + 1; q <= j; q++) ctx.lineTo(pts[q][0], pts[q][1]);
      ctx.stroke();
    }
  }
  // Sample a stretch [t0, t1] of one intersection curve, already projected by fn.
  function arc(s, t0, t1, fn) {
    var n = Math.max(2, Math.ceil((t1 - t0) / TAU * 160)), p = [];
    for (var i = 0; i <= n; i++) p.push(fn(t0 + (t1 - t0) * i / n, s));
    return p;
  }
  function glow(pts, a) {
    if (pts.length < 2) return;
    [[7, 0.1], [3, 0.28], [1.5, 1]].forEach(function (g) {
      ctx.globalAlpha = a * g[1];
      ctx.lineWidth = g[0];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    });
  }
  function f2(v) { return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(2); }

  // e: ms since start (Infinity: finished, still pose).
  function draw(e) {
    ca = Math.cos(yaw); sa = Math.sin(yaw); cb = Math.cos(pitch); sb = Math.sin(pitch);
    var narrow = W < 520;
    sc = Math.min(W / 122, H / (narrow ? 92 : 78));
    cx = W * 0.5; cy = H * (narrow ? 0.44 : 0.47);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Wireframe, with the shaft's two silhouette rulings for the given view.
    var wa = Math.min(1, e / WIRE_IN), list = WIRE.slice(), f = Math.atan2(cb * ca, sb);
    ruling(list, f, 0);
    ruling(list, f + Math.PI, 0);
    list.forEach(function (ed) {
      ctx.strokeStyle = ed.k === 0 || ed.k === 1 ? C.line : C.dim;
      ctx.setLineDash(ed.k === 3 ? [8, 4, 1.5, 4] : []);
      strokeDepth(ed.p.map(proj), wa * [1, 0.42, 0.7, 0.8][ed.k], ed.k ? 0.9 : 1.5);
    });
    ctx.setLineDash([]);

    // The pen: traces both curves once, then circles them with a comet tail.
    var q = Math.max(0, Math.min(1, (e - WIRE_IN * 0.6) / DRAW_IN)), drawn = 2 * q, head, loop;
    if (q < 1) { loop = Math.min(1, Math.floor(drawn)); head = (drawn - loop) * TAU; }
    else if (e === Infinity) { loop = 0; head = POSE.theta; }
    else { var h = ((e - WIRE_IN * 0.6 - DRAW_IN) / LOOP) % 2; loop = Math.floor(h); head = (h - loop) * TAU; }
    var base = q < 1 ? 0.9 : 0.9 - 0.45 * Math.min(1, (e - WIRE_IN * 0.6 - DRAW_IN) / 1200 || 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = C.pen;
    var on3d = function (t, s) { return proj(onCurve(t, s)); };
    [1, -1].forEach(function (s, i) {
      var end = Math.min(1, Math.max(0, drawn - i)) * TAU;
      if (end > 0) glow(arc(s, 0, end, on3d), base);
    });
    var sgn = loop ? -1 : 1, t0 = Math.max(0, head - TAIL * TAU);
    if (head > t0) glow(arc(sgn, t0, head, on3d), 1);
    var P = on3d(head, sgn);
    ctx.fillStyle = C.pen;
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(P[0], P[1], 8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(P[0], P[1], 2.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Inset: the hole's surface unrolled, true to scale (u = r θ across, v = z up).
    var bw = Math.max(118, Math.min(196, W * 0.3)), bh = bw * G.R1 * 2 / (TAU * G.r), m = 12;
    var bx = W - bw - m, by = H - bh - m - (narrow ? 0 : 6);
    var uv = function (t, s) { return [bx + t / TAU * bw, by + bh / 2 - zOn(t, s) / (2 * G.R1) * bh, 0]; };
    ctx.globalAlpha = 0.85 * wa;
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.beginPath();
    for (var i = 0; i < 16; i++) {
      var a = uv(i / 16 * TAU, -1), b = uv(i / 16 * TAU, 1);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = C.pen;
    [1, -1].forEach(function (s, i) {
      var end = Math.min(1, Math.max(0, drawn - i)) * TAU;
      if (end > 0) glow(arc(s, 0, end, uv), base * 0.9);
    });
    var U = uv(head, sgn);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(U[0], U[1], 2.4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Read-out: the two surfaces and the pen's position on the curve.
    var fs = narrow ? 10 : 11, lh = fs + 5;
    ctx.font = fs + "px ui-monospace, \"SF Mono\", \"DejaVu Sans Mono\", Menlo, Consolas, monospace";
    ctx.globalAlpha = wa;
    ctx.fillStyle = C.line;
    ctx.fillText("y² + z² = 20²", m, m + fs);
    ctx.fillText("(x + 18)² + y² = 14²", m, m + fs + lh);
    ctx.fillStyle = C.pen;
    var x = onCurve(head, sgn);
    ctx.fillText("θ " + head.toFixed(3) + "  z " + f2(x[2]), m, m + fs + 2 * lh);
    ctx.fillStyle = C.dim;
    ctx.fillText("u", bx + bw - fs * 0.7, by - 4);
    ctx.fillText("v", bx - fs * 0.9, by + fs * 0.8);
    ctx.globalAlpha = 1;
  }

  /* ---------- animation loop ---------- */

  var start = 0, last = 0, running = false, visible = false, raf = 0, t0 = 0;
  function frame(now) {
    raf = 0;
    if (!running) return;
    if (!start) start = now;
    var dt = last ? Math.min(64, now - last) : 16;
    last = now;
    t0 += dt;
    yaw = POSE.yaw + SWAY * Math.sin(TAU * t0 / SWAY_T);
    draw(now - start);
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (reduce || running || !visible || document.hidden) return;
    running = true;
    last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function pause() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (start) start -= 1e9; // resume in the steady phase, not with a second draw-in
  }
  function still() { if (W > 1 && !running) { yaw = POSE.yaw; draw(Infinity); } }

  if (ctx) {
    readColors();
    resize();
    still();
    canvas.parentNode.classList.add("is-live"); // hides the static fallback image
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); still(); }).observe(canvas);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) play(); else pause();
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); else play(); });
  }

  /* ---------- stat strip count-up (motion only) ---------- */

  var nums = band.querySelectorAll("[data-count]");
  if (nums.length && doc.classList.contains("motion") && window.IntersectionObserver) {
    var list = nums[0].closest(".stats");
    var set = function (k) {
      nums.forEach(function (el) {
        var to = parseFloat(el.getAttribute("data-count")), from = parseFloat(el.getAttribute("data-from") || "0");
        var dec = (el.getAttribute("data-count").split(".")[1] || "").length;
        el.textContent = (from + (to - from) * k).toFixed(dec);
      });
    };
    set(0);
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      var s0 = 0;
      requestAnimationFrame(function step(now) {
        if (!s0) s0 = now;
        var k = Math.min(1, (now - s0) / 1600);
        set(1 - Math.pow(1 - k, 3));
        if (k < 1) requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    io.observe(list);
  }
})();

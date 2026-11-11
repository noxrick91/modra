/* Modra site: the hero wireframe and the parametric demo.
 * The part is a generic flange drawn by this file: a disc with a chamfered rim, a hub with a
 * chamfered top, a through bore and a bolt circle of holes. Canvas 2D, own projection, no library.
 * tools/build_part_svg.py mirrors this geometry for the no-script fallback image. */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Shared parameters (mm). The demo sliders change these; the hero part and the sketch follow.
  var P = { holes: 6, bcd: 72 };
  var DIM = { R: 50, T: 12, C: 1.5, HUB: 22, HUBTOP: 30, HC: 2, BORE: 12, HOLE: 4 };

  /* ---------- geometry ---------- */

  function circle(r, z, cx, cy, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * TAU;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
    return pts;
  }

  // Edges as polylines: {p: points, k: 0 edge | 1 construction}
  function edges() {
    var D = DIM, E = [];
    var add = function (p, k) { E.push({ p: p, k: k || 0 }); };
    add(circle(D.R, 0, 0, 0, 96));
    add(circle(D.R, D.T - D.C, 0, 0, 96));
    add(circle(D.R - D.C, D.T, 0, 0, 96));
    add(circle(D.HUB, D.T, 0, 0, 64));
    add(circle(D.HUB, D.HUBTOP - D.HC, 0, 0, 64));
    add(circle(D.HUB - D.HC, D.HUBTOP, 0, 0, 64));
    add(circle(D.BORE, 0, 0, 0, 48));
    add(circle(D.BORE, D.HUBTOP, 0, 0, 48));
    for (var i = 0; i < P.holes; i++) {
      var a = (i / P.holes) * TAU, cx = (P.bcd / 2) * Math.cos(a), cy = (P.bcd / 2) * Math.sin(a);
      add(circle(D.HOLE, 0, cx, cy, 28));
      add(circle(D.HOLE, D.T, cx, cy, 28));
    }
    add(circle(P.bcd / 2, D.T, 0, 0, 96), 1);
    add([[0, 0, -10], [0, 0, D.HUBTOP + 10]], 1);
    return E;
  }

  // Straight side lines where each cylinder or cone turns away from the viewer.
  function silhouettes(phi) {
    var D = DIM, S = [];
    function side(r0, z0, r1, z1, cx, cy) {
      [phi + Math.PI / 2, phi - Math.PI / 2].forEach(function (t) {
        var c = Math.cos(t), s = Math.sin(t);
        S.push({ p: [[cx + r0 * c, cy + r0 * s, z0], [cx + r1 * c, cy + r1 * s, z1]], k: 0 });
      });
    }
    side(D.R, 0, D.R, D.T - D.C, 0, 0);
    side(D.R, D.T - D.C, D.R - D.C, D.T, 0, 0);
    side(D.HUB, D.T, D.HUB, D.HUBTOP - D.HC, 0, 0);
    side(D.HUB, D.HUBTOP - D.HC, D.HUB - D.HC, D.HUBTOP, 0, 0);
    side(D.BORE, 0, D.BORE, D.HUBTOP, 0, 0);
    for (var i = 0; i < P.holes; i++) {
      var a = (i / P.holes) * TAU;
      side(DIM.HOLE, 0, DIM.HOLE, DIM.T, (P.bcd / 2) * Math.cos(a), (P.bcd / 2) * Math.sin(a));
    }
    return S;
  }

  /* ---------- hero canvas ---------- */

  var canvas = document.getElementById("part-canvas");
  var box = canvas ? canvas.parentNode : null;
  var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  var W = 0, H = 0, dpr = 1;
  var colors = { line: "#1d4f9c", accent: "#b4500f" };
  var model = edges();
  var yaw = 0.6, pitch = 1.0, tYaw = 0, tPitch = 0, pYaw = 0, pPitch = 0;
  var start = 0, last = 0, running = false, visible = true, raf = 0;
  var DRAW_IN = 1800; // ms for the regeneration effect

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.line = cs.getPropertyValue("--part-line").trim() || colors.line;
    colors.accent = cs.getPropertyValue("--signal").trim() || colors.accent;
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function draw(t) {
    var a = yaw + pYaw, b = pitch + pPitch;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    var s = Math.min(W, H) / 128, cx = W / 2, cy = H / 2 + Math.min(W, H) * 0.02, Dp = 420;
    function proj(p) {
      var x1 = p[0] * ca - p[1] * sa, y1 = p[0] * sa + p[1] * ca, z1 = p[2] - 14;
      var y2 = y1 * cb - z1 * sb, z2 = y1 * sb + z1 * cb, k = Dp / (Dp + y2);
      return [cx + x1 * k * s, cy - z2 * k * s, y2];
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var phi = Math.atan2(ca, sa);
    var list = model.concat(silhouettes(phi));
    var n = model.length;
    for (var e = 0; e < list.length; e++) {
      var ed = list[e];
      // Draw-in: model edges one after another, side lines fade in at the end.
      var f = 1;
      if (t < 1) f = e < n ? Math.max(0, Math.min(1, (t * 1.6 - (e / n) * 0.9) / 0.7)) : Math.max(0, (t - 0.75) / 0.25);
      if (f <= 0) continue;
      var pts = ed.p.map(proj);
      var m = Math.max(1, Math.round((pts.length - 1) * f));
      ctx.strokeStyle = ed.k ? colors.accent : colors.line;
      ctx.lineWidth = ed.k ? 1 : 1.5;
      ctx.setLineDash(ed.k ? [7, 4, 1.5, 4] : []);
      // Depth cue: chunks further away are fainter (a light hidden-line effect).
      for (var i = 0; i < m; i += 6) {
        var j = Math.min(m, i + 6), d = 0;
        for (var q = i; q <= j; q++) d += pts[q][2];
        d /= j - i + 1;
        var alpha = 1 - 0.72 * Math.max(0, Math.min(1, (d + 50) / 100));
        ctx.globalAlpha = (ed.k ? 0.75 : 1) * alpha * (t < 1 && e >= n ? f : 1);
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        for (q = i + 1; q <= j; q++) ctx.lineTo(pts[q][0], pts[q][1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  function frame(now) {
    raf = 0;
    if (!running) return;
    if (!start) start = now;
    var dt = last ? Math.min(64, now - last) : 16;
    last = now;
    yaw += dt * 0.00018;
    pYaw += (tYaw - pYaw) * Math.min(1, dt * 0.004);
    pPitch += (tPitch - pPitch) * Math.min(1, dt * 0.004);
    draw(Math.min(1, (now - start) / DRAW_IN));
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
  }
  function still() {
    // A posed, finished render: used for reduced motion and after parameter changes while paused.
    if (W > 1) draw(1);
  }

  if (ctx) {
    readColors();
    resize();
    if (reduce) { yaw = 0.62; pitch = 1.02; }
    still();
    box.classList.add("is-live"); // hides the static fallback image
    if (window.ResizeObserver) {
      new ResizeObserver(function () { resize(); if (!running) still(); }).observe(canvas);
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) play(); else pause();
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause(); else play();
    });
    document.addEventListener("modra:theme", function () { readColors(); if (!running) still(); });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", function () { readColors(); if (!running) still(); });
    }
    if (!reduce) {
      var hero = document.querySelector(".hero") || canvas;
      hero.addEventListener("pointermove", function (ev) {
        var r = canvas.getBoundingClientRect();
        var nx = (ev.clientX - (r.left + r.width / 2)) / Math.max(200, r.width);
        var ny = (ev.clientY - (r.top + r.height / 2)) / Math.max(200, r.height);
        tYaw = Math.max(-1, Math.min(1, nx)) * 0.35;
        tPitch = Math.max(-1, Math.min(1, ny)) * 0.18;
      });
      hero.addEventListener("pointerleave", function () { tYaw = 0; tPitch = 0; });
      start = 0;
      play();
    }
  }

  /* ---------- parametric demo (2D sketch) ---------- */

  var NS = "http://www.w3.org/2000/svg";
  var holesG = document.getElementById("sk-holes");
  var bcdCircle = document.getElementById("sk-bcd");
  var bcdDim = document.getElementById("sk-bcd-dim");
  var bcdText = document.getElementById("sk-bcd-text");
  var calloutText = document.getElementById("sk-callout-text");
  var leader = document.getElementById("sk-leader");
  var inHoles = document.getElementById("in-holes");
  var inBcd = document.getElementById("in-bcd");
  var outHoles = document.getElementById("out-holes");
  var outBcd = document.getElementById("out-bcd");

  function f1(v) { return Math.round(v * 100) / 100; }

  function updateSketch() {
    if (!holesG) return;
    var r = P.bcd / 2;
    while (holesG.firstChild) holesG.removeChild(holesG.firstChild);
    for (var i = 0; i < P.holes; i++) {
      var a = (i / P.holes) * TAU;
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", f1(r * Math.cos(a)));
      c.setAttribute("cy", f1(-r * Math.sin(a)));
      c.setAttribute("r", DIM.HOLE);
      holesG.appendChild(c);
    }
    bcdCircle.setAttribute("r", r);
    // Bolt-circle dimension below the part: extension lines, dimension line, arrowheads.
    bcdDim.setAttribute("d", "M" + -r + " 4V66M" + r + " 4V66M" + -r + " 62H" + r +
      "M" + -r + " 62l5 -2v4zM" + r + " 62l-5 -2v4z");
    bcdText.textContent = "Ø" + P.bcd;
    // Callout to the first hole at angle 0.
    leader.setAttribute("d", "M" + f1(r + 3) + " -3L" + f1(r + 13) + " -24H" + f1(r + 30));
    calloutText.setAttribute("x", f1(r + 13));
    calloutText.textContent = P.holes + " × Ø" + DIM.HOLE * 2;
    if (outHoles) outHoles.textContent = P.holes;
    if (outBcd) outBcd.textContent = P.bcd;
  }

  function onInput() {
    P.holes = Math.max(3, Math.min(12, parseInt(inHoles.value, 10) || 6));
    P.bcd = Math.max(62, Math.min(84, parseInt(inBcd.value, 10) || 72));
    model = edges();
    updateSketch();
    if (ctx && !running) still();
  }

  if (inHoles && inBcd) {
    document.querySelectorAll(".demo-controls").forEach(function (el) { el.hidden = false; });
    inHoles.addEventListener("input", onInput);
    inBcd.addEventListener("input", onInput);
    onInput();
  }
})();

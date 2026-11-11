/* Modra site: theme, language, configuration and screenshot viewer. No dependencies. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var SUPPORTED = ["en", "zh-CN"];
  var THEME_KEY = "modra-theme";
  var LANG_KEY = "modra-lang";

  // English source strings for text that only exists in script. Translations live in i18n/<lang>.json.
  var EN = {
    "ui.themeToDark": "Switch to dark theme",
    "ui.themeToLight": "Switch to light theme"
  };

  var catalog = null; // active translation, or null for English
  var originals = new Map(); // element -> {attr: English value}

  // The script's own URL locates the catalogs, so the page also works one folder deep (404.html).
  var scriptEl = document.currentScript;
  var base = new URL("../../", scriptEl ? scriptEl.src : location.href);

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function t(key) {
    if (catalog && Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
    return EN[key];
  }

  /* ---------- language ---------- */

  function normalise(tag) {
    if (!tag) return null;
    if (/^zh/i.test(tag)) return "zh-CN";
    if (/^en/i.test(tag)) return "en";
    return null;
  }

  function initialLang() {
    var q = null;
    try { q = normalise(new URLSearchParams(location.search).get("lang")); } catch (e) {}
    if (q) return q;
    var s = normalise(load(LANG_KEY));
    if (s) return s;
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < langs.length; i++) {
      var n = normalise(langs[i]);
      if (n) return n;
    }
    return "en";
  }

  var ATTRS = [
    ["data-i18n", "text"],
    ["data-i18n-html", "html"],
    ["data-i18n-alt", "alt"],
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-title", "title"],
    ["data-i18n-content", "content"]
  ];

  function remember(el, slot, value) {
    var rec = originals.get(el);
    if (!rec) { rec = {}; originals.set(el, rec); }
    if (!(slot in rec)) rec[slot] = value;
    return rec[slot];
  }

  function applyStrings() {
    ATTRS.forEach(function (pair) {
      var attr = pair[0], slot = pair[1];
      document.querySelectorAll("[" + attr + "]").forEach(function (el) {
        var key = el.getAttribute(attr);
        var current = slot === "text" ? el.textContent : slot === "html" ? el.innerHTML : el.getAttribute(slot);
        var english = remember(el, slot, current);
        var value = catalog && Object.prototype.hasOwnProperty.call(catalog, key) ? catalog[key] : english;
        if (slot === "text") el.textContent = value;
        else if (slot === "html") el.innerHTML = value;
        else el.setAttribute(slot, value);
      });
    });
  }

  function setLang(lang, persist) {
    var done = function () {
      doc.setAttribute("lang", lang);
      applyStrings();
      updateLangButton(lang);
      updateThemeButton();
      doc.classList.remove("i18n-pending");
      if (persist) store(LANG_KEY, lang);
      syncUrl(lang);
    };
    if (lang === "en") { catalog = null; done(); return; }
    fetch(new URL("i18n/" + lang + ".json", base).href)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (json) { catalog = json; done(); })
      .catch(function () { catalog = null; lang = "en"; done(); });
  }

  function syncUrl(lang) {
    try {
      var url = new URL(location.href);
      if (!url.searchParams.has("lang")) return;
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url.href);
    } catch (e) {}
  }

  var langBtn = document.getElementById("lang-toggle");
  function updateLangButton(lang) {
    if (!langBtn) return;
    // Each language is named in itself, as language switchers conventionally are.
    var other = lang === "en" ? "zh-CN" : "en";
    langBtn.textContent = other === "zh-CN" ? "\u4e2d\u6587" : "English";
    langBtn.setAttribute("lang", other);
  }
  if (langBtn) {
    langBtn.hidden = false;
    langBtn.addEventListener("click", function () {
      setLang(doc.getAttribute("lang") === "zh-CN" ? "en" : "zh-CN", true);
    });
  }

  /* ---------- theme ---------- */

  var themeBtn = document.getElementById("theme-toggle");
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function effectiveTheme() {
    var set = doc.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }
  function updateThemeButton() {
    if (!themeBtn) return;
    var dark = effectiveTheme() === "dark";
    themeBtn.setAttribute("aria-label", dark ? t("ui.themeToLight") : t("ui.themeToDark"));
  }
  if (themeBtn) {
    themeBtn.hidden = false;
    themeBtn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      doc.setAttribute("data-theme", next);
      store(THEME_KEY, next);
      updateThemeButton();
      document.dispatchEvent(new CustomEvent("modra:theme")); // the hero canvas re-reads its colours
    });
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", updateThemeButton);
  }

  /* ---------- configuration (site.config.js) ---------- */

  function applyConfig() {
    var cfg = window.MODRA_SITE || {};
    document.querySelectorAll("[data-config-href]").forEach(function (el) {
      var v = cfg[el.getAttribute("data-config-href")];
      if (typeof v === "string" && /^https?:\/\//.test(v)) {
        el.setAttribute("href", v);
        el.setAttribute("rel", "noopener");
        el.hidden = false;
      }
    });
    document.querySelectorAll("[data-config-section]").forEach(function (el) {
      var v = cfg[el.getAttribute("data-config-section")];
      el.hidden = !(typeof v === "string" && /^https?:\/\//.test(v)); // no link, no section
    });
    document.querySelectorAll("[data-config-text]").forEach(function (el) {
      var v = cfg[el.getAttribute("data-config-text")];
      if (typeof v === "string" && v.trim()) { el.textContent = v; el.hidden = false; }
    });
  }

  /* ---------- screenshot viewer ---------- */

  function initLightbox() {
    var dlg = document.getElementById("lightbox");
    var links = Array.prototype.slice.call(document.querySelectorAll(".gallery a.shot"));
    if (!dlg || !links.length || typeof dlg.showModal !== "function") return; // links still open the image
    var img = dlg.querySelector(".lb-img");
    var cap = dlg.querySelector(".lb-caption");
    var count = dlg.querySelector(".lb-count");
    var index = 0;
    var opener = null;

    function show(i) {
      index = (i + links.length) % links.length;
      var a = links[index];
      var thumb = a.querySelector("img");
      var fig = a.closest("figure");
      var fc = fig ? fig.querySelector("figcaption") : null;
      img.src = a.getAttribute("href");
      img.alt = thumb ? thumb.alt : "";
      cap.textContent = fc ? fc.textContent : "";
      count.textContent = (index + 1) + " / " + links.length;
    }
    function close() { dlg.close(); }

    links.forEach(function (a, i) {
      a.addEventListener("click", function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
        ev.preventDefault();
        opener = a;
        show(i);
        dlg.showModal();
        dlg.querySelector('[data-lb="next"]').focus();
      });
    });
    dlg.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-lb]");
      if (b) {
        var act = b.getAttribute("data-lb");
        if (act === "prev") show(index - 1);
        else if (act === "next") show(index + 1);
        else close();
      } else if (ev.target === dlg) {
        close(); // click on the backdrop
      }
    });
    dlg.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft") { ev.preventDefault(); show(index - 1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); show(index + 1); }
    });
    dlg.addEventListener("close", function () {
      img.removeAttribute("src");
      if (opener) opener.focus();
    });
  }

  /* ---------- motion: scroll reveals and grid parallax ---------- */

  function initMotion() {
    window.ModraReveal = true;
    if (!doc.classList.contains("motion")) return; // reduced motion: everything stays visible and still
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    // Stagger siblings that enter together (cards, gallery items).
    items.forEach(function (el) {
      var p = el.parentNode, i = 0;
      for (var c = p.firstElementChild; c && c !== el; c = c.nextElementSibling) if (c.classList.contains("reveal")) i++;
      el.style.setProperty("--i", Math.min(i, 8));
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });

    var grid = document.querySelector(".grid-bg");
    if (grid) {
      var ticking = false;
      window.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          // Slower than the page, wrapping on the 120 px major grid so the pattern never jumps.
          grid.style.setProperty("--grid-shift", (-(window.scrollY * 0.12) % 120).toFixed(1) + "px");
        });
      }, { passive: true });
    }
  }

  /* ---------- start ---------- */

  initMotion();

  applyConfig();
  initLightbox();
  updateThemeButton();
  var lang = initialLang();
  if (lang === "en") {
    updateLangButton("en");
    doc.classList.remove("i18n-pending");
  } else {
    setLang(lang, false);
  }
})();

/* Textbook runtime (from dpf_reboot LoopBook): page chrome (top bar, TOC, chapter nav, figure numbers, terms, quizzes)
   plus small helpers for canvas simulators. Plain ES2020, no dependencies. */
(function () {
  "use strict";

  /* One runtime serves every book on the shelf. A page names its book with <html data-book="...">
     (default loop); chapter files are relative to that book's directory. */
  var BOOKS = {
    /* One entry per book. home = absolute URL of the book's index; chapter files are relative to it. */
    kmhv3: {
      brand: "KMHv3<b>Book</b>", home: "index.html", title: "KMHv3Book: 쿤밍후 v3 코어",
      chapters: [
        { id: "index", file: "index.html", no: "", title: "표지와 지도" },
        { id: "ch01", file: "ch01-overview.html", no: "1", title: "CPU 기초와 KMHv3 지도" },
        { id: "ch02", file: "ch02-bpu.html", no: "2", title: "분기 예측 I: BPU 파이프라인과 BTB" },
        { id: "ch03", file: "ch03-predictors.html", no: "3", title: "분기 예측 II: TAGE·SC·ITTAGE·RAS" },
        { id: "ch04", file: "ch04-fetch.html", no: "4", title: "명령어 인출: FTQ·ICache·IFU" },
        { id: "ch05", file: "ch05-decode-rename.html", no: "5", title: "디코드와 리네임" },
        { id: "ch06", file: "ch06-dispatch-issue.html", no: "6", title: "디스패치와 이슈 큐" },
        { id: "ch07", file: "ch07-execute.html", no: "7", title: "데이터패스와 실행 유닛" },
        { id: "ch08", file: "ch08-rob-redirect.html", no: "8", title: "ROB, 커밋, 리다이렉트" },
        { id: "ch09", file: "ch09-loadstore.html", no: "9", title: "로드·스토어 파이프라인과 LSQ" },
        { id: "ch10", file: "ch10-cache-mmu.html", no: "10", title: "캐시, TLB, 프리페처" },
        { id: "ch11", file: "ch11-vector.html", no: "11", title: "벡터 확장(RVV)" },
        { id: "ch12", file: "ch12-verify.html", no: "12", title: "빌드·시뮬레이션·검증" },
        { id: "ch13", file: "ch13-lab.html", no: "13", title: "통합 실험실: 한 명령어의 일생" }
      ]
    }
  };
  var BOOK_ID = BOOKS[document.documentElement.getAttribute("data-book")] ? document.documentElement.getAttribute("data-book") : Object.keys(BOOKS)[0];
  var BOOK = BOOKS[BOOK_ID];
  var CHAPTERS = BOOK.chapters;

  var THEME_KEY = "book-theme";
  var listeners = [];

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: theme just won't persist */ }
    return null;
  }

  function embedded() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  function initialTheme() {
    var saved = store(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    if (embedded()) return "dark"; /* the dashboard shell is black */
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    store(THEME_KEY, t);
    listeners.forEach(function (fn) { try { fn(t); } catch (e) { console.error(e); } });
  }
  document.documentElement.setAttribute("data-theme", initialTheme());

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function current() {
    var id = document.body.getAttribute("data-chapter") || "index";
    var i = CHAPTERS.findIndex(function (c) { return c.id === id; });
    return { idx: i < 0 ? 0 : i, ch: CHAPTERS[i < 0 ? 0 : i] };
  }

  function buildTopbar(cur) {
    var bar = el("header", { class: "topbar" });
    var crumb = cur.ch.no ? "Chapter " + cur.ch.no + " · " + cur.ch.title : cur.ch.title;
    bar.innerHTML =
      '<a class="brand" href="index.html">' + BOOK.brand + "</a>" +
      '<span class="crumb">' + crumb + "</span>" +
      '<select class="tb-btn" aria-label="장 이동">' +
      CHAPTERS.map(function (c, i) {
        return '<option value="' + c.file + '"' + (i === cur.idx ? " selected" : "") + ">" +
          (c.no ? c.no + ". " : "") + c.title + "</option>";
      }).join("") + "</select>" +
      '<select class="tb-btn tb-shelf" aria-label="책 바꾸기">' +
      Object.keys(BOOKS).map(function (k) {
        return '<option value="' + BOOKS[k].home + '"' + (k === BOOK_ID ? " selected" : "") + ">" + BOOKS[k].title + "</option>";
      }).join("") + "</select>" +
      
      '<button class="tb-btn" type="button" data-theme-toggle>테마</button>' +
      '<div class="progress-bar"></div>';
    bar.querySelectorAll("select").forEach(function (sel) {
      sel.addEventListener("change", function (e) { window.location.href = e.target.value; });
    });
    bar.querySelector("[data-theme-toggle]").addEventListener("click", function () {
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    document.body.insertBefore(bar, document.body.firstChild);
    var prog = bar.querySelector(".progress-bar");
    window.addEventListener("scroll", function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
    }, { passive: true });
  }

  function slug(s, i) { return "s" + i + "-" + s.replace(/[^\w가-힣]+/g, "-").slice(0, 40); }

  function buildToc(main) {
    var heads = main.querySelectorAll("section > h2, .sim .sim-head h3");
    if (heads.length < 2) return;
    var page = main.parentElement;
    page.classList.add("has-toc");
    var toc = el("nav", { class: "toc", "aria-label": "이 장의 목차" }, '<div class="toc-title">이 장에서</div>');
    var links = [];
    heads.forEach(function (h, i) {
      var target = h.tagName === "H2" ? h.parentElement : h.closest(".sim");
      if (!target.id) target.id = slug(h.textContent, i);
      var a = el("a", { href: "#" + target.id }, h.textContent);
      if (h.tagName === "H3") a.className = "sim-link";
      toc.appendChild(a);
      links.push({ a: a, t: target });
    });
    page.appendChild(toc);
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) { l.a.classList.toggle("active", l.t === en.target); });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    links.forEach(function (l) { io.observe(l.t); });
  }

  function numberFigures(main, cur) {
    var n = 0;
    main.querySelectorAll("figure.diagram figcaption").forEach(function (cap) {
      n += 1;
      var label = (cur.ch.no || "0") + "-" + n;
      cap.insertAdjacentHTML("afterbegin", '<b class="fig-no">그림 ' + label + ".</b> ");
      var fig = cap.closest("figure");
      if (fig && !fig.id) fig.id = "fig-" + label;
    });
    if (cur.ch.no) main.style.setProperty("--chap", '"' + cur.ch.no + '."');
  }

  function buildChapterNav(main, cur) {
    if (main.querySelector(".chapter-nav")) return;
    var prev = CHAPTERS[cur.idx - 1];
    var next = CHAPTERS[cur.idx + 1];
    var nav = el("nav", { class: "chapter-nav" });
    if (prev) nav.innerHTML += '<a href="' + prev.file + '"><span>이전</span><b>' + (prev.no ? prev.no + ". " : "") + prev.title + "</b></a>";
    if (next) nav.innerHTML += '<a class="next" href="' + next.file + '"><span>다음</span><b>' + next.no + ". " + next.title + "</b></a>";
    main.appendChild(nav);
  }

  function wireTerms() {
    var pop = null;
    function hide() { if (pop) { pop.remove(); pop = null; } }
    document.querySelectorAll(".term[data-def]").forEach(function (t) {
      t.setAttribute("tabindex", "0");
      function show() {
        hide();
        pop = el("div", { class: "term-pop", role: "tooltip" });
        pop.innerHTML = "<b>" + (t.getAttribute("data-head") || t.textContent) + "</b>" + t.getAttribute("data-def");
        document.body.appendChild(pop);
        var r = t.getBoundingClientRect();
        var left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - pop.offsetWidth - 12);
        pop.style.left = Math.max(8, left) + "px";
        pop.style.top = window.scrollY + r.bottom + 6 + "px";
      }
      t.addEventListener("mouseenter", show);
      t.addEventListener("focus", show);
      t.addEventListener("mouseleave", hide);
      t.addEventListener("blur", hide);
    });
  }

  /* <div class="quiz" data-answer="1"><div class="q">...</div><div class="opts"><button>..</button></div><div class="explain">..</div></div> */
  function wireQuizzes() {
    document.querySelectorAll(".quiz").forEach(function (q) {
      var right = parseInt(q.getAttribute("data-answer") || "0", 10);
      var btns = q.querySelectorAll(".opts button");
      btns.forEach(function (b, i) {
        b.type = "button";
        b.addEventListener("click", function () {
          btns.forEach(function (x, j) {
            x.disabled = true;
            if (j === right) x.classList.add("right");
          });
          if (i !== right) b.classList.add("wrong");
          q.classList.add("answered");
        });
      });
    });
  }

  /* ---------------- simulator helpers ---------------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim() || "#888";
  }

  function alpha(color, a) {
    var c = color.trim();
    if (c[0] === "#" && (c.length === 7 || c.length === 4)) {
      var hex = c.length === 4 ? c.slice(1).split("").map(function (x) { return x + x; }).join("") : c.slice(1);
      var n = parseInt(hex, 16);
      return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
    }
    return c;
  }

  /* Book.canvas(canvasEl, draw) -> handle {ctx, w, h, redraw}. draw(ctx, w, h) is called on
     resize and theme change; coordinates are CSS pixels. */
  function canvas(c, draw) {
    var ctx = c.getContext("2d");
    var handle = { ctx: ctx, w: 0, h: 0, redraw: redraw };
    function size() {
      var dpr = window.devicePixelRatio || 1;
      var r = c.getBoundingClientRect();
      handle.w = Math.max(10, r.width);
      handle.h = Math.max(10, r.height);
      c.width = Math.round(handle.w * dpr);
      c.height = Math.round(handle.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function redraw() {
      ctx.clearRect(0, 0, handle.w, handle.h);
      draw(ctx, handle.w, handle.h);
    }
    size();
    if ("ResizeObserver" in window) {
      var last = handle.w;
      new ResizeObserver(function () {
        var r = c.getBoundingClientRect();
        if (Math.abs(r.width - last) < 1) return;
        last = r.width;
        size();
        redraw();
      }).observe(c);
    }
    listeners.push(function () { redraw(); });
    requestAnimationFrame(redraw);
    return handle;
  }

  /* Seeded RNG (mulberry32) with uniform/normal/choice helpers. */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var spare = null;
    return {
      next: next,
      uniform: function (lo, hi) { return lo + (hi - lo) * next(); },
      normal: function (mu, sd) {
        var z;
        if (spare !== null) { z = spare; spare = null; } else {
          var u = 0, v = 0;
          while (u === 0) u = next();
          v = next();
          var r = Math.sqrt(-2 * Math.log(u));
          z = r * Math.cos(2 * Math.PI * v);
          spare = r * Math.sin(2 * Math.PI * v);
        }
        return (mu || 0) + (sd === undefined ? 1 : sd) * z;
      },
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  /* Bind every input[data-k] under root: returns a live params object and calls onChange.
     <output data-for="k"> elements show the value; data-fmt="pct|int|f2" formats it. */
  function bind(root, onChange) {
    var params = {};
    var inputs = root.querySelectorAll("input[data-k], select[data-k]");
    function fmt(v, f) {
      if (f === "pct") return (v * 100).toFixed(1) + "%";
      if (f === "int") return String(Math.round(v));
      if (f && f[0] === "f") return Number(v).toFixed(parseInt(f.slice(1), 10));
      return String(v);
    }
    function read() {
      inputs.forEach(function (i) {
        var k = i.getAttribute("data-k");
        params[k] = i.type === "checkbox" ? i.checked : (i.type === "range" || i.type === "number" ? parseFloat(i.value) : i.value);
        root.querySelectorAll('output[data-for="' + k + '"]').forEach(function (o) {
          o.textContent = fmt(params[k], o.getAttribute("data-fmt") || i.getAttribute("data-fmt"));
        });
      });
    }
    inputs.forEach(function (i) {
      i.addEventListener("input", function () { read(); if (onChange) onChange(params); });
    });
    read();
    return params;
  }

  /* Linear scale helper and simple chart primitives. */
  function scale(d0, d1, r0, r1) {
    var f = function (v) { return r0 + ((v - d0) / ((d1 - d0) || 1)) * (r1 - r0); };
    f.inv = function (p) { return d0 + ((p - r0) / ((r1 - r0) || 1)) * (d1 - d0); };
    return f;
  }

  /* frame(ctx, w, h, {x:[lo,hi], y:[lo,hi], xlabel, ylabel, pad, xticks, yticks, xfmt, yfmt})
     -> {x: scale, y: scale, box}. Draws grid + axes. */
  function frame(ctx, w, h, o) {
    var pad = Object.assign({ l: 46, r: 14, t: 14, b: 34 }, o.pad || {});
    var box = { x0: pad.l, x1: w - pad.r, y0: pad.t, y1: h - pad.b };
    var sx = scale(o.x[0], o.x[1], box.x0, box.x1);
    var sy = scale(o.y[0], o.y[1], box.y1, box.y0);
    var nx = o.xticks || 5, ny = o.yticks || 4;
    var xfmt = o.xfmt || function (v) { return +v.toFixed(2); };
    var yfmt = o.yfmt || function (v) { return +v.toFixed(2); };
    ctx.save();
    ctx.font = "11px " + cssVar("mono");
    ctx.lineWidth = 1;
    for (var i = 0; i <= ny; i++) {
      var yv = o.y[0] + (o.y[1] - o.y[0]) * i / ny;
      var py = Math.round(sy(yv)) + 0.5;
      ctx.strokeStyle = cssVar("grid");
      ctx.beginPath(); ctx.moveTo(box.x0, py); ctx.lineTo(box.x1, py); ctx.stroke();
      ctx.fillStyle = cssVar("text-faint");
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(yfmt(yv), box.x0 - 6, py);
    }
    for (var j = 0; j <= nx; j++) {
      var xv = o.x[0] + (o.x[1] - o.x[0]) * j / nx;
      var px = Math.round(sx(xv)) + 0.5;
      ctx.strokeStyle = cssVar("grid");
      ctx.beginPath(); ctx.moveTo(px, box.y0); ctx.lineTo(px, box.y1); ctx.stroke();
      ctx.fillStyle = cssVar("text-faint");
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(xfmt(xv), px, box.y1 + 6);
    }
    ctx.strokeStyle = cssVar("axis");
    ctx.beginPath(); ctx.moveTo(box.x0, box.y0); ctx.lineTo(box.x0, box.y1); ctx.lineTo(box.x1, box.y1); ctx.stroke();
    ctx.font = "12px " + cssVar("font");
    ctx.fillStyle = cssVar("text-dim");
    if (o.xlabel) { ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(o.xlabel, box.x1, h - 2); }
    if (o.ylabel) { ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(o.ylabel, box.x0 + 6, box.y0); }
    ctx.restore();
    return { x: sx, y: sy, box: box };
  }

  function line(ctx, pts, color, width, dash) {
    if (!pts.length) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width || 2;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    ctx.restore();
  }

  function hline(ctx, f, v, color, label, dash) {
    var y = Math.round(f.y(v)) + 0.5;
    line(ctx, [[f.box.x0, y], [f.box.x1, y]], color, 1.5, dash || [5, 4]);
    if (label) {
      ctx.save(); ctx.font = "11px " + cssVar("font"); ctx.fillStyle = color;
      ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(label, f.box.x1 - 4, y - 3); ctx.restore();
    }
  }

  function vline(ctx, f, v, color, label, dash) {
    var x = Math.round(f.x(v)) + 0.5;
    line(ctx, [[x, f.box.y0], [x, f.box.y1]], color, 1.5, dash || [5, 4]);
    if (label) {
      ctx.save(); ctx.font = "11px " + cssVar("font"); ctx.fillStyle = color;
      ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(label, x + 4, f.box.y0 + 2); ctx.restore();
    }
  }

  /* histogram(values, lo, hi, bins) -> counts array */
  function histogram(values, lo, hi, bins) {
    var c = new Array(bins).fill(0);
    values.forEach(function (v) {
      var k = Math.floor((v - lo) / (hi - lo) * bins);
      if (k >= 0 && k < bins) c[k] += 1;
    });
    return c;
  }

  function bars(ctx, f, counts, lo, hi, colorFn) {
    var bw = (hi - lo) / counts.length;
    counts.forEach(function (n, i) {
      var x0 = f.x(lo + i * bw), x1 = f.x(lo + (i + 1) * bw);
      var y = f.y(n);
      ctx.fillStyle = colorFn(lo + (i + 0.5) * bw, i);
      ctx.fillRect(x0 + 0.5, y, Math.max(1, x1 - x0 - 1), f.box.y1 - y);
    });
  }

  function text(ctx, s, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = (o.weight || "") + " " + (o.size || 12) + "px " + cssVar(o.mono ? "mono" : "font");
    ctx.fillStyle = o.color || cssVar("text");
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.base || "middle";
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.restore();
  }

  /* Animation loop that pauses when the canvas is off-screen. step(dtSeconds) returns false to stop. */
  function loop(canvasEl, step) {
    var visible = true, running = false, last = 0;
    function frameFn(t) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (visible && step(dt) === false) { running = false; return; }
      requestAnimationFrame(frameFn);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; last = 0; }).observe(canvasEl);
    }
    return {
      start: function () { if (!running) { running = true; last = 0; requestAnimationFrame(frameFn); } },
      stop: function () { running = false; },
      get running() { return running; }
    };
  }

  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return NaN;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1));
  }
  function quantile(a, q) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return s[lo] + (s[hi] - s[lo]) * (p - lo);
  }

  window.Book = {
    book: BOOK_ID,
    books: BOOKS,
    chapters: CHAPTERS,
    css: cssVar,
    alpha: alpha,
    canvas: canvas,
    rng: rng,
    bind: bind,
    scale: scale,
    frame: frame,
    line: line,
    hline: hline,
    vline: vline,
    histogram: histogram,
    bars: bars,
    text: text,
    roundRect: roundRect,
    loop: loop,
    mean: mean,
    sd: sd,
    quantile: quantile,
    onTheme: function (fn) { listeners.push(fn); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var cur = current();
    buildTopbar(cur);
    var main = document.querySelector("main.chapter");
    if (main) {
      numberFigures(main, cur);
      buildToc(main);
      if (cur.ch.id !== "index") buildChapterNav(main, cur);
    }
    wireTerms();
    wireQuizzes();
  });
})();
/* euiyun preset add-on (optional): paints the filled part of range tracks by setting --fill on each
   input[type=range]. Load after book.js. Without it the euiyun track shows no fill (Firefox fills natively).
   Scripts that set slider.value directly should call Euiyun.fill(slider) afterwards. */
(function () {
  "use strict";
  function fill(r) {
    var min = parseFloat(r.min || "0"), max = parseFloat(r.max || "100"), v = parseFloat(r.value);
    var pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    r.style.setProperty("--fill", Math.max(0, Math.min(100, pct)) + "%");
  }
  function all() { document.querySelectorAll('input[type="range"]').forEach(fill); }
  document.addEventListener("input", function (e) { if (e.target.matches && e.target.matches('input[type="range"]')) fill(e.target); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", all); else all();
  window.addEventListener("load", all);
  window.Euiyun = { fill: fill, fillAll: all };
})();

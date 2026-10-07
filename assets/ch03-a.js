/* ch03-a.js: saturating-counter animation, alternating-pattern PREDICT, SC threshold lab.
   Rules follow src/main/scala/xiangshan/frontend/bpu/SaturateCounter.scala and sc/Sc.scala @09453ff8. */

/* Shared helpers for the ch03 scripts. */
var Ch03 = (function () {
  "use strict";
  /* unsigned saturating counter of width w: +1/-1, hold at 0 and 2^w-1 (SaturateCounter.scala:65) */
  function upd(v, taken, w) {
    var max = (1 << w) - 1;
    if (taken) return v < max ? v + 1 : v;
    return v > 0 ? v - 1 : v;
  }
  function pos(v, w) { return v >= (1 << (w - 1)); } /* isPositive = MSB */
  function weak(v, w) { return v === (1 << (w - 1)) || v === (1 << (w - 1)) - 1; }
  function segInit(seg, cb) {
    var bs = Array.prototype.slice.call(seg.querySelectorAll("button"));
    bs.forEach(function (b) {
      b.addEventListener("click", function () {
        bs.forEach(function (x) { x.classList.toggle("on", x === b); });
        if (cb) cb(b.getAttribute("data-v"), bs.indexOf(b));
      });
    });
    return function () { var k = bs.findIndex(function (b) { return b.classList.contains("on"); }); return bs[k].getAttribute("data-v") || k; };
  }
  function pct(a, n) { return n ? (100 * a / n).toFixed(1) + "%" : "-"; }
  return { upd: upd, pos: pos, weak: weak, segInit: segInit, pct: pct };
})();

/* Sim 1: 1/2/3-bit counters on synthetic traces. */
(function () {
  "use strict";
  var root = document.getElementById("sim-cnt");
  if (!root) return;
  var W = [1, 2, 3], INIT = [0, 1, 3]; /* weak not-taken for w>=2; 0 for the 1-bit counter */
  var biasSeq = (function () { var r = Book.rng(7), a = []; for (var i = 0; i < 400; i++) a.push(r.next() < 0.9); return a; })();
  var MAXN = 200;
  var st;
  var getTrace = Ch03.segInit(document.getElementById("cnt-trace"), function () { anim.stop(); reset(); });
  function outcome(i) {
    var t = getTrace();
    if (t === "loop") return i % 4 !== 3;
    if (t === "alt") return i % 2 === 0;
    return biasSeq[i % biasSeq.length];
  }
  function reset() {
    st = { n: 0, ctr: INIT.slice(), hits: [0, 0, 0], hist: [] };
    cv.redraw(); show(null);
  }
  function step() {
    var a = outcome(st.n), rec = { a: a, p: [], c: [] };
    for (var k = 0; k < 3; k++) {
      var p = Ch03.pos(st.ctr[k], W[k]);
      if (p === a) st.hits[k]++;
      st.ctr[k] = Ch03.upd(st.ctr[k], a, W[k]);
      rec.p.push(p); rec.c.push(st.ctr[k]);
    }
    st.hist.push(rec); st.n++;
    cv.redraw(); show(rec);
  }
  function draw(ctx, w, h) {
    var lab = 58, cell = 22, K = Math.max(6, Math.min(30, Math.floor((w - lab - 70) / cell)));
    var rows = ["실제", "1비트", "2비트", "3비트"], top = 26, rh = (h - top - 24) / 4;
    Book.text(ctx, "최근 " + K + "개 분기 (칸 = 예측, 색 = 적중)", lab, 12, { size: 12, color: Book.css("text-dim") });
    var start = Math.max(0, st.hist.length - K);
    rows.forEach(function (r, ri) {
      var y = top + ri * rh + rh / 2;
      Book.text(ctx, r, 6, y, { size: 13, weight: 700, color: Book.css("text") });
      for (var j = 0; j < K; j++) {
        var rec = st.hist[start + j], x = lab + j * cell;
        if (!rec) { Book.roundRect(ctx, x, y - 10, cell - 3, 20, 4, null, Book.css("border")); continue; }
        var txt, fill;
        if (ri === 0) { txt = rec.a ? "T" : "N"; fill = Book.css("surface"); }
        else { var p = rec.p[ri - 1]; txt = p ? "T" : "N"; fill = p === rec.a ? Book.css("ok-soft") : Book.css("bad-soft"); }
        Book.roundRect(ctx, x, y - 10, cell - 3, 20, 4, fill, Book.css("border"));
        Book.text(ctx, txt, x + (cell - 3) / 2, y, { size: 11, mono: true, align: "center", color: Book.css("text") });
      }
      if (ri > 0) {
        var k = ri - 1, vx = lab + K * cell + 8;
        Book.text(ctx, "ctr " + st.ctr[k], vx, y - 7, { size: 12, mono: true, color: Book.css("accent") });
        Book.text(ctx, Ch03.pos(st.ctr[k], W[k]) ? "→ T" : "→ N", vx, y + 9, { size: 11, mono: true, color: Book.css("text-dim") });
      }
    });
    Book.text(ctx, "분기 번호 " + start + " … " + (start + K - 1), lab, h - 10, { size: 11, mono: true, color: Book.css("text-faint") });
  }
  var cv = Book.canvas(document.getElementById("cnt-cv"), draw);
  function show(rec) {
    document.getElementById("cnt-n").textContent = st.n;
    ["cnt-a1", "cnt-a2", "cnt-a3"].forEach(function (id, k) { document.getElementById(id).textContent = Ch03.pct(st.hits[k], st.n); });
    var v = document.getElementById("cnt-verdict");
    if (!rec) { v.className = "verdict grey"; v.textContent = "대기: 아직 분기가 없다"; return; }
    var miss = rec.p.filter(function (p) { return p !== rec.a; }).length;
    v.className = "verdict " + (miss === 0 ? "ok" : miss === 3 ? "bad" : "warn");
    v.textContent = (st.n) + "번째 실제 " + (rec.a ? "T" : "N") + ": 셋 중 " + (3 - miss) + "개 적중";
  }
  var anim = Book.loop(document.getElementById("cnt-cv"), function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.12) return true;
    anim.acc = 0; step();
    return st.n < MAXN;
  });
  document.getElementById("cnt-step").addEventListener("click", function () { anim.stop(); step(); });
  document.getElementById("cnt-play").addEventListener("click", function () { if (st.n >= MAXN) reset(); anim.start(); });
  document.getElementById("cnt-reset").addEventListener("click", function () { anim.stop(); reset(); });
  st = { n: 0, ctr: INIT.slice(), hits: [0, 0, 0], hist: [] };
  show(null);
})();

/* Sim 2 (PREDICT): alternating TNTN with one 2-bit counter vs two counters chosen by 1 bit of history. */
(function () {
  "use strict";
  var seg = document.getElementById("pre-choice");
  if (!seg) return;
  var pick = Ch03.segInit(seg);
  document.getElementById("pre-run").addEventListener("click", function () {
    var c = 1, hc = [1, 1], last = 0, hitC = 0, hitH = 0, N = 100;
    for (var i = 0; i < N; i++) {
      var a = i % 2 === 0;
      if (Ch03.pos(c, 2) === a) hitC++;
      c = Ch03.upd(c, a, 2);
      if (Ch03.pos(hc[last], 2) === a) hitH++;
      hc[last] = Ch03.upd(hc[last], a, 2);
      last = a ? 1 : 0;
    }
    var actual = hitC >= 90 ? 0 : hitC >= 30 ? 1 : 2;
    var me = pick();
    var out = document.getElementById("pre-out");
    out.className = "verdict " + (me === actual ? "ok" : "warn");
    out.textContent = (me === actual ? "맞았다. " : "빗나갔다. ") + "2비트 카운터는 100번 중 " + hitC + "번 맞혔다. 1과 2 사이를 오가며 늘 반대로 찍는다.";
    document.getElementById("pre-c").textContent = hitC + " / " + N;
    document.getElementById("pre-h").textContent = hitH + " / " + N;
  });
})();

/* Sim 4 (LAB): SC sum vs TAGE-confidence threshold (sc/Sc.scala:267-314). */
(function () {
  "use strict";
  var root = document.getElementById("sim-sc");
  if (!root) return;
  var P = Book.bind(root, function () { cv.redraw(); show(); });
  function calc() {
    var ps = function (c) { return 2 * c + 1; }; /* getPercsum = Cat(ctr, 1) */
    var parts = [
      ["path", 2 * ps(P.path)], ["global", 2 * ps(P.glob)], ["bw", 2 * ps(P.bw)],
      ["imli", ps(P.imli)], ["bias", ps(P.bias)]
    ];
    var sum = parts.reduce(function (s, p) { return s + p[1]; }, 0);
    var t = P.tage | 0, sh = (t === 0 || t === 7) ? 4 : (t === 3 || t === 4) ? 6 : 5;
    var th = P.thr >> sh;
    var above = (sum > th) || (sum < -th);
    var scPred = sum >= 0, tagePred = t >= 4;
    return { parts: parts, sum: sum, sh: sh, th: th, use: above, scPred: scPred, tagePred: tagePred, fin: above ? scPred : tagePred };
  }
  function draw(ctx, w, h) {
    var r = calc(), lab = 64, x0 = lab, x1 = w - 14, cx = (x0 + x1) / 2;
    var R = Math.min(520, Math.max(80, 1.3 * Math.max(P.thr >> 4, Math.abs(r.sum)))); /* zoom so bars stay readable */
    var sx = function (v) { return cx + v / R * (x1 - cx); };
    var rows = r.parts.concat([["합", r.sum]]), top = 20, rh = (h - top - 30) / rows.length;
    [4, 5, 6].forEach(function (s) {
      var t = P.thr >> s, on = s === r.sh, col = on ? Book.css("warn") : Book.css("text-faint");
      Book.line(ctx, [[sx(t), top - 6], [sx(t), h - 30]], col, on ? 2 : 1, on ? null : [3, 4]);
      Book.line(ctx, [[sx(-t), top - 6], [sx(-t), h - 30]], col, on ? 2 : 1, on ? null : [3, 4]);
      if (on) Book.text(ctx, "±" + t, sx(t) + 4, top - 8, { size: 11, mono: true, color: col });
    });
    Book.line(ctx, [[cx, top - 6], [cx, h - 30]], Book.css("axis"), 1);
    rows.forEach(function (p, i) {
      var y = top + i * rh + rh / 2, v = p[1], last = i === rows.length - 1;
      Book.text(ctx, p[0], 6, y, { size: 12, weight: last ? 700 : 400, color: Book.css("text") });
      var col = last ? (r.use ? Book.css("accent") : Book.css("grey")) : (v >= 0 ? Book.css("ok") : Book.css("bad"));
      var a = sx(Math.min(0, v)), b = sx(Math.max(0, v));
      Book.roundRect(ctx, a, y - rh * 0.3, Math.max(2, b - a), rh * 0.6, 3, col, null);
      Book.text(ctx, String(v), v >= 0 ? b + 4 : a - 4, y, { size: 11, mono: true, align: v >= 0 ? "left" : "right", color: Book.css("text-dim") });
    });
    [-Math.round(R), 0, Math.round(R)].forEach(function (v) { Book.text(ctx, String(v), sx(v), h - 14, { size: 11, mono: true, align: "center", color: Book.css("text-faint") }); });
  }
  var cv = Book.canvas(document.getElementById("sc-cv"), draw);
  function show() {
    var r = calc();
    var cls = ["", "", "", "", "포화", "mid", "weak"][r.sh];
    document.getElementById("sc-sum").textContent = r.sum;
    document.getElementById("sc-th").textContent = P.thr + ">>" + r.sh + " = " + r.th + " (" + cls + ")";
    document.getElementById("sc-tp").textContent = r.tagePred ? "taken" : "not-taken";
    document.getElementById("sc-fin").textContent = (r.fin ? "taken" : "not-taken") + (r.use ? " (SC)" : " (TAGE)");
    var v = document.getElementById("sc-verdict");
    if (!r.use) { v.className = "verdict grey"; v.textContent = "|합| ≤ " + r.th + ": SC 불사용, TAGE 답 유지"; }
    else if (r.scPred !== r.tagePred) { v.className = "verdict warn"; v.textContent = "|합| > " + r.th + ": SC가 TAGE를 뒤집는다"; }
    else { v.className = "verdict ok"; v.textContent = "|합| > " + r.th + ": SC 사용, TAGE와 같은 답"; }
  }
  show();
})();

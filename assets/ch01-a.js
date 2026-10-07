/* ch01-a.js: 1장 시뮬레이터 A~C (파이프라인 재생기, 순차 대 비순차 PREDICT, 폭 대 IPC).
   모두 일반 교과서 모델의 장난감이다. 색은 Book.css 토큰으로만 읽는다. */

function ch01Seg(id, onPick) {
  var seg = document.getElementById(id);
  var bs = Array.prototype.slice.call(seg.querySelectorAll("button"));
  bs.forEach(function (b, i) {
    b.addEventListener("click", function () {
      bs.forEach(function (x) { x.classList.toggle("on", x === b); });
      if (onPick) onPick(i);
    });
  });
  return function () { return bs.findIndex(function (b) { return b.classList.contains("on"); }); };
}
function ch01Fill(el) { if (window.Euiyun && Euiyun.fill) Euiyun.fill(el); }

/* ---------- A. 5단 파이프라인 재생기 ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-pipe");
  if (!root) return;
  /* rd: 쓰는 레지스터, rs: 읽는 레지스터, ld: 로드, br: 분기(taken) */
  var PROG = [
    { s: "lw  x1,0(x2)", rd: 1, rs: [2], ld: true },
    { s: "add x3,x1,x4", rd: 3, rs: [1, 4] },
    { s: "sub x5,x6,x7", rd: 5, rs: [6, 7] },
    { s: "beq x5,x0,L", rd: 0, rs: [5], br: true }, /* taken: 아래 xor·and(PC+4, PC+8)를 건너뛴다 */
    { s: "L: or x8,x3,x5", rd: 8, rs: [3, 5] },
    { s: "sw  x8,4(x2)", rd: 0, rs: [8, 2] }
  ];
  var ST = ["F", "D", "E", "M", "W"];

  /* 각 행: {s, cells: {cycle: 글자}, wb, kind} . 글자 "-"=멈춤, "x"=버림 */
  function schedule(mode) {
    var rows = [], i, r, c;
    if (mode === 0) { /* 비파이프라인: 앞 명령어가 W를 끝내야 다음 F */
      var t = 1;
      PROG.forEach(function (p) {
        r = { s: p.s, cells: {}, wb: 0 };
        for (c = 0; c < 5; c++) r.cells[t + c] = ST[c];
        r.wb = t + 4; t += 5; rows.push(r);
      });
      return rows;
    }
    var hz = mode === 2, prev = null, list = [];
    PROG.forEach(function (p) {
      list.push(p);
      if (hz && p.br) { list.push({ s: "xor x9,x3,x5", wrong: true, rs: [] }); list.push({ s: "and x9,x9,x6", wrong: true, rs: [] }); }
    });
    var flushAt = 0;
    for (i = 0; i < list.length; i++) {
      var p = list[i];
      r = { s: p.s, cells: {}, wb: 0, wrong: !!p.wrong };
      var F = prev ? Math.max(prev.F + 1, prev.D) : 1; /* 앞 명령어가 F를 비워야 들어온다 */
      if (flushAt && !p.wrong) F = Math.max(F, flushAt);
      var D = Math.max(F + 1, prev ? prev.Dend + 1 : 0);
      var E = Math.max(D + 1, prev ? prev.E + 1 : 0);
      if (hz && prev && prev.ld && p.rs.indexOf(prev.rd) >= 0) E = Math.max(E, prev.E + 2); /* 로드-사용 */
      var Dend = E - 1;
      for (c = F; c < D; c++) r.cells[c] = "F";
      r.cells[D] = "D";
      for (c = D + 1; c <= Dend; c++) r.cells[c] = "-";
      if (p.wrong) {
        var stop = flushAt; /* 분기 판정 다음 사이클에 버림 */
        Object.keys(r.cells).forEach(function (k) { if (+k >= stop) delete r.cells[k]; });
        r.cells[stop] = "x"; r.wb = 0; rows.push(r);
        prev = { F: F, D: D, Dend: Dend, E: E, rd: -1 };
        continue;
      }
      r.cells[E] = "E"; r.cells[E + 1] = "M"; r.cells[E + 2] = "W"; r.wb = E + 2;
      if (hz && p.br) flushAt = E + 1;
      prev = { F: F, D: D, Dend: Dend, E: E, rd: p.rd, ld: p.ld };
      rows.push(r);
    }
    return rows;
  }

  var mode = 0, rows = schedule(0), t = 0;
  var slider = document.getElementById("pipe-t");
  function total() { return rows.reduce(function (m, r) { return Math.max(m, r.wb, Math.max.apply(null, Object.keys(r.cells).map(Number))); }, 0); }
  function bubbles() {
    var n = 0;
    rows.forEach(function (r) { Object.keys(r.cells).forEach(function (k) { if (r.cells[k] === "-") n++; }); if (r.wrong) n++; });
    return n;
  }

  var cv = Book.canvas(document.getElementById("pipe-cv"), function (ctx, w, h) {
    var T = total(), lw = Math.min(118, w * 0.34), top = 26, rh = Math.min(30, (h - top - 8) / rows.length);
    var cw = (w - lw - 6) / T;
    for (var c = 1; c <= T; c++) {
      var x = lw + (c - 1) * cw;
      if (c === t) ctx.fillStyle = Book.css("accent-soft"), ctx.fillRect(x, top - 4, cw, rows.length * rh + 4);
      if (cw >= 14 || c % 5 === 0 || c === 1) Book.text(ctx, String(c), x + cw / 2, 12, { size: 10, mono: true, align: "center", color: Book.css("text-faint") });
    }
    rows.forEach(function (r, i) {
      var y = top + i * rh;
      Book.text(ctx, r.s, 4, y + rh / 2, { size: lw < 100 ? 10 : 11, mono: true, color: r.wrong ? Book.css("text-faint") : Book.css("text") });
      Object.keys(r.cells).forEach(function (k) {
        var cyc = +k, g = r.cells[k], x = lw + (cyc - 1) * cw;
        if (cyc > t) { ctx.strokeStyle = Book.css("border"); ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 2.5, Math.max(2, cw - 3), rh - 5); return; } /* 아직 오지 않은 칸: 윤곽만 */
        var col = g === "-" ? Book.css("warn-soft") : g === "x" ? Book.css("bad-soft") : r.wrong ? Book.css("grey-soft") : g === "W" ? Book.css("ok-soft") : Book.css("accent-soft");
        var st = g === "-" ? Book.css("warn") : g === "x" ? Book.css("bad") : r.wrong ? Book.css("grey") : g === "W" ? Book.css("ok") : Book.css("accent");
        Book.roundRect(ctx, x + 1, y + 2, Math.max(2, cw - 2), rh - 4, 3, col, st);
        if (cw >= 12) Book.text(ctx, g === "-" ? "·" : g === "x" ? "×" : g, x + cw / 2, y + rh / 2, { size: 11, mono: true, align: "center", weight: "700", color: st });
      });
    });
  });

  function show() {
    var T = total(), done = rows.filter(function (r) { return r.wb && r.wb <= t; }).length;
    document.getElementById("pipe-ro-c").textContent = t;
    document.getElementById("pipe-ro-n").textContent = done + " / " + PROG.length;
    document.getElementById("pipe-ro-ipc").textContent = (PROG.length / T).toFixed(2);
    document.getElementById("pipe-ro-bub").textContent = bubbles();
    document.getElementById("pipe-t-out").textContent = t + " / " + T;
    var v = document.getElementById("pipe-verdict"), stall = null, flush = null;
    rows.forEach(function (r) { if (r.cells[t] === "-") stall = r; if (r.cells[t] === "x") flush = r; });
    if (t === 0) { v.className = "verdict grey"; v.textContent = "대기: 재생 또는 한 사이클을 누른다"; }
    else if (flush) { v.className = "verdict bad"; v.textContent = "사이클 " + t + ": beq가 EX에서 taken으로 판정, 오경로 2개를 버린다"; }
    else if (stall) { v.className = "verdict warn"; v.textContent = "사이클 " + t + ": " + stall.s + " 명령어가 lw 결과를 기다려 ID에 머문다"; }
    else if (t >= T) { v.className = "verdict ok"; v.textContent = "끝: " + PROG.length + "개 명령어, " + T + "사이클, IPC " + (PROG.length / T).toFixed(2); }
    else { v.className = "verdict grey"; v.textContent = "사이클 " + t + " 진행 중"; }
  }
  function setT(v) { t = Math.max(0, Math.min(total(), v)); slider.value = t; ch01Fill(slider); cv.redraw(); show(); }
  function setMode(m) { mode = m; rows = schedule(m); slider.max = total(); anim.stop(); setT(0); }

  var acc = 0;
  var anim = Book.loop(cv.ctx.canvas, function (dt) {
    acc += dt; if (acc < 0.35) return true; acc = 0;
    setT(t + 1); return t < total();
  });
  ch01Seg("pipe-mode", setMode);
  slider.addEventListener("input", function () { anim.stop(); setT(+slider.value); });
  document.getElementById("pipe-play").addEventListener("click", function () { if (t >= total()) setT(0); anim.start(); });
  document.getElementById("pipe-step").addEventListener("click", function () { anim.stop(); setT(t + 1); });
  document.getElementById("pipe-reset").addEventListener("click", function () { anim.stop(); setT(0); });
  setMode(0);
})();

/* ---------- B. 순차 대 비순차 PREDICT ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-ooo");
  if (!root) return;
  /* lat: null이면 미스 지연 슬라이더 값 */
  var PROG = [
    { s: "ld  x1,0(x10)", d: [], lat: null },
    { s: "add x2,x1,x3", d: [0], lat: 1 },
    { s: "mul x4,x5,x6", d: [], lat: 3 },
    { s: "add x7,x4,x8", d: [2], lat: 1 },
    { s: "sub x9,x5,x6", d: [], lat: 1 },
    { s: "ld  x11,8(x10)", d: [], lat: 3 },
    { s: "add x12,x11,x9", d: [5, 4], lat: 1 },
    { s: "xor x13,x2,x12", d: [1, 6], lat: 1 }
  ];
  var CW = 4; /* 커밋 폭 */

  /* 발행 폭 1. ooo=false면 프로그램 순서로만 발행. 결과: 행마다 {dis, iss, done, cmt} */
  function run(ooo, lat, win) {
    var n = PROG.length, R = PROG.map(function () { return { dis: -1, iss: -1, done: -1, cmt: -1 }; });
    var nextDis = 0, nextCmt = 0;
    for (var cyc = 0; cyc < 2000 && nextCmt < n; cyc++) {
      /* 커밋: 순서대로, 완료된 것만, 최대 CW개 */
      for (var k = 0; k < CW && nextCmt < n; k++) {
        var c = R[nextCmt];
        if (c.done >= 0 && c.done <= cyc) { c.cmt = cyc; nextCmt++; } else break;
      }
      /* 발행: 1개 */
      var pick = -1;
      for (var i = 0; i < nextDis; i++) {
        if (R[i].iss >= 0) continue;
        var ready = PROG[i].d.every(function (j) { return R[j].done >= 0 && R[j].done <= cyc; });
        if (!ooo) { if (ready) pick = i; break; } /* 순차: 가장 오래된 미발행 하나만 본다 */
        if (ready) { pick = i; break; }
      }
      if (pick >= 0) { R[pick].iss = cyc; R[pick].done = cyc + (PROG[pick].lat === null ? lat : PROG[pick].lat); }
      /* 디스패치: 1개, 창(아직 커밋 안 된 수) < win */
      if (nextDis < n && nextDis - nextCmt < win) { R[nextDis].dis = cyc; nextDis++; }
    }
    var end = R.reduce(function (m, r) { return Math.max(m, r.cmt); }, 0) + 1;
    return { R: R, end: end };
  }

  var P, res = {}, revealed = false;
  var pickOf = ch01Seg("ooo-choice", function () { if (revealed) judge(); });
  function compute() { res.io = run(false, P.lat, P.win); res.oo = run(true, P.lat, P.win); }
  function actual() {
    var r = res.oo.R, mul = r[2];
    if (mul.cmt === r[7].cmt) return 2;
    if (mul.cmt <= mul.done) return 0;
    return 1;
  }
  var NAMES = ["실행 직후", "ld 커밋 이후", "프로그램 끝"];
  function judge() {
    var a = actual(), pk = pickOf(), r = res.oo.R, out = document.getElementById("ooo-out");
    out.className = "verdict " + (pk === a ? "ok" : "warn");
    out.textContent = (pk === a ? "맞았다. " : "빗나갔다. ") + "실제: " + NAMES[a] + " (mul 끝남 " + r[2].done + ", ld 커밋 " + r[0].cmt + ", mul 커밋 " + r[2].cmt + ")";
  }
  function show() {
    document.getElementById("ooo-ro-in").innerHTML = res.io.end + "<small>cyc</small>";
    document.getElementById("ooo-ro-oo").innerHTML = res.oo.end + "<small>cyc</small>";
    var sv = res.io.end - res.oo.end;
    document.getElementById("ooo-ro-save").textContent = sv + " (" + Math.round(100 * sv / res.io.end) + "%)";
    var m = res.oo.R[2];
    document.getElementById("ooo-ro-mul").textContent = m.done + " → " + m.cmt;
  }

  var cv = Book.canvas(document.getElementById("ooo-cv"), function (ctx, w, h) {
    if (!res.io) return;
    var T = Math.max(res.io.end, res.oo.end), lw = Math.min(112, w * 0.3), half = (h - 30) / 2;
    var sx = function (c) { return lw + (c / T) * (w - lw - 8); };
    [["순차 코어", res.io, 0], ["비순차 코어", res.oo, 1]].forEach(function (pp) {
      var y0 = 4 + pp[2] * (half + 6), rh = (half - 18) / PROG.length, R = pp[1].R;
      Book.text(ctx, pp[0] + " · " + pp[1].end + "사이클", 4, y0 + 7, { size: 12, weight: "700", color: Book.css(pp[2] ? "accent" : "text") });
      R.forEach(function (r, i) {
        var y = y0 + 18 + i * rh, mid = y + rh / 2;
        Book.text(ctx, PROG[i].s, 4, mid, { size: lw < 100 ? 9 : 10, mono: true, color: Book.css("text-dim") });
        ctx.fillStyle = Book.css("grey-soft"); ctx.fillRect(sx(r.dis), mid - 1, Math.max(1, sx(r.iss) - sx(r.dis)), 2);
        var miss = PROG[i].lat === null;
        Book.roundRect(ctx, sx(r.iss), y + 2, Math.max(3, sx(r.done) - sx(r.iss)), rh - 4, 2, Book.css(miss ? "bad-soft" : "accent-soft"), Book.css(miss ? "bad" : "accent"));
        ctx.fillStyle = Book.css("warn"); ctx.fillRect(sx(r.done), mid - 1, Math.max(0, sx(r.cmt) - sx(r.done)), 2);
        ctx.fillStyle = Book.css("ok"); ctx.fillRect(sx(r.cmt) - 1, y + 1, 3, rh - 2);
        if (i === 2 && pp[2]) Book.text(ctx, "mul", sx(r.done) + 4, y - 1, { size: 9, color: Book.css("warn"), base: "top" });
      });
    });
    var ly = h - 10;
    [["실행", "accent"], ["미스", "bad"], ["커밋 대기", "warn"], ["커밋", "ok"]].forEach(function (L, i) {
      var x = 6 + i * Math.min(90, (w - 12) / 4);
      ctx.fillStyle = Book.css(L[1]); ctx.fillRect(x, ly - 4, 10, 8);
      Book.text(ctx, L[0], x + 14, ly, { size: 10, color: Book.css("text-dim") });
    });
  });

  P = Book.bind(root, function () { compute(); cv.redraw(); show(); if (revealed) judge(); });
  document.getElementById("ooo-run").addEventListener("click", function () { revealed = true; judge(); });
  compute(); cv.redraw(); show();
})();

/* ---------- C. 폭 대 IPC ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-ipc");
  if (!root) return;
  var N = 3000, ROB = 352;
  var CAP = { alu: 6, br: 3, ld: 3, st: 2 }; /* Parameters.scala:341-445의 ALU·BJU·LDU·STA 수. 스토어는 STA 하나로 본다(STD 생략) */
  var LAT = { alu: 1, br: 1, ld: 4, st: 1 };

  function stream(dep, ldf) {
    var rng = Book.rng(4242), s = [];
    for (var i = 0; i < N; i++) {
      var u = rng.next(), ty = u < ldf ? "ld" : u < ldf + 0.10 ? "st" : u < ldf + 0.25 ? "br" : "alu";
      var src = [];
      for (var k = 0; k < 2; k++) if (rng.next() < dep) { var d = 1 + Math.floor(rng.next() * 8); if (i - d >= 0) src.push(i - d); }
      s.push({ ty: ty, src: src });
    }
    return s;
  }
  function sim(s, w, cap) {
    var done = new Array(N), iss = new Array(N), nDis = 0, nCmt = 0, wait = [], cyc = 0;
    for (; nCmt < N && cyc < 100000; cyc++) {
      var c = 0;
      while (c < w && nCmt < N && iss[nCmt] && done[nCmt] <= cyc) { nCmt++; c++; }
      var used = { alu: 0, br: 0, ld: 0, st: 0 }, keep = [];
      for (var j = 0; j < wait.length; j++) {
        var i = wait[j], p = s[i];
        var ok = p.src.every(function (q) { return iss[q] && done[q] <= cyc; });
        if (ok && (!cap || used[p.ty] < CAP[p.ty])) { used[p.ty]++; iss[i] = true; done[i] = cyc + LAT[p.ty]; }
        else keep.push(i);
      }
      wait = keep;
      for (c = 0; c < w && nDis < N && nDis - nCmt < ROB; c++) wait.push(nDis++);
    }
    return N / cyc;
  }

  var P, curve = { cap: [], free: [] }, key = "";
  function compute() {
    var k = P.dep + "|" + P.ld;
    if (k === key) return; key = k;
    var s = stream(P.dep, P.ld);
    curve = { cap: [], free: [] };
    for (var w = 1; w <= 12; w++) { curve.cap.push(sim(s, w, true)); curve.free.push(sim(s, w, false)); }
  }
  var cv = Book.canvas(document.getElementById("ipc-cv"), function (ctx, w, h) {
    if (!curve.cap.length) return;
    var ymax = Math.ceil(Math.max.apply(null, curve.free.concat(curve.cap)) + 0.5);
    var f = Book.frame(ctx, w, h, { x: [1, 12], y: [0, ymax], xlabel: "폭", ylabel: "IPC", xticks: 11, yticks: Math.min(6, ymax), xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    Book.vline(ctx, f, 8, Book.css("text-faint"), "KMHv3 폭 8", [4, 4]);
    var pts = function (a) { return a.map(function (v, i) { return [f.x(i + 1), f.y(v)]; }); };
    Book.line(ctx, pts(curve.free), Book.css("accent-2"), 2, [6, 4]);
    Book.line(ctx, pts(curve.cap), Book.css("accent"), 2.5);
    var arr = P.cap ? curve.cap : curve.free, cx = f.x(P.w), cy = f.y(arr[P.w - 1]);
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = Book.css("warn"); ctx.fill();
    Book.text(ctx, "실선: 유닛 수 제한 · 점선: 무제한", f.box.x1 - 4, f.box.y1 - 10, { size: 11, align: "right", color: Book.css("text-dim") });
  });
  function show() {
    var arr = P.cap ? curve.cap : curve.free, cur = arr[P.w - 1];
    document.getElementById("ipc-ro-cur").textContent = cur.toFixed(2);
    document.getElementById("ipc-ro-max").textContent = arr[11].toFixed(2);
    var g = P.w < 12 ? (arr[P.w] - cur) / cur : null;
    document.getElementById("ipc-ro-gain").textContent = g === null ? "-" : (g >= 0 ? "+" : "") + (100 * g).toFixed(1) + "%";
    var v = document.getElementById("ipc-verdict");
    if (g === null) { v.className = "verdict grey"; v.textContent = "폭 12: 이 실험의 오른쪽 끝"; }
    else if (g < 0.03) { v.className = "verdict warn"; v.textContent = "포화: 폭 " + P.w + " 이후로는 얻는 게 거의 없다"; }
    else { v.className = "verdict ok"; v.textContent = "폭을 늘리면 아직 오른다(+1당 " + (100 * g).toFixed(1) + "%)"; }
  }
  P = Book.bind(root, function () { compute(); cv.redraw(); show(); });
  compute(); cv.redraw(); show();
})();

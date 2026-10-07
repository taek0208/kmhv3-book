/* ch07-a.js: 3절 뱅크 예측(sim-bankpred), 뱅크 Monte Carlo(sim-bank), 4절 파이프라인 애니메이션(sim-pipe).
   규칙은 XiangShan @09453ff8 코드를 그대로 옮겼다. 입력은 합성 데이터이다. */

/* OldestArbiter (RFReadArbiter.scala:47-94). prio: 원-핫 정수 배열. 다음 우선순위를 돌려준다. */
function ch07OldestNext(vReg, rReg) {
  var n = vReg.length, out = [];
  for (var i = 0; i < n; i++) {
    var otherValid = 0, older = 0, lowerInvalid = 0;
    for (var j = 0; j < n; j++) {
      if (j === i) continue;
      if (vReg[j]) otherValid++;
      if (!vReg[j] || rReg[i] < rReg[j]) older++;
      if (j < i && !vReg[j]) lowerInvalid++;
    }
    if (vReg[i] && otherValid > 0) out.push((1 << (n - 1)) >> older);
    else out.push(1 << (otherValid > 1 ? otherValid + lowerInvalid : i));
  }
  return out;
}
/* 이번 사이클 ready: lowest set bit of OR(valid prio) 를 가진 입력만 이긴다 (:59-60, :87-89). */
function ch07OldestReady(valid, prio) {
  var merge = 0;
  for (var i = 0; i < valid.length; i++) if (valid[i]) merge |= prio[i];
  var low = merge & -merge;
  return valid.map(function (v, i) { return !v || prio[i] === low; });
}
function ch07Seg(id, onPick) {
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

/* ---------- sim-bankpred (PREDICT) ---------- */
(function () {
  "use strict";
  if (!document.getElementById("sim-bankpred")) return;
  /* 포트 7 그룹: 우선순위 순서 LDU0(7,0), ALU3 src1(7,1), BJU0 src1(7,2). Parameters.scala */
  var reqs = [{ n: "LDU0", psrc: 9, rob: 30 }, { n: "ALU3", psrc: 13, rob: 20 }, { n: "BJU0", psrc: 21, rob: 10 }];
  var grid = document.getElementById("bp-grid");
  var out = document.getElementById("bp-out");
  function bin(v) { return ("00" + v.toString(2)).slice(-3); }
  function render(res) {
    grid.innerHTML = "";
    reqs.forEach(function (r, i) {
      var d = document.createElement("div");
      d.className = "bk-cell" + (res ? (res.ready[i] ? " win" : " lose") : "");
      d.innerHTML = "<b>" + r.n + "</b>psrc " + r.psrc + " → 뱅크 " + (r.psrc & 3) + "<br>robIdx " + r.rob +
        (res ? "<br>우선순위 " + bin(res.prio[i]) : "");
      grid.appendChild(d);
    });
  }
  function clear() {
    out.className = "verdict grey"; out.textContent = "아직 확인하지 않음";
    ["bp-prio", "bp-win", "bp-alu3"].forEach(function (id) { document.getElementById(id).textContent = "-"; });
    render(null);
  }
  var hist = ch07Seg("bp-hist", clear);
  var choice = ch07Seg("bp-choice", null);
  document.getElementById("bp-run").addEventListener("click", function () {
    var past = hist() === 1;
    /* 두 사이클 전 valid/robIdx가 이번 우선순위를 정한다 (T0 → T2). */
    var prio = ch07OldestNext([past, past, past], reqs.map(function (r) { return r.rob; }));
    var ready = ch07OldestReady([true, true, true], prio);
    var win = ready.indexOf(true);
    render({ prio: prio, ready: ready });
    document.getElementById("bp-prio").textContent = prio.map(bin).join(" ");
    document.getElementById("bp-win").textContent = reqs[win].n;
    /* ALU3 src0(psrc 5)은 포트 6을 혼자 쓰므로 이긴다. uop 결과는 src1에 달렸다 (DataPath.scala:611). */
    document.getElementById("bp-alu3").textContent = ready[1] ? "OG0 통과" : "OG0 실패 (src1 패배)";
    var pick = choice();
    out.className = "verdict " + (pick === win ? "ok" : "bad");
    out.textContent = (pick === win ? "맞았다. " : "빗나갔다. ") + "실제 승자: " + reqs[win].n +
      (past ? " (가장 오래된 robIdx 10)" : " (입력 순서 우선)");
  });
  clear();
})();

/* ---------- sim-bank (Monte Carlo) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-bank");
  if (!root) return;
  /* EXU별 소스의 (포트, 우선순위). Parameters.scala:340-452 */
  var EXUS = [
    [[0, 0], [1, 0]], [[1, 1], [7, 2]], [[2, 0], [3, 0]], [[3, 1], [9, 2]], [[4, 0], [5, 0]], [[5, 1], [11, 2]],
    [[6, 0], [7, 1]], [[8, 0], [9, 1]], [[10, 0], [11, 1]], [[7, 0]], [[9, 0]], [[11, 0]],
    [[6, 1]], [[8, 1]], [[0, 1]], [[2, 1]]
  ];
  var groups = {};
  EXUS.forEach(function (srcs, e) {
    srcs.forEach(function (s, k) { (groups[s[0]] = groups[s[0]] || []).push({ e: e, k: k, pr: s[1] }); });
  });
  var slot = {}; /* "e,k" -> [port, index in group] */
  Object.keys(groups).forEach(function (p) {
    groups[p].sort(function (a, b) { return a.pr - b.pr; });
    groups[p].forEach(function (m, idx) { slot[m.e + "," + m.k] = [+p, idx]; });
  });
  var CYCLES = 3000, seed = 7;
  var P = Book.bind(root, function () { run(); });
  var res = null;
  var cv = Book.canvas(document.getElementById("bank-cv"), draw);

  function simulate(nb) {
    var rng = Book.rng(seed);
    var arb = {};
    Object.keys(groups).forEach(function (p) {
      var n = groups[p].length;
      for (var b = 0; b < nb; b++) {
        var pr = [], z = [];
        for (var i = 0; i < n; i++) { pr.push(1 << i); z.push(false); }
        arb[p + ":" + b] = { n: n, prio: pr, vReg: z.slice(), rReg: z.map(function () { return 0; }) };
      }
    });
    var issued = 0, failed = 0;
    for (var c = 0; c < CYCLES; c++) {
      var reqs = {}; /* key -> {valid[], rob[]} */
      var uops = [];
      EXUS.forEach(function (srcs, e) {
        var go = rng.next() < P.p, rob = rng.next();
        var rd = srcs.map(function () { return { rf: rng.next() < P.r, psrc: rng.int(1, 223) }; });
        if (!go) return;
        var u = { reads: [] };
        srcs.forEach(function (s, k) {
          if (!rd[k].rf) return;
          var sl = slot[e + "," + k], key = sl[0] + ":" + (rd[k].psrc % nb);
          var a = arb[key];
          if (!reqs[key]) reqs[key] = { valid: new Array(a.n).fill(false), rob: new Array(a.n).fill(0) };
          reqs[key].valid[sl[1]] = true; reqs[key].rob[sl[1]] = rob;
          u.reads.push([key, sl[1]]);
        });
        uops.push(u);
      });
      var ready = {};
      Object.keys(arb).forEach(function (key) {
        var a = arb[key], q = reqs[key] || { valid: new Array(a.n).fill(false), rob: new Array(a.n).fill(0) };
        ready[key] = a.n === 1 ? [true] : ch07OldestReady(q.valid, a.prio);
        if (a.n > 1) { a.prio = ch07OldestNext(a.vReg, a.rReg); a.vReg = q.valid; a.rReg = q.rob; }
      });
      uops.forEach(function (u) {
        issued++;
        if (u.reads.some(function (r) { return !ready[r[0]][r[1]]; })) failed++;
      });
    }
    return { issued: issued, rate: issued ? failed / issued : 0 };
  }

  function run() {
    res = [1, 2, 4].map(simulate);
    var f = function (x) { return (x.rate * 100).toFixed(1) + "%"; };
    document.getElementById("bank-r1").textContent = f(res[0]);
    document.getElementById("bank-r2").textContent = f(res[1]);
    document.getElementById("bank-r4").textContent = f(res[2]);
    document.getElementById("bank-n").textContent = res[2].issued;
    var v = document.getElementById("bank-verdict");
    if (res[0].rate === 0) { v.className = "verdict ok"; v.textContent = "RF 읽기가 없으면 포트 충돌도 없다"; }
    else if (res[2].rate === 0) { v.className = "verdict ok"; v.textContent = "4뱅크에서는 충돌이 한 번도 없었다"; }
    else {
      v.className = "verdict warn";
      v.textContent = "4뱅크 실패율은 1뱅크의 1/" + (res[0].rate / res[2].rate).toFixed(1) + " (시드 " + seed + ")";
    }
    cv.redraw();
  }

  function draw(ctx, w, h) {
    var top = res ? Math.max(0.05, res[0].rate * 1.25) : 0.05;
    var f = Book.frame(ctx, w, h, { x: [0, 3], y: [0, top], xticks: 3, yticks: 4, ylabel: "OG0 실패율",
      xfmt: function () { return ""; }, yfmt: function (v) { return (v * 100).toFixed(0) + "%"; } });
    if (!res) return;
    var cols = [Book.css("bad"), Book.css("warn"), Book.css("ok")], names = ["1뱅크", "2뱅크", "4뱅크"];
    res.forEach(function (r, i) {
      var x0 = f.x(i + 0.2), x1 = f.x(i + 0.8), y = f.y(r.rate);
      ctx.fillStyle = cols[i]; ctx.fillRect(x0, y, x1 - x0, f.box.y1 - y);
      Book.text(ctx, (r.rate * 100).toFixed(1) + "%", (x0 + x1) / 2, y - 9, { align: "center", mono: true, size: 12 });
      Book.text(ctx, names[i], (x0 + x1) / 2, f.box.y1 + 14, { align: "center", size: 12, color: Book.css("text-dim") });
    });
  }
  document.getElementById("bank-seed").addEventListener("click", function () { seed = seed * 31 % 997 + 1; run(); });
  run();
})();

/* ---------- sim-pipe (ANIMATION) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-pipe");
  if (!root) return;
  var NC = 12, state = { t: NC - 1 };
  var P = Book.bind(root, function () { show(); });
  var prodPick = ch07Seg("pipe-prod", function () { show(); });
  var bypPick = ch07Seg("pipe-byp", function () { show(); });
  var cv = Book.canvas(document.getElementById("pipe-cv"), draw);

  /* 단계 배치(추론): 선택 t, OG0 t+1, OG1 t+2, EX t+3..t+3+L, WB 다음 사이클. 웨이크업은 선택+1+L. */
  function model() {
    var lat = prodPick() === 1 ? 2 : 0, byp = bypPick() === 0;
    var k = Math.round(P.k), kEff = byp ? k : Math.max(k, 2);
    var p = { sel: 0, ex0: 3, ex1: 3 + lat }; p.wb = p.ex1 + 1;
    var cs = 1 + lat + kEff;
    var c = { sel: cs, ex0: cs + 3, ex1: cs + 3 }; c.wb = c.ex1 + 1;
    var src = kEff === 0 ? "forward (0001)" : kEff === 1 ? "bypass (0010)" : "RC (0110) 또는 RF (1000)";
    return { lat: lat, byp: byp, k: k, kEff: kEff, p: p, c: c, src: src };
  }
  function stage(u, t) {
    if (t === u.sel) return "선택";
    if (t === u.sel + 1) return "OG0";
    if (t === u.sel + 2) return "OG1";
    if (t >= u.ex0 && t <= u.ex1) return u.ex1 > u.ex0 ? "EX" + (t - u.ex0 + 1) : "EX";
    if (t === u.wb) return "WB";
    return "";
  }
  function color(s) {
    if (s === "선택") return Book.css("grey-soft");
    if (s === "OG0" || s === "OG1") return Book.css("accent-soft");
    if (s.indexOf("EX") === 0) return Book.css("ok-soft");
    if (s === "WB") return Book.css("accent-2-soft");
    return null;
  }
  function draw(ctx, w, h) {
    var m = model(), L = 40, cw = (w - L - 8) / NC, top = 34, rh = 52;
    for (var t = 0; t < NC; t++) {
      var x = L + t * cw;
      Book.text(ctx, String(t), x + cw / 2, 16, { align: "center", mono: true, size: 11, color: Book.css("text-faint") });
    }
    [["P", m.p], ["C", m.c]].forEach(function (row, r) {
      var y = top + r * (rh + 46);
      Book.text(ctx, row[0], 14, y + rh / 2, { weight: 700, size: 15 });
      for (var t = 0; t < NC; t++) {
        var s = stage(row[1], t), x = L + t * cw;
        ctx.save(); ctx.globalAlpha = t <= state.t ? 1 : 0.28;
        Book.roundRect(ctx, x + 1.5, y, cw - 3, rh, 5, color(s) || Book.css("surface"), Book.css("border"));
        if (s) Book.text(ctx, s, x + cw / 2, y + rh / 2, { align: "center", size: cw < 30 ? 9 : 11, mono: true });
        ctx.restore();
      }
    });
    /* 원천 화살표: P 결과 사이클 → C OG1 사이클 */
    var x1 = L + m.p.ex1 * cw + cw / 2, y1 = top + rh, x2 = L + (m.c.sel + 2) * cw + cw / 2, y2 = top + rh + 46;
    var col = m.kEff === 0 ? Book.css("ok") : m.kEff === 1 ? Book.css("accent-2") : Book.css("warn");
    Book.line(ctx, [[x1, y1 + 2], [x2, y2 - 2]], col, 2.5);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x2, y2 - 3, 4, 0, 7); ctx.fill();
    Book.text(ctx, m.src.split(" (")[0], Math.min(Math.max((x1 + x2) / 2 + 6, L), w - 70), (y1 + y2) / 2, { size: 12, color: col, weight: 700 });
    var cx = L + state.t * cw;
    ctx.strokeStyle = Book.css("accent"); ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, top - 6, cw - 2, rh * 2 + 46 + 12);
    Book.text(ctx, "가는 칸: 아직 오지 않은 사이클", L, h - 12, { size: 11, color: Book.css("text-faint") });
  }
  function show() {
    var m = model();
    document.getElementById("pipe-t").textContent = state.t;
    document.getElementById("pipe-src").textContent = m.src;
    document.getElementById("pipe-gap").textContent = (m.c.ex0 - m.p.ex1) + "사이클";
    document.getElementById("pipe-sel").textContent = m.c.sel + "사이클";
    var v = document.getElementById("pipe-verdict"), sp = stage(m.p, state.t) || "-", sc = stage(m.c, state.t) || "-";
    var note = "t=" + state.t + ": P " + sp + ", C " + sc;
    if (!m.byp && m.k < 2) { v.className = "verdict warn"; note += ". 바이패스가 없어 C 선택이 k=2로 밀렸다"; }
    else if (state.t === m.c.sel + 2) { v.className = "verdict ok"; note += ". C가 OG1에서 " + m.src.split(" (")[0] + "로 값을 받는다"; }
    else v.className = "verdict grey";
    v.textContent = note;
    cv.redraw();
  }
  var anim = Book.loop(cv.ctx.canvas, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.5) return true;
    anim.acc = 0;
    if (state.t >= NC - 1) return false;
    state.t++; show();
    return state.t < NC - 1;
  });
  document.getElementById("pipe-step").addEventListener("click", function () { anim.stop(); state.t = (state.t + 1) % NC; show(); });
  document.getElementById("pipe-play").addEventListener("click", function () { if (state.t >= NC - 1) state.t = 0; show(); anim.start(); });
  document.getElementById("pipe-reset").addEventListener("click", function () { anim.stop(); state.t = 0; show(); });
  show();
})();

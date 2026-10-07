/* ch07-b.js: 6절 WB 중재(sim-wb), busy table 스테퍼(sim-busy), 7절 SRT16 계산기(sim-srt).
   규칙은 XiangShan @09453ff8 코드를 그대로 옮겼다. 입력은 합성 데이터이다. ch07Seg는 ch07-a.js에 있다. */

/* ---------- sim-wb: WBArbiter (RFWBConflictChecker.scala:54-111), n = 2 ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-wb");
  if (!root) return;
  var N = 400, SHOW = 40, seed = 11, trace = null;
  var P = Book.bind(root, function () { run(); });
  var mode = ch07Seg("wb-mode", function () { run(); });
  var cv = Book.canvas(document.getElementById("wb-cv"), draw);

  function simulate(useCounter) {
    var rng = Book.rng(seed);
    var pend = [false, false], cnt = [0, 0], isFull = [false, false], hasFull = false;
    var rows = [[], []], cntB = [], req = [0, 0], ok = [0, 0], streak = 0, maxStreak = 0;
    for (var c = 0; c < N; c++) {
      var na = rng.next() < P.pa, nb = rng.next() < P.pb;
      if (!pend[0] && na) pend[0] = true;
      if (!pend[1] && nb) pend[1] = true;
      var valid = pend.slice();
      var hasFullReq = (valid[0] && isFull[0]) || (valid[1] && isFull[1]);
      var fv = valid.map(function (v, i) { return useCounter ? v && (!hasFull || !hasFullReq || isFull[i]) : v; });
      /* ArbiterCtrl: 낮은 번호 우선. ready = grant && finalValid || !valid */
      var ready = [fv[0] || !valid[0], (!fv[0] && fv[1]) || !valid[1]];
      var fullNext = cnt.map(function (x) { return x >= 6; });
      for (var i = 0; i < 2; i++) {
        if (valid[i] && !ready[i]) cnt[i] = cnt[i] >= 6 ? 7 : cnt[i] + 2;
        else if (valid[i] && ready[i]) cnt[i] = Math.max(0, cnt[i] - 1);
        if (valid[i]) { req[i]++; if (ready[i]) { ok[i]++; pend[i] = false; } }
        rows[i].push(valid[i] ? (ready[i] ? 1 : 2) : 0);
      }
      if (valid[1] && !ready[1]) { streak++; maxStreak = Math.max(maxStreak, streak); } else if (valid[1]) streak = 0;
      isFull = fullNext; hasFull = fullNext[0] || fullNext[1];
      cntB.push(cnt[1]);
    }
    return { rows: rows, cntB: cntB, req: req, ok: ok, maxStreak: maxStreak };
  }
  function pct(a, b) { return b ? (a / b * 100).toFixed(1) + "%" : "요청 없음"; }
  function run() {
    trace = simulate(mode() === 0);
    document.getElementById("wb-b").textContent = pct(trace.ok[1], trace.req[1]);
    document.getElementById("wb-a").textContent = pct(trace.ok[0], trace.req[0]);
    document.getElementById("wb-wait").textContent = trace.maxStreak + "사이클";
    var v = document.getElementById("wb-verdict");
    if (!trace.req[1]) { v.className = "verdict grey"; v.textContent = "FEX0이 요청하지 않았다"; }
    else if (!trace.ok[1]) { v.className = "verdict bad"; v.textContent = "FEX0 기아: 400사이클 동안 한 번도 쓰지 못했다"; }
    else if (trace.maxStreak > 4) { v.className = "verdict warn"; v.textContent = "FEX0이 최대 " + trace.maxStreak + "사이클 연속으로 졌다"; }
    else { v.className = "verdict ok"; v.textContent = "FEX0 연속 실패가 " + trace.maxStreak + "사이클 이하로 묶였다"; }
    cv.redraw();
  }
  function draw(ctx, w, h) {
    if (!trace) return;
    var L = 46, cw = (w - L - 10) / SHOW, rh = 22, names = ["ALU3", "FEX0"];
    var cols = [Book.css("surface"), Book.css("ok"), Book.css("bad")];
    for (var r = 0; r < 2; r++) {
      var y = 12 + r * (rh + 6);
      Book.text(ctx, names[r], 4, y + rh / 2, { size: 12, mono: true });
      for (var c = 0; c < SHOW; c++) {
        ctx.fillStyle = cols[trace.rows[r][c]];
        ctx.fillRect(L + c * cw + 0.5, y, Math.max(1, cw - 1), rh);
      }
    }
    var f = Book.frame(ctx, w, h, { x: [0, SHOW], y: [0, 8], xticks: 4, yticks: 4, pad: { t: 76, l: 46 },
      xlabel: "사이클", ylabel: "FEX0 카운터", xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    Book.hline(ctx, f, 6, Book.css("warn"), "full (6 이상)");
    var pts = [];
    for (var c = 0; c < SHOW; c++) { pts.push([f.x(c), f.y(trace.cntB[c])]); pts.push([f.x(c + 1), f.y(trace.cntB[c])]); }
    Book.line(ctx, pts, Book.css("accent"), 2);
  }
  document.getElementById("wb-seed").addEventListener("click", function () { seed = seed * 29 % 991 + 3; run(); });
  run();
})();

/* ---------- sim-busy: FuBusyTableWrite (FuBusyTableWrite.scala:57) for ALU4 {Alu 0, Mul 2} ---------- */
(function () {
  "use strict";
  if (!document.getElementById("sim-busy")) return;
  var LAT = { alu: 0, mul: 2 }, NAME = { alu: "ALU", mul: "MUL" }, s;
  var mode = ch07Seg("busy-mode", function () { reset(); });
  var bitsEl = document.getElementById("busy-bits"), logEl = document.getElementById("busy-log");
  var v = document.getElementById("busy-verdict");
  function reset() {
    s = { t: 0, table: 0, issued: 0, blocked: 0, col: 0, wb: {}, log: [] };
    v.className = "verdict grey"; v.textContent = "버튼 하나가 한 사이클이다";
    show();
  }
  function act(kind) {
    var on = mode() === 0, setShift = 0, msg;
    if (kind === "idle") { msg = "쉼"; v.className = "verdict grey"; v.textContent = "t=" + s.t + ": 아무것도 발행하지 않았다"; }
    else {
      var L = LAT[kind];
      if (on && ((s.table >> L) & 1)) {
        s.blocked++; msg = NAME[kind] + " 막힘 (비트" + L + ")";
        v.className = "verdict warn"; v.textContent = "t=" + s.t + ": 비트" + L + "이 서 있어 " + NAME[kind] + "을 발행하지 않는다";
      } else {
        s.issued++; setShift = (1 << L) >> 1;
        var w = s.t + L;
        msg = NAME[kind] + " 발행, 출력 " + w;
        if (s.wb[w]) {
          s.col++; msg += " 충돌! (" + s.wb[w] + "와 같은 출력 사이클)";
          v.className = "verdict bad"; v.textContent = "t=" + s.t + ": 출력 " + w + "에서 " + s.wb[w] + "와 부딪힌다. fuOutValidOH가 one-hot이 아니다";
        } else {
          v.className = "verdict ok"; v.textContent = "t=" + s.t + ": " + NAME[kind] + " 발행, 출력 사이클 " + w;
        }
        s.wb[w] = NAME[kind] + "@" + s.t;
      }
    }
    s.log.push("t=" + s.t + "  표 " + bits(s.table) + "  " + msg);
    s.table = (s.table >> 1) | setShift;
    s.t++;
    show();
  }
  function bits(x) { return ("00" + x.toString(2)).slice(-3); }
  function show() {
    bitsEl.innerHTML = "";
    [2, 1, 0].forEach(function (b) {
      var d = document.createElement("div");
      d.className = "bt-bit" + ((s.table >> b) & 1 ? " on" : "");
      d.textContent = "지연" + b;
      bitsEl.appendChild(d);
    });
    document.getElementById("busy-t").textContent = s.t;
    document.getElementById("busy-tab").textContent = bits(s.table);
    document.getElementById("busy-n").textContent = s.issued + " / " + s.blocked;
    document.getElementById("busy-col").textContent = s.col;
    logEl.textContent = s.log.length ? s.log.join("\n") : "(기록 없음)";
    logEl.scrollTop = logEl.scrollHeight;
  }
  document.getElementById("busy-alu").addEventListener("click", function () { act("alu"); });
  document.getElementById("busy-mul").addEventListener("click", function () { act("mul"); });
  document.getElementById("busy-idle").addEventListener("click", function () { act("idle"); });
  document.getElementById("busy-reset").addEventListener("click", reset);
  document.getElementById("busy-demo").addEventListener("click", function () {
    reset(); act("mul"); act("idle"); act("alu"); act("alu");
  });
  reset();
})();

/* ---------- sim-srt: SRT16DividerDataModule (SRT16Divider.scala) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-srt");
  if (!root) return;
  var P = Book.bind(root, function () { show(); });
  var cv = Book.canvas(document.getElementById("srt-cv"), draw);
  function model() {
    var ab = Math.round(P.ab), db = Math.round(P.db);
    /* LZC는 6비트 PriorityEncoder(:144-145): 값이 0이면 63, aLZC(6)은 늘 0 */
    var aLZC = ab === 0 ? 63 : 64 - ab, dLZC = db === 0 ? 63 : 64 - db;
    var dIsZero = db === 0;
    var dIsOne = dLZC === 63;                                 /* :156, 제수 0에서도 참 */
    var diffW = dLZC - aLZC;                                  /* :149, 7비트 뺄셈의 부호 = bit6 */
    var aTooSmall = diffW < 0;                                /* :159 */
    var special = dIsOne || dIsZero || aTooSmall;             /* :160 */
    var why = dIsZero ? "제수 0" : dIsOne ? "|제수| = 1" : ab === 0 ? "피제수 0, LZC 63이라 차이 음수" : "피제수 비트 < 제수 비트";
    if (special) return { aLZC: aLZC, dLZC: dLZC, special: true, why: why, iters: 0, out: 5, ahead: 2 };
    var N = (diffW + 1) >> 2;                                /* :180 */
    return { aLZC: aLZC, dLZC: dLZC, diff: diffW, special: false, N: N, iters: N + 1, out: N + 6, ahead: N + 3 };
  }
  function draw(ctx, w, h) {
    var m = model();
    var f = Book.frame(ctx, w, h, { x: [0, 62], y: [0, 24], xticks: 6, yticks: 4, xlabel: "dLZC − aLZC", ylabel: "결과 사이클",
      xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    var pts = [];
    for (var d = 0; d <= 62; d++) {
      var y = ((d + 1) >> 2) + 6;
      pts.push([f.x(d), f.y(y)]); pts.push([f.x(Math.min(62, d + 1)), f.y(y)]);
    }
    Book.line(ctx, pts, Book.css("accent"), 2);
    Book.hline(ctx, f, 5, Book.css("warn"), "특수 경우 5");
    if (!m.special) {
      Book.vline(ctx, f, m.diff, Book.css("accent-2"), "차이 " + m.diff);
      ctx.fillStyle = Book.css("accent-2"); ctx.beginPath(); ctx.arc(f.x(m.diff), f.y(m.out), 5, 0, 7); ctx.fill();
    }
  }
  function show() {
    var m = model();
    document.getElementById("srt-lzc").textContent = m.aLZC + " / " + m.dLZC;
    document.getElementById("srt-it").textContent = m.special ? "0회 (건너뜀)" : m.iters + "회";
    document.getElementById("srt-out").textContent = m.out;
    document.getElementById("srt-ahead").textContent = m.ahead;
    var v = document.getElementById("srt-verdict");
    if (m.special) { v.className = "verdict warn"; v.textContent = "특수 경우(" + m.why + "): pre_1 → post_1, 5사이클"; }
    else { v.className = "verdict ok"; v.textContent = "차이 " + m.diff + ", N = " + m.N + ", 반복 " + m.iters + "회, 결과 " + m.out + "사이클"; }
    cv.redraw();
  }
  show();
})();

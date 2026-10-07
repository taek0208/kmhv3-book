/* ch08-a.js: sim-ring (352칸 원형 ROB), sim-cpred (커밋 수 예측), sim-full (긴 지연 머리와 ROB 가득).
   상수 출처: RobSize 352 (Parameters.scala:114), bankNum 8 (Rob.scala:173), RenameWidth/CommitWidth 8
   (Parameters.scala:82-83), allowEnqueue <= RobSize-RenameWidth, dispatch <= RobSize-2*RenameWidth
   (Rob.scala:971-972), 줄 단위 커밋 (Rob.scala:239-250, 832-842). 명령 지연은 합성 데이터다. */
(function () {
  "use strict";
  var root = document.getElementById("sim-ring");
  if (!root) return;
  var SIZE = 352, BANK = 8, RW = 8, LINES = SIZE / BANK;
  var S;
  var P = Book.bind(root, function () { show(); });
  var cv = Book.canvas(document.getElementById("ring-cv"), draw);

  function reset() {
    S = { t: 0, deq: 0, enq: 0, done: new Array(SIZE).fill(-1), long: new Array(SIZE).fill(false),
      allowEnq: true, total: 0, lastC: 0, lastLimit: BANK, lastK: 0 };
  }

  /* One cycle: commit inside deqPtr's line, enqueue if last cycle's allowEnqueue, then update the register. */
  function step() {
    S.t += 1;
    var t = S.t, n0 = S.enq - S.deq;
    var limit = BANK - (S.deq % BANK), c = 0;
    while (c < limit && S.deq + c < S.enq && S.done[(S.deq + c) % SIZE] <= t) c++;
    for (var i = 0; i < c; i++) S.done[(S.deq + i) % SIZE] = -1;
    S.deq += c;
    var k = S.allowEnq ? Math.round(P.enq) : 0;
    for (var j = 0; j < k; j++) {
      var r = Book.rng(1000 + S.enq), isLong = r.next() < P.plong;
      var idx = S.enq % SIZE;
      S.long[idx] = isLong;
      S.done[idx] = t + (isLong ? Math.round(P.longlat) : r.int(2, 5));
      S.enq += 1;
    }
    S.allowEnq = n0 + k <= SIZE - RW; /* Rob.scala:971 */
    S.total += c; S.lastC = c; S.lastLimit = limit; S.lastK = k;
  }

  function ptr(abs) { return "(" + (Math.floor(abs / SIZE) % 2) + ", " + (abs % SIZE) + ")"; }

  function draw(ctx, w, h) {
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 26, r0 = R * 0.42, dr = (R - r0) / BANK;
    var t = S.t, da = 2 * Math.PI / LINES;
    for (var L = 0; L < LINES; L++) {
      for (var b = 0; b < BANK; b++) {
        var idx = L * BANK + b, a0 = -Math.PI / 2 + L * da, a1 = a0 + da * 0.92;
        var d = S.done[idx], col;
        if (d < 0) col = Book.css("surface-2");
        else if (d <= t) col = Book.css("ok");
        else col = S.long[idx] ? Book.css("warn") : Book.css("accent");
        ctx.beginPath();
        ctx.arc(cx, cy, r0 + (b + 0.92) * dr, a0, a1);
        ctx.arc(cx, cy, r0 + b * dr, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
    }
    function pointer(abs, color, label, out) {
      var a = -Math.PI / 2 + (abs % SIZE) / SIZE * 2 * Math.PI;
      var x0 = cx + Math.cos(a) * (r0 - 6), y0 = cy + Math.sin(a) * (r0 - 6);
      var x1 = cx + Math.cos(a) * (R + 6), y1 = cy + Math.sin(a) * (R + 6);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      Book.text(ctx, label, cx + Math.cos(a) * (R + out), cy + Math.sin(a) * (R + out), { size: 12, weight: 700, color: color, align: "center" });
    }
    pointer(S.enq, Book.css("accent-2"), "enq", 16);
    pointer(S.deq, Book.css("bad"), "deq", 16);
    Book.text(ctx, "유효 " + (S.enq - S.deq), cx, cy - 10, { size: 14, weight: 700, align: "center" });
    Book.text(ctx, "/ 352", cx, cy + 10, { size: 12, color: Book.css("text-dim"), align: "center" });
    Book.text(ctx, "안쪽 = bank 0", 6, h - 10, { size: 11, color: Book.css("text-faint") });
  }

  function show() {
    var n = S.enq - S.deq;
    document.getElementById("ring-t").textContent = S.t;
    document.getElementById("ring-n").textContent = n;
    document.getElementById("ring-c").textContent = S.t ? S.lastC + " / " + S.lastLimit : "-";
    document.getElementById("ring-deq").textContent = ptr(S.deq);
    document.getElementById("ring-enqp").textContent = ptr(S.enq);
    document.getElementById("ring-ipc").textContent = S.t ? (S.total / S.t).toFixed(2) : "-";
    var v = document.getElementById("ring-verdict");
    if (S.t === 0) { v.className = "verdict grey"; v.textContent = "사이클 0: ROB가 비었다"; return; }
    if (!S.allowEnq) { v.className = "verdict bad"; v.textContent = "allowEnqueue = 0: 유효 " + n + "개, 다음 사이클 입장 정지 (문턱 344)"; return; }
    if (S.lastC === 0 && n > 0) { v.className = "verdict warn"; v.textContent = "커밋 0: 머리 robIdx " + (S.deq % SIZE) + "가 아직 끝나지 않았다"; return; }
    v.className = "verdict ok";
    v.textContent = "커밋 " + S.lastC + "개 (줄 한도 " + S.lastLimit + "), 입장 " + S.lastK + "개";
  }

  function tick() { step(); cv.redraw(); show(); }
  var acc = 0;
  var anim = Book.loop(cv.ctx.canvas, function (dt) {
    acc += dt;
    if (acc < 0.08) return true;
    acc = 0; tick();
    return true;
  });
  var playBtn = document.getElementById("ring-play");
  document.getElementById("ring-step").addEventListener("click", function () { anim.stop(); playBtn.textContent = "재생"; tick(); });
  playBtn.addEventListener("click", function () {
    if (anim.running) { anim.stop(); playBtn.textContent = "재생"; } else { anim.start(); playBtn.textContent = "정지"; }
  });
  document.getElementById("ring-reset").addEventListener("click", function () { anim.stop(); playBtn.textContent = "재생"; reset(); cv.redraw(); show(); });
  document.getElementById("ring-fast").addEventListener("click", function () {
    anim.stop(); playBtn.textContent = "재생";
    for (var i = 0; i < 50; i++) step();
    cv.redraw(); show();
  });
  reset(); cv.redraw(); show();
})();

/* PREDICT: 이번 사이클 커밋 수. 정답은 Rob.scala:822-842의 commitValidThisLine 식을 그대로 계산한다. */
(function () {
  "use strict";
  var root = document.getElementById("sim-cpred");
  if (!root) return;
  var buttons = Array.prototype.slice.call(root.querySelectorAll("#cp-choice button"));
  var k = 0, prob = null, tries = 0, right = 0;
  var ORDER = ["normal", "intrLoad", "nfLine", "intrAlu", "nfHead"];

  function make(kk) {
    var r = Book.rng(800 + kk * 7), type = ORDER[(kk - 1) % ORDER.length];
    var o = r.int(0, 5), m = r.next() < 0.6 ? 7 : r.int(o + 1, 7), line = r.int(0, 43);
    var kinds = ["alu", "alu", "load", "store"], slots = [];
    for (var i = 0; i < 8; i++) {
      slots.push({ hc: i < o, v: i >= o && i <= m, w: i >= o && i <= m && r.next() < 0.75, nf: false, kind: r.pick(kinds) });
    }
    var intr = false;
    if (type === "nfLine") { var j = r.int(o + 1, m); slots[j].nf = true; slots[j].w = true; }
    if (type === "nfHead") { slots[o].nf = true; slots[o].w = true; }
    if (type === "intrLoad") { intr = true; slots[o].kind = "load"; }
    if (type === "intrAlu") { intr = true; slots[o].kind = "alu"; }
    return { o: o, line: line, slots: slots, intr: intr, type: type };
  }

  /* Rob.scala:604-616, 822-842 with hasWaitForward = deqHasFlushed = false and no other blockCommit source. */
  function solve(p) {
    var s = p.slots, h = s[p.o];
    var deqNeedFlush = h.nf && h.v && h.w;
    var safe = h.kind === "alu"; /* interrupt_safe: not load/store (Rob.scala:1184) */
    var intrEnable = p.intr && safe;
    var blockCommit = deqNeedFlush;
    var allowOnly = s.some(function (x) { return x.v && x.nf; }) || p.intr;
    var isBlocked = intrEnable || deqNeedFlush;
    var got = [];
    if (!blockCommit) {
      for (var i = 0; i < 8; i++) {
        var older = false;
        if (i > 0) {
          for (var q = 0; q <= i; q++) if (!s[q].w && !s[q].hc) older = true;
          var allHc = true;
          for (q = 0; q < i; q++) if (!s[q].hc) allHc = false;
          if (allowOnly && !allHc) older = true;
        }
        if (s[i].v && s[i].w && !isBlocked && !older && !s[i].hc) got.push(i);
      }
    }
    var why;
    if (blockCommit) why = "머리가 needFlush이고 완료라 blockCommit이다. 이번 사이클은 커밋 대신 flushOut을 판정한다.";
    else if (intrEnable) why = "인터럽트 요청이 있고 머리가 ALU(interrupt_safe)라 intrEnable이 서서 모든 칸이 막힌다.";
    else if (allowOnly) why = (p.intr ? "인터럽트 요청" : "줄 안의 예외 칸") + " 때문에 allowOnlyOneCommit이다. 머리 한 칸만, 그것도 완료일 때만 간다.";
    else why = "막는 신호가 없다. deqPtr부터 연속으로 완료된 칸을 줄 끝까지 커밋한다.";
    return { n: got.length, got: got, blockCommit: blockCommit, allowOnly: allowOnly && !blockCommit, why: why };
  }

  function render(marks) {
    var base = prob.line * 8, html = "";
    prob.slots.forEach(function (s, i) {
      var cls = "slot", st;
      if (s.hc) { cls += " hc"; st = "커밋"; }
      else if (!s.v) { cls += " empty"; st = "빈칸"; }
      else if (s.w) { cls += " w"; st = "완료"; }
      else { cls += " nw"; st = "대기"; }
      if (s.nf && s.v) cls += " nf";
      if (i === prob.o) cls += " deq";
      if (marks && marks.indexOf(i) >= 0) cls += " got";
      var tag = s.v ? (s.nf ? "예외" : (s.kind === "store" ? "st" : s.kind)) : "-";
      html += '<div class="' + cls + '"><b>' + (base + i) + "</b>" + st + "<br>" + tag + "</div>";
    });
    document.getElementById("cp-slots").innerHTML = html;
  }

  function next() {
    k += 1; prob = make(k);
    document.getElementById("cp-k").textContent = k;
    document.getElementById("cp-desc").textContent = "deqPtr = " + (prob.line * 8 + prob.o) + " (줄 " + prob.line + ", 뱅크 " + prob.o +
      "). 인터럽트 요청: " + (prob.intr ? "있음" : "없음") + ". 다른 막힘 신호는 없다.";
    document.getElementById("cp-bc").textContent = "-";
    document.getElementById("cp-ao").textContent = "-";
    var out = document.getElementById("cp-out");
    out.className = "verdict grey"; out.textContent = "숫자를 고른 뒤 확인을 누른다";
    render(null);
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { buttons.forEach(function (x) { x.classList.toggle("on", x === b); }); });
  });
  document.getElementById("cp-new").addEventListener("click", next);
  document.getElementById("cp-run").addEventListener("click", function () {
    var pick = buttons.findIndex(function (b) { return b.classList.contains("on"); });
    var a = solve(prob), ok = pick === a.n;
    tries += 1; if (ok) right += 1;
    render(a.got);
    document.getElementById("cp-bc").textContent = a.blockCommit ? "1" : "0";
    document.getElementById("cp-ao").textContent = a.allowOnly ? "1" : "0";
    document.getElementById("cp-score").textContent = right + " / " + tries;
    var out = document.getElementById("cp-out");
    out.className = "verdict " + (ok ? "ok" : "bad");
    out.textContent = (ok ? "맞았다. " : "빗나갔다. ") + "실제 " + a.n + "개" +
      (a.n ? " (robIdx " + a.got.map(function (i) { return prob.line * 8 + i; }).join(", ") + ")" : "") + ". " + a.why;
  });
  next();
})();

/* LAB: 긴 지연 머리 때문에 ROB가 찬다. dispatch -> (RegNext) -> ROB 입장 (CtrlBlock.scala:795-800). */
(function () {
  "use strict";
  var root = document.getElementById("sim-full");
  if (!root) return;
  var CFG = [{ S: 352, W: 8, name: "Default" }, { S: 208, W: 6, name: "BackendV2" }, { S: 48, W: 8, name: "Minimal" }];
  var BANK = 8, cfg = CFG[0], res = null;
  var P = Book.bind(root, function () { run(); });
  var cv = Book.canvas(document.getElementById("full-cv"), draw);

  function run() {
    var S = cfg.S, W = cfg.W, lat = Math.round(P.lat), T = lat + 80;
    var deq = 0, enq = 0, done = {}, pending = 0, allowEnq = true, allowDisp = true;
    var occ = [], firstStop = -1, stall = 0, peak = 0, total = 0, lost = 0;
    for (var t = 0; t < T; t++) {
      var n0 = enq - deq;
      var limit = BANK - (deq % BANK), c = 0;
      while (c < limit && deq + c < enq && done[deq + c] <= t) c++;
      deq += c; total += c;
      var k = 0;
      if (pending) {
        if (allowEnq) { for (var j = 0; j < pending; j++) { done[enq] = enq === 0 ? t + lat : t + 2; enq++; } k = pending; }
        else lost += pending;
      }
      var d = allowDisp ? W : 0;
      if (!d) { stall++; if (firstStop < 0) firstStop = t; }
      pending = d;
      allowEnq = n0 + k <= S - W;      /* Rob.scala:971 */
      allowDisp = n0 + k <= S - 2 * W; /* Rob.scala:972 */
      occ.push(enq - deq); peak = Math.max(peak, enq - deq);
    }
    res = { occ: occ, firstStop: firstStop, stall: stall, peak: peak, ipc: total / T, T: T, lat: lat, lost: lost };
    cv.redraw(); show();
  }

  function draw(ctx, w, h) {
    if (!res) return;
    var S = cfg.S, W = cfg.W;
    var f = Book.frame(ctx, w, h, { x: [0, res.T], y: [0, S * 1.08], xlabel: "사이클", ylabel: "유효 항목",
      xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    Book.hline(ctx, f, S, Book.css("text-faint"), "", [2, 3]);
    Book.hline(ctx, f, S - W, Book.css("bad"), "", [5, 4]);
    Book.hline(ctx, f, S - 2 * W, Book.css("warn"), "", [5, 4]);
    /* 세 선이 W칸밖에 안 떨어져 있어 라벨을 한 줄로 모아 왼쪽 아래에 쓴다 */
    ctx.save(); ctx.font = "11px " + Book.css("font"); ctx.textBaseline = "top"; ctx.textAlign = "left";
    var lx = f.box.x0 + 30, ly = f.y(S - 2 * W) + 4;
    [["S " + S, "text-faint"], ["S−W " + (S - W), "bad"], ["S−2W " + (S - 2 * W), "warn"]].forEach(function (p) {
      ctx.fillStyle = Book.css(p[1]); ctx.fillText(p[0], lx, ly); lx += ctx.measureText(p[0]).width + 10;
    });
    ctx.restore();
    Book.vline(ctx, f, 1 + res.lat, Book.css("accent-2"), "load 완료", [4, 4]);
    Book.line(ctx, res.occ.map(function (v, i) { return [f.x(i), f.y(v)]; }), Book.css("accent"), 2);
  }

  function show() {
    document.getElementById("full-stop").textContent = res.firstStop < 0 ? "없음" : res.firstStop;
    document.getElementById("full-peak").textContent = res.peak + " / " + cfg.S;
    document.getElementById("full-stall").textContent = res.stall;
    document.getElementById("full-ipc").textContent = res.ipc.toFixed(2);
    var v = document.getElementById("full-verdict");
    if (res.stall > 0) {
      v.className = "verdict warn";
      v.textContent = cfg.name + ": 사이클 " + res.firstStop + "에 dispatch가 멈췄다. 머리 load는 " + (1 + res.lat) + "에 끝난다.";
    } else {
      v.className = "verdict ok";
      v.textContent = cfg.name + ": dispatch가 한 번도 멈추지 않았다. ROB가 지연 " + res.lat + "을 덮는다.";
    }
  }

  var segBtns = Array.prototype.slice.call(root.querySelectorAll("#full-cfg button"));
  segBtns.forEach(function (b, i) {
    b.addEventListener("click", function () {
      segBtns.forEach(function (x) { x.classList.toggle("on", x === b); });
      cfg = CFG[i]; run();
    });
  });
  run();
})();

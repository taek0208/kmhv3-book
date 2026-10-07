/* ch08-b.js: sim-walk (플러시와 walk), sim-exc (트랩 예측), sim-cause (예외 원인 우선순위).
   상수 출처: CommitWidth 8 (Parameters.scala:83), 스냅샷 4개 (Parameters.scala:88), 간격 RobCommitWidth*4 = 32
   (Rename.scala:767), useSnpt/snptSelect (CtrlBlock.scala:643-657), walk 타이밍 (Rob.scala:732-744, 938-977),
   ExceptionGen 3단 (ExceptionGen.scala:108-179), intrEnable (Rob.scala:608), 원인 순위 (package.scala:760-780). */
(function () {
  "use strict";
  var root = document.getElementById("sim-walk");
  if (!root) return;
  var D = 13, W = 8, SNPT_NUM = 4, SNPT_GAP = 32, plan = null, now = -1;
  var kind = 0, snapOn = true;
  var P = Book.bind(root, function () { build(); });
  var cv = Book.canvas(document.getElementById("walk-cv"), draw);

  function lineHead(x) { return x - (x % W); }

  function build() {
    var X = D + Math.round(P.dist), young = Math.round(P.young), top = X + young;
    var flushItself = kind === 1;
    /* snapshots: rename groups of 8 from D, jumps at D+5+12k (synthetic) */
    var snaps = [], last = null;
    if (snapOn) {
      for (var h = D; h <= top; h += W) {
        var jmp = -1;
        for (var q = h; q < h + W && q <= top; q++) if ((q - D - 5) >= 0 && (q - D - 5) % 12 === 0) jmp = q;
        if (jmp < 0 || snaps.length >= SNPT_NUM) continue;
        if (last !== null && h - last < SNPT_GAP) continue;
        snaps.push({ h: h, j: jmp }); last = h;
      }
    }
    var lastWalk = flushItself ? X - 1 : X; /* Rob.scala:975-977 */
    var use = null;
    snaps.forEach(function (s) { /* CtrlBlock.scala:644-657: newest qualifying snapshot */
      if ((X > s.h && (X % 352) !== (s.h % 352)) || (!flushItself && X === s.h)) use = s;
    });
    var start = use ? use.h : D, L0 = lineHead(start);
    var n = Math.floor((lastWalk - L0) / W) + 1;
    var dropSnap = snaps.filter(function (s) { return s.j >= X; }).length; /* CtrlBlock.scala:634-641 */
    plan = { X: X, young: young, top: top, flushItself: flushItself, snaps: snaps, use: use, start: start, L0: L0, n: n,
      lastWalk: lastWalk, dropped: top - lastWalk, dropSnap: dropSnap };
    now = -1; stop(); cv.redraw(); show();
  }

  function draw(ctx, w, h) {
    if (!plan) return;
    var first = lineHead(D), lastLine = lineHead(plan.top), cols = (lastLine - first) / W + 1;
    var padL = 34, padT = 30, padB = 34, cw = (w - padL - 8) / cols, ch = (h - padT - padB) / W;
    for (var b = 0; b < W; b++) Book.text(ctx, String(b), 14, padT + (b + 0.5) * ch, { size: 10, color: Book.css("text-faint"), mono: true, align: "center" });
    Book.text(ctx, "bank", 4, padT - 14, { size: 10, color: Book.css("text-faint") });
    for (var c = 0; c < cols; c++) {
      var L = first + c * W, walkIdx = (L - plan.L0) / W, walkedAt = 2 + walkIdx; /* line walked at T+2+idx */
      for (b = 0; b < W; b++) {
        var r = L + b, col, a = 1;
        if (r < D || r > plan.top) { col = Book.css("surface-2"); }
        else if (r > plan.lastWalk) { col = now >= 1 ? Book.css("bad") : Book.css("accent"); a = now >= 1 ? 0.25 : 0.75; }
        else if (r >= plan.start && walkIdx >= 0 && now >= walkedAt) { col = Book.css("ok"); }
        else if (r < plan.start) { col = Book.css("grey"); a = 0.45; }
        else { col = Book.css("ok"); a = 0.35; }
        ctx.globalAlpha = a; ctx.fillStyle = col;
        ctx.fillRect(padL + c * cw + 0.5, padT + b * ch + 0.5, Math.max(1, cw - 1), ch - 1);
        ctx.globalAlpha = 1;
        if (r === plan.X) { ctx.strokeStyle = Book.css("accent-2"); ctx.lineWidth = 2; ctx.strokeRect(padL + c * cw + 1, padT + b * ch + 1, cw - 2, ch - 2); }
      }
      if (now >= 2 && walkIdx === now - 2 && walkIdx < plan.n) {
        ctx.strokeStyle = Book.css("warn"); ctx.lineWidth = 2.5;
        ctx.strokeRect(padL + c * cw, padT - 2, cw, W * ch + 4);
      }
    }
    plan.snaps.forEach(function (s) {
      var c = (lineHead(s.h) - first) / W, x = padL + (c + 0.5) * cw, on = plan.use === s;
      ctx.fillStyle = on ? Book.css("accent") : Book.css("text-faint");
      ctx.beginPath(); ctx.moveTo(x - 5, padT - 12); ctx.lineTo(x + 5, padT - 12); ctx.lineTo(x, padT - 4); ctx.closePath(); ctx.fill();
    });
    var xs = padL + ((plan.L0 - first) / W) * cw, xx = padL + ((lineHead(plan.X) - first) / W + 0.5) * cw;
    Book.text(ctx, "walk 시작", Math.min(xs, w - 70), h - padB + 12, { size: 11, weight: 700, color: Book.css("accent") });
    Book.text(ctx, "X = " + plan.X, Math.min(xx, w - 60), h - padB + 26, { size: 11, weight: 700, color: Book.css("accent-2") });
    Book.text(ctx, "▼ 스냅샷 (보라 = 사용)", w - 8, padT - 20, { size: 10, color: Book.css("text-dim"), align: "right" });
  }

  function label(k) { return k < 0 ? "T 이전" : (k === 0 ? "T" : "T+" + k); }

  function show() {
    var p = plan;
    document.getElementById("walk-t").textContent = label(now);
    document.getElementById("walk-s").textContent = (p.use ? "예 / " : "아니오 / ") + p.start;
    document.getElementById("walk-last").textContent = p.lastWalk + (p.flushItself ? " (X−1)" : " (X)");
    document.getElementById("walk-n").textContent = p.n + "줄";
    document.getElementById("walk-fin").textContent = "T+" + (p.n + 1);
    document.getElementById("walk-drop").textContent = p.dropped + " / " + p.dropSnap;
    var v = document.getElementById("walk-verdict"), msg, cls = "warn";
    if (now < 0) { msg = "T 이전: robIdx " + p.X + "의 " + (p.flushItself ? "load 재실행(flush)" : "분기 오예측(flushAfter)") + "이 도착하기 직전"; cls = "grey"; }
    else if (now === 0) msg = "T: enqPtr를 " + (p.flushItself ? p.X : p.X + 1) + "로 되감고 lastWalkPtr = " + p.lastWalk + ", 시작 줄 머리 " + p.L0;
    else if (now === 1) msg = "T+1: 젊은 항목 " + p.dropped + "개를 한 사이클에 무효로, 상태 s_walk";
    else if (now <= p.n + 1) {
      var j = now - 2, a = p.L0 + j * W;
      msg = "T+" + now + ": 줄 " + (j + 1) + "/" + p.n + " walk (robIdx " + Math.max(a, p.start) + "~" + Math.min(a + W - 1, p.lastWalk) + ")" + (now === p.n + 1 ? ", walkFinished" : "");
    } else { msg = "T+" + now + ": RAB 종료 후 s_idle, 입장 재개 (추론: RAB 1사이클 가정)"; cls = "ok"; }
    v.className = "verdict " + cls; v.textContent = msg;
  }

  function tick() { if (now < plan.n + 2) now += 1; cv.redraw(); show(); return now < plan.n + 2; }
  var acc = 0;
  var anim = Book.loop(cv.ctx.canvas, function (dt) {
    acc += dt; if (acc < 0.3) return true; acc = 0;
    var more = tick(); if (!more) playBtn.textContent = "재생";
    return more;
  });
  var playBtn = document.getElementById("walk-play");
  function stop() { anim.stop(); playBtn.textContent = "재생"; }
  document.getElementById("walk-step").addEventListener("click", function () { stop(); tick(); });
  playBtn.addEventListener("click", function () {
    if (anim.running) { stop(); return; }
    if (now >= plan.n + 2) now = -1;
    anim.start(); playBtn.textContent = "정지";
  });
  document.getElementById("walk-reset").addEventListener("click", function () { stop(); now = -1; cv.redraw(); show(); });
  function segWire(id, set) {
    var bs = Array.prototype.slice.call(root.querySelectorAll("#" + id + " button"));
    bs.forEach(function (b, i) { b.addEventListener("click", function () { bs.forEach(function (x) { x.classList.toggle("on", x === b); }); set(i); build(); }); });
  }
  segWire("walk-kind", function (i) { kind = i; });
  segWire("walk-snap", function (i) { snapOn = i === 0; });
  build();
})();

/* PREDICT: 누가 먼저 트랩을 일으키나. 사이클 단위로 ROB 머리 판정과 ExceptionGen current를 계산한다. */
(function () {
  "use strict";
  var root = document.getElementById("sim-exc");
  if (!root) return;
  var SCN = [
    { intr: null, insts: [["load", 9, "LPF 13"], ["alu", 3], ["load", 4, "LAM 4"], ["alu", 5], ["alu", 6]] },
    { intr: 2, insts: [["load", 10], ["alu", 3], ["alu", 4], ["alu", 5], ["alu", 6]] },
    { intr: 2, insts: [["store", 6, "SAF 7"], ["alu", 3], ["alu", 3], ["alu", 4], ["alu", 4]] },
    { intr: 5, insts: [["alu", 2], ["alu", 8], ["load", 4, "LAF 5"], ["alu", 5], ["alu", 6]] }
  ];
  var scn = 0;
  var choiceBtns = Array.prototype.slice.call(root.querySelectorAll("#exc-choice button"));
  var scnBtns = Array.prototype.slice.call(root.querySelectorAll("#exc-scn button"));

  function table() {
    var s = SCN[scn], html = "<tr><th>명령</th><th>종류</th><th class=\"num\">writeback</th><th>예외</th></tr>";
    s.insts.forEach(function (x, i) {
      html += "<tr><td>I" + (i + 1) + (i === 0 ? " (머리)" : "") + "</td><td>" + x[0] + "</td><td class=\"num\">" + x[1] + "</td><td>" + (x[2] || "-") + "</td></tr>";
    });
    html += "<tr><td colspan=\"4\">인터럽트 요청: " + (s.intr === null ? "없음" : "사이클 " + s.intr + "부터 (ROB에는 한 사이클 뒤 보임)") + "</td></tr>";
    document.getElementById("exc-table").innerHTML = html;
  }

  /* Rob.scala:608-614, 676, 711, 822-842; ExceptionGen.scala:108-179 (wb at c -> current at c+3, oldest wins). */
  function simulate() {
    var s = SCN[scn], ins = s.insts, head = 0, log = [], committed = [];
    for (var t = 1; t <= 30; t++) {
      var intrReg = s.intr !== null && t >= s.intr + 1;
      var current = -1;
      for (var i = 0; i < ins.length; i++) if (ins[i][2] && t >= ins[i][1] + 3) { current = i; break; }
      var hd = ins[head], done = t >= hd[1], nf = !!hd[2] && done;
      var intrEnable = intrReg && hd[0] === "alu";
      var deqHasException = nf && current === head && t >= hd[1] + 2;
      var curTxt = current < 0 ? "-" : "I" + (current + 1);
      if (intrEnable || deqHasException) {
        var what = intrEnable ? "인터럽트 flushOut" : "I" + (head + 1) + " 예외 flushOut (" + hd[2] + ")";
        log.push([t, "I" + (head + 1), curTxt, intrEnable ? 1 : 0, what]);
        return { t: t, head: head, isInt: intrEnable, log: log, committed: committed, pick: intrEnable ? 2 : (head === 0 ? 0 : 1) };
      }
      var ev = "-";
      if (nf) ev = "blockCommit (머리 needFlush, ExceptionGen 대기)";
      else {
        var allowOnly = intrReg;
        for (i = head; i < ins.length; i++) if (ins[i][2] && t >= ins[i][1]) allowOnly = true;
        var c = [];
        for (i = head; i < ins.length; i++) {
          if (t < ins[i][1] || (ins[i][2] && i !== head)) break;
          c.push("I" + (i + 1));
          if (allowOnly) break;
        }
        head += c.length; committed = committed.concat(c);
        if (c.length) ev = "커밋 " + c.join(", ") + (allowOnly ? " (한 개씩)" : "");
        if (head >= ins.length) { log.push([t, "-", curTxt, 0, ev]); return { t: -1, head: -1, isInt: false, log: log, committed: committed, pick: -1 }; }
      }
      log.push([t, "I" + (head + 1), curTxt, intrEnable ? 1 : 0, ev]);
    }
    return { t: -1, head: -1, isInt: false, log: log, committed: committed, pick: -1 };
  }

  function run() {
    var r = simulate(), pick = choiceBtns.findIndex(function (b) { return b.classList.contains("on"); });
    var html = "<tr><th class=\"num\">사이클</th><th>머리(끝)</th><th>current</th><th class=\"num\">intrEnable</th><th>일</th></tr>";
    r.log.forEach(function (l) { html += "<tr><td class=\"num\">" + l[0] + "</td><td>" + l[1] + "</td><td>" + l[2] + "</td><td class=\"num\">" + l[3] + "</td><td>" + l[4] + "</td></tr>"; });
    document.getElementById("exc-log").innerHTML = html;
    document.getElementById("exc-cyc").textContent = r.t < 0 ? "없음" : r.t;
    document.getElementById("exc-head").textContent = r.head < 0 ? "-" : "I" + (r.head + 1);
    document.getElementById("exc-int").textContent = r.t < 0 ? "-" : (r.isInt ? "1" : "0");
    document.getElementById("exc-cm").textContent = r.committed.length ? r.committed.join(", ") : "없음";
    var out = document.getElementById("exc-out"), ok = pick === r.pick;
    out.className = "verdict " + (ok ? "ok" : "bad");
    out.textContent = (ok ? "맞았다. " : "빗나갔다. ") + "실제: " + choiceBtns[r.pick].textContent + ", 사이클 " + r.t + ", 머리 I" + (r.head + 1) + ".";
  }

  scnBtns.forEach(function (b, i) {
    b.addEventListener("click", function () {
      scnBtns.forEach(function (x) { x.classList.toggle("on", x === b); });
      scn = i; table();
      document.getElementById("exc-log").innerHTML = "";
      var out = document.getElementById("exc-out"); out.className = "verdict grey"; out.textContent = "시나리오 " + "ABCD"[i] + ": 예측한 뒤 실행한다";
      ["exc-cyc", "exc-head", "exc-int", "exc-cm"].forEach(function (id) { document.getElementById(id).textContent = "-"; });
    });
  });
  choiceBtns.forEach(function (b) {
    b.addEventListener("click", function () { choiceBtns.forEach(function (x) { x.classList.toggle("on", x === b); }); });
  });
  document.getElementById("exc-run").addEventListener("click", run);
  table();
})();

/* LAB: 예외 원인 우선순위. package.scala:760-780 순서, 코드는 package.scala:695-718, single-step은 TrapHandleModule.scala:77. */
(function () {
  "use strict";
  var root = document.getElementById("sim-cause");
  if (!root) return;
  var PRI = [["double trap", 16], ["breakpoint", 3], ["명령 PF", 12], ["명령 GPF", 20], ["명령 AF", 1], ["software check", 18],
    ["illegal instr", 2], ["virtual instr", 22], ["명령 정렬", 0], ["ecall M", 11], ["ecall S", 9], ["ecall VS", 10], ["ecall U", 8],
    ["store 정렬", 6], ["load 정렬", 4], ["store PF", 15], ["load PF", 13], ["store GPF", 23], ["load GPF", 21],
    ["store AF", 7], ["load AF", 5], ["hardware error", 19]];
  var on = new Array(PRI.length).fill(false), step = false;
  var grid = document.getElementById("cause-grid");
  var html = "";
  for (var q = PRI.length - 1; q >= 0; q--) html += '<button class="btn" data-i="' + q + '">' + PRI[q][0] + " (" + PRI[q][1] + ")</button>";
  html += '<button class="btn" data-i="-1">single-step</button>';
  grid.innerHTML = html;
  var btns = Array.prototype.slice.call(grid.querySelectorAll("button"));

  function show() {
    btns.forEach(function (b) {
      var i = +b.getAttribute("data-i");
      b.classList.toggle("primary", i < 0 ? step : on[i]);
    });
    var n = on.filter(Boolean).length + (step ? 1 : 0), best = on.indexOf(true);
    var v = document.getElementById("cause-out"), pick = "-", code = "-";
    if (step) {
      pick = "breakpoint (single-step)"; code = "3";
      v.className = "verdict warn";
      v.textContent = "single-step이 켜져 있으면 다른 원인과 관계없이 breakPoint(3)로 바뀐다 (TrapHandleModule.scala:77).";
    } else if (best >= 0) {
      pick = PRI[best][0]; code = String(PRI[best][1]);
      v.className = "verdict ok";
      v.textContent = "켠 원인 중 순위가 가장 높은 " + PRI[best][0] + " → mcause 예외 코드 " + PRI[best][1] + ". 순위 " + (best + 1) + "/22.";
    } else { v.className = "verdict grey"; v.textContent = "원인 없음: 예외가 아니다."; }
    document.getElementById("cause-n").textContent = n;
    document.getElementById("cause-pick").textContent = pick;
    document.getElementById("cause-code").textContent = code;
  }
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      var i = +b.getAttribute("data-i");
      if (i < 0) step = !step; else on[i] = !on[i];
      show();
    });
  });
  document.getElementById("cause-clear").addEventListener("click", function () { on.fill(false); step = false; show(); });
  show();
})();

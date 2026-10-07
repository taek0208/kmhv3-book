/* Chapter 04 sims D-F: instruction boundary, PredChecker, IBuffer allowEnq.
   Rules follow XiangShan @09453ff8 (ifu/InstrBoundary.scala, ifu/Helpers.scala, ifu/PredChecker.scala,
   ifu/Ifu.scala, ibuffer/IBuffer.scala). Bit patterns, programs and block sizes are synthetic. */

/* ---------- Sim D: boundary (InstrBoundary.scala:54-78,131-135; Helpers.scala:166-209) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-bnd");
  if (!root) return;
  var rvc = [], seed = 1;
  var r0 = Book.rng(7);
  for (var i = 0; i < 32; i++) rvc.push(r0.next() < 0.5);
  function mk(id, n, click) {
    var el = document.getElementById(id), a = [];
    for (var k = 0; k < n; k++) {
      var c = document.createElement("div"); c.className = "cell"; el.appendChild(c); a.push(c);
      if (click) (function (j) { c.classList.add("click"); c.addEventListener("click", function () { rvc[j] = !rvc[j]; show(); }); })(k);
    }
    return a;
  }
  var cs = mk("bnd-slots", 32, true), ca = mk("bnd-ha", 16), cb = mk("bnd-hb", 16), cl = mk("bnd-lanes", 36);
  var P = Book.bind(root, function () { show(); });

  function chain(b, from, to) { for (var k = from; k < to; k++) b[k] = !b[k - 1] || rvc[k - 1]; return b; }
  function show() {
    var b = [!P.half];
    chain(b, 1, 16);
    var hA = b.slice(); hA[16] = false; chain(hA, 17, 32); /* latter half assuming slot 16 is a 32-bit tail */
    var hB = b.slice(); hB[16] = true; chain(hB, 17, 32);
    var useA = b[15] && !rvc[15];
    var fin = useA ? hA : hB;
    var end = P.end, n = 0, n16 = 0, n32 = 0, lanes = [];
    for (var s = 0; s < 32; s++) {
      var inR = s <= end;
      var isEnd = !fin[s] || (fin[s] && rvc[s]); /* instrEndMask */
      var tailHalf = s === end && fin[s] && !rvc[s];
      var cls = !inR ? "off" : tailHalf ? "warn" : !fin[s] ? "k1" : rvc[s] ? "k3" : "k2";
      cs[s].className = "cell click " + cls;
      cs[s].innerHTML = "<b>" + (rvc[s] ? "01" : "11") + "</b>" + s;
      if (inR && isEnd) {
        n++;
        if (fin[s]) { n16++; lanes.push([s, "k3"]); } else { n32++; lanes.push([s === 0 ? -1 : s - 1, "k2"]); }
      }
    }
    for (var h = 0; h < 16; h++) {
      ca[h].className = "cell " + (useA ? (hA[16 + h] ? "ok" : "") : "off");
      cb[h].className = "cell " + (!useA ? (hB[16 + h] ? "ok" : "") : "off");
      ca[h].innerHTML = "<b>" + (hA[16 + h] ? "S" : "") + "</b>" + (16 + h);
      cb[h].innerHTML = "<b>" + (hB[16 + h] ? "S" : "") + "</b>" + (16 + h);
    }
    var sh = P.sh;
    for (var l = 0; l < 36; l++) {
      var j = l - sh;
      if (l < sh) { cl[l].className = "cell warn"; cl[l].innerHTML = "<b>-</b>" + l; }
      else if (j < lanes.length) { cl[l].className = "cell " + lanes[j][1]; cl[l].innerHTML = "<b>s" + lanes[j][0] + "</b>" + l; }
      else { cl[l].className = "cell off"; cl[l].innerHTML = "<b></b>" + l; }
    }
    var halfEnd = fin[end] && !rvc[end];
    document.getElementById("bnd-n").textContent = n;
    document.getElementById("bnd-mix").textContent = n16 + " / " + n32;
    document.getElementById("bnd-hyp").textContent = useA ? "A (b16=0)" : "B (b16=1)";
    document.getElementById("bnd-half").textContent = halfEnd ? "예" : "아니오";
    var used = sh + n, v = document.getElementById("bnd-verdict");
    v.className = "verdict " + (halfEnd ? "warn" : "ok");
    v.textContent = "레인 " + used + "/36 사용 (거품 " + sh + " + 명령어 " + n + ")" + (halfEnd ? ", 슬롯 " + end + "의 앞반쪽은 다음 블록으로" : "");
  }
  function setAll(f) { for (var k = 0; k < 32; k++) rvc[k] = f(k); show(); }
  document.getElementById("bnd-rand").addEventListener("click", function () { var r = Book.rng(100 + seed++); setAll(function () { return r.next() < 0.5; }); });
  document.getElementById("bnd-rvc").addEventListener("click", function () { setAll(function () { return true; }); });
  document.getElementById("bnd-rvi").addEventListener("click", function () { setAll(function () { return false; }); });
  show();
})();

/* ---------- Sim E: PredChecker (PredChecker.scala:82-134; Ifu.scala:742-743; IfuRedirectReceiver.scala:42) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-pc");
  if (!root) return;
  var BASE = 0x80000100;
  /* [mnemonic, bytes, kind, offset]; kind: n = not CFI, br = conditional, jal = Direct, jalr = Indirect, ret = Indirect + pop */
  var PROG = [
    [["add", 4, "n"], ["c.addi", 2, "n"], ["jal", 4, "jal", 0x40], ["add", 4, "n"], ["beq", 4, "br", 0x20], ["c.mv", 2, "n"], ["add", 4, "n"], ["c.add", 2, "n"]],
    [["add", 4, "n"], ["c.addi", 2, "n"], ["add", 4, "n"], ["sub", 4, "n"], ["c.mv", 2, "n"], ["add", 4, "n"], ["c.li", 2, "n"], ["add", 4, "n"]],
    [["c.addi", 2, "n"], ["beq", 4, "br", 0x18], ["jalr a5", 4, "jalr"], ["add", 4, "n"], ["ret", 2, "ret"], ["add", 4, "n"], ["c.nop", 2, "n"], ["add", 4, "n"]]
  ];
  var KIND = { jal: "jalFault", jalr: "jalrFault", ret: "retFault", n: "notCfiTaken" };
  var el = document.getElementById("pc-lanes"), cells = [];
  for (var i = 0; i < 8; i++) { var c = document.createElement("div"); c.className = "cell"; el.appendChild(c); cells.push(c); }
  var prog = 0;
  var P = Book.bind(root, function () { show(); });
  function hex(v) { return "0x" + v.toString(16).toUpperCase(); }
  function show() {
    var pr = PROG[prog], tk = P.tk, pc = BASE, fault = -1, kind = "";
    var pcs = pr.map(function (x) { var p = pc; pc += x[1]; return p; });
    for (var k = 0; k < 8 && fault < 0; k++) {
      var valid = tk < 0 || k <= tk, taken = k === tk, t = pr[k][2];
      if (!valid) break;
      if ((t === "jal" || t === "jalr" || t === "ret") && !taken) { fault = k; kind = KIND[t]; }
      else if (t === "n" && taken) { fault = k; kind = KIND.n; }
    }
    var keep = fault >= 0 ? fault + 1 : (tk < 0 ? 8 : tk + 1);
    for (var j = 0; j < 8; j++) {
      cells[j].className = "cell " + (j === fault ? "bad" : j < keep ? "k3" : "off") + (j === tk ? " dash" : "");
      cells[j].innerHTML = "<b>" + pr[j][0] + "</b>" + (pcs[j] & 0xfff).toString(16);
    }
    var tgt = "-", train = "-";
    if (fault >= 0) {
      var f = pr[fault];
      if (f[2] === "ret") tgt = "RAS top";
      else if (f[2] === "jal" || f[2] === "br") tgt = hex(pcs[fault] + f[3]);
      else tgt = hex(pcs[fault] + (f[1] === 2 ? 2 : 4)) + (f[2] === "jalr" ? " (순차)" : "");
      train = (f[2] === "jal" || f[2] === "ret" || f[2] === "n") ? "예" : "아니오";
    }
    document.getElementById("pc-kind").textContent = fault >= 0 ? kind + " @" + fault : "없음";
    document.getElementById("pc-keep").textContent = keep;
    document.getElementById("pc-tgt").textContent = tgt;
    document.getElementById("pc-train").textContent = train;
    document.getElementById("pc-txt").textContent = "점선 = BPU가 taken이라 한 레인 (" + (tk < 0 ? "없음" : tk) +
      "). 검사 대상은 jal·jalr·ret·비분기뿐이고 beq 방향은 보지 않는다. 블록 시작 " + hex(BASE) + ".";
    var v = document.getElementById("pc-verdict");
    if (fault < 0) { v.className = "verdict ok"; v.textContent = "오류 없음: " + keep + "개가 IBuffer로"; }
    else {
      v.className = "verdict bad";
      v.textContent = "WB redirect: 레인 " + fault + " " + kind + " → " + tgt + (pr[fault][2] === "jalr" ? ", 실제 목표는 백엔드가 고침(추론)" : "");
    }
  }
  var bs = Array.prototype.slice.call(document.getElementById("pc-prog").querySelectorAll("button"));
  bs.forEach(function (b, k) {
    b.addEventListener("click", function () { bs.forEach(function (x) { x.classList.toggle("on", x === b); }); prog = k; show(); });
  });
  show();
})();

/* ---------- Sim F: IBuffer occupancy (IBuffer.scala:162-175, Size 48; DecodeWidth 8) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-ib");
  if (!root) return;
  var SIZE = 48, T = 120, S;
  var P = Book.bind(root, function () { reset(); });
  var cv = Book.canvas(document.getElementById("ib-cv"), draw);
  function blk() { var lo = Math.max(1, P.fn - 4), hi = Math.min(32, P.fn + 4); return S.r.int(lo, hi); }
  function reset() {
    S = { t: 0, valid: 0, allow: true, stall: 0, deq: 0, hist: [0], allowH: [1], r: Book.rng(4242) };
    S.cur = blk(); S.nxt = blk();
    cv.redraw(); show();
  }
  function step() {
    var numEnq = S.allow ? S.cur : 0;
    var numDeq = Math.min(S.valid, P.dec); /* bypass and the 8 output registers are not modelled */
    var next = S.valid + numEnq - numDeq;
    var prevInstrCount = S.allow ? S.nxt : S.cur; /* the block IFU offers next cycle */
    if (S.allow) { S.cur = S.nxt; S.nxt = blk(); } else S.stall++;
    S.allow = prevInstrCount < SIZE - next;
    S.valid = next; S.deq += numDeq; S.t++;
    S.hist.push(S.valid); S.allowH.push(S.allow ? 1 : 0);
  }
  function draw(ctx, w, h) {
    var f = Book.frame(ctx, w, h, { x: [0, T], y: [0, SIZE], xlabel: "사이클", ylabel: "점유", xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    Book.hline(ctx, f, SIZE, Book.css("bad"), "48칸");
    if (S.cur !== undefined) Book.hline(ctx, f, SIZE - S.cur, Book.css("warn"), "다음 블록이 들어갈 한계");
    S.allowH.forEach(function (a, i) {
      if (!a) { ctx.fillStyle = Book.css("bad-soft"); ctx.fillRect(f.x(i) - 1, f.y(SIZE), Math.max(2, f.x(1) - f.x(0)), f.y(0) - f.y(SIZE)); }
    });
    Book.line(ctx, S.hist.map(function (v, i) { return [f.x(i), f.y(v)]; }), Book.css("accent"), 2);
  }
  function show() {
    document.getElementById("ib-t").textContent = S.t;
    document.getElementById("ib-n").textContent = S.valid + " / 48";
    document.getElementById("ib-stall").textContent = S.stall;
    document.getElementById("ib-thr").textContent = S.t ? (S.deq / S.t).toFixed(2) : "0";
    var v = document.getElementById("ib-verdict");
    if (S.t === 0) { v.className = "verdict grey"; v.textContent = "대기: 재생 또는 한 사이클"; }
    else if (S.allow) { v.className = "verdict ok"; v.textContent = "allowEnq = 1: 다음 블록 " + S.cur + " < 빈칸 " + (SIZE - S.valid); }
    else { v.className = "verdict bad"; v.textContent = "allowEnq = 0: 다음 블록 " + S.cur + " ≥ 빈칸 " + (SIZE - S.valid) + ", IFU 정지"; }
  }
  var anim = Book.loop(cv.ctx.canvas, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.08) return true;
    anim.acc = 0; step(); cv.redraw(); show();
    return S.t < T;
  });
  var play = document.getElementById("ib-play");
  play.addEventListener("click", function () { if (S.t >= T) reset(); anim.start(); });
  document.getElementById("ib-step").addEventListener("click", function () { if (S.t < T) { step(); cv.redraw(); show(); } });
  document.getElementById("ib-reset").addEventListener("click", function () { anim.stop(); reset(); });
  reset();
})();

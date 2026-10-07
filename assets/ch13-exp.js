/* ch13 experiments: dependency-chain PREDICT (section 2), misprediction penalty (section 4),
   ROB-full under a load miss (section 5). Model and constants: ch13-engine.js (window.KMH13). */

/* PREDICT: 8-long dependent chains. The answer comes from running the engine, not a constant. */
(function () {
  "use strict";
  var root = document.getElementById("sim-chain");
  if (!root || !window.KMH13) return;
  var K = window.KMH13;
  function chain(line) {
    var a = [];
    for (var i = 0; i < 8; i++) a.push(line);
    var r = K.simulate(K.parse(a.join("\n")).prog, {});
    return r.rows.map(function (x) { return x.exS - r.rows[0].exS; });
  }
  var data = { alu: chain("add x1, x1, x2"), mul: chain("mul x1, x1, x2"), ld: chain("ld x1, 0(x1)") };
  var revealed = false;
  var cv = Book.canvas(document.getElementById("chain-cv"), draw);
  function draw(ctx, w, h) {
    var f = Book.frame(ctx, w, h, { x: [0, 7], y: [0, 30], xticks: 7, yticks: 6, xlabel: "체인 안 순서 (#)", ylabel: "EX 시작 - 첫 EX (cycle)",
      xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    var sets = [["alu", "ALU", Book.css("text-dim")]];
    if (revealed) sets.push(["mul", "MUL", Book.css("accent")], ["ld", "LOAD hit", Book.css("accent-2")]);
    sets.forEach(function (s) {
      var pts = data[s[0]].map(function (v, i) { return [f.x(i), f.y(v)]; });
      Book.line(ctx, pts, s[2], 2.2);
      pts.forEach(function (p) { ctx.fillStyle = s[2]; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); });
      var last = pts[pts.length - 1];
      Book.text(ctx, s[1] + " " + data[s[0]][7], last[0] - 6, last[1] - 10, { size: 12, weight: 700, color: s[2], align: "right" });
    });
    if (!revealed) Book.text(ctx, "MUL과 LOAD 선은 답을 고른 뒤 나타난다", f.box.x0 + 8, f.box.y0 + 22, { size: 12, color: Book.css("text-faint") });
  }
  var seg = document.getElementById("chain-choice");
  var btns = Array.prototype.slice.call(seg.querySelectorAll("button"));
  btns.forEach(function (b) {
    b.addEventListener("click", function () { btns.forEach(function (x) { x.classList.toggle("on", x === b); }); });
  });
  document.getElementById("chain-run").addEventListener("click", function () {
    var pick = +btns.filter(function (b) { return b.classList.contains("on"); })[0].textContent;
    var actual = data.mul[7];
    revealed = true; cv.redraw();
    document.getElementById("chain-ro-alu").textContent = data.alu[7];
    document.getElementById("chain-ro-mul").textContent = data.mul[7];
    document.getElementById("chain-ro-ld").textContent = data.ld[7];
    var out = document.getElementById("chain-out");
    out.className = "verdict " + (pick === actual ? "ok" : "warn");
    out.textContent = (pick === actual ? "맞았다. " : "빗나갔다. ") + "MUL 8개 체인: 7번의 의존 × 3 cycle = " + actual +
      " cycle. ALU는 " + data.alu[7] + ", LOAD hit 체인은 " + data.ld[7] + ".";
  });
  document.getElementById("chain-reset").addEventListener("click", function () {
    revealed = false; cv.redraw();
    ["alu", "mul", "ld"].forEach(function (k) { document.getElementById("chain-ro-" + k).textContent = "?"; });
    var out = document.getElementById("chain-out");
    out.className = "verdict grey"; out.textContent = "아직 실행하지 않음";
  });
})();

/* Misprediction penalty: components from the fact sheet G9 (추론) and a CPI-stack estimate. */
(function () {
  "use strict";
  var root = document.getElementById("sim-mp");
  if (!root || !window.KMH13) return;
  var K = window.KMH13;
  var P = Book.bind(root, function () { cv.redraw(); show(); });
  var cv = Book.canvas(document.getElementById("mp-cv"), draw);
  function pen() { return K.penalty({ aheadMiss: P.ahead, icMiss: P.ic, walk: P.walk, younger: P.young }); }
  function ipcAt(mpki, p) { return 1 / (1 / P.ipc + mpki / 1000 * p); }
  function draw(ctx, w, h) {
    var p = pen().total;
    var f = Book.frame(ctx, w, h, { x: [0, 20], y: [0, Math.ceil(P.ipc)], xticks: 5, yticks: 4, xlabel: "오예측 / 1000 명령 (MPKI)", ylabel: "실효 IPC",
      xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(1); } });
    var base = [], cur = [];
    for (var m = 0; m <= 20; m += 0.25) { base.push([f.x(m), f.y(ipcAt(m, 16))]); cur.push([f.x(m), f.y(ipcAt(m, p))]); }
    Book.line(ctx, base, Book.css("text-faint"), 1.5, [5, 4]);
    Book.line(ctx, cur, Book.css("accent"), 2.5);
    var x = f.x(P.mpki), y = f.y(ipcAt(P.mpki, p));
    ctx.fillStyle = Book.css("accent"); ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    Book.text(ctx, "벌점 " + p + " cycle", f.box.x1 - 4, f.box.y0 + 12, { size: 12, weight: 700, color: Book.css("accent"), align: "right" });
    Book.text(ctx, "점선: 기본 16 cycle", f.box.x1 - 4, f.box.y0 + 30, { size: 11, color: Book.css("text-faint"), align: "right" });
  }
  function show() {
    var r = pen();
    var eff = ipcAt(P.mpki, r.total);
    document.getElementById("mp-ro-p").textContent = r.total + " cycle";
    document.getElementById("mp-ro-parts").textContent = r.parts.filter(function (x) { return x.v > 0; }).map(function (x) { return x.v; }).join("+");
    document.getElementById("mp-ro-ipc").textContent = eff.toFixed(2);
    document.getElementById("mp-ro-loss").textContent = ((1 - eff / P.ipc) * 100).toFixed(1) + "%";
    document.getElementById("mp-ro-slot").textContent = r.total * K.C.W;
    var v = document.getElementById("mp-verdict");
    var walk = r.parts.filter(function (x) { return x.walk; })[0];
    var extra = r.total - 16;
    v.className = "verdict " + (extra > 0 ? "warn" : "ok");
    v.textContent = (extra > 0 ? "기본 16 cycle에 " + extra + " cycle이 더해졌다" : "기본 경로: 분기 EX → 정답 경로 첫 EX 16 cycle") +
      (walk ? " · walk " + walk.walk + " cycle 중 앞단 재충전 8 cycle과 겹치지 않는 몫 " + walk.v + " (추론)" : "");
  }
  show();
})();

/* ROB full: one load miss at the head, endless independent instructions behind it. */
(function () {
  "use strict";
  var root = document.getElementById("sim-rob");
  if (!root || !window.KMH13) return;
  var K = window.KMH13;
  var limit = K.C.ROB_DISPATCH, res = null;
  var P = Book.bind(root, function () { run(); });
  var cv = Book.canvas(document.getElementById("rob-cv"), draw);
  function run() { res = K.robRun(P.miss, limit, Math.max(160, P.miss + 90)); cv.redraw(); show(); }
  function draw(ctx, w, h) {
    if (!res) return;
    var f = Book.frame(ctx, w, h, { x: [0, res.T], y: [0, 360], xticks: 4, yticks: 4, xlabel: "cycle", ylabel: "ROB 점유",
      xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    ctx.fillStyle = Book.css("bad-soft");
    res.dispatched.forEach(function (d, t) { if (!d) ctx.fillRect(f.x(t), f.box.y0, Math.max(1, f.x(t + 1) - f.x(t)), f.box.y1 - f.box.y0); });
    Book.hline(ctx, f, 352, Book.css("bad"), "", [2, 3]);
    Book.hline(ctx, f, 344, Book.css("text-dim"), "", [5, 4]);
    Book.hline(ctx, f, limit === 336 ? 336 : 344, Book.css("accent"), "", [6, 3]);
    var lx = f.box.x1 - 6, ly = f.y(150);
    Book.text(ctx, "352 RobSize", lx, ly, { size: 11, color: Book.css("bad"), align: "right" });
    Book.text(ctx, "344 allowEnqueue (ROB)", lx, ly + 16, { size: 11, color: Book.css("text-dim"), align: "right" });
    Book.text(ctx, limit + " Dispatch 문턱", lx, ly + 32, { size: 11, weight: 700, color: Book.css("accent"), align: "right" });
    Book.vline(ctx, f, res.headReady, Book.css("warn"), "miss 완료", [4, 3]);
    Book.line(ctx, res.occ.map(function (v, t) { return [f.x(t), f.y(v)]; }), Book.css("accent-2"), 2.2);
  }
  function show() {
    document.getElementById("rob-ro-first").textContent = res.firstStall < 0 ? "없음" : res.firstStall;
    document.getElementById("rob-ro-stall").textContent = res.stall;
    document.getElementById("rob-ro-peak").textContent = res.peak;
    document.getElementById("rob-ro-drop").textContent = res.dropped;
    document.getElementById("rob-ro-lost").textContent = res.stall * K.C.W;
    var v = document.getElementById("rob-verdict");
    if (res.dropped) {
      v.className = "verdict bad";
      v.textContent = "cycle " + res.firstDrop + ": 이미 보낸 요청 " + res.dropped + "개를 ROB가 거절했다. Dispatch 쪽에서는 보냈다고 여기므로 명령을 잃는다 (추론).";
    } else if (res.stall) {
      v.className = "verdict warn";
      v.textContent = "miss 지연 " + P.miss + " cycle을 다 숨기지 못했다: cycle " + res.firstStall + "부터 dispatch가 " + res.stall + " cycle 멈췄고, 최대 점유 " + res.peak + "/352.";
    } else {
      v.className = "verdict ok";
      v.textContent = "ROB 안에서 지연을 숨겼다: 최대 점유 " + res.peak + ", dispatch는 한 번도 멈추지 않았다.";
    }
  }
  var btns = Array.prototype.slice.call(document.getElementById("rob-limit").querySelectorAll("button"));
  btns.forEach(function (b, i) {
    b.addEventListener("click", function () {
      btns.forEach(function (x) { x.classList.toggle("on", x === b); });
      limit = i === 0 ? K.C.ROB_DISPATCH : K.C.ROB_ENQ;
      run();
    });
  });
  run();
})();

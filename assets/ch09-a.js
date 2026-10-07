/* ch09-a.js: sim-life, sim-pfwd, sim-fwd, sim-raw. DOM-based; colours come from book.css classes. */
var Ch09 = (function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  /* .seg buttons: book.js does not toggle .on, so each sim does. Returns a getter for the selected index. */
  function seg(id, cb) {
    var bs = Array.prototype.slice.call($(id).querySelectorAll("button"));
    bs.forEach(function (b, i) {
      b.addEventListener("click", function () {
        bs.forEach(function (x) { x.classList.toggle("on", x === b); });
        if (cb) cb(i);
      });
    });
    return function () { return bs.findIndex(function (b) { return b.classList.contains("on"); }); };
  }
  function setRange(r, v) { r.value = v; if (window.Euiyun) Euiyun.fill(r); }
  function cell(parent, text, cls) {
    var d = document.createElement("div");
    d.textContent = text;
    if (cls) d.className = cls;
    parent.appendChild(d);
    return d;
  }
  /* Player: step/play/reset over positions 0..max() with a range scrubber. */
  function player(o) {
    var timer = null;
    function stop() { if (timer) { clearInterval(timer); timer = null; } o.play.textContent = "재생"; }
    function go(p) { setRange(o.range, p); o.show(p); }
    o.range.addEventListener("input", function () { stop(); o.show(+o.range.value); });
    o.play.addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (+o.range.value >= +o.range.max) go(0);
      o.play.textContent = "멈춤";
      timer = setInterval(function () {
        var p = +o.range.value + 1;
        if (p > +o.range.max) { stop(); return; }
        go(p);
      }, o.ms || 600);
    });
    if (o.step) o.step.addEventListener("click", function () { stop(); go(Math.min(+o.range.max, +o.range.value + 1)); });
    o.reset.addEventListener("click", function () { stop(); go(0); });
    return { stop: stop, go: go };
  }
  return { $: $, seg: seg, setRange: setRange, cell: cell, player: player };
})();

/* sim-life: scripted frames per scenario. Routes, entrances and causes follow NewLoadUnit.scala /
   LoadQueueReplay.scala; waits for external events (TLB hint, refill) are synthetic. */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-life")) return;
  var LANES = ["s0", "s1", "s2", "s3", "Q", "완료"];
  function f(at, ent, cause, log) { return { at: at, ent: ent, cause: cause, log: log }; }
  var head = [
    f(0, "scalarIssue", "없음", "IQ에서 발행. 입구 5번 scalarIssue가 중재에서 이김. vaddr 계산, TLB·DCache·SQ·Sbuffer 요청 시작"),
    f(1, "scalarIssue", "없음", "TLB 응답 확인, nuke 검사")
  ];
  var S = [
    head.concat([
      f(2, "scalarIssue", "없음", "DCache 적중, SQ·Sbuffer 포워딩 바이트 병합. 원인 비트 0개"),
      f(3, "scalarIssue", "없음", "결과 라이트백, LQ에 완료 기록"),
      f(5, "scalarIssue", "없음", "완료. 발행부터 4사이클")
    ]),
    head.concat([
      f(2, "scalarIssue", "C_TM", "TLB 미스: 원인 비트 C_TM(3)"),
      f(3, "scalarIssue", "C_TM", "tlbMiss라 패스트 리플레이 자격 없음 → LRQ에 C_TM 기록, 막힘=1"),
      f(4, "scalarIssue", "C_TM", "LRQ에서 TLB hint 대기 (합성 대기)"),
      f(4, "scalarIssue", "C_TM", "LRQ에서 TLB hint 대기"),
      f(4, "scalarIssue", "C_TM", "LRQ에서 TLB hint 대기"),
      f(4, "scalarIssue", "C_TM", "TLB hint id 일치 → 막힘 해제, 선택됨"),
      f(0, "replayLoPrio", "C_TM", "C_TM은 고우선 입구 대상이 아니므로 3번 replayLoPrio로 재진입"),
      f(1, "replayLoPrio", "C_TM", "이번엔 TLB 적중"),
      f(2, "replayLoPrio", "C_TM", "DCache 적중, 원인 없음"),
      f(3, "replayLoPrio", "C_TM", "라이트백"),
      f(5, "replayLoPrio", "C_TM", "완료. 발행부터 12사이클(대기 길이는 합성)")
    ]),
    head.concat([
      f(2, "scalarIssue", "C_BC", "같은 사이클 다른 로드와 DCache 뱅크 충돌: C_BC(8)"),
      f(3, "scalarIssue", "C_BC", "더 높은 원인 없음 + 자격 충족 → 패스트 리플레이. LRQ에 쓰지 않음"),
      f(0, "fastReplay", "C_BC", "2번 입구 fastReplay로 s0 재진입"),
      f(1, "fastReplay", "C_BC", "TLB 적중"),
      f(2, "fastReplay", "C_BC", "충돌 없음, 데이터 확보"),
      f(3, "fastReplay", "C_BC", "라이트백"),
      f(5, "fastReplay", "C_BC", "완료. 발행부터 8사이클")
    ]),
    head.concat([
      f(2, "scalarIssue", "C_DM", "DCache 미스, MSHR 할당: C_DM(6)"),
      f(3, "scalarIssue", "C_DM", "C_DM은 패스트 리플레이 대상 아님 → LRQ에 C_DM 기록, 막힘=1"),
      f(4, "scalarIssue", "C_DM", "리필 대기 (합성 대기, 실제 길이는 L2 지연)"),
      f(4, "scalarIssue", "C_DM", "리필 대기"),
      f(4, "scalarIssue", "C_DM", "리필 대기"),
      f(4, "scalarIssue", "C_DM", "리필 대기"),
      f(4, "scalarIssue", "C_DM", "해당 MSHR의 TL-D 리필 도착 → 막힘 해제, 선택됨(ldWbPtr+0~3 아니면 고우선 클래스에서 나이순)"),
      f(0, "replayHiPrio", "C_DM", "C_DM이라 1번 replayHiPrio로 재진입. 이 입구만 TL-D·uncache 포워딩 요청을 낸다"),
      f(1, "replayHiPrio", "C_DM", "TLB 적중"),
      f(2, "replayHiPrio", "C_DM", "리필 데이터(TL-D)에서 포워딩"),
      f(3, "replayHiPrio", "C_DM", "라이트백"),
      f(5, "replayHiPrio", "C_DM", "완료. 발행부터 13사이클(대기 길이는 합성)")
    ])
  ];
  var lanes = $("life-lanes").children, log = $("life-log"), range = $("life-pos");
  var getScn = Ch09.seg("life-scn", function () { pl.stop(); range.max = S[getScn()].length - 1; pl.go(0); });
  function show(p) {
    var fr = S[getScn()], cur = fr[Math.min(p, fr.length - 1)];
    $("life-pos-o").textContent = p;
    for (var i = 0; i < lanes.length; i++) lanes[i].classList.toggle("here", i === cur.at);
    $("life-cyc").textContent = p;
    $("life-at").textContent = LANES[cur.at];
    $("life-ent").textContent = cur.ent;
    $("life-cause").textContent = cur.cause;
    log.innerHTML = "";
    for (var k = 0; k <= p && k < fr.length; k++) {
      var li = document.createElement("li");
      li.textContent = "c" + k + " · " + fr[k].log;
      if (k === p) li.className = "cur";
      log.appendChild(li);
    }
    log.scrollTop = log.scrollHeight;
  }
  var pl = Ch09.player({ range: range, play: $("life-play"), step: $("life-step"), reset: $("life-reset"), show: show });
  range.max = S[0].length - 1;
  pl.go(0);
})();

/* Store-to-load forward rule (NewStoreQueue.scala:488-520, 636, 650-660) on synthetic stores in one 16B bank.
   Stores are listed oldest first; all are older than the load. */
var Ch09Fwd = (function () {
  "use strict";
  var STORES = [{ n: "S1", off: 0, sz: 8, op: "sd" }, { n: "S2", off: 4, sz: 4, op: "sw" }, { n: "S3", off: 6, sz: 2, op: "sh" }];
  function run(ld, ready, dataReady) {
    var lo = ld.off, hi = Math.min(15, ld.off + ld.sz - 1);
    var cand = [];
    STORES.forEach(function (s, i) {
      if (ready[i] && s.off <= hi && s.off + s.sz - 1 >= lo) cand.push(i); // address ready && byte overlap
    });
    var r = { cand: cand, sel: -1, full: false, cause: "없음", bytes: [] };
    if (cand.length) {
      r.sel = cand[cand.length - 1]; // youngest older store
      var s = STORES[r.sel];
      r.full = s.off <= lo && s.off + s.sz - 1 >= hi;
      var safe = cand.length <= 1 || r.full;
      if (!safe) r.cause = "C_SMF";
      else if (!dataReady[r.sel]) r.cause = "C_FF";
    }
    for (var b = 0; b < 16; b++) {
      if (b < lo || b > hi) r.bytes.push("");
      else if (r.sel >= 0 && r.cause === "없음" && b >= STORES[r.sel].off && b < STORES[r.sel].off + STORES[r.sel].sz) r.bytes.push(STORES[r.sel].n);
      else r.bytes.push(r.cause === "없음" ? "C" : "?");
    }
    return r;
  }
  return { STORES: STORES, run: run };
})();

(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-pfwd")) return;
  var getPick = Ch09.seg("pfwd-choice");
  $("pfwd-run").addEventListener("click", function () {
    var r = Ch09Fwd.run({ off: 4, sz: 4 }, [true, true, true], [true, true, true]);
    var actual = r.cause === "C_SMF" ? 2 : 0; // no rule ever mixes two stores (index 1)
    var out = $("pfwd-out"), ok = getPick() === actual;
    out.className = "verdict " + (ok ? "ok" : "warn");
    out.textContent = (ok ? "맞았다. " : "빗나갔다. ") + "겹친 스토어 " + r.cand.length + "개, 가장 어린 " +
      Ch09Fwd.STORES[r.sel].n + "(바이트 6-7)가 로드 4-7을 다 덮지 못해 s2SafeForward=0 → " + r.cause +
      ". SQ는 한 스토어에서만 꺼내므로 S2·S3를 섞는 경로는 없다.";
  });
})();

(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-fwd")) return;
  var SZ = [1, 2, 4, 8], grid = $("fwd-grid"), off = $("fwd-off");
  var getSize = Ch09.seg("fwd-size", update);
  ["fwd-s1", "fwd-s2", "fwd-s3", "fwd-s3d"].forEach(function (id) { $(id).addEventListener("change", update); });
  off.addEventListener("input", update);
  function update() {
    var ld = { off: +off.value, sz: SZ[getSize()] };
    $("fwd-off-o").textContent = ld.off;
    var ready = [$("fwd-s1").checked, $("fwd-s2").checked, $("fwd-s3").checked];
    var r = Ch09Fwd.run(ld, ready, [true, true, $("fwd-s3d").checked]);
    grid.innerHTML = "";
    Ch09.cell(grid, "바이트", "rl");
    for (var b = 0; b < 16; b++) Ch09.cell(grid, b.toString(16));
    Ch09Fwd.STORES.forEach(function (s, i) {
      Ch09.cell(grid, s.n + " " + s.op, "rl");
      for (var b = 0; b < 16; b++) {
        var inS = b >= s.off && b < s.off + s.sz;
        Ch09.cell(grid, inS ? (ready[i] ? "■" : "?") : "", inS ? (r.sel === i ? "on1" : (ready[i] ? "on2" : "")) : "");
      }
    });
    Ch09.cell(grid, "로드", "rl");
    for (b = 0; b < 16; b++) Ch09.cell(grid, b >= ld.off && b < ld.off + ld.sz && b < 16 ? "■" : "", b >= ld.off && b < ld.off + ld.sz ? "ld" : "");
    Ch09.cell(grid, "결과", "rl");
    r.bytes.forEach(function (x) { Ch09.cell(grid, x, x === "" ? "" : (x === "?" ? "bad" : (x === "C" ? "" : "ok"))); });
    $("fwd-n").textContent = r.cand.length;
    $("fwd-sel").textContent = r.sel < 0 ? "없음" : Ch09Fwd.STORES[r.sel].n;
    $("fwd-full").textContent = r.sel < 0 ? "-" : (r.full ? "예" : "아니오");
    $("fwd-cause").textContent = r.cause;
    var v = $("fwd-verdict"), cross = ld.off + ld.sz > 16, txt, cls;
    if (r.cause === "C_SMF") { cls = "bad"; txt = "겹친 스토어 " + r.cand.length + "개 중 가장 어린 " + Ch09Fwd.STORES[r.sel].n + "가 로드를 다 덮지 못한다 → forwardInvalid, C_SMF 리플레이 (오래된 스토어가 SQ를 떠날 때까지)."; }
    else if (r.cause === "C_FF") { cls = "warn"; txt = "선택된 " + Ch09Fwd.STORES[r.sel].n + "의 데이터가 아직 없다 → dataInvalid, C_FF 리플레이 (그 sqIdx 데이터가 써지면 깸)."; }
    else if (r.sel < 0) { cls = "grey"; txt = "주소가 준비된 겹치는 오래된 스토어가 없다. 전부 Sbuffer·캐시(C)에서 읽는다."; }
    else { cls = "ok"; txt = Ch09Fwd.STORES[r.sel].n + "에서 " + r.bytes.filter(function (x) { return x === Ch09Fwd.STORES[r.sel].n; }).length + "바이트 포워딩" + (r.full ? " (전부 덮음, SQ만으로 완성)." : ", 나머지는 Sbuffer·캐시(C)."); }
    if (ready.indexOf(false) >= 0) txt += " 주소 미준비 스토어는 비교 대상이 아니다. 같은 바이트였다면 4절의 RAW 검사가 나중에 잡는다.";
    if (cross) txt += " 16바이트를 넘는 부분은 s0이 unalignHead/tail로 나누므로 이 표는 첫 16바이트만 본다.";
    v.className = "verdict " + cls;
    v.textContent = txt;
  }
  update();
})();

/* sim-raw: when a same-address older store's address appears relative to the load's pipeline.
   Window rules from NewLoadUnit.scala:674-681/1023-1031 (nuke in s1/s2), LoadQueueRAW.scala:131-134 (enqueue),
   268/363 (3-cycle select), 389 (level flush). SQ visibility at Ts+1 and the 1-cycle LRQ re-entry are simplified. */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-raw")) return;
  var N = 18, tl = $("raw-tl"), pos = $("raw-pos");
  tl.style.gridTemplateColumns = "34px repeat(" + N + ", minmax(0, 1fr))";
  tl.style.fontSize = "10px";
  function model(L, T, same, full) {
    var load = {}, store = {}, ev = {}, r = {};
    function pipe(t0, tag) { load[t0] = "s0"; load[t0 + 1] = "s1"; load[t0 + 2] = "s2"; load[t0 + 3] = "s3"; if (tag) ev[t0 + 3] = tag; }
    if (T - 1 >= 0) store[T - 1] = "S0";
    store[T] = "S1";
    pipe(L);
    if (!same || T <= L) {
      r.who = !same ? (T >= L + 3 && !full ? "RAW 큐 (불일치)" : "없음") : "SQ 포워딩";
      if (!same && T >= L + 3 && full) { r.who = "C_RAW 리플레이"; }
      r.done = L + 3; r.flush = "없음";
      if (!same && T >= L + 3 && full) {
        ev[L + 3] = "Q"; for (var w = L + 4; w <= T; w++) load[w] = "Q";
        pipe(T + 1, "W"); r.done = T + 4;
      } else ev[L + 3] = "W";
      r.txt = !same ? (T >= L + 3 ? (full ? "주소가 달라도 RAW 큐가 가득이면 s2에서 C_RAW가 된다. 오래된 스토어 주소가 모두 나오면 풀린다." : "오래된 스토어 주소가 미준비라 RAW 큐에 엔트리가 생기지만, 주소가 달라 CAM이 일치하지 않는다. 스토어 주소가 준비되면 엔트리를 푼다.") : "주소가 달라 포워딩도 nuke도 없다. 그대로 라이트백.")
        : "스토어 주소가 로드 s1 전에 SQ에 있다 → 포워딩으로 올바른 값을 받는다.";
      return finish();
    }
    if (T <= L + 2) {
      ev[T] = "N"; ev[L + 3] = "F"; pipe(L + 4, "W");
      r.who = "nuke (C_NK)"; r.done = L + 7; r.flush = "없음";
      r.txt = "스토어 S1이 로드 " + (T === L + 1 ? "s1" : "s2") + "과 같은 사이클 → nuke. s3에서 패스트 리플레이로 s0 재진입, 그땐 SQ에서 포워딩한다. 뒤 명령은 버리지 않는다.";
      return finish();
    }
    if (full) {
      ev[L + 3] = "Q"; for (var q = L + 4; q <= T; q++) load[q] = "Q";
      pipe(T + 1, "W");
      r.who = "C_RAW 리플레이"; r.done = T + 4; r.flush = "없음";
      r.txt = "RAW 큐 56칸이 가득이라 s2에서 C_RAW. 오래된 스토어 주소가 모두 준비될 때까지 LRQ에서 기다렸다가 다시 실행한다 (재진입 1사이클은 단순화).";
      return finish();
    }
    ev[L + 3] = "×"; ev[T] = "C";
    for (var k = 1; k <= 2; k++) ev[T + k] = "s";
    ev[T + 3] = "FL";
    r.who = "LoadQueueRAW"; r.done = (L + 3) + " (틀린 값)"; r.flush = "사이클 " + (T + 3) + ", level=flush";
    r.txt = "로드는 s2에서 RAW 큐에 등록된 뒤 틀린 값으로 라이트백했다. 스토어 S1의 CAM이 사이클 " + T + "에 일치를 찾고 3사이클 선택 뒤 로드 pc부터 flush. mdpTrain으로 StoreSet이 학습한다.";
    return finish();
    function finish() { r.load = load; r.store = store; r.ev = ev; return r; }
  }
  var cur;
  function draw(p) {
    $("raw-pos-o").textContent = p;
    tl.innerHTML = "";
    Ch09.cell(tl, "c", "rl");
    for (var c = 0; c < N; c++) Ch09.cell(tl, String(c), c === p ? "now" : "");
    [["로드", cur.load], ["스토어", cur.store], ["사건", cur.ev]].forEach(function (row) {
      Ch09.cell(tl, row[0], "rl");
      for (var c = 0; c < N; c++) {
        var x = row[1][c] || "", cls = c > p ? "hide" : "";
        if (x === "FL" || x === "×") cls += " bad"; else if (x === "N" || x === "Q" || x === "F") cls += " ld"; else if (x === "W") cls += " ok"; else if (x) cls += " on1";
        Ch09.cell(tl, x, cls.trim());
      }
    });
    var end = p >= N - 1;
    $("raw-who").textContent = end ? cur.who : "…";
    $("raw-done").textContent = end ? String(cur.done) : "…";
    $("raw-flush").textContent = end ? cur.flush : "…";
    var v = $("raw-verdict");
    v.className = "verdict " + (end ? (cur.flush !== "없음" ? "bad" : (cur.who.indexOf("nuke") === 0 || cur.who.indexOf("C_RAW") === 0 ? "warn" : "ok")) : "grey");
    v.textContent = end ? cur.txt : "진행 중… 사이클 " + p + " (진행 슬라이더를 끝까지 끌면 결과)";
  }
  function recompute() {
    var L = +$("raw-l").value, T = +$("raw-s").value;
    $("raw-tl-o").textContent = L; $("raw-ts-o").textContent = T;
    cur = model(L, T, $("raw-same").checked, $("raw-full").checked);
    draw(+pos.value);
  }
  ["raw-l", "raw-s"].forEach(function (id) { $(id).addEventListener("input", recompute); });
  ["raw-same", "raw-full"].forEach(function (id) { $(id).addEventListener("change", recompute); });
  Ch09.player({ range: pos, play: $("raw-play"), reset: $("raw-reset"), show: draw, ms: 350 });
  recompute();
})();

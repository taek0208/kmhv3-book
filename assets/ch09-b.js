/* ch09-b.js: sim-cause, sim-cool, sim-ss, sim-fw, sim-sb. Needs Ch09 helpers from ch09-a.js. */

/* sim-cause: s2 cause bits -> s3 decision. NewLoadUnit.scala:1063-1081 (fast replay), 1566 (one-hot record),
   LoadQueueReplay.scala:898-950 (initial blocking), 755-757 (re-entry entrance). */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-cause")) return;
  var NAMES = ["C_UNCACHE", "C_SMF", "C_MA", "C_TM", "C_FF", "C_DR", "C_DM", "C_WF", "C_BC", "C_RAR", "C_RAW", "C_NK", "C_MF"];
  var box = $("cz-box"), cb = [];
  NAMES.forEach(function (n, i) {
    var l = document.createElement("label"), c = document.createElement("input");
    c.type = "checkbox"; c.disabled = i === 7 || i === 12;
    l.appendChild(c); l.appendChild(document.createTextNode(" " + i + " " + n + (c.disabled ? " (항상 0)" : "")));
    box.appendChild(l); cb.push(c);
    c.addEventListener("change", update);
  });
  ["cz-ffnow", "cz-nf", "cz-fromfast"].forEach(function (id) { $(id).addEventListener("change", update); });
  function preset(list, nf) {
    cb.forEach(function (c, i) { c.checked = list.indexOf(i) >= 0; });
    if (nf !== undefined) $("cz-nf").checked = nf;
    update();
  }
  $("cz-p1").addEventListener("click", function () { preset([8]); });
  $("cz-p2").addEventListener("click", function () { preset([3, 6]); });
  $("cz-p3").addEventListener("click", function () { preset([2, 11]); });
  $("cz-p4").addEventListener("click", function () { preset([10, 11]); });
  $("cz-clr").addEventListener("click", function () { preset([]); });
  function higher(c, k) { for (var i = 0; i < k; i++) if (c[i]) return true; return false; }
  function update() {
    var c = cb.map(function (x) { return x.checked; });
    var ffnow = $("cz-ffnow").checked, nf = $("cz-nf").checked, fromFast = $("cz-fromfast").checked;
    var top = c.indexOf(true), v = $("cz-verdict");
    if (top < 0) {
      $("cz-path").textContent = "라이트백"; $("cz-rec").textContent = "없음"; $("cz-blk").textContent = "-"; $("cz-ent").textContent = "-";
      v.className = "verdict ok"; v.textContent = "원인 비트가 없다. s3에서 결과를 라이트백하고 LQ에 완료로 기록한다.";
      return;
    }
    var cm = c.slice(); cm[2] = c[2] && !nf; // C_MA masked when the nuking store is the MDP target
    var why = [];
    if (c[4] && !higher(c, 4) && ffnow) why.push("C_FF(데이터가 이번/직전 사이클에 써짐)");
    if (c[5] && !higher(c, 5)) why.push("C_DR");
    if (c[8] && !higher(c, 8)) why.push("C_BC");
    if (c[11] && !higher(cm, 9)) why.push("C_NK(코드 0~8 원인 없음" + (c[2] && nf ? ", C_MA는 nukeFirst로 무시" : "") + ")");
    var block = [];
    if (fromFast) block.push("이미 fastReplay 입구");
    if (c[3]) block.push("TLB 미스");
    var fast = why.length > 0 && block.length === 0;
    var rec = NAMES[top];
    if (fast) {
      $("cz-path").textContent = "패스트 리플레이";
      $("cz-rec").textContent = "기록 안 함";
      $("cz-blk").textContent = "-";
      $("cz-ent").textContent = "2 fastReplay";
      v.className = "verdict ok";
      v.textContent = "자격: " + why.join(", ") + ". LRQ를 거치지 않고 s3에서 s0의 2번 입구로 바로 돌아간다.";
      return;
    }
    var blk;
    if (top === 5 || top === 8 || top === 11) blk = "아니오 (다음 사이클 재시도 가능)";
    else if (top === 4) blk = ffnow ? "아니오 (생산 스토어 데이터 준비됨)" : "예 (그 sqIdx 데이터 대기)";
    else if (top === 3) blk = "예 (TLB가 가득 찼거나, 이번·직전 사이클 TLB hint 또는 빠른 TLB hint 응답이 맞으면 아니오)";
    else if (top === 6) blk = "예 (리필이 이번/직전 사이클이면 아니오. full_fwd는 로드 유닛이 항상 0으로 씀)";
    else blk = "예";
    $("cz-path").textContent = "LRQ 기록";
    $("cz-rec").textContent = top + " " + rec;
    $("cz-blk").textContent = blk;
    $("cz-ent").textContent = top === 6 || top === 0 ? "1 replayHiPrio" : "3 replayLoPrio";
    var n = c.filter(Boolean).length;
    v.className = "verdict warn";
    v.textContent = "PriorityEncoderOH가 " + n + "개 원인 중 코드가 가장 작은 " + rec + "만 기록한다." +
      (why.length ? " 패스트 리플레이 후보(" + why.join(", ") + ")였지만 " + block.join(", ") + " 때문에 자격이 없다." : "") +
      (n > 1 ? " 나머지 원인은 재시도 때 s2에서 다시 판정된다." : "");
  }
  update();
})();

/* sim-cool: per-pipe coldCounter (LoadQueueReplay.scala:656-663, 750, 792-802). Model: the s1 register is loaded
   only when replayCanFire; the load unit always accepts (fire = s1 valid). Demand is synthetic. */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-cool")) return;
  var root = $("sim-cool"), tl = $("cool-tl"), N = 40, H = 20;
  tl.style.gridTemplateColumns = "40px repeat(" + H + ", minmax(0, 1fr))";
  tl.style.fontSize = "10px";
  var P = Book.bind(root, draw);
  var getDem = Ch09.seg("cool-dem", function () { draw(); });
  function sim(TH, dem) {
    var c = 0, s1 = false, lastFire = false, out = [];
    for (var t = 0; t < N; t++) {
      var demand = dem === 0 || t < 20;
      var fire = s1, can = c < TH;
      out.push({ c: c, fire: fire, demand: demand });
      s1 = can && demand;
      c = (lastFire && fire) || c >= TH ? (c + 1) % 16 : 0;
      lastFire = fire;
    }
    return out;
  }
  function draw() {
    var r = sim(P.th, getDem()), fires = 0, run = 0, best = 0, rest = 0;
    r.forEach(function (x, t) {
      if (x.fire) { fires++; run++; best = Math.max(best, run); } else run = 0;
      if (t > 0 && !x.fire && r[t - 1].demand) rest++;
    });
    tl.innerHTML = "";
    for (var h = 0; h < N; h += H) {
      Ch09.cell(tl, "c" + h + "~", "rl");
      for (var t = h; t < h + H; t++) Ch09.cell(tl, String(t % 100), "");
      Ch09.cell(tl, "발사", "rl");
      for (t = h; t < h + H; t++) Ch09.cell(tl, r[t].fire ? "●" : (r[t].demand ? "·" : ""), r[t].fire ? "ok" : (r[t].demand && t > 0 ? "ld" : ""));
      Ch09.cell(tl, "카운터", "rl");
      for (t = h; t < h + H; t++) Ch09.cell(tl, String(r[t].c), r[t].c >= P.th ? "bad" : "");
    }
    $("cool-n").textContent = fires;
    $("cool-run").textContent = best;
    $("cool-rest").textContent = rest;
  }
  draw();
})();

/* sim-ss: StoreSet training on one looping store/load pair (StoreSet.scala:218-327, 483-541).
   Folded PCs and sqIdx are synthetic; fold6 = x[5:0]^x[9:6] stands in for XORFold(x, 6) (추론). */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-ss")) return;
  var LD = 0x2A7, ST = 0x1C3;
  function fold6(x) { return (x & 0x3f) ^ (x >> 6); }
  function hex(x) { return "0x" + x.toString(16).toUpperCase(); }
  var st, getMode = Ch09.seg("ss-mode", reset);
  function reset() {
    st = { it: 0, vio: 0, ma: 0, ssit: {}, lfst: null, log: [] };
    st.ssit[LD] = { v: false, id: 0, strict: false };
    st.ssit[ST] = { v: false, id: 0, strict: false };
    render();
  }
  function train(l, s) {
    var a = st.ssit[l], b = st.ssit[s];
    if (!a.v && !b.v) { var id = Math.min(fold6(l), fold6(s)); a.v = b.v = true; a.id = b.id = id; return "둘 다 없음 → SSID = min(" + hex(fold6(l)) + ", " + hex(fold6(s)) + ") = " + id; }
    if (a.v && !b.v) { b.v = true; b.id = a.id; return "로드만 있음 → 스토어에 " + a.id; }
    if (!a.v && b.v) { a.v = true; a.id = b.id; return "스토어만 있음 → 로드에 " + b.id; }
    if (a.id === b.id) { a.strict = true; return "이미 같은 SSID → 로드 strict=1"; }
    var m = Math.min(a.id, b.id); a.id = b.id = m; return "다른 SSID → 작은 " + m + "로 합침";
  }
  function step() {
    var on = getMode() === 0, it = ++st.it, sq = (10 + it) % 128, L = [];
    var s = st.ssit[ST], l = st.ssit[LD];
    if (on && s.v) { st.lfst = { id: s.id, sq: sq }; L.push("스토어 디스패치: SSIT 적중(" + s.id + ") → LFST[" + s.id + "] = sqIdx " + sq); }
    else L.push("스토어 디스패치: SSIT " + (on ? "미적중" : "꺼짐") + ", sqIdx " + sq);
    var wait = on && l.v && st.lfst && st.lfst.id === l.id;
    if (wait) {
      st.ma++;
      L.push("로드: LFST[" + l.id + "] 유효 → loadWaitBit=1, waitSqIdx=" + sq + ". SQ가 그 스토어 주소 미준비를 알려 C_MA로 대기");
      L.push("스토어 S1 주소 → LFST 무효화, 로드 C_MA 풀림 → 재실행 때 SQ 포워딩. flush 없음");
      st.lfst = null;
    } else {
      st.vio++;
      L.push("로드: 기다릴 스토어 없음 → 먼저 실행, 캐시의 옛 값 사용");
      L.push("스토어 S1 주소 → LoadQueueRAW 일치 → flush" + (on ? ", mdpTrain: " + train(LD, ST) : " (학습 안 함)"));
      st.lfst = null;
    }
    st.log = L.map(function (x) { return "반복 " + it + " · " + x; }).concat(st.log).slice(0, 12);
    render();
  }
  function render() {
    var t = $("ss-tab"), rows = [["표", "PC", "fold6", "v", "SSID", "strict"]];
    [["SSIT 로드", LD], ["SSIT 스토어", ST]].forEach(function (r) {
      var e = st.ssit[r[1]];
      rows.push([r[0], hex(r[1]), hex(fold6(r[1])), e.v ? "1" : "0", e.v ? String(e.id) : "-", e.strict ? "1" : "0"]);
    });
    rows.push(["LFST", "-", "-", st.lfst ? "1" : "0", st.lfst ? String(st.lfst.id) : "-", st.lfst ? "sq " + st.lfst.sq : "-"]);
    t.innerHTML = rows.map(function (r, i) {
      return "<tr>" + r.map(function (x) { return i ? "<td>" + x + "</td>" : "<th>" + x + "</th>"; }).join("") + "</tr>";
    }).join("");
    var log = $("ss-log");
    log.innerHTML = "";
    st.log.forEach(function (x, i) { var li = document.createElement("li"); li.textContent = x; if (i < 2) li.className = "cur"; log.appendChild(li); });
    $("ss-it").textContent = st.it;
    $("ss-vio").textContent = st.vio;
    $("ss-ma").textContent = st.ma;
    $("ss-id").textContent = st.ssit[LD].v ? String(st.ssit[LD].id) : "-";
  }
  $("ss-next").addEventListener("click", step);
  $("ss-run").addEventListener("click", function () { for (var i = 0; i < 8; i++) step(); });
  $("ss-reset").addEventListener("click", reset);
  reset();
})();

/* sim-fw: forceWrite(t+1) = cnt>=Upper ? 1 : (cnt>=Lower && forceWrite(t))  (NewStoreQueue.scala:913-917).
   The validCnt sequence is synthetic. */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-fw")) return;
  var SEQ = [50, 58, 61, 59, 60, 58, 61, 57, 54, 56], tl = $("fw-tl"), shown = false;
  tl.style.gridTemplateColumns = "64px repeat(" + (SEQ.length + 1) + ", minmax(0, 1fr))";
  var P = Book.bind($("sim-fw"), function () { draw(); });
  var getPick = Ch09.seg("fw-choice");
  function run() {
    var fw = [0];
    SEQ.forEach(function (c, t) { fw.push(c >= P.up ? 1 : (c >= P.lo && fw[t] ? 1 : 0)); });
    return fw;
  }
  function draw() {
    var fw = run();
    tl.innerHTML = "";
    Ch09.cell(tl, "사이클", "rl");
    for (var t = 0; t <= SEQ.length; t++) Ch09.cell(tl, String(t), t === 4 ? "now" : "");
    Ch09.cell(tl, "validCnt", "rl");
    for (t = 0; t <= SEQ.length; t++) Ch09.cell(tl, t < SEQ.length ? String(SEQ[t]) : "", t < SEQ.length && SEQ[t] >= P.up ? "bad" : (t < SEQ.length && SEQ[t] >= P.lo ? "ld" : ""));
    Ch09.cell(tl, "forceWrite", "rl");
    for (t = 0; t <= SEQ.length; t++) Ch09.cell(tl, shown || t === 0 ? String(fw[t]) : "?", shown && fw[t] ? "ok" : "");
    if (!shown) return;
    var tog = 0;
    for (t = 1; t < fw.length; t++) if (fw[t] !== fw[t - 1]) tog++;
    $("fw-on").textContent = fw.reduce(function (a, b) { return a + b; }, 0);
    $("fw-tog").textContent = tog;
  }
  $("fw-run").addEventListener("click", function () {
    shown = true;
    draw();
    var fw = run(), actual = fw[4], ok = getPick() === actual, out = $("fw-out");
    out.className = "verdict " + (ok ? "ok" : "warn");
    out.textContent = (ok ? "맞았다. " : "빗나갔다. ") + "Upper=" + P.up + ", Lower=" + P.lo + "에서 사이클 4의 forceWrite = " + actual +
      ". 사이클 3의 값 59가 " + (59 >= P.up ? "Upper 이상이라 켜진다." : (59 >= P.lo ? "Lower 이상이고 직전 값이 " + fw[3] + "이므로 " + (fw[3] ? "유지된다." : "꺼진 채 남는다.") : "Lower 미만이라 꺼진다."));
  });
  draw();
})();

/* sim-sb: Sbuffer 16 lines (Sbuffer.scala:336-341 merge, 365-379 even/odd insert, 543-550 do_eviction,
   634-646 victim). PLRU is approximated by LRU; DCache write latency (3) and the timeout are synthetic. */
(function () {
  "use strict";
  var $ = Ch09.$;
  if (!$("sim-sb")) return;
  var root = $("sim-sb"), grid = $("sb-grid"), LAT = 3, MAXC = 200;
  var P = Book.bind(root, function () { render(); });
  var getPat = Ch09.seg("sb-pat", reset);
  var S, timer = null;
  function reset() {
    stop();
    S = { cyc: 0, n: 0, mg: 0, wr: 0, stall: 0, ev: false, rng: Book.rng(9), pend: null,
      L: Array.apply(null, Array(16)).map(function () { return { v: false, inf: false, tag: 0, bytes: 0, coh: 0, use: 0, done: 0 }; }) };
    render();
  }
  function nextStore() {
    var p = getPat(), k = S.n;
    if (p === 0) return { tag: 0x100 + (k >> 3), off: (k & 7) * 8 };
    if (p === 1) return k < 3 ? { tag: 0x200 + k, off: 0 } : null;
    return { tag: 0x300 + S.rng.int(0, 63), off: S.rng.int(0, 7) * 8 };
  }
  function insert(s, prevLine) {
    var L = S.L, j;
    for (j = 0; j < 16; j++) if (L[j].v && !L[j].inf && L[j].tag === s.tag) {
      L[j].bytes = Math.min(64, L[j].bytes + 8); L[j].coh = 0; L[j].use = S.cyc; S.mg++; return j;
    }
    var ev = 0, od = 0;
    L.forEach(function (x, i) { if (!x.v) { if (i % 2) od++; else ev++; } });
    var par = prevLine >= 0 ? 1 - prevLine % 2 : (ev >= od ? 0 : 1);
    for (j = par; j < 16; j += 2) if (!L[j].v) break;
    if (j >= 16) return -1;
    L[j] = { v: true, inf: false, tag: s.tag, bytes: 8, coh: 0, use: S.cyc, done: 0 };
    return j;
  }
  function tick() {
    var L = S.L, thr = $("sb-force").checked ? 9 - 1 : 9;
    L.forEach(function (x) { if (x.inf && x.done <= S.cyc) { x.v = false; x.inf = false; } });
    var cand = -1, to = -1;
    L.forEach(function (x, i) {
      if (!x.v || x.inf) return;
      if (x.coh >= P.to && to < 0) to = i;
      if (cand < 0 || x.use < L[cand].use) cand = i;
    });
    var victim = to >= 0 ? to : (S.ev ? cand : -1);
    if (victim >= 0) { L[victim].inf = true; L[victim].done = S.cyc + LAT; S.wr++; }
    var prev = -1, stalled = false;
    for (var k = 0; k < 2; k++) {
      var s = S.pend || nextStore();
      if (!s) break;
      var j = insert(s, prev);
      if (j < 0) { S.pend = s; stalled = true; break; }
      S.pend = null; S.n++; prev = j;
    }
    if (stalled) S.stall++;
    L.forEach(function (x) { if (x.v && !x.inf) x.coh++; });
    var act = L.filter(function (x) { return x.v && !x.inf; }).length, val = L.filter(function (x) { return x.v; }).length;
    S.ev = act >= thr || act === 15 || val === 16; // registered: takes effect next cycle
    S.cyc++;
    render();
  }
  function render() {
    grid.innerHTML = "";
    S.L.forEach(function (x, i) {
      var d = Ch09.cell(grid, "#" + i + (i % 2 ? " 홀" : " 짝"), x.v ? (x.inf ? "f" : "v") : "");
      d.appendChild(document.createElement("br"));
      d.appendChild(document.createTextNode(x.v ? x.tag.toString(16) : "-"));
      var bar = document.createElement("i");
      bar.style.width = (x.v ? x.bytes / 64 * 100 : 0) + "%";
      d.appendChild(bar);
    });
    var act = S.L.filter(function (x) { return x.v && !x.inf; }).length, val = S.L.filter(function (x) { return x.v; }).length;
    $("sb-cyc").textContent = S.cyc;
    $("sb-in").textContent = S.n;
    $("sb-mg").textContent = S.mg;
    $("sb-wr").textContent = S.wr;
    $("sb-av").textContent = act + " / " + val;
    $("sb-st").textContent = S.stall;
    var v = $("sb-verdict");
    v.className = "verdict " + (S.stall ? "warn" : (S.ev ? "bad" : "grey"));
    v.textContent = "do_eviction=" + (S.ev ? 1 : 0) + " (임계 " + ($("sb-force").checked ? 8 : 9) + "). 스토어 " + S.n + "개 → DCache 쓰기 " + S.wr +
      "회" + (S.n ? " (" + (S.wr / S.n * 100).toFixed(0) + "%)" : "") + (S.stall ? ", 빈 줄이 없어 은퇴 스토어를 못 받은 사이클 " + S.stall + "." : ".");
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } $("sb-play").textContent = "재생"; }
  $("sb-play").addEventListener("click", function () {
    if (timer) { stop(); return; }
    $("sb-play").textContent = "멈춤";
    timer = setInterval(function () { if (S.cyc >= MAXC) { stop(); return; } tick(); }, 120);
  });
  $("sb-step").addEventListener("click", function () { stop(); tick(); });
  $("sb-reset").addEventListener("click", reset);
  $("sb-force").addEventListener("change", render);
  reset();
})();

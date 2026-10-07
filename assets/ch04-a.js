/* Chapter 04 sims A-C: FTQ ring, ICache address split, 2-fetch predict.
   Rules follow XiangShan @09453ff8 (Ftq.scala, icache/Helpers.scala, ICacheMainPipe.scala, TwoFetch.scala).
   Block sizes, pages, addresses and ways are synthetic. */
function segWire(seg, cb) {
  var bs = Array.prototype.slice.call(seg.querySelectorAll("button"));
  bs.forEach(function (b, i) {
    b.addEventListener("click", function () {
      bs.forEach(function (x) { x.classList.toggle("on", x === b); });
      if (cb) cb(i);
    });
  });
  return function () { return bs.findIndex(function (b) { return b.classList.contains("on"); }); };
}
function hex(v) { return "0x" + v.toString(16).toUpperCase(); }

/* Block geometry shared by sims B and C (icache/Helpers.scala:138-162, 269-273; ftq/Bundles.scala:147). */
function blockGeo(pc, end) {
  var off = pc & 63, b5 = (pc >> 5) & 1, e4 = (end >> 4) & 1;
  var cross = !!(b5 && e4);
  var low = off >> 3, high = ((b5 ^ e4) << 2) | ((end >> 2) & 3);
  var l0 = [], l1 = [];
  for (var i = 0; i < 8; i++) {
    l0.push(i >= low && (cross || i <= high));
    l1.push(cross && i <= high);
  }
  var set = Math.floor(pc / 64) % 256;
  return { cross: cross, l0: l0, l1: l1, set: [set, (set + 1) % 256], size: end + 1 - ((pc >> 1) & 15), page: Math.floor(pc / 4096) };
}

/* ---------- Sim A: FTQ ring (Ftq.scala:181-183, 228-234, 252-256, 258-275, 286-333, 366-373, 498-506) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-ftq");
  if (!root) return;
  var FTQ = 64, PF_DEPTH = 32, STALL_LIMIT = 8;
  var P = Book.bind(root, function () { show(); });
  var grid = document.getElementById("ftq-cells");
  var cells = [];
  for (var i = 0; i < FTQ; i++) { var c = document.createElement("div"); c.className = "cell"; grid.appendChild(c); cells.push(c); }
  var S;

  function mkEntry(idx) {
    var r = Book.rng(idx * 7919 + S.epoch * 104729 + 17);
    var prev = S.ent[idx - 1];
    return { size: r.int(4, 24), page: (prev ? prev.page : 0) + (r.next() < 0.2 ? 1 : 0), wt: S.t, ft: -1 };
  }
  function reset() {
    S = { t: 0, bpu: 0, pf: 0, fetch: 0, commit: 0, pnr: 0, ent: {}, stall: 0, miss: 0, nf: 0, n2: 0, epoch: 0, block: "", msg: "" };
    show();
  }
  function bpuReady() {
    var why = [];
    if (S.bpu - S.commit >= FTQ) why.push("bpu − commit = 64");
    if (S.bpu - S.fetch >= PF_DEPTH) why.push("bpu − fetch = 32");
    if (S.stall >= STALL_LIMIT) why.push("학습 정지 카운터 " + S.stall + " ≥ 8");
    return why;
  }
  function step() {
    var e;
    /* commit: one block per cycle once the backend has had `lat` cycles with it */
    e = S.ent[S.commit];
    if (S.commit < S.fetch && e && e.ft >= 0 && S.t - e.ft >= P.lat) S.commit++;
    /* fetch: Ftq.scala:327-333; ICache side assumed conflict-free here */
    if (S.miss > 0) S.miss--;
    else if (S.bpu > S.fetch && S.fetch - S.commit < FTQ - 1 && S.pf > S.fetch) {
      var a = S.ent[S.fetch], b = S.ent[S.fetch + 1];
      var two = !!b && S.pf > S.fetch + 1 && S.pnr > S.fetch + 1 && a.size + b.size <= 32 && a.page === b.page;
      a.ft = S.t; if (two) b.ft = S.t;
      S.fetch += two ? 2 : 1; S.nf++; if (two) S.n2++;
    }
    /* prefetch: Ftq.scala:286-301, WayLookup needs 2 free of 32 (ICacheWayLookup.scala:162) */
    if (S.bpu > S.pf && S.pf - S.fetch <= PF_DEPTH - 2) {
      var p = S.ent[S.pf], q = S.ent[S.pf + 1];
      S.pf += (q && S.bpu > S.pf + 1 && S.pnr > S.pf + 1 && p.page === q.page) ? 2 : 1;
    }
    /* BPU train stall counter: 4-bit, +1 while blocked, else 0 (Ftq.scala:172-177) */
    S.stall = P.stall ? (S.stall + 1) % 16 : 0;
    var why = bpuReady();
    S.block = why.join(", ");
    if (!why.length) { S.ent[S.bpu] = mkEntry(S.bpu); S.bpu++; }
    /* pnr: an entry leaves BPU s3 two cycles after it was written (Ftq.scala:233) */
    while (S.pnr < S.bpu && S.t - S.ent[S.pnr].wt >= 2) S.pnr++;
    S.t++;
    S.msg = "";
  }
  function override() {
    if (S.pnr >= S.bpu) { S.msg = "s3에 있는 블록이 없다"; return; }
    var idx = S.pnr;
    S.epoch++;
    S.ent[idx] = mkEntry(idx);
    for (var k = idx + 1; k < S.bpu; k++) delete S.ent[k];
    S.bpu = idx + 1; S.pnr = idx + 1;
    var rolled = [];
    if (S.pf > idx) rolled.push("pf");
    if (S.fetch > idx) rolled.push("fetch");
    if (S.pf >= idx) S.pf = idx;
    if (S.fetch >= idx) S.fetch = idx;
    S.msg = "s3 override: 칸 " + (idx % FTQ) + " 다시 씀, " + (rolled.length ? rolled.join("·") + " 되감김" : "되감을 포인터 없음");
  }
  function redirect() {
    if (S.fetch <= S.commit) { S.msg = "인출된 블록이 없어 redirect할 대상이 없다"; return; }
    var ftqIdx = Math.min(S.commit + 1, S.fetch - 1), nw = ftqIdx + 1;
    S.epoch++;
    for (var k = nw; k < S.bpu; k++) delete S.ent[k];
    S.bpu = S.pf = S.fetch = S.pnr = nw; S.miss = 0;
    S.msg = "백엔드 redirect: 칸 " + (ftqIdx % FTQ) + "의 분기가 틀림 → 네 포인터 = " + (nw % FTQ);
  }
  function show() {
    var ptr = { C: S.commit, F: S.fetch, P: S.pf, N: S.pnr, B: S.bpu };
    for (var i = 0; i < FTQ; i++) {
      var lbl = "";
      Object.keys(ptr).forEach(function (k) { if (ptr[k] % FTQ === i) lbl += k; });
      cells[i].innerHTML = "<b>" + lbl + "</b>" + i;
      cells[i].className = "cell";
    }
    for (var a = S.commit; a < S.bpu; a++) {
      var c = cells[a % FTQ];
      c.className = "cell " + (a < S.fetch ? "k1" : a < S.pf ? "k2" : "k3") + (a >= S.pnr ? " dash" : "");
    }
    document.getElementById("ftq-t").textContent = S.t;
    document.getElementById("ftq-df").textContent = (S.bpu - S.fetch) + " / 32";
    document.getElementById("ftq-dc").textContent = (S.bpu - S.commit) + " / 64";
    document.getElementById("ftq-nf").textContent = S.nf + " (2개 " + S.n2 + ")";
    var v = document.getElementById("ftq-verdict"), why = bpuReady();
    if (S.msg) { v.className = "verdict warn"; v.textContent = S.msg; }
    else if (S.t === 0) { v.className = "verdict grey"; v.textContent = "대기: 재생 또는 한 사이클"; }
    else if (why.length) { v.className = "verdict bad"; v.textContent = "BPU 멈춤: " + why.join(", "); }
    else { v.className = "verdict ok"; v.textContent = "BPU 수락" + (S.miss ? " (ICache 미스 " + S.miss + "사이클 남음)" : ""); }
  }
  var anim = Book.loop(grid, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.15) return true;
    anim.acc = 0; step(); show();
    return S.t < 400;
  });
  var play = document.getElementById("ftq-play");
  play.addEventListener("click", function () {
    if (anim.running) { anim.stop(); play.textContent = "재생"; }
    else { anim.start(); play.textContent = "멈춤"; }
  });
  document.getElementById("ftq-step").addEventListener("click", function () { step(); show(); });
  document.getElementById("ftq-reset").addEventListener("click", function () { anim.stop(); play.textContent = "재생"; reset(); });
  document.getElementById("ftq-miss").addEventListener("click", function () { S.miss = 40; S.msg = "ICache 미스: fetch 40사이클 정지"; show(); });
  document.getElementById("ftq-ovr").addEventListener("click", function () { override(); show(); });
  document.getElementById("ftq-redir").addEventListener("click", function () { redirect(); show(); });
  reset();
  for (var w = 0; w < 24; w++) step(); /* start mid-flight so the ring is visible on load */
  show();
})();

/* ---------- Sim B: address split (L1Cache.scala:47-57,107; icache/Parameters.scala:29-32,49,103) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-addr");
  if (!root) return;
  var PPN = 0x800123; /* synthetic physical page number = tag paddr[47:12] */
  var bits = document.getElementById("addr-bits");
  var L0 = document.getElementById("addr-l0"), L1 = document.getElementById("addr-l1");
  function mk(el) { var a = []; for (var i = 0; i < 8; i++) { var c = document.createElement("div"); c.className = "cell"; el.appendChild(c); a.push(c); } return a; }
  var c0 = mk(L0), c1 = mk(L1);
  function show(P) {
    var va = 0x40000000 + P.al * 0x1000 + P.off;
    var g = blockGeo(va, P.end);
    var set = g.set[0];
    var seg = [
      ["[49:14]", hex(Math.floor(va / 16384)), 4, ""],
      ["[13:12]", String(P.al), 2, "var(--warn-soft)"],
      ["[11:6]", String((P.off >> 6) & 63), 3, "var(--accent-soft)"],
      ["[5:3]", String((P.off >> 3) & 7), 2, "var(--accent-2-soft)"],
      ["[2:0]", String(P.off & 7), 2, ""]
    ];
    bits.innerHTML = seg.map(function (s) {
      return '<span style="--w:' + s[2] + (s[3] ? ";background:" + s[3] : "") + '">' + s[0] + "<br>" + s[1] + "</span>";
    }).join("");
    for (var i = 0; i < 8; i++) {
      c0[i].className = "cell" + (g.l0[i] ? " k3" : " off"); c0[i].innerHTML = "<b>" + (i === 0 ? "set " + set : "") + "</b>b" + i;
      c1[i].className = "cell" + (g.l1[i] ? " k2" : " off"); c1[i].innerHTML = "<b>" + (i === 0 ? "set " + g.set[1] : "") + "</b>b" + i;
    }
    document.getElementById("addr-set").textContent = set;
    document.getElementById("addr-mb").textContent = (set & 1) ? "홀 (1)" : "짝 (0)";
    document.getElementById("addr-size").textContent = g.size > 0 ? g.size : "무효";
    document.getElementById("addr-tag").textContent = hex(PPN);
    document.getElementById("addr-txt").textContent = "vaddr " + hex(va) + " · paddr " + hex(PPN * 4096 + (va & 4095)) +
      " · 기준점(32B 내림) 라인 오프셋 " + ((P.off & 63) & 32) + "B";
    var v = document.getElementById("addr-verdict");
    if (g.size <= 0) { v.className = "verdict bad"; v.textContent = "endPosition이 시작보다 앞: BPU가 만들지 않는 블록"; }
    else if (g.cross) { v.className = "verdict warn"; v.textContent = "교차 라인: set " + set + "(" + (set & 1 ? "홀" : "짝") + ")과 " + g.set[1] + "(" + (g.set[1] & 1 ? "홀" : "짝") + ")을 함께 읽는다"; }
    else { v.className = "verdict ok"; v.textContent = "한 라인 안: set " + set + "만 읽는다"; }
  }
  var P = Book.bind(root, show);
  show(P);
})();

/* ---------- Sim C: 2-fetch predict (Ftq.scala:327-333, ICacheMainPipe.scala:134-157, TwoFetch.scala:118-124) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-two");
  if (!root) return;
  var B = 0x80001000;
  var SC = [
    { a: [B, 7, 0], b: [B + 0x140, 9, 1], pnr: true, d: "A: " + hex(B) + " end 7, way 0 / B: " + hex(B + 0x140) + " end 9, way 1. B는 pnr 통과." },
    { a: [B, 23, 0], b: [B + 0x140, 9, 1], pnr: true, d: "①에서 A의 end만 23으로 늘렸다. 나머지는 같다." },
    { a: [B, 7, 0], b: [B + 0x140, 9, 1], pnr: false, d: "①과 같지만 B가 아직 BPU s3를 떠나지 않았다(pnr 이전)." },
    { a: [B + 0xFC0, 7, 0], b: [B + 0x1040, 3, 1], pnr: true, d: "A: " + hex(B + 0xFC0) + " end 7 / B: " + hex(B + 0x1040) + " end 3. 페이지 끝을 넘는다." },
    { a: [B, 7, 0], b: [B + 0x140, 9, 0], pnr: true, d: "①과 같지만 B도 way 0에서 히트했다." },
    { a: [B, 3, 0], b: [B + 0x10, 15, 0], pnr: true, d: "A: " + hex(B) + " end 3 / B: " + hex(B + 0x10) + " end 15. 둘 다 way 0." }
  ];
  function evalSc(s) {
    var a = blockGeo(s.a[0], s.a[1]), b = blockGeo(s.b[0], s.b[1]);
    var sum = a.size + b.size, samePage = a.page === b.page;
    var raw = s.pnr && sum <= 32 && samePage;
    var conflict = "";
    [[a.l0, a.set[0]], [a.l1, a.set[1]]].forEach(function (x, i) {
      [[b.l0, b.set[0]], [b.l1, b.set[1]]].forEach(function (y, j) {
        var ov = x[0].some(function (v, k) { return v && y[0][k]; });
        if (ov && s.a[2] === s.b[2] && x[1] !== y[1] && !conflict) conflict = "A라인" + i + "·B라인" + j + " (way " + s.a[2] + ")";
      });
    });
    var pcase = a.set[0] === b.set[0] ? "SameLine" :
      (a.cross && !b.cross && a.set[1] === b.set[0]) ? "Overlap1" :
      (!a.cross && b.cross && b.set[1] === a.set[0]) ? "Overlap2" :
      (!a.cross && !b.cross && (a.set[0] & 1) !== (b.set[0] & 1)) ? "Interleave" : "Conflict";
    return { sum: sum, samePage: samePage, raw: raw, conflict: conflict, two: raw && !conflict, pcase: pcase, a: a, b: b };
  }
  var cur = 0;
  var pick = segWire(document.getElementById("two-pick"));
  function clear() {
    document.getElementById("two-desc").textContent = SC[cur].d;
    ["two-sum", "two-pg", "two-cf", "two-case"].forEach(function (id) { document.getElementById(id).textContent = "-"; });
    var o = document.getElementById("two-out"); o.className = "verdict grey"; o.textContent = "먼저 답을 고르세요";
  }
  segWire(document.getElementById("two-sc"), function (i) { cur = i; clear(); });
  document.getElementById("two-run").addEventListener("click", function () {
    var s = SC[cur], r = evalSc(s);
    document.getElementById("two-sum").textContent = r.a.size + " + " + r.b.size + " = " + r.sum;
    document.getElementById("two-pg").textContent = (r.samePage ? "예" : "아니오") + " · " + (s.pnr ? "예" : "아니오");
    document.getElementById("two-cf").textContent = r.raw ? (r.conflict || "없음") : "검사 안 함";
    document.getElementById("two-case").textContent = r.pcase;
    var why = !s.pnr ? "B가 pnr 이전" : r.sum > 32 ? "크기 합 " + r.sum + " > 32" : !r.samePage ? "페이지가 다르다" :
      r.conflict ? "data SRAM 충돌 " + r.conflict : "FTQ 후보 + ICache 충돌 없음";
    var ok = (pick() === 0) === r.two;
    var o = document.getElementById("two-out");
    o.className = "verdict " + (ok ? "ok" : "warn");
    o.textContent = (ok ? "맞았다. " : "빗나갔다. ") + (r.two ? "2개 함께 인출" : "1개만 인출") + ": " + why;
  });
  clear();
})();

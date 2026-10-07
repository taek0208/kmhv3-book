/* Chapter 10 sims 1-4: AMAT, DCache address split, bank conflict, MSHR.
   Rules follow XiangShan @09453ff8 (L1Cache.scala, DCacheWrapper.scala, BankedDataArray.scala, MissQueue.scala).
   Latencies, addresses, request streams and ages are synthetic. */
function c10seg(seg, cb) {
  var bs = Array.prototype.slice.call(seg.querySelectorAll("button"));
  bs.forEach(function (b, i) {
    b.addEventListener("click", function () {
      bs.forEach(function (x) { x.classList.toggle("on", x === b); });
      if (cb) cb(i);
    });
  });
  return function () { return bs.findIndex(function (b) { return b.classList.contains("on"); }); };
}
function c10hex(v) { return "0x" + v.toString(16); }
function c10cells(host, n, cls) {
  var out = [];
  for (var i = 0; i < n; i++) { var d = document.createElement("div"); d.className = cls || "c10-cell"; host.appendChild(d); out.push(d); }
  return out;
}

/* ---------- Sim 1: AMAT (latencies are assumptions) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-amat");
  if (!root) return;
  var P = Book.bind(root, function () { calc(); h.redraw(); });
  var R;
  function calc() {
    var m1 = P.m1 / 100, m2 = P.m2 / 100, m3 = P.m3 / 100;
    var parts = [P.t1, m1 * P.t2, m1 * m2 * P.t3, m1 * m2 * m3 * P.tm];
    var amat = parts[0] + parts[1] + parts[2] + parts[3];
    R = { parts: parts, amat: amat, flat: P.t1 + m1 * P.tm, dram: m1 * m2 * m3 };
    document.getElementById("amat-v").textContent = amat.toFixed(2) + " cyc";
    document.getElementById("amat-flat").textContent = R.flat.toFixed(2) + " cyc";
    document.getElementById("amat-dram").textContent = (R.dram * 100).toFixed(2) + "%";
  }
  var h = Book.canvas(document.getElementById("amat-cv"), function (ctx, w, hh) {
    if (!R) calc();
    var names = ["L1 hit", "L2", "L3", "DRAM"];
    var cols = [Book.css("accent"), Book.css("accent-2"), Book.css("warn"), Book.css("bad")];
    var max = Math.max(R.amat, R.flat) * 1.05, x0 = 12, x1 = w - 12, sc = (x1 - x0) / max;
    Book.text(ctx, "AMAT 구성 (사이클)", x0, 16, { size: 12, color: Book.css("text-dim") });
    var x = x0, y = 32, bh = 34;
    R.parts.forEach(function (p, i) {
      var ww = p * sc;
      if (ww > 0.5) Book.roundRect(ctx, x, y, ww, bh, 3, cols[i]);
      x += ww;
    });
    Book.text(ctx, R.amat.toFixed(2), Math.min(x + 6, x1 - 40), y + bh / 2, { size: 13, mono: true, weight: 700 });
    var ly = y + bh + 20, lx = x0;
    R.parts.forEach(function (p, i) {
      Book.roundRect(ctx, lx, ly - 6, 12, 12, 2, cols[i]);
      var s = names[i] + " " + p.toFixed(2);
      Book.text(ctx, s, lx + 16, ly, { size: 11.5, mono: true });
      lx += Math.max(92, ctx.measureText ? 26 + s.length * 7 : 100);
      if (lx > x1 - 80) { lx = x0; ly += 18; }
    });
    var y2 = ly + 22;
    Book.text(ctx, "L2·L3 없이 L1 miss가 바로 DRAM으로 갈 때", x0, y2, { size: 12, color: Book.css("text-dim") });
    Book.roundRect(ctx, x0, y2 + 12, P.t1 * sc, 26, 3, cols[0]);
    Book.roundRect(ctx, x0 + P.t1 * sc, y2 + 12, (R.flat - P.t1) * sc, 26, 3, Book.alpha ? Book.alpha(cols[3], 0.45) : cols[3]);
    Book.text(ctx, R.flat.toFixed(2), Math.min(x0 + R.flat * sc + 6, x1 - 40), y2 + 25, { size: 13, mono: true, weight: 700 });
  });
  calc();
})();

/* ---------- Sim 2: address split + set crowding (L1Cache.scala:82-104, DCacheWrapper.scala:255-258, 299-310) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-addr");
  if (!root) return;
  var P = Book.bind(root, function () { show(); });
  var mode = c10seg(document.getElementById("addr-mode"), function () { show(); });
  var bars = c10cells(document.getElementById("addr-bars"), 4);
  /* hashBitPairs(addr, 47, 12, 2): 36 bits = 18 pairs, remain 0 -> XOR of all pairs */
  function hash2(va) {
    var h = 0n;
    for (var i = 12n; i <= 46n; i += 2n) h ^= (va >> i) & 3n;
    return Number(h);
  }
  function setOf(va, m) {
    var low6 = Number((va >> 6n) & 63n);
    var hi2 = m === 0 ? hash2(va) : Number((va >> 12n) & 3n);
    return { set: (hi2 << 6) | low6, alias: hi2 };
  }
  function parse(s, bits) {
    try {
      var t = String(s).trim().replace(/_/g, "");
      if (!/^(0x)?[0-9a-f]+$/i.test(t)) return null;
      return BigInt(t.indexOf("0x") === 0 || t.indexOf("0X") === 0 ? t : "0x" + t) & ((1n << BigInt(bits)) - 1n);
    } catch (e) { return null; }
  }
  function bin(v, n) { var s = v.toString(2); while (s.length < n) s = "0" + s; return s; }
  function maxPerSet(m) {
    var cnt = {}, best = 0, k = BigInt(P.k);
    var base = parse(P.va, 48) || 0n;
    for (var i = 0; i < P.n; i++) {
      var s = setOf(base + (BigInt(i) << k), m).set;
      cnt[s] = (cnt[s] || 0) + 1;
      best = Math.max(best, cnt[s]);
    }
    return { best: best, cnt: cnt };
  }
  function show() {
    var m = mode();
    var va = parse(P.va, 48), ppn = parse(P.ppn, 36);
    var tbl = document.getElementById("addr-tbl");
    if (va === null || ppn === null) {
      tbl.innerHTML = "<tr><td>16진수로 입력하세요 (예: 0x7f12345678c8)</td></tr>";
      document.getElementById("addr-set").textContent = "-";
      document.getElementById("addr-alias").textContent = "-";
    } else {
      var r = setOf(va, m), off = Number(va & 63n), bank = Number((va >> 1n) & 31n);
      tbl.innerHTML =
        "<tr><th>필드</th><th>비트</th><th>값</th></tr>" +
        "<tr><td>offset</td><td>vaddr[5:0]</td><td class='num'>" + off + "</td></tr>" +
        "<tr><td>bank</td><td>vaddr[5:1]</td><td class='num'>" + bank + "</td></tr>" +
        "<tr><td>set[5:0]</td><td>vaddr[11:6]</td><td class='num'>" + bin(r.set & 63, 6) + "</td></tr>" +
        "<tr><td>set[7:6]</td><td>" + (m === 0 ? "⊕ vaddr[47:12] 18쌍" : "vaddr[13:12]") + "</td><td class='num'>" + bin(r.alias, 2) + "</td></tr>" +
        "<tr><td>tag</td><td>paddr[47:12] (36비트)</td><td class='num'>" + c10hex(ppn) + "</td></tr>";
      document.getElementById("addr-set").textContent = String(r.set);
      document.getElementById("addr-alias").textContent = bin(r.alias, 2);
    }
    var a = maxPerSet(0), b = maxPerSet(1), cur = m === 0 ? a : b;
    /* bars: arrays per set[7:6] group among sets touched (same low 6 bits for all arrays) */
    var grp = [0, 0, 0, 0];
    Object.keys(cur.cnt).forEach(function (s) { grp[(+s) >> 6] += cur.cnt[s]; });
    bars.forEach(function (el, i) {
      var n = grp[i], over = n > 4;
      el.className = "c10-cell" + (over ? " X" : n ? " L" : "");
      el.innerHTML = "<b>set[7:6]=" + bin(i, 2) + "</b>배열 " + n + "개 / 4 way" +
        "<div class='c10-bar" + (over ? " over" : "") + "' style='width:" + Math.min(100, n / Math.max(4, P.n) * 100) + "%'></div>";
    });
    document.getElementById("addr-m1").textContent = String(a.best);
    document.getElementById("addr-m2").textContent = String(b.best);
    var v = document.getElementById("addr-verdict");
    if (cur.best > 4) { v.className = "verdict bad"; v.textContent = "한 set에 배열 " + cur.best + "개 > 4 way: 훑을 때마다 서로 쫓아낸다"; }
    else { v.className = "verdict ok"; v.textContent = "한 set 최대 " + cur.best + "개 ≤ 4 way: 모두 함께 머물 수 있다"; }
  }
  show();
})();

/* ---------- Sim 3: bank conflict among 3 load ports (BankedDataArray.scala:343-365, 740-762, 799-801) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-bank");
  if (!root) return;
  var P = Book.bind(root, function () { show(); });
  var size = c10seg(document.getElementById("bank-size"), function () { show(); });
  var old = c10seg(document.getElementById("bank-old"), function () { show(); });
  var view = document.getElementById("bank-view"), rows = [], labels = [];
  for (var p = 0; p < 3; p++) {
    var lb = document.createElement("div"); lb.className = "c10-log"; view.appendChild(lb); labels.push(lb);
    var row = document.createElement("div"); row.className = "c10-row"; view.appendChild(row);
    var out = [];
    for (var i = 0; i < 32; i++) { var e = document.createElement("i"); row.appendChild(e); out.push(e); }
    rows.push(out);
  }
  function mask(off, bytes) {
    var lo = Math.floor(off / 2), hi = Math.min(31, Math.floor((off + bytes - 1) / 2)), m = [];
    for (var i = 0; i < 32; i++) m.push(i >= lo && i <= hi);
    return m;
  }
  function show() {
    var bytes = size() === 0 ? 8 : 16;
    var o = [P.o0, P.o1, P.o2].map(function (v) { return bytes === 16 ? v & 0x30 : v; });
    var s = [P.s0, P.s1, P.s2];
    var m = o.map(function (v) { return mask(v, bytes); });
    /* age: oldest first, then port order -> rank 0 = oldest (smallest lqIdx) */
    var first = old(), order = [first, (first + 1) % 3, (first + 2) % 3], rank = [];
    order.forEach(function (p, r) { rank[p] = r; });
    var flag = [false, false, false];
    for (var x = 0; x < 3; x++) for (var y = 0; y < 3; y++) {
      if (x === y) continue;
      var overlap = m[x].some(function (b, i) { return b && m[y][i]; });
      if (overlap && s[x] !== s[y]) flag[x] = true;
    }
    var win = -1;
    for (var q = 0; q < 3; q++) if (flag[q] && (win < 0 || rank[q] < rank[win])) win = q;
    for (var p = 0; p < 3; p++) {
      var lose = flag[p] && p !== win;
      rows[p].forEach(function (c, i) { c.className = m[p][i] ? (lose ? "x" : flag[p] ? "ok" : "on") : ""; });
      var banks = m[p].map(function (b, i) { return b ? i : -1; }).filter(function (i) { return i >= 0; });
      labels[p].textContent = "P" + p + " · 나이 " + (rank[p] + 1) + "번째 · offset " + o[p] + " · set " + s[p] + " · bank " + banks[0] + "-" + banks[banks.length - 1];
      var el = document.getElementById("bank-r" + p);
      el.className = "v " + (lose ? "bad" : "ok");
      el.textContent = lose ? "replay (bank_conflict_slow)" : (flag[p] ? "통과 (충돌 중 최고참)" : "통과");
    }
  }
  show();
})();

/* ---------- Sim 4: MSHR animation (MissQueue.scala:868-917, 1242, 1728) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-mshr");
  if (!root) return;
  var N = 16, PRE = 30;
  var P = Book.bind(root, function () { reset(); });
  var cells = c10cells(document.getElementById("mshr-grid"), N);
  var logEl = document.getElementById("mshr-log");
  var S, rnd, timer = null;
  function reset() {
    S = { t: 0, e: [], nextBlk: 0x100, merge: 0, rej: 0, nack: 0, pfrej: 0, msg: "" };
    for (var i = 0; i < N; i++) S.e.push(null);
    rnd = Book.rng(20261008);
    for (var k = 0; k < PRE; k++) step(true);
    draw();
  }
  function step(quiet) {
    S.t++;
    for (var i = 0; i < N; i++) if (S.e[i] && S.t >= S.e[i].free) S.e[i] = null;
    var msg = "t=" + S.t + ": 요청 없음";
    if (rnd.next() < 0.7) {
      var r = rnd.next(), kind = r < P.pf ? "P" : (rnd.next() < 0.75 ? "L" : "S");
      var live = S.e.filter(Boolean), blk;
      if (live.length && rnd.next() < 0.3) blk = rnd.pick(live).blk; else blk = S.nextBlk++;
      var hit = -1;
      for (var j = 0; j < N; j++) if (S.e[j] && S.e[j].blk === blk) hit = j;
      var name = { L: "load", S: "store", P: "prefetch" }[kind] + " 블록 " + c10hex(blk);
      if (hit >= 0) {
        var e = S.e[hit];
        var canLoad = kind === "L" && S.t < e.beat;                 /* before first beat, new req is load */
        var canStore = kind === "S" && e.kind === "S" && S.t < e.free; /* refill resp not back, both stores */
        if (canLoad || canStore) { e.n++; S.merge++; msg = "t=" + S.t + ": " + name + " → MSHR " + hit + "에 merge"; }
        else { S.rej++; msg = "t=" + S.t + ": " + name + " → reject (MSHR " + hit + " 같은 블록, " + (S.t >= e.beat ? "데이터 도착 후" : "합칠 수 없는 조합") + ")"; }
      } else {
        var lo = kind === "P" ? N - P.npf : 0, got = -1;
        for (var q = lo; q < N; q++) if (!S.e[q]) { got = q; break; }
        if (got < 0) {
          if (kind === "P") { S.pfrej++; msg = "t=" + S.t + ": " + name + " → 거절 (id ≥ " + lo + " 칸 없음)"; }
          else { S.nack++; msg = "t=" + S.t + ": " + name + " → nack, replay (빈 MSHR 없음)"; }
        } else {
          S.e[got] = { kind: kind, blk: blk, t0: S.t, beat: S.t + P.lat, free: S.t + P.lat + 3, n: 1 };
          msg = "t=" + S.t + ": " + name + " → MSHR " + got + " 할당, " + (kind === "S" ? "AcquireBlock/Perm" : "AcquireBlock");
        }
      }
    }
    S.msg = msg;
    if (!quiet) draw();
  }
  function draw() {
    var used = 0, lo = N - P.npf;
    cells.forEach(function (c, i) {
      var e = S.e[i];
      if (e) used++;
      c.className = "c10-cell" + (e ? (e.kind === "P" ? " P" : " L") : "");
      var tag = i < lo ? "demand" : "pf 가능";
      if (!e) { c.innerHTML = "<b>#" + i + "</b>" + tag; return; }
      var prog = Math.min(1, (S.t - e.t0) / (e.free - e.t0));
      c.innerHTML = "<b>#" + i + " " + ({ L: "LD", S: "ST", P: "PF" })[e.kind] + (e.n > 1 ? " ×" + e.n : "") + "</b>" + c10hex(e.blk) +
        (S.t >= e.beat ? " D" : " A") + "<div class='bar' style='width:" + (prog * 100).toFixed(0) + "%'></div>";
    });
    document.getElementById("mshr-use").textContent = S.t + " / " + used + "칸";
    document.getElementById("mshr-merge").textContent = String(S.merge);
    document.getElementById("mshr-rej").textContent = String(S.rej);
    document.getElementById("mshr-nack").textContent = String(S.nack);
    document.getElementById("mshr-pfrej").textContent = String(S.pfrej);
    logEl.textContent = S.msg + "  (A = Grant 대기, D = 데이터 도착)";
  }
  var runBtn = document.getElementById("mshr-run");
  function stop() { if (timer) { clearInterval(timer); timer = null; } runBtn.textContent = "재생"; }
  runBtn.addEventListener("click", function () {
    if (timer) { stop(); return; }
    runBtn.textContent = "멈춤";
    timer = setInterval(function () { step(); if (S.t > 2000) stop(); }, 160);
  });
  document.getElementById("mshr-step").addEventListener("click", function () { stop(); step(); });
  document.getElementById("mshr-reset").addEventListener("click", function () { stop(); reset(); });
  reset();
})();

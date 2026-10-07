/* ch03-b.js: TAGE stepper. Real constants from src/main/scala/xiangshan/frontend/bpu/tage/Parameters.scala,
   tage/Helpers.scala, tage/Tage.scala and history/phr @09453ff8, run on synthetic branch traces.
   Simplifications (stated in the page): 64B-aligned start PC, one branch per prediction, mainBTB modelled as a
   per-PC 2-bit counter starting at 1, LFSR seed 1, useful reset applied at once when the counter saturates. */
var Ch03Tage = (function () {
  "use strict";
  var LENS = [4, 9, 17, 29, 56, 109, 211, 397]; /* tage/Parameters.scala:24-35 */
  var NT = 8, PHRLEN = 532, TAGW = 13, SETW = 9, CTRW = 3, UW = 2, UAW = 5;

  function create() {
    var s = {
      phr: new Uint8Array(PHRLEN), tables: [], base: {}, ua: [], lfsr: 1, resetCtr: 0, allocs: 0, resets: 0
    };
    for (var t = 0; t < NT; t++) s.tables.push({});
    for (var i = 0; i < 2 * NT; i++) s.ua.push(1 << (UAW - 1)); /* WeakPositive = 16, Tage.scala:56 */
    return s;
  }
  /* computeFoldedHist: XOR of compLen-bit chunks of the newest histLen bits (bpu/Helpers.scala:185-192) */
  function fold(phr, L, W) {
    var c = Math.min(L, W), r = 0;
    for (var i = 0; i < L; i++) if (phr[i]) r ^= 1 << (i % c);
    return r;
  }
  /* pathHash = (Cat(pc[9:1], 0000) ^ target[16:2])[14:0] (phr/Helpers.scala:60-63) */
  function hash15(pc, tgt) {
    return ((Math.floor(pc / 2) % 512) * 16 ^ (Math.floor(tgt / 4) % 32768)) & 0x7fff;
  }
  /* PHR' = (PHR << 2) ^ hash15 (추론: circular buffer of Phr.scala:288-297 written as a shift) */
  function phrPush(s, pc, tgt) {
    var h = hash15(pc, tgt), p = s.phr;
    for (var i = PHRLEN - 1; i >= 2; i--) p[i] = p[i - 2];
    p[0] = 0; p[1] = 0;
    for (var j = 0; j < 15; j++) p[j] ^= (h >> j) & 1;
  }
  function weak(v) { return v === 3 || v === 4; }
  function lfsrStep(s) { /* 15-bit maximal LFSR, taps {15,14} (Tage.scala:527-532) */
    var b = ((s.lfsr >> 14) ^ (s.lfsr >> 13)) & 1;
    s.lfsr = ((s.lfsr << 1) | b) & 0x7fff;
    return s.lfsr;
  }

  function predict(s, pc) {
    var start = Math.floor(pc / 64) * 64, pos = Math.floor((pc % 64) / 2);
    var setF = Math.floor(start / 8) % 512, tagF = Math.floor(start / 4096) % 8192; /* fields after instOffset 1, bank 2 */
    var rows = [], prov = -1, alt = -1;
    for (var t = 0; t < NT; t++) {
      var L = LENS[t];
      var idx = (setF ^ fold(s.phr, L, SETW)) & 511;
      var rawTag = (tagF ^ fold(s.phr, L, TAGW) ^ (fold(s.phr, L, 12) << 1)) & 0x1fff;
      var tag = rawTag ^ pos; /* getTag (tage/Helpers.scala:65-66) */
      var set = s.tables[t][idx] || [null, null], way = -1;
      for (var w = 0; w < 2; w++) if (set[w] && set[w].tag === tag) { way = w; break; }
      rows.push({ t: t, L: L, idx: idx, tag: tag, way: way, e: way >= 0 ? set[way] : null });
    }
    for (var k = NT - 1; k >= 0; k--) if (rows[k].way >= 0) { if (prov < 0) prov = k; else if (alt < 0) alt = k; }
    var bctr = s.base[pc] === undefined ? 1 : s.base[pc];
    var basePred = bctr >= 2, baseConf = bctr === 0 || bctr === 3;
    var hasP = prov >= 0, hasA = alt >= 0;
    var pc_ = hasP ? rows[prov].e.ctr : 0, ac = hasA ? rows[alt].e.ctr : 0;
    var altConf = hasA ? !weak(ac) : baseConf;
    var uIdx = hasP ? prov * 2 + (altConf ? 1 : 0) : -1;
    var useAlt = hasP && s.ua[uIdx] >= 16;
    var useProv = hasP && !(useAlt && weak(pc_)); /* Tage.scala:165-170 */
    var tageValid = useProv || hasA;
    var tagePred = useProv ? pc_ >= 4 : ac >= 4;
    var fin = tageValid ? tagePred : basePred;
    var src = useProv ? prov : hasA ? alt : -1;
    return { pc: pc, pos: pos, rows: rows, prov: prov, alt: alt, bctr: bctr, basePred: basePred, altConf: altConf,
      uIdx: uIdx, useProv: useProv, provPred: pc_ >= 4, altOrBase: hasA ? ac >= 4 : basePred, fin: fin, src: src };
  }

  function train(s, r, actual) {
    var hasP = r.prov >= 0, P = hasP ? r.rows[r.prov].e : null, A = r.alt >= 0 ? r.rows[r.alt].e : null;
    var oldPctr = hasP ? P.ctr : 0, out = { alloc: -1, reset: false };
    if (hasP) {
      if (r.provPred === actual && r.provPred !== r.altOrBase && P.u < 3) P.u++; /* :411-412 */
      P.ctr = Ch03.upd(P.ctr, actual, CTRW);
    }
    if (!r.useProv && A) A.ctr = Ch03.upd(A.ctr, actual, CTRW); /* useAlt, :403 */
    if (hasP && weak(oldPctr) && r.provPred !== r.altOrBase) { /* :428-430 */
      var u = s.ua[r.uIdx];
      if (r.altOrBase === actual) s.ua[r.uIdx] = Math.min(31, u + 1); else s.ua[r.uIdx] = Math.max(0, u - 1);
    }
    s.base[r.pc] = Ch03.upd(r.bctr, actual, 2);
    var need = r.fin !== actual && !(hasP && r.prov === NT - 1) &&
      !(hasP && !r.useProv && r.provPred === actual && weak(oldPctr)); /* :417-419 */
    var rnd = lfsrStep(s) & 0xff;
    if (need) {
      var cand = 0, wayMask = [];
      for (var t = 0; t < NT; t++) {
        wayMask.push(0);
        if (hasP && t <= r.prov) continue; /* longer-history tables only, :498-506 */
        var set = s.tables[t][r.rows[t].idx] || [null, null];
        var inv = 0, wk = 0, nu = 0;
        for (var w = 0; w < 2; w++) {
          var e = set[w];
          if (!e) inv |= 1 << w;
          else { if (e.u === 0) nu |= 1 << w; if (e.u === 0 && weak(e.ctr)) wk |= 1 << w; }
        }
        wayMask[t] = inv || wk || nu; /* invalid > weak&useful0 > useful0, :509-522 */
        if (wayMask[t]) cand |= 1 << t;
      }
      if (cand) {
        var pref = (cand & rnd) || cand, at = 0;
        while (!((pref >> at) & 1)) at++;
        var aw = wayMask[at] & 1 ? 0 : 1;
        var row = r.rows[at];
        if (!s.tables[at][row.idx]) s.tables[at][row.idx] = [null, null];
        s.tables[at][row.idx][aw] = { tag: row.tag, ctr: actual ? 4 : 3, u: 0 }; /* :546-559 */
        out.alloc = at; s.allocs++;
      } else if (++s.resetCtr >= 255) { /* usefulResetCtr saturates at 255, :561, 626-636 */
        s.resetCtr = 0; s.resets++; out.reset = true;
        s.tables.forEach(function (tb) { Object.keys(tb).forEach(function (k) { tb[k].forEach(function (e) { if (e) e.u = 0; }); }); });
      }
    }
    return out;
  }

  /* Synthetic traces. Each call yields the next dynamic control-flow event. */
  var PCS = {
    loop: { B: [0x80001034, 0x80001000], O: [0x8000107c, 0x80001000] },
    alt: { B: [0x80003010, 0x80003030], O: [0x80003038, 0x80003000] },
    corr: { A: [0x80002008, 0x80002020], B: [0x80002024, 0x80002040], O: [0x80002048, 0x80002000] }
  };
  function tracer(kind, N, seed) {
    var rng = Book.rng(seed || 11), j = 0, phase = 0, a = false, P = PCS[kind];
    return function () {
      if (kind === "loop") {
        if (phase === 0) { var tk = j < N - 1; j++; if (!tk) { phase = 1; j = 0; } return { name: "B", pc: P.B[0], tgt: P.B[1], cond: true, taken: tk }; }
        phase = 0; return { name: "O", pc: P.O[0], tgt: P.O[1], cond: false, taken: true };
      }
      if (kind === "alt") {
        if (phase === 0) { phase = 1; j++; return { name: "B", pc: P.B[0], tgt: P.B[1], cond: true, taken: j % 2 === 1 }; }
        phase = 0; return { name: "O", pc: P.O[0], tgt: P.O[1], cond: false, taken: true };
      }
      if (phase === 0) { phase = 1; a = rng.next() < 0.5; return { name: "A", pc: P.A[0], tgt: P.A[1], cond: true, taken: a }; }
      if (phase === 1) { phase = 2; return { name: "B", pc: P.B[0], tgt: P.B[1], cond: true, taken: a }; }
      phase = 0; return { name: "O", pc: P.O[0], tgt: P.O[1], cond: false, taken: true };
    };
  }
  /* Advance until one conditional branch has been predicted and trained. */
  function stepOne(s, next) {
    for (;;) {
      var ev = next();
      if (!ev.cond) { phrPush(s, ev.pc, ev.tgt); continue; }
      var r = predict(s, ev.pc);
      var o = train(s, r, ev.taken);
      if (ev.taken) phrPush(s, ev.pc, ev.tgt);
      return { ev: ev, r: r, o: o, ok: r.fin === ev.taken };
    }
  }
  return { LENS: LENS, create: create, tracer: tracer, stepOne: stepOne, fold: fold, hash15: hash15 };
})();

(function () {
  "use strict";
  var root = typeof document !== "undefined" && document.getElementById("sim-tage");
  if (!root) return;
  var S, next, hist, last, MAXP = 4000;
  var getTrace = Ch03.segInit(document.getElementById("tage-trace"), function () { anim.stop(); reset(); });
  var P = Book.bind(root, function () { if (getTrace() === "loop") { anim.stop(); reset(); } });
  function reset() {
    S = Ch03Tage.create(); next = Ch03Tage.tracer(getTrace(), P.n | 0, 11); hist = []; last = null;
    setPlay(false); render();
  }
  function step() {
    last = Ch03Tage.stepOne(S, next);
    hist.push({ name: last.ev.name, ok: last.ok, src: last.r.src, alloc: last.o.alloc });
  }
  function hx(v, d) { var t = v.toString(16); while (t.length < d) t = "0" + t; return t; }
  function renderTable() {
    var tb = document.getElementById("tage-tab");
    var h = "<tr><th>표</th><th class=\"num\">L</th><th class=\"num\">set</th><th class=\"num\">태그</th><th>적중</th><th class=\"num\">ctr</th><th class=\"num\">u</th></tr>";
    var r = last && last.r;
    for (var t = 0; t < 8; t++) {
      var row = r ? r.rows[t] : null, cls = "";
      if (r && t === r.prov) cls = "p"; else if (r && t === r.alt) cls = "a";
      if (last && last.o.alloc === t) cls = "n";
      var role = r && t === r.prov ? " P" : r && t === r.alt ? " A" : "";
      var e = row && row.e;
      h += "<tr class=\"" + cls + "\"><td>T" + t + role + (last && last.o.alloc === t ? " 새" : "") + "</td><td class=\"num\">" + Ch03Tage.LENS[t] +
        "</td><td class=\"num mono\">" + (row ? hx(row.idx, 3) : "-") + "</td><td class=\"num mono\">" + (row ? hx(row.tag, 4) : "-") +
        "</td><td>" + (row ? (row.way >= 0 ? "way " + row.way : "miss") : "-") + "</td><td class=\"num\">" + (e ? e.ctr : "-") + "</td><td class=\"num\">" + (e ? e.u : "-") + "</td></tr>";
    }
    h += "<tr><td>기본</td><td class=\"num\">-</td><td class=\"num\">-</td><td class=\"num\">-</td><td>" + (r ? (r.basePred ? "T" : "N") : "-") +
      "</td><td class=\"num\">" + (r ? r.bctr : "-") + "</td><td class=\"num\">-</td></tr>";
    tb.innerHTML = h;
  }
  function draw(ctx, w, h) {
    var lab = 44, top = 14, bot = 24, rh = (h - top - bot) / 9, K = Math.max(20, Math.min(160, Math.floor((w - lab - 10) / 4)));
    var dx = (w - lab - 10) / K;
    for (var i = 0; i < 9; i++) {
      var y = top + (8 - i) * rh + rh / 2;
      Book.line(ctx, [[lab, y], [w - 6, y]], Book.css("grid"), 1);
      Book.text(ctx, i === 0 ? "기본" : "T" + (i - 1), 6, y, { size: 11, mono: true, color: Book.css("text-dim") });
    }
    var st = Math.max(0, hist.length - K);
    for (var j = st; j < hist.length; j++) {
      var p = hist[j], x = lab + (j - st + 0.5) * dx, yy = top + (8 - (p.src + 1)) * rh + rh / 2;
      ctx.fillStyle = p.ok ? Book.css("ok") : Book.css("bad");
      ctx.beginPath(); ctx.arc(x, yy, p.ok ? 2.2 : 3.4, 0, 6.2832); ctx.fill();
    }
    Book.text(ctx, "출처 표 (최근 " + K + "개 예측, 빨강 = 틀림)", lab, h - 10, { size: 11, color: Book.css("text-faint") });
  }
  var cv = Book.canvas(document.getElementById("tage-cv"), draw);
  function render() {
    cv.redraw(); renderTable();
    var rec = hist.slice(-100), ok = rec.filter(function (p) { return p.ok; }).length;
    document.getElementById("tage-n").textContent = hist.length;
    document.getElementById("tage-acc").textContent = Ch03.pct(ok, rec.length);
    var names = {}, per = [];
    rec.forEach(function (p) { var n = names[p.name] || (names[p.name] = [0, 0]); n[1]++; if (p.ok) n[0]++; });
    Object.keys(names).sort().forEach(function (k) { per.push(k + " " + Ch03.pct(names[k][0], names[k][1])); });
    document.getElementById("tage-per").textContent = per.length ? per.join(" · ") : "-";
    document.getElementById("tage-alloc").textContent = S.allocs + (S.resets ? " (리셋 " + S.resets + ")" : "");
    var v = document.getElementById("tage-verdict");
    if (!last) { v.className = "verdict grey"; v.textContent = "대기: " + (getTrace() === "loop" ? "루프 N=" + (P.n | 0) : getTrace() === "alt" ? "교대" : "상관"); return; }
    var r = last.r, src = r.src >= 0 ? "T" + r.src + (r.useProv ? " provider" : " alt") : "기본";
    v.className = "verdict " + (last.ok ? "ok" : "bad");
    v.textContent = last.ev.name + " 실제 " + (last.ev.taken ? "T" : "N") + ", 예측 " + (r.fin ? "T" : "N") + " (" + src + ")" + (last.ok ? " 적중" : " 틀림") + (last.o.alloc >= 0 ? ", T" + last.o.alloc + "에 할당" : "");
  }
  var playBtn = document.getElementById("tage-play");
  function setPlay(on) { if (!on) anim.stop(); playBtn.textContent = on ? "멈춤" : "재생"; }
  var anim = Book.loop(document.getElementById("tage-cv"), function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.05) return true;
    anim.acc = 0;
    for (var k = 0; k < 4; k++) step();
    render();
    if (hist.length >= MAXP) { setPlay(false); return false; }
    return true;
  });
  document.getElementById("tage-step").addEventListener("click", function () { setPlay(false); step(); render(); });
  playBtn.addEventListener("click", function () {
    if (anim.running) { setPlay(false); return; }
    if (hist.length >= MAXP) reset();
    setPlay(true); anim.start();
  });
  document.getElementById("tage-reset").addEventListener("click", function () { reset(); });
  reset();
})();

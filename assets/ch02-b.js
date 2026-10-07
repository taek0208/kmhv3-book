/* ch02-b.js: s1 source PREDICT, PHR stepper, counter comparison. Rules cited in each sim-note (@09453ff8). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var C = window.Ch02 || {};
  var seg = C.seg, hex = C.hex, pc32 = C.pc32;

  /* ---------- Sim D: s1 source and s2 override (bpu/Bpu.scala:280-329, 356-380) ---------- */
  (function () {
    var root = $("sim-s1"); if (!root) return;
    /* t: "c" conditional (ctr = 2-bit counter), "j" direct jump. uBTB has no counter: hit = taken. */
    var CASES = [
      { abtb: [{ p: 6, t: "c", ctr: 1 }, { p: 20, t: "j" }], ubtb: { p: 12, t: "j" }, mbtb: [{ p: 6, t: "c", ctr: 2 }, { p: 20, t: "j" }] },
      { abtb: [], ubtb: { p: 12, t: "j" }, mbtb: [{ p: 12, t: "j" }] },
      { abtb: [{ p: 6, t: "c", ctr: 1 }], ubtb: { p: 12, t: "j" }, mbtb: [{ p: 6, t: "c", ctr: 1 }, { p: 25, t: "j" }] },
      { abtb: [{ p: 9, t: "c", ctr: 2 }, { p: 3, t: "c", ctr: 3 }], ubtb: null, mbtb: [{ p: 9, t: "c", ctr: 2 }, { p: 3, t: "c", ctr: 3 }] }
    ];
    var NAMES = ["aBTB", "uBTB", "fall-through"];
    var ci = 0, pick = 0, ran = false;
    /* taken = jump || cond && ctr >= 2 (no uTAGE / TAGE-fast hit); first taken = least position (CompareMatrix) */
    function firstTaken(list) {
      var best = null;
      list.forEach(function (e) { if ((e.t === "j" || e.ctr >= 2) && (!best || e.p < best.p)) best = e; });
      return best;
    }
    var FT = { taken: false, p: 31, t: "-" };
    function s1Of(cs) {
      if (cs.abtb.length) { var f = firstTaken(cs.abtb); return f ? { src: 0, taken: true, p: f.p, t: f.t } : { src: 2, taken: false, p: 31, t: "-" }; }
      if (cs.ubtb) return { src: 1, taken: true, p: cs.ubtb.p, t: cs.ubtb.t };
      return { src: 2, taken: false, p: FT.p, t: "-" };
    }
    function s2Of(cs) { var f = firstTaken(cs.mbtb); return f ? { taken: true, p: f.p, t: f.t } : { taken: false, p: 31, t: "-" }; }
    function override(s1, s2) {
      var takenDiff = s1.taken !== s2.taken;
      var posDiff = s2.taken && s2.p !== s1.p, attrDiff = s2.taken && s2.t !== s1.t;
      return { on: takenDiff || posDiff || attrDiff, why: takenDiff ? "taken이 다름" : posDiff ? "첫 taken 칸이 다름" : attrDiff ? "종류가 다름" : "" };
    }
    var desc = function (r) { return r.taken ? "칸 " + r.p + " " + (r.t === "j" ? "점프" : "조건") + " taken" : "taken 없음(끝 31)"; };
    function rowHtml(label, list, mark) {
      var h = "<b>" + label + "</b>";
      for (var i = 0; i < 32; i++) {
        var e = null; list.forEach(function (x) { if (x.p === i) e = x; });
        var cls = e ? (e.t === "j" ? "j" : "c") : "";
        if (mark !== null && mark === i) cls = "pick";
        h += '<i class="' + cls + '">' + (e ? (e.t === "j" ? "J" : "C" + e.ctr) : (mark === i ? "▸" : "")) + "</i>";
      }
      return h;
    }
    function show() {
      var cs = CASES[ci], s1 = s1Of(cs), s2 = s2Of(cs);
      var m1 = ran && s1.src < 2 ? s1.p : null, m2 = ran ? s2.p : null;
      $("s1-view").innerHTML = '<div class="slots">' +
        rowHtml("aBTB", cs.abtb, ran && s1.src === 0 ? m1 : null) +
        rowHtml("uBTB", cs.ubtb ? [cs.ubtb] : [], ran && s1.src === 1 ? m1 : null) +
        rowHtml("MainBTB", cs.mbtb, ran && s2.taken ? m2 : null) + "</div>" +
        '<p class="mini">' + (cs.abtb.length ? "aBTB hit " + cs.abtb.length + "개" : "aBTB hit 없음") + " · " + (cs.ubtb ? "uBTB hit" : "uBTB miss") + " · C숫자 = 2비트 카운터, J = 점프</p>";
      if (!ran) {
        ["s1-s1", "s1-s2", "s1-ov"].forEach(function (id) { $(id).textContent = "-"; });
        var v = $("s1-out"); v.className = "verdict grey"; v.textContent = "아직 실행하지 않음";
        return;
      }
      var ov = override(s1, s2);
      $("s1-s1").textContent = NAMES[s1.src] + ": " + desc(s1);
      $("s1-s2").textContent = "MainBTB: " + desc(s2);
      $("s1-ov").textContent = ov.on ? "예 (" + ov.why + ")" : "아니오";
      var ok = pick === s1.src, out = $("s1-out");
      out.className = "verdict " + (ok ? "ok" : "bad");
      out.textContent = (ok ? "맞다. " : "아니다. ") + "s1은 " + NAMES[s1.src] + "를 쓴다" +
        (s1.src === 2 && cs.abtb.length ? ": aBTB가 hit했지만 taken이 없어서 uBTB를 보지 않고 fall-through로 간다(G6)." :
          s1.src === 0 ? ": aBTB hit 중 가장 앞 taken(칸 " + s1.p + ")을 고른다(G6)." : ": aBTB hit가 없어 uBTB로 내려간다(G6).") +
        (ov.on ? " s2는 " + ov.why + " → s2_override, 거품 1." : " s2도 같은 답 → override 없음.");
    }
    seg($("s1-case"), function (i) { ci = i; ran = false; show(); });
    seg($("s1-pick"), function (i) { pick = i; ran = false; show(); });
    $("s1-run").addEventListener("click", function () { ran = true; show(); });
    show();
  })();

  /* ---------- Sim E: PHR update (bpu/history/phr/Helpers.scala:60-63, 84-95; Shamt 2, hash 15 bits, 532 bits) ---------- */
  (function () {
    var root = $("sim-phr"); if (!root) return;
    var MASK = (BigInt(1) << BigInt(532)) - BigInt(1), N = 0x80001800;
    var PATHS = [
      [[0x80000116, 0x80000418, 1], [0x80000430, N, 1]],
      [[0x8000091A, 0x80000C2C, 1], [0x80000C30, 0x80000C70, 0], [0x80000C36, N, 1]]
    ];
    var pi = 0, k = 0;
    function hash(pc, t) { return ((((pc >>> 1) & 0x1FF) << 4) ^ ((t >>> 2) & 0x7FFF)) & 0x7FFF; }
    function run(path, steps) {
      var p = BigInt(0), rows = [];
      for (var i = 0; i < steps; i++) {
        var b = path[i], before = p, hs = hash(b[0], b[1]);
        if (b[2]) p = ((p << BigInt(2)) ^ BigInt(hs)) & MASK;   /* taken: shift by Shamt, XOR hash */
        rows.push({ pc: b[0], t: b[1], tk: b[2], h: hs, before: before, after: p });
      }
      return { phr: p, rows: rows };
    }
    function abtbIdx(phrUsed) {
      var h4 = Number(phrUsed & BigInt(15));                     /* folded (L=5,F=5)[3:0] = PHR[3:0] */
      var idx = (N & 0xFF) ^ h4;                                 /* startPc[7:0] ^ hash4 */
      return { h4: h4, set: idx >>> 2, bank: idx & 3 };
    }
    function show() {
      var path = PATHS[pi], r = run(path, k), h = "<tr><th>#</th><th>분기 PC</th><th>목적지</th><th>방향</th><th>hash</th><th>갱신 후 PHR</th></tr>";
      path.forEach(function (b, i) {
        if (i < k) {
          var x = r.rows[i];
          h += "<tr><td class=\"num\">" + (i + 1) + "</td><td class=\"num\">" + pc32(x.pc) + "</td><td class=\"num\">" + pc32(x.t) + "</td><td>" + (x.tk ? "T" : "NT") +
            "</td><td class=\"num\">" + (x.tk ? hex(x.h, 4) : "(안 씀)") + "</td><td class=\"num\">" + hex(Number(x.after & BigInt(0xFFFF)), 4) + "</td></tr>";
        } else h += "<tr><td class=\"num\">" + (i + 1) + "</td><td class=\"num\">" + pc32(b[0]) + "</td><td>?</td><td>?</td><td></td><td></td></tr>";
      });
      $("ph-tab").innerHTML = h;
      var bits = "";
      for (var b = 23; b >= 0; b--) {
        var on = (r.phr >> BigInt(b)) & BigInt(1);
        bits += '<span class="' + (b < 4 ? "f4" : on ? "f1" : "") + '">' + on + "</span>";
      }
      $("ph-bits").innerHTML = bits;
      $("ph-k").textContent = k + " / " + path.length;
      $("ph-v").textContent = hex(Number(r.phr & BigInt(0xFFFF)), 4);
      var v = $("ph-verdict");
      if (k < path.length) {
        $("ph-ab").textContent = "-";
        v.className = "verdict grey";
        v.textContent = k === 0 ? "PHR = 0에서 시작(합성 초깃값). '한 분기'를 누르세요." :
          (r.rows[k - 1].tk ? "taken: PHR을 2비트 밀고 hash " + hex(r.rows[k - 1].h, 4) + "를 XOR했다." : "not-taken: PHR은 그대로다.");
        return;
      }
      var used = r.rows[path.length - 1].before, a = abtbIdx(used);
      var other = abtbIdx(run(PATHS[1 - pi], PATHS[1 - pi].length).rows[PATHS[1 - pi].length - 1].before);
      $("ph-ab").textContent = "set " + a.set + " · 뱅크 " + a.bank;
      v.className = "verdict ok";
      v.textContent = "N의 s0에서 aBTB는 마지막 분기 전 PHR " + hex(Number(used & BigInt(0xFFFF)), 4) + "의 [3:0] = " + hex(a.h4) + "를 쓴다 → set " + a.set +
        ", 뱅크 " + a.bank + ". 다른 경로는 set " + other.set + ", 뱅크 " + other.bank + (other.set !== a.set || other.bank !== a.bank ? ": 같은 PC, 다른 엔트리." : ".");
    }
    seg($("ph-path"), function (i) { pi = i; k = 0; show(); });
    $("ph-step").addEventListener("click", function () { if (k < PATHS[pi].length) k++; show(); });
    $("ph-all").addEventListener("click", function () { k = PATHS[pi].length; show(); });
    $("ph-reset").addEventListener("click", function () { k = 0; show(); });
    show();
  })();

  /* ---------- Sim F: 2-bit counter vs uBTB usefulCnt (mbtb/MainBtbAlignBank.scala:220-281, ubtb/MicroBtb.scala:145-193) ---------- */
  (function () {
    var root = $("sim-ctr"); if (!root) return;
    var LEN = 48, pat = 0, res = null;
    var P = Book.bind(root, function () { compute(); cv.redraw(); });
    var cv = Book.canvas($("ct-cv"), draw);
    function outcomes() {
      var n = P.n | 0, o = [];
      for (var i = 0; i < LEN; i++) {
        if (pat === 0) o.push(i % n !== n - 1);        /* loop: T..T N */
        else if (pat === 1) o.push(i % n === n - 1);   /* rare: N..N T */
        else o.push(i % 2 === 0);                      /* alternate: T N */
      }
      return o;
    }
    function compute() {
      var o = outcomes(), a = { v: false, c: 0 }, u = 0, ea = 0, eu = 0, ca = [0], cu = [0];
      o.forEach(function (tk) {
        /* 2-bit (MainBTB): miss -> predict NT; mispredicted taken on miss -> write entry, ctr = WeakPositive 2 */
        var pa = a.v ? a.c >= 2 : false;
        if (pa !== tk) ea++;
        if (!a.v) { if (tk) { a.v = true; a.c = 2; } } else a.c = Math.max(0, Math.min(3, a.c + (tk ? 1 : -1)));
        /* uBTB: valid iff usefulCnt != 0, hit -> taken; miss & taken -> alloc 3; hit & taken -> +1; hit & NT -> -1 */
        var pu = u > 0;
        if (pu !== tk) eu++;
        if (u === 0) { if (tk) u = 3; } else u = tk ? Math.min(3, u + 1) : u - 1;
        ca.push(ea); cu.push(eu);
      });
      res = { o: o, ea: ea, eu: eu, ca: ca, cu: cu };
      $("ct-a").textContent = ea;
      $("ct-b").textContent = eu;
      $("ct-n").textContent = LEN;
      var v = $("ct-verdict");
      if (ea === eu) { v.className = "verdict grey"; v.textContent = "둘 다 " + ea + "번 틀린다."; }
      else {
        var better = ea < eu ? "2비트 카운터" : "uBTB";
        v.className = "verdict " + (ea < eu ? "ok" : "warn");
        v.textContent = better + "가 " + Math.abs(ea - eu) + "번 덜 틀린다 (정확도 " + Math.round(100 * (LEN - ea) / LEN) + "% 대 " + Math.round(100 * (LEN - eu) / LEN) + "%).";
      }
    }
    function draw(ctx, w, h) {
      if (!res) compute();
      var ymax = Math.max(4, Math.ceil(Math.max(res.ea, res.eu) / 4) * 4);
      var f = Book.frame(ctx, w, h, { x: [0, LEN], y: [0, ymax], xlabel: "실행 횟수", ylabel: "누적 틀림", pad: { b: 46 }, xticks: 4,
        xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
      Book.line(ctx, res.ca.map(function (v, i) { return [f.x(i), f.y(v)]; }), Book.css("accent-2"), 2.5);
      Book.line(ctx, res.cu.map(function (v, i) { return [f.x(i), f.y(v)]; }), Book.css("accent"), 2.5, [6, 4]);
      var cw = (f.box.x1 - f.box.x0) / LEN;
      res.o.forEach(function (tk, i) {
        ctx.fillStyle = tk ? Book.css("ok") : Book.css("grey");
        ctx.fillRect(f.box.x0 + i * cw + 0.5, f.box.y1 + 22, Math.max(1, cw - 1), 6);
      });
      Book.text(ctx, "2비트 (실선)", f.box.x0 + 90, f.box.y0 + 10, { color: Book.css("accent-2"), weight: 700 });
      Book.text(ctx, "uBTB (점선)", f.box.x0 + 90, f.box.y0 + 28, { color: Book.css("accent"), weight: 700 });
    }
    seg($("ct-pat"), function (i) { pat = i; compute(); cv.redraw(); });
    compute();
  })();
})();

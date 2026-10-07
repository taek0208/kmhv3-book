/* ch02-a.js: fall-through calculator, BTB address decomposer, override timeline.
   Each simulator models the rule cited in its sim-note (KMHv3 @09453ff8) on synthetic addresses. */
(function () {
  "use strict";
  window.Ch02 = window.Ch02 || {};
  var $ = function (id) { return document.getElementById(id); };
  var hex = function (v, w) { var s = v.toString(16).toUpperCase(); while (s.length < (w || 1)) s = "0" + s; return "0x" + s; };
  var pc32 = function (v) { var s = hex(v >>> 0, 8).slice(2); return "0x" + s.slice(0, 4) + "_" + s.slice(4); };
  /* book.js does not wire .seg: toggle .on here and report the index. */
  function seg(el, fn) {
    var bs = el.querySelectorAll("button");
    bs.forEach(function (b, i) {
      b.addEventListener("click", function () {
        bs.forEach(function (x) { x.classList.toggle("on", x === b); });
        fn(i);
      });
    });
  }
  function segSet(el, i) { el.querySelectorAll("button").forEach(function (x, j) { x.classList.toggle("on", j === i); }); }
  window.Ch02.seg = seg; window.Ch02.segSet = segSet; window.Ch02.hex = hex; window.Ch02.pc32 = pc32;

  /* ---------- Sim A: fall-through (bpu/FallThroughPredictor.scala:65-94) ---------- */
  (function () {
    var root = $("sim-ft"); if (!root) return;
    var k = $("ft-k"), BASE = 0x80000000;
    var PRE = [0x000, 0x010, 0x03E, 0xFC0, 0xFE0, 0xFFE];
    function fallThrough(start) {
      var align = start - (start % 32);                  /* getAlignedPc: clear pc[4:0] */
      var next = start + 64; next -= next % 32;          /* getAlignedPc(s1_startPc + 64) */
      var bit12 = function (v) { return Math.floor(v / 4096) % 2; };
      var cross = bit12(start) !== bit12(next);          /* isCrossPage: pc[12] differs */
      var nextPage = next - (next % 4096);
      var target = cross ? nextPage : next;
      var pos = cross ? ((~(next - nextPage)) >>> 1) & 31 : 31; /* ~(nextBlock - nextPage)[5:1] */
      return { align: align, next: next, cross: cross, target: target, pos: pos, len: target - start };
    }
    function show() {
      var off = +k.value, start = BASE + off, r = fallThrough(start);
      $("ft-off").textContent = hex(off, 3);
      var s0 = (start - r.align) / 2, html = "<b>칸</b>";
      for (var i = 0; i < 32; i++) html += "<i>" + (i % 8 === 0 ? i : "") + "</i>";
      html += "<b>블록</b>";
      for (i = 0; i < 32; i++) {
        var c = i < s0 ? "pre" : i < r.pos ? "in" : i === r.pos ? "end" : "out";
        html += '<i class="' + c + '" title="' + pc32(r.align + 2 * i) + '"></i>';
      }
      $("ft-slots").innerHTML = html;
      $("ft-al").textContent = pc32(r.align);
      $("ft-tg").textContent = pc32(r.target);
      $("ft-pos").textContent = r.pos + (r.cross && r.pos < 31 ? " (잘림)" : "");
      $("ft-len").innerHTML = r.len + "<small>B</small>";
      var v = $("ft-verdict");
      if (r.cross && r.target !== r.next) {
        v.className = "verdict warn";
        v.textContent = "페이지를 넘는다: align32(start+64) = " + pc32(r.next) + " 대신 페이지 시작 " + pc32(r.target) + "에서 자른다 (F1)";
      } else {
        v.className = "verdict ok";
        v.textContent = "페이지 안: target = align32(start+64) = " + pc32(r.target) + ", 끝 칸 31, " + r.len + "바이트";
      }
      var j = PRE.indexOf(off); segSet($("ft-pre"), j);
    }
    seg($("ft-pre"), function (i) { k.value = PRE[i]; if (window.Euiyun) Euiyun.fill(k); show(); });
    k.addEventListener("input", show);
    window.Ch02.fallThrough = fallThrough;
    show();
  })();

  /* ---------- Sim B: BTB address fields (mbtb/Helpers.scala:30-45, abtb/AheadBtb.scala:95-98, ubtb/Helpers.scala) ---------- */
  (function () {
    var root = $("sim-addr"); if (!root) return;
    var k = $("ad-k"), START = 0x80001050, pc = START;
    var P = Book.bind(root, function () { show(); });
    function mbtb(a) {
      return { off: (a >>> 1) & 15, half: (a >>> 5) & 1, ibank: (a >>> 6) & 3, set: (a >>> 8) & 255, tag: (a >>> 16) & 0xFFFF };
    }
    function setPc(v) { pc = v >>> 0; k.value = pc & 0xFFFF; if (window.Euiyun) Euiyun.fill(k); show(); }
    function show() {
      $("ad-pc").textContent = hex(pc & 0xFFFF, 4);
      var bits = "";
      for (var b = 31; b >= 0; b--) {
        var cls = b >= 16 ? "f1" : b >= 8 ? "f2" : b >= 6 ? "f3" : b === 5 ? "f4" : "";
        bits += '<span class="' + cls + '">' + ((pc >>> b) & 1) + "</span>";
      }
      $("ad-bits").innerHTML = bits;
      var m = mbtb(pc);
      var other = ((pc + 32) >>> 0) - ((pc + 32) % 32);              /* getAlignedPc(start + 32) */
      var o = mbtb(other);
      var cross = ((pc >>> 12) & 1) !== ((other >>> 12) & 1);          /* isCrossPage */
      var row = function (name, a, f, note) {
        return "<tr><td>" + name + "</td><td class=\"num\">" + pc32(a) + "</td><td class=\"num\">" + f.half + "</td><td class=\"num\">" + f.ibank +
          "</td><td class=\"num\">" + hex(f.set, 2) + "</td><td class=\"num\">" + hex(f.tag, 4) + "</td><td>" + note + "</td></tr>";
      };
      $("ad-tab").innerHTML = "<tr><th>MainBTB 읽기</th><th>주소</th><th>반쪽</th><th>뱅크</th><th>set</th><th>tag</th><th>쓰는 칸</th></tr>" +
        row("startPc", pc, m, "칸 " + m.off + " 이후 (B1)") +
        row("다른 반쪽", other, o, cross ? "버림: 페이지 넘음" : "칸 0 이후 전부");
      $("ad-m").textContent = "set " + hex(m.set, 2) + " · 반쪽" + m.half + " 뱅크" + m.ibank;
      var idx = (pc & 0xFF) ^ (P.h | 0);                                /* startPc[7:0] ^ hash4 */
      $("ad-a").textContent = "set " + (idx >>> 2) + " · 뱅크 " + (idx & 3);
      $("ad-u").textContent = hex((pc >>> 1) & 0x3FFFFF, 6);           /* pc[22:1] */
    }
    k.addEventListener("input", function () { pc = ((pc - (pc & 0xFFFF)) + (+k.value)) >>> 0; show(); });
    $("ad-32").addEventListener("click", function () { setPc(pc + 32); });
    $("ad-256").addEventListener("click", function () { setPc(pc + 256); });
    $("ad-64k").addEventListener("click", function () { setPc(pc + 0x10000); });
    $("ad-rst").addEventListener("click", function () { setPc(START); });
    show();
  })();

  /* ---------- Sim C: override timeline (bpu/Bpu.scala:248-278, 510, 533-541) ---------- */
  (function () {
    var root = $("sim-ovr"); if (!root) return;
    var T = 12, k = $("ov-k"), sc = 0, hist = [], t = 0, timer = null;
    var TRUE = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
    /* Successor of a block as predicted at stage s (1,2,3). Only block B is mispredicted. */
    function succ(blk, s) {
      if (blk[0] === "x") return "x" + (+blk.slice(1) + 1);
      if (blk === "B") {
        if (sc === 1) return s === 1 ? "x1" : "C";      /* s2 fixes */
        if (sc === 2) return s === 3 ? "C" : "x1";      /* s3 fixes */
        if (sc === 3) return "x1";                       /* all wrong: backend redirect */
      }
      return TRUE[TRUE.indexOf(blk) + 1];
    }
    function simulate() {
      var s1 = { v: false }, s2 = { v: false }, s3 = { v: false }, reg = "A", out = [];
      for (var c = 0; c < T; c++) {
        var redirect = sc === 3 && c === 7;
        var ftqReady = !(sc === 4 && (c === 3 || c === 4));
        var s2ovr = s2.v && succ(s2.b, 2) !== succ(s2.b, 1);
        var s3ovr = s3.v && succ(s3.b, 3) !== succ(s3.b, 2);
        var s3flush = redirect, s2flush = s3flush || s3ovr, s1flush = s2flush || s2ovr;
        var s3fire = s3.v, s3ready = s3fire || !s3.v;
        var s2fire = s2.v && s3ready, s2ready = s2fire || !s2.v;
        var s1fire = s1.v && s2ready && ftqReady;
        var s1ready = s1fire || !s1.v || s1flush;
        var s0fire = s1ready;                                       /* sramResetDone assumed */
        var pc0 = redirect ? "C" : s3ovr ? succ(s3.b, 3) : s2ovr ? succ(s2.b, 2) : s1.v ? succ(s1.b, 1) : reg;
        var ftq = s3ovr ? s3.b + "*" : s2ovr ? s2.b + "*" : (s1fire && !s1flush) ? s1.b : "";
        out.push({ s0: s0fire ? pc0 : "", s0st: !s0fire, s1: s1.v ? s1.b : "", s2: s2.v ? s2.b : "", s3: s3.v ? s3.b : "",
          f1: s1.v && s1flush, f2: s2.v && s2flush, f3: s3.v && s3flush, st1: s1.v && !s1fire && !s1flush,
          ftq: ftq, s2ovr: s2ovr, s3ovr: s3ovr, redirect: redirect, ftqReady: ftqReady, newSent: s1fire && !s1flush, pc0: pc0 });
        var n3 = s3flush ? { v: false } : s2fire ? { v: !s2flush, b: s2.b } : s3fire ? { v: false } : s3;
        var n2 = s2flush ? { v: false } : s1fire ? { v: !s1flush, b: s1.b } : s2fire ? { v: false } : s2;
        var n1 = s0fire ? { v: true, b: pc0 } : s1flush ? { v: false } : s1fire ? { v: false } : s1;
        if (s0fire) reg = pc0;
        s1 = n1; s2 = n2; s3 = n3;
      }
      return out;
    }
    var wrong = function (b) { return b && b[0] === "x"; };
    function cell(txt, cls) { return '<td class="' + cls + '">' + (txt || "") + "</td>"; }
    function show() {
      var rows = { s0: "<tr><th>s0</th>", s1: "<tr><th>s1</th>", s2: "<tr><th>s2</th>", s3: "<tr><th>s3</th>", ftq: "<tr><th>FTQ</th>" };
      var head = "<tr><th>t</th>";
      for (var c = 0; c < T; c++) {
        head += "<th>" + c + "</th>";
        var h = hist[c], now = c === t ? " now" : "";
        if (c > t) { ["s0", "s1", "s2", "s3", "ftq"].forEach(function (r) { rows[r] += "<td></td>"; }); continue; }
        rows.s0 += cell(h.s0st ? "멈춤" : h.s0, (h.s0st ? "st" : wrong(h.s0) ? "w" : "ok") + now);
        ["s1", "s2", "s3"].forEach(function (s, i) {
          var b = h[s], fl = h["f" + (i + 1)];
          rows[s] += cell(b, (!b ? "" : fl ? "fl" : (s === "s1" && h.st1) ? "st" : wrong(b) ? "w" : "ok") + now);
        });
        rows.ftq += cell(h.ftq, (!h.ftq ? "" : h.ftq.indexOf("*") > 0 ? "st" : wrong(h.ftq) ? "w" : "ok") + now);
      }
      $("ov-tab").innerHTML = head + "</tr>" + rows.s0 + "</tr>" + rows.s1 + "</tr>" + rows.s2 + "</tr>" + rows.s3 + "</tr>" + rows.ftq + "</tr>";
      var seen = {}, sent = 0, good = [];
      for (c = 0; c <= t; c++) {
        if (wrong(hist[c].s1)) seen[hist[c].s1] = 1;
        if (hist[c].newSent) { sent++; if (!wrong(hist[c].s1)) good.push(hist[c].s1); }
      }
      $("ov-sent").textContent = sent;
      $("ov-bub").textContent = Object.keys(seen).length;
      $("ov-good").textContent = good.length ? good.join("·") : "-";
      $("ov-t").textContent = t;
      var h = hist[t], v = $("ov-verdict"), msg, cls = "verdict ok";
      if (h.redirect) { cls = "verdict bad"; msg = "t" + t + ": redirect. s1-s3를 모두 비우고 s0 = C. 그동안 가져온 x 블록은 모두 버린다."; }
      else if (h.s3ovr) { cls = "verdict bad"; msg = "t" + t + ": s3_override. s3의 " + h.s3 + "가 s2와 다른 다음 블록 " + h.pc0 + "을 낸다 → s1·s2 비움(거품 2), s0 = " + h.pc0 + ". FTQ의 " + h.s3 + " 칸을 고친다(*)."; }
      else if (h.s2ovr) { cls = "verdict warn"; msg = "t" + t + ": s2_override. s2의 " + h.s2 + "가 s1과 다른 다음 블록 " + h.pc0 + "을 낸다 → s1 비움(거품 1), s0 = " + h.pc0 + ". FTQ 칸을 고친다(*)."; }
      else if (!h.ftqReady) { cls = "verdict warn"; msg = "t" + t + ": FTQ.ready = 0 → s1_fire = 0, s1_ready = 0 → s0 멈춤. s1이 " + h.s1 + "를 붙잡고 있다."; }
      else if (!h.s1) msg = "t" + t + ": s1이 비어 있어 s0는 레지스터에 남은 리셋 벡터 " + h.pc0 + "에서 시작한다.";
      else msg = "t" + t + ": 정상. s1의 " + (h.s1 || "-") + " 예측이 FTQ로 가고, 그 target " + h.pc0 + "이 같은 사이클 s0 PC가 된다.";
      v.className = cls; v.textContent = msg;
    }
    function go(nt) { t = Math.max(0, Math.min(T - 1, nt)); k.value = t; if (window.Euiyun) Euiyun.fill(k); show(); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $("ov-play").textContent = "재생"; }
    function reset() { stop(); hist = simulate(); go(0); }
    seg($("ov-sc"), function (i) { sc = i; reset(); });
    k.addEventListener("input", function () { stop(); go(+k.value); });
    $("ov-step").addEventListener("click", function () { stop(); go(t + 1); });
    $("ov-reset").addEventListener("click", reset);
    $("ov-play").addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (t >= T - 1) go(0);
      $("ov-play").textContent = "일시정지";
      timer = setInterval(function () { if (t >= T - 1) { stop(); return; } go(t + 1); }, 650);
    });
    reset();
  })();
})();

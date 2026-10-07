/* Chapter 05 sims, part A: decode uop-buffer stepper (sim-dec) and fusion detector (sim-fus). */

/* Shared helper: make a .seg act like radio buttons; returns a getter for the active index. */
window.C5Seg = function (seg, onPick) {
  var bs = Array.prototype.slice.call(seg.querySelectorAll("button"));
  bs.forEach(function (b, i) {
    b.addEventListener("click", function () {
      bs.forEach(function (x) { x.classList.toggle("on", x === b); });
      if (onPick) onPick(i);
    });
  });
  return function () { return bs.findIndex(function (b) { return b.classList.contains("on"); }); };
};

/* sim-dec. Rule (UopBufferCtrlDecoder.scala:213-229 + ChannelUopSelect.scala:257-298):
   mop 0 is always accepted; mop k>=1 is accepted iff b + n0 + ... + n(k-1) <= 7, i.e. its first uop
   lands in output slot 0..7; at most DecodeWidth = 8 mops. Output uops = min(8, total); the overflow
   (total - 8, at most 7) stays in the uop buffer (uopBufferSize = maxSplitUopNum - 1 = 7). */
(function () {
  "use strict";
  var root = document.getElementById("sim-dec");
  if (!root) return;
  var OUT = 8, BUF = 7, MOPS = 8;
  var PATTERNS = [[1], [1, 1, 1, 1, 1, 1, 1, 2, 1, 2], [1, 1, 8, 1, 1, 1], [2, 4, 1, 2, 1, 4, 1]];
  var scen = 0, st;
  var getScen = C5Seg(document.getElementById("dec-seg"), function (i) { scen = i; reset(); });
  var cv = Book.canvas(document.getElementById("dec-cv"), draw);

  function nOf(idx) { var p = PATTERNS[scen]; return p[idx % p.length]; }

  function reset() {
    st = { cyc: 0, next: 0, buf: [], hist: [], uops: 0, last: null };
    cv.redraw(); show();
  }

  function step() {
    var slots = st.buf.slice(), sum = st.buf.length, k = 0;
    while (k < MOPS) {
      if (k > 0 && sum > OUT - 1) break; /* first uop of mop k must land in slot <= 7 */
      var n = nOf(st.next);
      for (var u = 0; u < n; u++) slots.push(st.next);
      sum += n; st.next++; k++;
    }
    var out = slots.slice(0, OUT), rest = slots.slice(OUT);
    if (rest.length > BUF) throw new Error("uop buffer overflow");
    st.buf = rest; st.cyc++; st.uops += k;
    st.last = { cyc: st.cyc, out: out, buf: rest.slice(), mops: k };
    st.hist.push(st.last);
    if (st.hist.length > 7) st.hist.shift();
  }

  function draw(ctx, w, h) {
    var lab = 40, gap = 14, cells = OUT + BUF;
    var cw = Math.max(10, (w - lab - gap - 12) / cells), top = 30, rh = Math.min(34, (h - top - 8) / 7);
    var colA = Book.css("accent-soft"), colB = Book.css("accent-2-soft"), dim = Book.css("text-dim");
    Book.text(ctx, "출력 8칸", lab + cw * 4, 14, { size: 12, color: dim, align: "center" });
    Book.text(ctx, "uop 버퍼 7칸", lab + cw * OUT + gap + cw * 3.5, 14, { size: 12, color: dim, align: "center" });
    for (var r = 0; r < 7; r++) {
      var row = st.hist[r], y = top + r * rh;
      Book.text(ctx, row ? "c" + row.cyc : "", 6, y + rh / 2, { size: 12, color: dim, mono: true });
      for (var c = 0; c < cells; c++) {
        var x = lab + c * cw + (c >= OUT ? gap : 0);
        var id = row ? (c < OUT ? row.out[c] : row.buf[c - OUT]) : undefined;
        var fill = id === undefined ? null : (id % 2 ? colB : colA);
        Book.roundRect(ctx, x + 1, y + 2, cw - 2, rh - 4, 4, fill, id === undefined ? Book.css("border") : Book.css(id % 2 ? "accent-2" : "accent"));
        if (id !== undefined && cw > 16) Book.text(ctx, String(id), x + cw / 2, y + rh / 2, { size: 11, color: Book.css("text"), align: "center", mono: true });
      }
    }
    if (!st.hist.length) Book.text(ctx, "한 사이클을 눌러 시작", w / 2, top + rh * 3.5, { size: 13, color: dim, align: "center" });
  }

  function show() {
    var L = st.last;
    document.getElementById("dec-ro-cyc").textContent = st.cyc;
    document.getElementById("dec-ro-mop").textContent = L ? L.mops : 0;
    document.getElementById("dec-ro-uop").textContent = L ? L.out.length + " / 8" : "0 / 8";
    document.getElementById("dec-ro-buf").textContent = st.buf.length;
    document.getElementById("dec-ro-avg").textContent = st.cyc ? (st.uops / st.cyc).toFixed(2) /* mops per cycle */ : "0";
    var v = document.getElementById("dec-verdict");
    if (!L) { v.className = "verdict grey"; v.textContent = "대기: 칸 숫자는 명령 번호"; return; }
    if (L.out.length === OUT && L.buf.length === 0) { v.className = "verdict ok"; v.textContent = "8칸 가득, 버퍼 비움"; }
    else if (L.out.length === OUT) { v.className = "verdict warn"; v.textContent = "8칸 가득, 명령 " + L.buf[0] + "의 uop " + L.buf.length + "개가 버퍼로"; }
    else { v.className = "verdict warn"; v.textContent = "빈 출력 칸 " + (OUT - L.out.length) + "개: 다음 명령의 첫 uop가 슬롯 7을 넘음"; }
  }

  var anim = Book.loop(document.getElementById("dec-cv"), function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.45) return true;
    anim.acc = 0; step(); cv.redraw(); show();
    return st.cyc < 60;
  });
  var play = document.getElementById("dec-play");
  document.getElementById("dec-step").addEventListener("click", function () { anim.stop(); play.textContent = "재생"; step(); cv.redraw(); show(); });
  play.addEventListener("click", function () {
    if (anim.running) { anim.stop(); play.textContent = "재생"; }
    else { if (st.cyc >= 60) reset(); anim.start(); play.textContent = "일시정지"; }
  });
  document.getElementById("dec-reset").addEventListener("click", function () { anim.stop(); play.textContent = "재생"; reset(); });
  scen = getScen();
  reset();
})();

/* sim-fus. Rule (FusionDecoder.scala:530-569, 635): for window i in 0..6,
   out(i).valid = !thisCleared(i) && (one of 28 cases) && notHint && enabled; clear(i+1) = out(i).valid.
   Register conditions: A = same rd && rd1 == rs1_2; B = same rd && (rd1 == rs1_2 || rd1 == rs2_2) && rs1_2 != rs2_2. */
(function () {
  "use strict";
  var root = document.getElementById("sim-fus");
  if (!root) return;
  function op(o, imm) { return function (x) { return x.op === o && (imm === undefined || x.imm === imm); }; }
  function any(list) { return function (x) { return list.indexOf(x.op) >= 0; }; }
  var ADDW = any(["addiw", "addw"]), LOGIC = any(["andi", "and", "ori", "or", "xori", "xor", "orc.b"]);
  var CASES = [
    ["slli32_srli32", op("slli", 32), op("srli", 32), "A"], ["slli48_srli48", op("slli", 48), op("srli", 48), "A"],
    ["slliw16_srliw16", op("slliw", 16), op("srliw", 16), "A"], ["slliw16_sraiw16", op("slliw", 16), op("sraiw", 16), "A"],
    ["slli1_add", op("slli", 1), op("add"), "B"], ["slli2_add", op("slli", 2), op("add"), "B"], ["slli3_add", op("slli", 3), op("add"), "B"],
    ["slli32_srli31", op("slli", 32), op("srli", 31), "A"], ["slli32_srli30", op("slli", 32), op("srli", 30), "A"],
    ["slli32_srli29", op("slli", 32), op("srli", 29), "A"], ["srli8_andi255", op("srli", 8), op("andi", 255), "A"],
    ["slli4_add", op("slli", 4), op("add"), "B"], ["srli29_add", op("srli", 29), op("add"), "B"], ["srli30_add", op("srli", 30), op("add"), "B"],
    ["srli31_add", op("srli", 31), op("add"), "B"], ["srli32_add", op("srli", 32), op("add"), "B"],
    ["andi1_add", op("andi", 1), op("add"), "B"], ["andi1_addw", op("andi", 1), op("addw"), "B"],
    ["andi_f00_or", op("andi", -256), op("or"), "B"], ["andi127_mulw", op("andi", 127), op("mulw"), "B"],
    ["addw_andi255", ADDW, op("andi", 255), "A"], ["addw_andi1", ADDW, op("andi", 1), "A"],
    ["addw_zexth", ADDW, op("zext.h"), "A"], ["addw_sexth", ADDW, op("sext.h"), "A"],
    ["logic_andi1", LOGIC, op("andi", 1), "A"], ["logic_zexth", LOGIC, op("zext.h"), "A"],
    ["lui_addi", op("lui"), op("addi"), "A"], ["lui_addiw", op("lui"), op("addiw"), "A"]
  ];
  function I(o, rd, rs1, rs2, imm) {
    var t = o + " " + rd + (rs1 ? ", " + rs1 : "") + (rs2 ? ", " + rs2 : "") + (imm !== undefined ? ", " + (o === "lui" ? "0x" + imm.toString(16) : imm) : "");
    return { op: o, rd: rd, rs1: rs1, rs2: rs2, imm: imm, txt: t };
  }
  var SCEN = [
    [I("slli", "a0", "a1", null, 3), I("add", "a0", "a0", "a2"), I("lui", "t0", null, null, 0x12345), I("addi", "t0", "t0", null, 0x678),
     I("andi", "a3", "a4", null, 1), I("add", "a3", "a5", "a3"), I("slli", "a6", "a7", null, 32), I("srli", "a6", "a6", null, 32)],
    [I("slli", "a0", "a1", null, 32), I("srli", "a1", "a0", null, 32), I("slli", "t1", "t2", null, 1), I("add", "t1", "t1", "t1"),
     I("srli", "s1", "s2", null, 8), I("andi", "s1", "s1", null, 255), I("andi", "a2", "a3", null, 127), I("mulw", "a2", "a2", "a4")],
    [I("lui", "a0", null, null, 0x1), I("addiw", "a0", "a0", null, 16), I("andi", "a0", "a0", null, 255), I("xori", "a1", "a2", null, 5),
     I("andi", "a1", "a1", null, 1), I("add", "s0", "s1", "s2"), I("slli", "s3", "s4", null, 48), I("srli", "s3", "s3", null, 48)],
    [I("slli", "zero", "a1", null, 32), I("srli", "zero", "zero", null, 32), I("lui", "a0", null, null, 0x2), I("addi", "a0", "a0", null, 1),
     I("andi", "a1", "a2", null, 1), I("addw", "a1", "a1", "a3"), I("add", "a4", "a5", "a6"), I("addi", "zero", "zero", null, 0)]
  ];
  var scen = 0, fusionEnable = true, singlestep = false;
  var grid = document.getElementById("fus-grid");
  var getScen = C5Seg(document.getElementById("fus-seg"), function (i) { scen = i; run(); });

  function match(a, b) {
    var same = a.rd === b.rd, d1 = a.rd === b.rs1, d2 = a.rd === b.rs2, r12 = b.rs1 === b.rs2;
    var hits = CASES.filter(function (c) {
      var reg = c[3] === "A" ? same && d1 : same && (d1 || d2) && !r12;
      return c[1](a) && c[2](b) && reg;
    });
    if (hits.length > 1) throw new Error("more then one fusion matched"); /* XSError, FusionDecoder.scala:570 */
    return hits.length ? hits[0][0] : null;
  }

  function run() {
    var s = SCEN[scen], enabled = !(singlestep || !fusionEnable);
    var clear = [false], res = [], n = 0, blk = 0, hint = 0;
    for (var i = 0; i < 7; i++) {
      var m = match(s[i], s[i + 1]), notHint = s[i].rd !== "zero" && s[i + 1].rd !== "zero";
      var valid = !clear[i] && !!m && notHint && enabled;
      clear[i + 1] = valid;
      if (valid) n++;
      if (clear[i] && m) blk++;
      if (!clear[i] && m && !notHint && enabled) hint++;
      res.push({ m: m, valid: valid, blocked: clear[i] && !!m, hint: !clear[i] && m && !notHint && enabled });
    }
    grid.innerHTML = "";
    s.forEach(function (x, j) {
      var d = document.createElement("div"), r = res[j], cls = "c5-cell", nm = "슬롯 " + j;
      if (clear[j]) { cls += " cl"; nm = "clear"; }
      else if (r && r.valid) { cls += " fz"; nm = r.m; }
      else if (r && (r.blocked || r.hint)) { cls += " bl"; nm = "w" + j + (r.hint ? " HINT" : " 막힘"); }
      d.className = cls;
      d.innerHTML = '<span class="nm"></span>';
      d.firstChild.textContent = nm;
      d.appendChild(document.createTextNode(x.txt));
      grid.appendChild(d);
    });
    document.getElementById("fus-ro-n").textContent = n;
    document.getElementById("fus-ro-out").textContent = 8 - n;
    document.getElementById("fus-ro-blk").textContent = blk;
    document.getElementById("fus-ro-hint").textContent = hint;
    var v = document.getElementById("fus-verdict");
    if (!enabled) { v.className = "verdict warn"; v.textContent = "disableFusion = singlestep || !FUSION_ENABLE = 1: 모든 창 꺼짐"; }
    else { v.className = n ? "verdict ok" : "verdict grey"; v.textContent = "성립 " + n + "쌍: 리네임으로 가는 uop 8 → " + (8 - n); }
  }
  var en = document.getElementById("fus-en"), ss = document.getElementById("fus-ss");
  en.addEventListener("click", function () { fusionEnable = !fusionEnable; en.textContent = "FUSION_ENABLE = " + (fusionEnable ? 1 : 0); en.classList.toggle("primary", !fusionEnable); run(); });
  ss.addEventListener("click", function () { singlestep = !singlestep; ss.textContent = "singlestep = " + (singlestep ? 1 : 0); ss.classList.toggle("primary", singlestep); run(); });
  scen = getScen();
  run();
})();

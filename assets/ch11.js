/* Chapter 11 (vector): shared RVV helpers + vsetvli calculator, two PREDICTs, decode-slot stepper.
   Rules follow XiangShan kunminghu-v3 @09453ff8; line refs are in ch11-vector.html. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var SEWS = [8, 16, 32, 64];
  var LMULS = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
  var LNAME = ["mf8", "mf4", "mf2", "m1", "m2", "m4", "m8"];

  /* VLMAX = VLEN*LMUL/SEW, 0 when SEW > min(LMUL,1)*ELEN (VSetFuncUnit.scala:124-163). */
  function vlmax(sew, lmul) {
    if (sew > Math.min(lmul, 1) * 64) return 0;
    return 128 * lmul / sew;
  }
  /* AVL from GPR saturates to 8 bits: Cat(bits.drop(7).orR, bits.take(7)) (VSetFuncUnit.scala:44-47). */
  function satAvl(a) { return (a >= 128 ? 128 : 0) + (a & 127); }

  /* kind: vsetvli|vsetivli|vsetvl; mode: normal|vlmax|keep. prev = fixed earlier config e32·m1, vl=3. */
  var PREV = { sew: 32, lmul: 1, vl: 3 };
  function vsetCalc(kind, mode, avlIn, sew, lmul) {
    if (kind === "vsetivli") mode = "normal";             // uimm AVL: always normalStripmining
    var avl = kind === "vsetivli" ? Math.min(avlIn, 31) : satAvl(avlIn);
    var vm = vlmax(sew, lmul);
    var vill = vm === 0 || (mode === "keep" && vm !== vlmax(PREV.sew, PREV.lmul));
    var vl;
    if (vill) vl = 0;
    else if (mode === "normal") vl = avl >= vm ? vm : avl;
    else if (mode === "vlmax") vl = vm;
    else vl = PREV.vl;
    return { avl: avl, avlRaw: kind === "vsetivli" ? Math.min(avlIn, 31) : avlIn, vlmax: vm, vill: vill, vl: vl,
      flush: kind === "vsetvl", mode: mode };
  }

  /* uop count from SplitTable / UopInfoField. 0 = illegal. */
  function split(inst, sew, lmul, nf) {
    var legal = vlmax(sew, lmul) > 0, big = Math.max(1, lmul);
    if (!legal) return 0;
    switch (inst) {
      case "add": return 1;
      case "vadd": case "vmseq": case "vredsum": return big;
      case "vfadd": return sew >= 16 ? big : 0;                         // SL_Float
      case "vwadd": case "vnsrl": return (sew <= 32 && lmul <= 4) ? (lmul >= 1 ? 2 * lmul : 1) : 0; // SL_Widen, dupF2W
      case "vle": { var n = Math.max(1, lmul) * (nf || 1); return n <= 8 ? n : 0; } // EEW=SEW so EMUL=LMUL
    }
    return 0;
  }
  /* NumUopOhField.scala:24-28: 0,1->1, 2->2, 3|4->4, 5..8->8 */
  function roundOH(n) { return n <= 1 ? 1 : n === 2 ? 2 : n <= 4 ? 4 : 8; }

  function seg(el, fn) {
    var bs = el.querySelectorAll("button");
    bs.forEach(function (b, i) {
      b.addEventListener("click", function () {
        bs.forEach(function (x) { x.classList.toggle("on", x === b); });
        fn(i);
      });
    });
  }
  function segIdx(el) {
    var bs = [].slice.call(el.querySelectorAll("button"));
    return Math.max(0, bs.findIndex(function (b) { return b.classList.contains("on"); }));
  }
  function setRange(r, v, max) {
    if (max !== undefined) r.max = max;
    r.value = v;
    r.dispatchEvent(new Event("input", { bubbles: true }));
    if (window.Euiyun) window.Euiyun.fill(r);
  }

  window.CH11 = { vlmax: vlmax, vsetCalc: vsetCalc, split: split, roundOH: roundOH, seg: seg, segIdx: segIdx,
    setRange: setRange, SEWS: SEWS, LMULS: LMULS, LNAME: LNAME };

  /* ---------- S1: vsetvli calculator ---------- */
  (function () {
    var root = $("sim-vset"); if (!root) return;
    var kinds = ["vsetvli", "vsetivli", "vsetvl"], modes = ["normal", "vlmax", "keep"];
    var kind = 0, mode = 0, r = null;
    var p = Book.bind(root, update);
    var h = Book.canvas($("vs-cv"), draw);
    seg($("vs-kind"), function (i) { kind = i; update(); });
    seg($("vs-mode"), function (i) { mode = i; update(); });

    function update() {
      var sew = SEWS[p.sew], lmul = LMULS[p.lmul];
      $("vs-sew-o").textContent = "e" + sew;
      $("vs-lmul-o").textContent = LNAME[p.lmul];
      r = vsetCalc(kinds[kind], modes[mode], p.avl, sew, lmul);
      $("vs-vlmax").textContent = r.vlmax ? r.vlmax : "0 (불법)";
      $("vs-avl").textContent = r.mode === "normal" ? (kinds[kind] === "vsetivli" ? r.avl + " (uimm 0~31)" : r.avl) : "사용 안 함";
      $("vs-vl").textContent = r.vl;
      var vb = $("vs-vill"); vb.textContent = r.vill ? "1" : "0"; vb.className = "v" + (r.vill ? " bad" : "");
      $("vs-iter").textContent = (r.mode === "normal" && !r.vill && r.avlRaw > 0) ? Math.ceil(r.avlRaw / r.vlmax) : "-";
      var v = $("vs-verdict"), why;
      if (r.vill) why = r.vlmax === 0 ? "SEW > min(LMUL,1)×64 → vill=1, vl=0" : "rd=rs1=x0인데 VLMAX가 4에서 " + r.vlmax + "로 바뀜 → vill";
      else if (r.mode === "keep") why = "vl 유지(이전 vl=3), vtype만 교체";
      else if (r.mode === "vlmax") why = "rs1=x0, rd≠x0 → vl=VLMAX";
      else why = r.avl >= r.vlmax ? "AVL ≥ VLMAX → vl=VLMAX" : "AVL < VLMAX → vl=AVL";
      if (r.flush) why += " · vsetvl: 커밋 때 flushPipe";
      v.textContent = why;
      v.className = "verdict " + (r.vill ? "bad" : r.flush ? "warn" : "ok");
      h.redraw();
    }

    function draw(ctx, w, hh) {
      if (!r) return;
      var sew = SEWS[p.sew], lmul = LMULS[p.lmul], eb = sew / 8;
      var rows = Math.max(1, lmul), cols = 16 / eb;
      var L = 50, T = 14, B = 46, gx = w - L - 12, rh = Math.min(30, (hh - T - B) / rows - 4);
      var cw = gx / cols, cAcc = Book.css("accent"), cAccS = Book.css("accent-soft"), c2 = Book.css("accent-2"),
        c2S = Book.css("accent-2-soft"), cSur = Book.css("surface"), cBor = Book.css("border"), cBad = Book.css("bad");
      for (var row = 0; row < rows; row++) {
        var y = T + row * (rh + 4);
        Book.text(ctx, "v" + (8 + row), L - 8, y + rh / 2, { align: "right", mono: true, size: 12, color: Book.css("text-dim") });
        for (var c = 0; c < cols; c++) {
          var i = row * cols + c, x = L + c * cw;
          var st = r.vill ? "x" : i < r.vl ? "a" : i < r.vlmax ? "t" : "u";
          var fill = st === "a" ? cAccS : st === "t" ? c2S : cSur;
          var stroke = st === "a" ? cAcc : st === "t" ? c2 : st === "x" ? cBad : cBor;
          Book.roundRect(ctx, x + 1, y, cw - 2, rh, 3, fill, stroke);
          if (cw > 18 && rh > 14) Book.text(ctx, String(i), x + cw / 2, y + rh / 2,
            { align: "center", mono: true, size: cw > 26 ? 11 : 9, color: Book.css(st === "u" ? "text-faint" : "text") });
        }
      }
      var ly = hh - B + 16, items = [["활성 (i < vl)", cAccS, cAcc], ["tail (vl ≤ i < VLMAX)", c2S, c2], ["그룹 밖", cSur, cBor]];
      var lx = L;
      items.forEach(function (it) {
        Book.roundRect(ctx, lx, ly - 6, 12, 12, 2, it[1], it[2]);
        Book.text(ctx, it[0], lx + 16, ly, { size: 11, color: Book.css("text-dim") });
        lx += Math.min(150, (w - L) / 3);
      });
      Book.text(ctx, "e" + sew + "·" + LNAME[p.lmul] + "  레지스터당 원소 " + cols + "개" + (r.vill ? "  · vill" : ""),
        L, hh - 10, { size: 11, mono: true, color: Book.css(r.vill ? "bad" : "text-dim") });
    }
    update();
  })();

  /* ---------- PREDICTs ---------- */
  function predict(segId, runId, outId, choices, solve) {
    var sg = $(segId); if (!sg) return;
    seg(sg, function () { var o = $(outId); o.className = "verdict grey"; o.textContent = "아직 확인하지 않음"; });
    $(runId).addEventListener("click", function () {
      var pick = choices[segIdx(sg)], res = solve(), o = $(outId);
      var ok = String(pick) === String(res.ans);
      o.className = "verdict " + (ok ? "ok" : "bad");
      o.textContent = (ok ? "맞았다. " : "아니다. 고른 값 " + pick + ", 실제 " + res.ans + ". ") + res.why;
    });
  }
  predict("pvl-choice", "pvl-run", "pvl-out", [1000, 500, 32, 16], function () {
    var r = vsetCalc("vsetvli", "normal", 1000, 32, 4);
    return { ans: r.vl, why: "VLMAX = 128×4/32 = " + r.vlmax + ". AVL(1000) ≥ VLMAX이므로 vl = VLMAX = " + r.vl +
      ". 루프는 " + Math.ceil(1000 / r.vl) + "번 돈다. 500은 규격이 허용하는 ceil(AVL/2) 규칙과도 맞지 않는다(AVL ≥ 2·VLMAX)." };
  });
  predict("puop-choice", "puop-run", "puop-out", [4, 8, 16, "illegal"], function () {
    var n = split("vwadd", 32, 4);
    return { ans: n || "illegal", why: "dupF2W: 결과가 e64라 목적 그룹이 m8(v16~v23)이 되고 레지스터당 uop 1개 → " + n +
      "개. e32·m4는 SL_Widen(SEW ≤ 32, LMUL ≤ 4) 안이라 합법이다. m8이었다면 16개가 필요해 illegal." };
  });

  /* ---------- S2: decode slots (8) + uop buffer (7) ---------- */
  (function () {
    var root = $("sim-dslot"); if (!root) return;
    var L = "ABCDEFGH";
    var SC = [
      [["vadd e8·m8", "vadd", 8, 8], ["vadd e8·m8", "vadd", 8, 8], ["add", "add", 32, 1]],
      [["vadd e32·m4", "vadd", 32, 4], ["vwadd e32·m4", "vwadd", 32, 4], ["add", "add", 32, 1], ["add", "add", 32, 1]],
      [["vlseg3e32 m1", "vle", 32, 1, 3], ["vadd e32·m2", "vadd", 32, 2], ["vlseg3e32 m1", "vle", 32, 1, 3],
        ["add", "add", 32, 1], ["vadd e32·m1", "vadd", 32, 1]]
    ];
    var frames = [], f = 0, timer = null, mops = [];
    var p = Book.bind(root, function () { go(p.cyc, true); });
    var scrub = $("ds-cyc");

    function build(si) {
      mops = SC[si].map(function (m, i) {
        var n = split(m[1], m[2], m[3], m[4]);
        return { name: m[0], lab: L[i], n: n, r: roundOH(n), scalar: m[1] === "add", idx: i };
      });
      var q = 0, buf = [], out = [{ q: 0, slots: [], buf: [], acc: [], text: "시작: 명령 " + mops.length + "개가 디코드를 기다린다." }];
      var guard = 0;
      while ((q < mops.length || buf.length) && guard++ < 20) {
        var stream = buf.slice(), acc = [], cum = buf.length;
        for (var k = q; k < Math.min(mops.length, q + 8); k++) {   // decode window = 8 mops
          var m = mops[k];
          for (var u = 0; u < m.r; u++) stream.push({ t: u < m.n ? m.lab + u : m.lab + "·", m: m, pad: u >= m.n });
          cum += m.r; acc.push(m);
          if (cum >= 8) break;                                       // ChannelUopSelect: first cumulative >= 8
        }
        q += acc.length;
        var slots = stream.slice(0, 8);
        buf = stream.slice(8);
        out.push({ q: q, slots: slots, buf: buf, acc: acc,
          text: acc.length ? "받음: " + acc.map(function (m) { return m.lab + "(" + m.n + "→" + m.r + "칸)"; }).join(", ") +
            ". 누적 " + cum + (cum >= 8 ? " ≥ 8이라 여기서 멈춘다." : ", 남은 명령이 없다.") +
            (buf.length ? " 넘친 " + buf.length + "칸은 버퍼로." : "") : "새 명령 없음. 버퍼만 내보낸다." });
      }
      return out;
    }
    function cell(s) {
      var cls = s.pad ? "off" : s.m.scalar ? "" : (s.m.idx % 2 ? "on2" : "on");
      return '<div class="c ' + cls + '" title="' + s.m.name + '">' + s.t + "</div>";
    }
    function grid(list, n) {
      var h = "";
      for (var i = 0; i < n; i++) h += list[i] ? cell(list[i]) : '<div class="c off"></div>';
      return '<div class="cells" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + h + "</div>";
    }
    function render() {
      var fr = frames[f];
      var wait = mops.slice(fr.q).map(function (m) { return m.lab + ": " + m.name + " (" + m.n + " uop)"; });
      $("ds-view").innerHTML =
        '<div class="rowlbl">대기 중인 명령</div><div class="mini" style="margin:0">' + (wait.join(" · ") || "없음") + "</div>" +
        '<div class="rowlbl">rename 슬롯 8칸 (이번 사이클 출력)</div>' + grid(fr.slots, 8) +
        '<div class="rowlbl">uop 버퍼 7칸 (다음 사이클로)</div>' + grid(fr.buf, 7) +
        '<p class="mini">' + fr.text + " 빗금 칸 = 1·2·4·8 반올림으로 생긴 자리(추론).</p>";
      $("ds-c").textContent = f + " / " + (frames.length - 1);
      $("ds-acc").textContent = fr.acc.length ? fr.acc.map(function (m) { return m.lab; }).join(",") : "-";
      var real = fr.slots.filter(function (s) { return !s.pad; }).length;
      $("ds-out").textContent = f ? real + (fr.slots.length > real ? " (+빈칸 " + (fr.slots.length - real) + ")" : "") : "-";
      $("ds-buf").textContent = f ? fr.buf.length : "-";
    }
    function go(n, fromScrub) {
      f = Math.max(0, Math.min(frames.length - 1, n | 0));
      if (!fromScrub) setRange(scrub, f);
      render();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $("ds-play").textContent = "재생"; }
    function load(si) { stop(); frames = build(si); setRange(scrub, 0, frames.length - 1); go(0); }
    seg($("ds-scn"), load);
    $("ds-step").addEventListener("click", function () { stop(); go(f + 1); });
    $("ds-reset").addEventListener("click", function () { stop(); go(0); });
    $("ds-play").addEventListener("click", function () {
      if (timer) return stop();
      if (f >= frames.length - 1) go(0);
      $("ds-play").textContent = "정지";
      go(f + 1);
      timer = setInterval(function () { if (f >= frames.length - 1) return stop(); go(f + 1); }, 900);
    });
    load(0);
  })();
})();

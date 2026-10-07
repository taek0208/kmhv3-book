/* Chapter 11 (vector), part b: speculative vtype stepper, tail/mask merge grid, vector memory canvas.
   Needs window.CH11 from ch11.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var C = window.CH11;

  /* ---------- S5: speculative vtype stepper ---------- */
  (function () {
    var root = $("sim-vtype"); if (!root) return;
    var A = "e32·m1", B = "e8·m4", X = "e16·m2", R = "vill(리셋)";
    var I1t = A + " (spec " + R + ")", I3t = B + " (spec " + A + ")"; // vset: vtype = new, specvtype = previous (VTypeGen.scala:66,115-117)
    var nA = C.split("vadd", 32, 1), nB = C.split("vadd", 8, 4), nX = C.split("vadd", 16, 2);
    /* each step: [text, spec, arch, bufCount, vaddUops, rows]; rows = [inst, vtype tag, where] */
    var SC = [
      [
        ["IBuffer에 명령 4개가 들어왔다. 리셋 직후라 vtypeSpec과 vtypeArch는 모두 vill이다.", R, R, 0, "-",
          [["I1 vsetvli t0,a0,e32,m1", "-", "IBuffer"], ["I2 beq (안 뜀 예측)", "-", "IBuffer"], ["I3 vsetvli t0,a0,e8,m4", "-", "IBuffer"], ["I4 vadd.vv", "-", "IBuffer"]]],
        ["VTypeGen: vsetvli 자신은 vtype 필드에 새 vtype을, specvtype에 직전 vtype을 단다. 다른 명령은 Mux 사슬로 앞선 가장 가까운 vsetvli의 새 vtype을 받는다. vadd는 I3의 " + B + ". 그룹 끝 vtype이 vtypeSpec이 된다.", B, R, 0, nB,
          [["I1", I1t, "디코드"], ["I2", A, "디코드"], ["I3", I3t, "디코드"], ["I4 vadd", B, "디코드"]]],
        ["디코드: vadd를 " + B + "로 쪼개 uop " + nB + "개. Rename: vl을 쓰는 I1, I3만 VTypeBuffer에 들어간다(VlWen).", B, R, 2, nB,
          [["I1", I1t, "ROB"], ["I2", A, "ROB"], ["I3", I3t, "ROB"], ["I4 vadd", B, "ROB"]]],
        ["I1 커밋: VTypeBuffer가 " + A + "를 내보내고 vtypeArch가 바뀐다.", B, A, 1, nB,
          [["I1", I1t, "커밋"], ["I2", A, "커밋 (예측 맞음)"], ["I3", I3t, "ROB"], ["I4 vadd", B, "ROB"]]],
        ["I3 커밋: vtypeArch ← " + B + ".", B, B, 0, nB,
          [["I1", I1t, "커밋"], ["I2", A, "커밋"], ["I3", I3t, "커밋"], ["I4 vadd", B, "ROB"]]],
        ["vadd uop " + nB + "개 커밋. 추측이 맞았으므로 복구할 일이 없다.", B, B, 0, nB,
          [["I1", I1t, "커밋"], ["I2", A, "커밋"], ["I3", I3t, "커밋"], ["I4 vadd", B, "커밋"]]]
      ],
      [
        ["같은 명령열. 이번에는 I2 beq가 실제로는 뛰어서 I3를 건너뛰어야 한다.", R, R, 0, "-",
          [["I1 vsetvli t0,a0,e32,m1", "-", "IBuffer"], ["I2 beq (안 뜀 예측, 실제 뜀)", "-", "IBuffer"], ["I3 vsetvli t0,a0,e8,m4", "-", "IBuffer"], ["I4 vadd.vv", "-", "IBuffer"]]],
        ["VTypeGen은 예측된 경로대로 vadd에 " + B + "를 붙인다. vtypeSpec ← " + B + ".", B, R, 0, nB,
          [["I1", I1t, "디코드"], ["I2", A, "디코드"], ["I3 (잘못된 경로)", I3t, "디코드"], ["I4 vadd", B, "디코드"]]],
        ["디코드·Rename: vadd uop " + nB + "개, VTypeBuffer 2칸(I1, I3).", B, R, 2, nB,
          [["I1", I1t, "ROB"], ["I2", A, "ROB"], ["I3 (잘못된 경로)", I3t, "ROB"], ["I4 vadd", B, "ROB"]]],
        ["I2 실행: 오예측 redirect. I3와 vadd를 버린다. VTypeBuffer가 walk 상태로 가서 redirect 지점 앞의 마지막 vtype(I1의 " + A + ")을 돌려준다. walk 중에는 canEnq=0이라 새 uop이 ROB에 못 들어간다.", A, R, 1, "-",
          [["I1", I1t, "ROB"], ["I2", A, "ROB"], ["I3", "-", "버림"], ["I4 vadd", "-", "버림"]]],
        ["올바른 경로의 vadd를 다시 가져온다. VTypeGen이 vtypeSpec=" + A + "를 붙여 uop " + nA + "개로 쪼갠다.", A, R, 1, nA,
          [["I1", I1t, "ROB"], ["I2", A, "ROB"], ["I3", "-", "버림"], ["vadd (올바른 경로)", A, "디코드"]]],
        ["I1, I2, vadd 커밋. vtypeArch ← " + A + ".", A, A, 0, nA,
          [["I1", I1t, "커밋"], ["I2", A, "커밋"], ["I3", "-", "버림"], ["vadd (올바른 경로)", A, "커밋"]]]
      ],
      [
        ["I2는 vsetvl이다. vtype이 레지스터 a1(= " + X + ")에 있어 실행 전에는 모른다.", R, R, 0, "-",
          [["I1 vsetvli t0,a0,e32,m1", "-", "IBuffer"], ["I2 vsetvl t0,a0,a1", "-", "IBuffer"], ["I3 vadd.vv", "-", "IBuffer"]]],
        ["VTypeGen은 vsetvl을 처리하지 않는다(valid=false). vadd는 I1의 " + A + "를 받는다. 이 추측은 틀렸다.", A, R, 0, nA,
          [["I1", I1t, "디코드"], ["I2 vsetvl", A, "디코드"], ["I3 vadd", A, "디코드"]]],
        ["VsetDecoder가 I2에 flushPipe를 켠다. vadd는 " + A + "로 uop " + nA + "개. VTypeBuffer 2칸(I1, I2).", A, R, 2, nA,
          [["I1", I1t, "ROB"], ["I2 vsetvl (flushPipe)", A, "ROB"], ["I3 vadd", A, "ROB"]]],
        ["I1 커밋: vtypeArch ← " + A + ".", A, A, 1, nA,
          [["I1", I1t, "커밋"], ["I2 vsetvl (flushPipe)", A, "ROB"], ["I3 vadd", A, "ROB"]]],
        ["I2 실행(ALU3의 VSetUnit)이 " + X + "를 계산하고 커밋된다. flushPipe로 vadd를 버리고, hasVsetvl이 vtypeSpec과 vtypeArch를 " + X + "로 덮어쓴다.", X, X, 0, "-",
          [["I1", I1t, "커밋"], ["I2 vsetvl", A, "커밋 + flush"], ["I3 vadd", "-", "버림"]]],
        ["vadd를 다시 가져와 " + X + "로 쪼갠다: uop " + nX + "개.", X, X, 0, nX,
          [["I1", I1t, "커밋"], ["I2 vsetvl", A, "커밋"], ["I3 vadd (재fetch)", X, "디코드"]]]
      ]
    ];
    var si = 0, k = 0, timer = null, scrub = $("vt-stp");
    var p = Book.bind(root, function () { go(p.stp, true); });
    function render() {
      var s = SC[si][k];
      var rows = s[5].map(function (r) {
        var bad = r[2] === "버림", cls = bad ? "bad" : /커밋/.test(r[2]) ? "on" : "";
        return "<tr><td><code>" + r[0] + "</code></td><td>" + r[1] + '</td><td><span class="cells"><span class="c ' + cls + '">' + r[2] + "</span></span></td></tr>";
      }).join("");
      $("vt-view").innerHTML = '<p class="mini" style="margin:0 0 8px">' + s[0] + "</p>" +
        '<div class="table-wrap"><table class="data"><tr><th>명령</th><th>vtype 태그 (vset은 새 값, 괄호는 specvtype)</th><th>위치</th></tr>' + rows + "</table></div>";
      $("vt-spec").textContent = s[1];
      $("vt-arch").textContent = s[2];
      $("vt-buf").textContent = s[3] + " / 64";
      $("vt-uop").textContent = s[4];
    }
    function go(n, fromScrub) {
      k = Math.max(0, Math.min(SC[si].length - 1, n | 0));
      if (!fromScrub) C.setRange(scrub, k);
      render();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $("vt-play").textContent = "재생"; }
    C.seg($("vt-scn"), function (i) { stop(); si = i; go(0); });
    $("vt-next").addEventListener("click", function () { stop(); go(k + 1); });
    $("vt-reset").addEventListener("click", function () { stop(); go(0); });
    $("vt-play").addEventListener("click", function () {
      if (timer) return stop();
      if (k >= SC[si].length - 1) go(0);
      $("vt-play").textContent = "정지";
      go(k + 1);
      timer = setInterval(function () { if (k >= SC[si].length - 1) return stop(); go(k + 1); }, 1400);
    });
    go(0);
  })();

  /* ---------- S4: MergeUnit tail/mask grid (Exu.scala:137-166,223-235) ---------- */
  (function () {
    var root = $("sim-merge"); if (!root) return;
    var p = Book.bind(root, update), vlR = $("mg-vl");
    [$("mg-sew"), $("mg-mask"), $("mg-vta")].forEach(function (s) { C.seg(s, function () { update(); }); });
    function update() {
      var sew = C.SEWS[C.segIdx($("mg-sew"))], eb = sew / 8, L = [1, 2, 4, 8][p.lm];
      var mask = C.segIdx($("mg-mask")), agn = C.segIdx($("mg-vta")) === 1;
      var vmax = 16 * L / eb;
      $("mg-lmul-o").textContent = "m" + L;
      if (+vlR.max !== vmax || p.vl > vmax) { C.setRange(vlR, Math.min(p.vl, vmax), vmax); return; }
      var vl = p.vl, bytes = vl * eb, idx = Math.floor(bytes / 16), end = bytes % 16, per = 16 / eb;
      var act = 0, off = 0, tail = 0, html = "";
      for (var u = 0; u < L; u++) {
        var endU = u < idx ? 16 : u === idx ? end : 0, cells = "";
        for (var e = 0; e < per; e++) {
          var i = u * per + e, body = e * eb < endU;
          var en = mask === 0 ? true : mask === 1 ? i % 3 !== 2 : false; // vm=0 & v0 data forced to 0 (IssuePipe.scala:197)
          var cls, t;
          if (!body) { tail++; cls = "off"; t = agn ? "*" : "옛"; }
          else if (!en) { off++; cls = "warn"; t = agn ? "*" : "옛"; }
          else { act++; cls = "on"; t = String(i); }
          cells += '<div class="c ' + cls + '">' + t + "</div>";
        }
        html += '<div class="rowlbl">uop' + u + " → v" + (8 + u) + " · end=" + endU + "B</div>" +
          '<div class="cells" style="grid-template-columns:repeat(' + per + ',minmax(0,1fr))">' + cells + "</div>";
      }
      html += '<p class="mini">숫자 = 새 값을 쓰는 원소, 주황 = 마스크로 꺼짐, 점선 = tail. "옛" = 옛 vd 값을 유지(undisturbed), "*" = 규격상 옛 값 또는 전부 1 중 구현 선택(agnostic).</p>';
      $("mg-view").innerHTML = html;
      $("mg-idx").textContent = idx;
      $("mg-end").textContent = end;
      $("mg-act").textContent = act;
      $("mg-off").textContent = off + (mask === 2 ? " (추론)" : "");
      $("mg-tail").textContent = tail;
    }
    update();
  })();

  /* ---------- S3: vector memory accesses (unit-stride KMHv3 vs strided 일반 모델) ---------- */
  (function () {
    var root = $("sim-mem"); if (!root) return;
    var p = Book.bind(root, update), st = null;
    var h = Book.canvas($("mm-cv"), draw);
    [$("mm-mode"), $("mm-eew")].forEach(function (s) { C.seg(s, function () { update(); }); });
    function hex(a) { return "0x" + a.toString(16); }
    function update() {
      var strided = C.segIdx($("mm-mode")) === 1, eb = C.SEWS[C.segIdx($("mm-eew"))] / 8, L = [1, 2, 4, 8][p.lm];
      var base = 0x1000 + p.off, vl = 16 * L / eb, acc = [], splits = 0;
      $("mm-lmul-o").textContent = "m" + L;
      if (!strided) {
        for (var u = 0; u < L; u++) {                      // uop u: vaddr = base + 16*u (imm = VLENB*i)
          var a = base + 16 * u, nb = Math.ceil((a + 1) / 16) * 16;
          if (a % 16) { splits++; acc.push({ a: a, n: nb - a, u: u, part: "head" }, { a: nb, n: a + 16 - nb, u: u, part: "tail" }); }
          else acc.push({ a: a, n: 16, u: u, part: "" });
        }
      } else {
        for (var j = 0; j < vl; j++) acc.push({ a: base + j * p.str, n: eb, u: j, part: "" });
      }
      var lines = {};
      acc.forEach(function (x) { for (var b = x.a; b < x.a + x.n; b++) lines[Math.floor(b / 64)] = 1; });
      var ls = Object.keys(lines).map(Number).sort(function (x, y) { return x - y; });
      st = { acc: acc, lines: ls, strided: strided, L: L };
      $("mm-uop").textContent = L;
      $("mm-acc").textContent = acc.length;
      $("mm-split").textContent = strided ? "-" : splits + "개 uop";
      $("mm-line").textContent = ls.length;
      var v = $("mm-verdict");
      if (strided) { v.className = "verdict grey"; v.textContent = "일반 모델: 원소 " + vl + "개를 따로 접근. KMHv3 @09453ff8에는 이 실행 경로가 확인되지 않는다."; }
      else if (splits) { v.className = "verdict warn"; v.textContent = "base가 16B 정렬이 아니라 uop마다 head+tail 두 번: " + acc.length + "번 접근."; }
      else { v.className = "verdict ok"; v.textContent = "16B 정렬: uop " + L + "개 = 접근 " + acc.length + "번."; }
      h.redraw();
    }
    function draw(ctx, w, hh) {
      if (!st) return;
      var Lx = 58, T = 22, gx = w - Lx - 10, show = st.lines.slice(0, 12);
      var rh = Math.min(34, (hh - T - 30) / Math.max(1, show.length) - 6), bw = gx / 64;
      var cA = Book.css("accent"), cAS = Book.css("accent-soft"), c2 = Book.css("accent-2"), c2S = Book.css("accent-2-soft"),
        cSur = Book.css("surface"), cBor = Book.css("border"), dim = Book.css("text-dim");
      Book.text(ctx, "64B 캐시라인 한 줄 = 16B 뱅크 4개", Lx, 10, { size: 11, color: dim });
      show.forEach(function (ln, r) {
        var y = T + r * (rh + 6);
        Book.text(ctx, hex(ln * 64), Lx - 6, y + rh / 2, { align: "right", mono: true, size: 10, color: dim });
        Book.roundRect(ctx, Lx, y, gx, rh, 3, cSur, cBor);
        st.acc.forEach(function (x) {
          var s = Math.max(x.a, ln * 64), e = Math.min(x.a + x.n, ln * 64 + 64);
          if (e <= s) return;
          var odd = x.u % 2;
          Book.roundRect(ctx, Lx + (s - ln * 64) * bw + 0.5, y + 2, (e - s) * bw - 1, rh - 4, 2, odd ? c2S : cAS, odd ? c2 : cA);
          if (!st.strided && (e - s) * bw > 22) Book.text(ctx, "u" + x.u + (x.part ? x.part[0] : ""), Lx + ((s + e) / 2 - ln * 64) * bw, y + rh / 2,
            { align: "center", mono: true, size: 10, color: Book.css("text") });
        });
        ctx.save(); ctx.strokeStyle = dim; ctx.setLineDash([3, 3]);
        for (var b = 1; b < 4; b++) { ctx.beginPath(); ctx.moveTo(Lx + b * 16 * bw, y - 2); ctx.lineTo(Lx + b * 16 * bw, y + rh + 2); ctx.stroke(); }
        ctx.restore();
      });
      var more = st.lines.length - show.length;
      Book.text(ctx, (st.strided ? "strided: 일반 모델" : "unit-stride: uX h/t = head/tail") + (more > 0 ? "  · 라인 " + more + "개 더" : ""),
        Lx, hh - 10, { size: 11, color: Book.css(st.strided ? "text-faint" : "text-dim") });
    }
    update();
  })();
})();

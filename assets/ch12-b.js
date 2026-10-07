/* ch12-b.js: TopDown slot stepper (#sim-slots), ldReason PREDICT (#sim-ld), CPI stack calculator (#sim-cpi),
   first-week checklist (#wk). Priority order: Dispatch.scala:1254-1260; ldReason: Rob.scala:1551-1559;
   coarse map: scripts/top-down/configs.py:175-273 @09453ff8. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var W = 8; /* RenameWidth, Parameters.scala:82 */

  /* coarse category of each reason used below (configs.py xs_coarse_rename_map) */
  var CAT = {
    NoStall: "Base", ICacheMissBubble: "Frontend", FetchFragBubble: "Frontend", TAGEMissBubble: "BadSpec",
    LoadL3Stall: "Load", LoadL2Stall: "Load", LoadL1Stall: "Load", LoadMemStall: "Load", LoadTLBStall: "Load",
    MemNotReadyStall: "Load", LoadMSHRReplayStall: "Load", LqStall: "Load", LoadVioReplayStall: "BadSpec",
    IntIQFullStallAlu: "Core", IntFlStall: "FreelistStall", BackendOtherCoreStall: "CoreOther", SpecialInsts: "Privileged"
  };
  var KCLS = { Base: "k-base", Frontend: "k-fe", BadSpec: "k-bs", Core: "k-core", Load: "k-ld", Store: "k-st" };
  function kcls(r) { return KCLS[CAT[r]] || "k-oth"; }

  /* ---------------- TopDown slot stepper ---------------- */
  (function () {
    var root = $("sim-slots");
    if (!root) return;
    /* Synthetic per-cycle inputs. fire = number of slots dispatched (from slot 0);
       pre = rename stalled with a reason (prePipeStall); cur = dispatch's own stall/bubble reason;
       bub = rename bubble reason for empty slots; saved = dispatchBubbleValidReg reason. */
    var CY = [
      { fire: 8, note: "8칸 모두 dispatch: 전부 NoStall" },
      { fire: 0, bub: "ICacheMissBubble", note: "프런트엔드가 ICache 미스로 아무것도 보내지 못했다 (④줄)" },
      { fire: 5, bub: "FetchFragBubble", note: "fetch 블록이 5개만 채워져 뒤 3칸이 빈다 (④줄)" },
      { fire: 0, bub: "TAGEMissBubble", note: "분기 오예측 리다이렉트 직후의 버블 (④줄)" },
      { fire: 0, pre: "LoadL3Stall", note: "ROB 머리 load가 L3를 기다려 rename이 그 사유로 멈춤 (②줄)" },
      { fire: 0, pre: "LoadL3Stall", note: "같은 load를 계속 기다린다 (②줄)" },
      { fire: 2, cur: "IntIQFullStallAlu", note: "2개 보낸 뒤 ALU 이슈 큐가 가득 참 (③줄)" },
      { fire: 0, pre: "IntFlStall", cur: "IntIQFullStallAlu", note: "rename(IntFlStall)과 dispatch(IQ 가득)가 동시에 막힘: ②줄이 이긴다" },
      { fire: 6, note: "2칸이 비었지만 어느 조건에도 걸리지 않음: 기본값 BackendOtherCoreStall" },
      { fire: 4, saved: "SpecialInsts", note: "특수 명령어 뒤에 저장된 버블 사유 (⑤줄)" },
      { fire: 8, note: "8칸 모두 dispatch" },
      { fire: 4, cur: "LqStall", note: "load queue가 가득 차 dispatch가 멈춤 (③줄)" }
    ];
    /* Dispatch.scala:1254-1260 MuxCase, in priority order */
    function reason(c, i) {
      if (i < c.fire) return "NoStall";
      if (c.pre) return c.pre;
      if (c.cur) return c.cur;
      if (c.bub) return c.bub;
      if (c.saved) return c.saved;
      return "BackendOtherCoreStall";
    }
    var N = CY.length, t = 0, timer = null;
    var P = Book.bind(root, function () { t = Math.round(P.t); stop(); render(); });
    var range = root.querySelector('input[data-k="t"]');
    var out = root.querySelector('output[data-for="t"]');

    var grid = $("sl-grid");
    var html = "<b>slot</b>";
    for (var i = 0; i < W; i++) html += "<b>" + i + "</b>";
    for (var c = 0; c < N; c++) {
      html += '<b id="sl-r' + c + '">cyc ' + (c + 1) + "</b>";
      for (var j = 0; j < W; j++) html += '<i id="sl-c' + c + "-" + j + '">&nbsp;</i>';
    }
    grid.innerHTML = html;
    var ORDER = ["Base", "Frontend", "BadSpec", "Core", "Load", "Store", "기타"];
    var COLV = { Base: "ok", Frontend: "code", BadSpec: "bad", Core: "accent", Load: "warn", Store: "accent-2", "기타": "grey" };
    $("sl-legend").innerHTML = ORDER.map(function (k) { return '<span><i style="--c:var(--' + COLV[k] + ')"></i>' + k + "</span>"; }).join("");

    function setT(v) {
      t = Math.max(0, Math.min(N, v));
      range.value = t; out.textContent = t;
      if (window.Euiyun) Euiyun.fill(range);
    }
    function render() {
      var cnt = {}, byCat = {}, sum = 0;
      for (var c = 0; c < N; c++) {
        $("sl-r" + c).classList.toggle("cur", c === t - 1);
        for (var j = 0; j < W; j++) {
          var cell = $("sl-c" + c + "-" + j);
          if (c < t) {
            var r = reason(CY[c], j);
            cell.className = kcls(r);
            cell.textContent = r === "NoStall" ? "·" : r.replace(/Stall|Bubble/, "");
            cell.title = r;
            cnt[r] = (cnt[r] || 0) + 1;
            var k = CAT[r] && KCLS[CAT[r]] ? CAT[r] : "기타";
            byCat[k] = (byCat[k] || 0) + 1;
            sum++;
          } else { cell.className = ""; cell.textContent = " "; cell.title = ""; }
        }
      }
      $("sl-bar").innerHTML = sum ? ORDER.filter(function (k) { return byCat[k]; }).map(function (k) {
        return '<span title="' + k + " " + byCat[k] + '" style="width:' + (100 * byCat[k] / sum) + "%;background:var(--" + COLV[k] + ')"></span>';
      }).join("") : "";
      var top = "-", topN = 0;
      Object.keys(cnt).forEach(function (r) { if (r !== "NoStall" && cnt[r] > topN) { top = r; topN = cnt[r]; } });
      $("sl-cyc").textContent = t;
      $("sl-sum").textContent = sum + " = " + t + " × 8";
      $("sl-base").textContent = cnt.NoStall || 0;
      $("sl-top").textContent = topN ? top + " (" + topN + ")" : "-";
      var v = $("sl-verdict");
      if (!t) { v.className = "verdict grey"; v.textContent = "재생하면 사이클마다 8칸에 사유가 하나씩 붙는다"; return; }
      v.className = "verdict " + (t === N ? "ok" : "grey");
      v.textContent = "사이클 " + t + ": " + CY[t - 1].note + (t === N ? ". 끝: 합 " + sum + " = " + N + " × 8, 사이클당 dispatch " + ((cnt.NoStall || 0) / N).toFixed(2) + "개" : "");
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $("sl-play").textContent = "재생"; }
    $("sl-play").addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (t >= N) { setT(0); render(); }
      $("sl-play").textContent = "멈춤";
      timer = setInterval(function () { setT(t + 1); render(); if (t >= N) stop(); }, 650);
    });
    $("sl-step").addEventListener("click", function () { stop(); setT(t + 1); render(); });
    $("sl-reset").addEventListener("click", function () { stop(); setT(0); render(); });
    setT(0);
    render();
  })();

  /* ---------------- PREDICT: ldReason ---------------- */
  (function () {
    var root = $("sim-ld");
    if (!root) return;
    var pick = "LoadL2Stall";
    var F = Book.bind($("ld-flags"), function () { $("ld-verdict").className = "verdict grey"; $("ld-verdict").textContent = "조건이 바뀌었다. 다시 실행하세요"; });
    root.querySelectorAll("#ld-pick button").forEach(function (b) {
      b.addEventListener("click", function () {
        pick = b.textContent;
        root.querySelectorAll("#ld-pick button").forEach(function (x) { x.classList.toggle("on", x === b); });
      });
    });
    /* Rob.scala:1551-1559 */
    function ld(f) {
      return f.l3 ? "LoadMemStall" : f.l2 ? "LoadL3Stall" : f.l1 ? "LoadL2Stall" : f.ni ? "MemNotReadyStall" :
        f.tlb ? "LoadTLBStall" : f.tlbr ? "LoadTLBStall" : f.mshr ? "LoadMSHRReplayStall" : f.vio ? "LoadVioReplayStall" : "LoadL1Stall";
    }
    $("ld-run").addEventListener("click", function () {
      var r = ld(F), v = $("ld-verdict");
      $("ld-out").textContent = r;
      $("ld-cat").textContent = "Merge" + CAT[r];
      var base = F.l1 && F.l2 && !F.l3;
      if (base) {
        var ok = pick === r;
        v.className = "verdict " + (ok ? "ok" : "bad");
        v.textContent = (ok ? "맞음: " : "틀림: 예측 " + pick + ", 실제 " + r + ". ") +
          "L2에서 미스한 load는 L3의 응답을 기다리므로 이름은 LoadL3Stall이다. 이름은 미스가 난 곳이 아니라 기다리는 곳이다 (P2)";
      } else {
        v.className = "verdict warn";
        v.textContent = "조건을 바꿔 본 결과: " + r + ". 사슬의 위쪽 조건이 참이면 아래는 보지 않는다" + (r === "LoadVioReplayStall" ? ". 이 사유는 configs.py에서 BadSpec으로 묶인다" : "");
      }
    });
  })();

  /* ---------------- CPI stack calculator ---------------- */
  (function () {
    var root = $("sim-cpi");
    if (!root) return;
    var C = 1e6; /* synthetic cycle count */
    var P = Book.bind(root, function () { calc(); h.redraw(); });
    var R = null;
    var ROWS = [["Base", "ok"], ["BadSpecInst", "bad"], ["Frontend", "code"], ["BadSpec", "bad"], ["Core", "accent"], ["Load", "warn"], ["Store", "accent-2"]];
    function calc() {
      var I = P.ipc * C, slots = W * C;
      var noStall = I / (1 - P.wp);            /* dispatched uops incl. wrong path */
      var bsi = noStall - I;                    /* draw.py:205-209 overwrites Base with icount = 20M and moves the excess to BadSpecInst; here I plays icount */
      var loss = slots - noStall;
      var w = { Frontend: P.fe, BadSpec: P.bs, Core: P.co, Load: P.ld, Store: P.st };
      var ws = P.fe + P.bs + P.co + P.ld + P.st;
      var s = { Base: I, BadSpecInst: bsi };
      Object.keys(w).forEach(function (k) { s[k] = loss > 0 ? (ws ? loss * w[k] / ws : (k === "Core" ? loss : 0)) : 0; });
      var cpi = {};
      Object.keys(s).forEach(function (k) { cpi[k] = s[k] / (I * W); });
      R = { I: I, loss: loss, cpi: cpi, total: C / I };
      $("cpi-total").textContent = R.total.toFixed(3);
      $("cpi-base").textContent = cpi.Base.toFixed(3);
      $("cpi-bsi").textContent = cpi.BadSpecInst.toFixed(3);
      var top = "-", tv = 0;
      ["Frontend", "BadSpec", "Core", "Load", "Store", "BadSpecInst"].forEach(function (k) { if (cpi[k] > tv) { tv = cpi[k]; top = k; } });
      $("cpi-top").textContent = loss < 0 ? "-" : top + " " + tv.toFixed(3);
      var v = $("cpi-verdict");
      if (loss < 0) {
        v.className = "verdict bad";
        v.textContent = "불가능: dispatch된 uop " + Math.round(noStall).toLocaleString() + "개가 슬롯 " + slots.toLocaleString() + "개(사이클 × 8)를 넘는다";
      } else {
        v.className = "verdict ok";
        v.textContent = "CPI " + R.total.toFixed(3) + " = Base 0.125 + 손실 " + (R.total - 0.125).toFixed(3) + ". 막대 합이 C/I와 같다";
      }
    }
    var h = Book.canvas($("cpi-cv"), function (ctx, w, hh) {
      if (!R) return;
      var vals = ROWS.map(function (r) { return Math.max(0, R.cpi[r[0]]); });
      var xmax = Math.max(0.5, Math.ceil(Math.max(R.total, 0.25) * 4) / 4);
      var f = Book.frame(ctx, w, hh, { x: [0, xmax], y: [0, ROWS.length + 1], pad: { l: 92, b: 30 }, yticks: ROWS.length + 1,
        yfmt: function () { return ""; }, xfmt: function (v) { return v.toFixed(2); }, xlabel: "CPI 몫" });
      var rowH = (f.box.y1 - f.box.y0) / (ROWS.length + 1);
      /* top row: stacked total */
      var x = 0;
      ROWS.forEach(function (r, i) {
        var x0 = f.x(x), x1 = f.x(Math.min(xmax, x + vals[i]));
        ctx.fillStyle = Book.css(r[1]);
        ctx.fillRect(x0, f.box.y0 + 4, Math.max(0, x1 - x0), rowH - 8);
        x += vals[i];
      });
      Book.text(ctx, "합계", f.box.x0 - 8, f.box.y0 + rowH / 2, { align: "right", size: 12, weight: 700 });
      ROWS.forEach(function (r, i) {
        var y = f.box.y0 + rowH * (i + 1);
        Book.text(ctx, r[0], f.box.x0 - 8, y + rowH / 2, { align: "right", size: 11.5, mono: true, color: Book.css("text-dim") });
        var x1 = f.x(Math.min(xmax, vals[i]));
        ctx.fillStyle = Book.alpha(Book.css(r[1]), 0.85);
        ctx.fillRect(f.box.x0 + 1, y + 4, Math.max(0, x1 - f.box.x0 - 1), rowH - 8);
        Book.text(ctx, vals[i].toFixed(3), Math.min(x1 + 6, f.box.x1 - 40), y + rowH / 2, { size: 11, mono: true });
      });
    });
    calc();
    h.redraw();
  })();

  /* ---------------- first-week checklist ---------------- */
  (function () {
    if (!$("wk")) return;
    var STEPS = [
      ["1. 환경 변수 세 개", "export NOOP_HOME=$(pwd)\nexport NEMU_HOME=/abs/path/to/NEMU\nexport AM_HOME=/abs/path/to/nexus-am",
       "README.md:119-121은 세 경로 모두 절대 경로로 두라고 한다. NOOP_HOME은 xiangshan.py가 build/emu를 찾는 기준이다(scripts/xiangshan.py:305)."],
      ["2. 서브모듈 받기", "make init", "Makefile:368-371. 서브모듈이 비어 있으면 실제 빌드는 sim-verilog 단계의 mill 정교화에서 먼저 실패한다(utility 등이 없음, 추론). 'No rule to make target emu-mk'는 make -n이나 difftest만 빠진 경우에 보인다(Makefile:398)."],
      ["3. 가장 작은 RTL 만들어 보기", "make sim-verilog CONFIG=MinimalConfig", "정교화와 firtool이 도는지 먼저 확인한다. 결과는 build/rtl/SimTop.sv와 build/time.log(Makefile:333-354)."],
      ["4. 시뮬레이터 빌드", "make emu CONFIG=MinimalConfig EMU_THREADS=2 -j10", "README.md:135의 예시 그대로다. Verilator가 필요하다(README.md:127)."],
      ["5. coremark를 DiffTest와 함께", "./build/emu -b 0 -e 0 -i ./ready-to-run/coremark-2-iteration.bin \\\n  --diff ./ready-to-run/riscv64-nemu-interpreter-so",
       "README.md:136. 끝에 GOOD TRAP과 IPC가 찍히는지 본다(출력 형식은 difftest 쪽, 추론)."],
      ["6. CI와 같은 방식으로", "python3 scripts/xiangshan.py --build --emulator verilator --threads 8 --llc OpenLLC \\\n  --pgo <coremark.bin> --llvm-profdata llvm-profdata --trace-fst",
       ".github/workflows/emu-basics.yml:57-60. 이후 회귀 테스트도 이 래퍼로 돌린다."],
      ["7. 한 명령어씩 들여다보기", "make pdb\nmake pdb-run", "README.md:149-150, scripts/Makefile.pdb:38-65. picker가 필요하다. xwatch_commit_pc로 원하는 PC에서 멈춘다(README.md:163)."],
      ["8. 파이프라인 기록 켜기", "make emu WITH_CHISELDB=1 ...\n./build/emu ... --dump-db\npython3 scripts/perfcct.py <db> -v", "Makefile:221-223, scripts/xiangshan.py:301, 865 (--dump-db), scripts/perfcct.py:61-68. 명령어별 단계 시각을 본다."]
    ];
    var i = 0;
    function render() {
      $("wk-title").textContent = STEPS[i][0] + "  (" + (i + 1) + " / " + STEPS.length + ")";
      $("wk-cmd").textContent = STEPS[i][1];
      $("wk-why").textContent = STEPS[i][2];
      $("wk-prev").disabled = i === 0;
      $("wk-next").disabled = i === STEPS.length - 1;
    }
    $("wk-prev").addEventListener("click", function () { if (i > 0) i--; render(); });
    $("wk-next").addEventListener("click", function () { if (i < STEPS.length - 1) i++; render(); });
    render();
  })();
})();

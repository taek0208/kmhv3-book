/* ch12-a.js: build flow explorer (#sim-build) and DiffTest mismatch finder (#sim-diff).
   Command assembly mirrors Makefile:114-120, 197-284, 321-356, 398-405 @09453ff8. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------------- build flow explorer ---------------- */
  (function () {
    var root = $("sim-build");
    if (!root) return;
    var goal = "verilog";
    var cur = 0;
    var P = Book.bind(root, render);

    var FIRTOOL_OPT = '--firtool-opt "-O=release --disable-annotation-unknown --lowering-options=explicitBitcast,disallowLocalVariables,disallowPortDeclSharing,locationInfoStyle=none"';
    function isSim(g) { return g !== "verilog"; }
    function target(g) { return (g === "sim-chirrtl" || g === "gsim") ? "chirrtl" : "systemverilog"; }

    /* Makefile:114-120 MFC_ARGS, :162 COMMON_EXTRA_ARGS, :260-270 RELEASE/DEBUG/SIM_ARGS, :279-284 TOPMAIN_ARGS */
    function args(g) {
      var t = target(g);
      var mfc = "--target " + t + " " + FIRTOOL_OPT + (t === "systemverilog" ? " --split-verilog --dump-fir" : "");
      var common = mfc + " --llc OpenLLC";
      var rel = common + ' --fpga-platform --reset-gen --firtool-opt --ignore-read-enable-mem --firtool-opt "--default-layer-specialization=disable"';
      var dbg = common + (P.fpga ? ' --fpga-platform --firtool-opt "--default-layer-specialization=disable"'
                                 : ' --enable-difftest --firtool-opt "--default-layer-specialization=enable"');
      if (!isSim(g)) return { a: P.fpga ? dbg : rel, mode: P.fpga ? "debug" : "release" };
      var pre = (P.chiseldb ? "--with-chiseldb " : "") + (P.constantin ? "--with-constantin " : "");
      return { a: pre + (P.release ? rel : dbg) + " --full-stacktrace", mode: P.release ? "release" : "debug" };
    }

    function command(g) {
      var n = Math.round(P.cores);
      var head = "time -avp -o ./build/time.log mill -i -Djvm-xmx=40G -Djvm-xss=256m ";
      var main = isSim(g) ? "xiangshan.test.runMain top.XiangShanSim" : "xiangshan.runMain top.TopMain";
      var lines = ["mkdir -p build/rtl"];
      lines.push(head + main + " \\\n  --target-dir build/rtl --config " + P.config + " --issue E.b \\\n  --num-cores " + n + " " + args(g).a);
      var file = isSim(g) ? "SimTop.sv" : "XSTop.sv";
      if (target(g) === "systemverilog") {
        lines.push("{ git log -n 1; git diff; } | sed 's/^/\\/\\// ' > build/rtl/.__diff__");
        lines.push("cat build/rtl/.__diff__ build/rtl/" + file + " > build/rtl/.__out__ && mv build/rtl/.__out__ build/rtl/" + file);
        if (isSim(g)) {
          lines.push("sed -i -e 's/$fatal/xs_assert_v2(`__FILE__, `__LINE__)/g' ./build/rtl/*.sv");
          lines.push("sed -i -e \"s/\\$error(/\\$fwrite(32\\'h80000002, /g\" ./build/rtl/*.sv");
        }
      }
      if (g === "emu") {
        lines.push("make -C ./difftest emu-mk NUM_CORES=" + n + ' RTL_SUFFIX=sv RTL_INCLUDE=""');
        lines.push("make -C ./difftest emu NUM_CORES=" + n + " RTL_SUFFIX=sv OBJCACHE=");
      }
      if (g === "gsim") lines.push("make -C ./difftest emu GSIM=1 SIM_TOP=SimTop DESIGN_DIR=$NOOP_HOME NUM_CORES=" + n + " RTL_SUFFIX=sv");
      return lines.join("\n");
    }

    var STEPS = [
      { name: "make", on: function () { return true; },
        cmd: function (g) { return "make " + g + (P.config !== "DefaultConfig" ? " CONFIG=" + P.config : "") + (P.cores > 1 ? " NUM_CORES=" + Math.round(P.cores) : ""); },
        inp: "명령행 변수(CONFIG, NUM_CORES, RELEASE, FPGA, WITH_*)", out: "위의 mill 명령 한 줄과 후처리 명령들",
        src: "Makefile:69-71 (목표 하나), 321-356" },
      { name: "mill runMain", on: function () { return true; },
        cmd: function (g) { return "mill -i ... " + (isSim(g) ? "xiangshan.test.runMain top.XiangShanSim" : "xiangshan.runMain top.TopMain"); },
        inp: "build.mill (Chisel 7.13.0, Scala 2.13.17), JVM 힙 40G·스택 256m", out: "JVM 위에서 실행되는 Scala main",
        src: "build.mill:19, 32; Makefile:101-105" },
      { name: "ArgParser", on: function () { return true; },
        cmd: function () { return "ArgParser.parse(args) → (Parameters, firrtlOpts, firtoolOpts)"; },
        inp: "--config, --num-cores, --enable-difftest 같은 XiangShan 옵션", out: "Config 객체. 모르는 옵션은 firrtlOpts로 넘어간다",
        src: "src/main/scala/top/ArgParser.scala:85-86, 181-182, 263-269" },
      { name: "정교화", on: function () { return true; },
        cmd: function (g) { return isSim(g) ? "DifftestModule.top(new XiangShanSim())" : "LazyModule(new XSTop()) → Generator.execute"; },
        inp: "Config", out: function (g) { return isSim(g) ? "SimTop 회로 그래프 (코어 + 가상 메모리 + DiffTest 포트)" : "XSTop 회로 그래프"; },
        src: function (g) { return isSim(g) ? "src/test/scala/top/SimTop.scala:187-208" : "src/main/scala/top/Top.scala:649-687"; } },
      { name: "PrintModuleName", on: function () { return true; },
        cmd: function () { return "xiangshan.transforms.PrintModuleName (직렬화 전)"; },
        inp: "회로 그래프", out: "로그·assert 메시지 속 이름을 인스턴스 경로로 치환",
        src: "src/main/scala/xiangshan/transforms/PrintModuleName.scala:33-36" },
      { name: "CHIRRTL", on: function () { return true; },
        cmd: function (g) { return target(g) === "chirrtl" ? "--target chirrtl → 여기서 멈춤" : "Convert (--dump-fir면 .fir도 남김)"; },
        inp: "회로 그래프", out: function (g) { return target(g) === "chirrtl" ? "build/rtl/SimTop.fir (최종)" : "firtool에 넘길 FIRRTL IR"; },
        src: "src/main/scala/top/XiangShanStage.scala:38-47; Makefile:94-98" },
      { name: "firtool", on: function (g) { return target(g) === "systemverilog"; },
        cmd: function () { return "circt.stage.phases.CIRCT ← " + FIRTOOL_OPT; },
        inp: "FIRRTL IR + firtool 옵션", out: "build/rtl/*.sv (--split-verilog로 모듈마다 한 파일)",
        src: "src/main/scala/top/XiangShanStage.scala:47; Makefile:114-120" },
      { name: "후처리 sed", on: function (g) { return target(g) === "systemverilog"; },
        cmd: function (g) { return isSim(g) ? "git 헤더 붙이기 + $fatal→xs_assert_v2, $error(→$fwrite(32'h80000002," : "git 헤더 붙이기만"; },
        inp: "톱 .sv", out: "커밋·diff가 주석으로 박힌 .sv. 시뮬레이션용은 assert가 파일·줄을 출력하도록 바뀜",
        src: function (g) { return isSim(g) ? "Makefile:340-354" : "Makefile:327-329"; } },
      { name: "difftest 빌드", on: function (g) { return g === "emu" || g === "gsim"; },
        cmd: function (g) { return g === "gsim" ? "make -C ./difftest emu GSIM=1 ..." : "make -C ./difftest emu-mk → emu"; },
        inp: function (g) { return g === "gsim" ? "build/rtl/SimTop.fir" : "build/rtl/*.sv + difftest C++"; },
        out: "C++ 시뮬레이터 (빌드 규칙은 difftest 서브모듈, 추론)",
        src: "Makefile:398-405" },
      { name: "build/emu", on: function (g) { return g === "emu" || g === "gsim"; },
        cmd: function () { return "./build/emu -i <workload> --diff ./ready-to-run/riscv64-nemu-interpreter-so"; },
        inp: "워크로드 바이너리, REF .so", out: "커밋마다 비교, TRAP에서 종료",
        src: "README.md:136; scripts/xiangshan.py:305" }
    ];
    function val(v, g) { return typeof v === "function" ? v(g) : v; }

    var stepBox = $("bf-steps");
    STEPS.forEach(function (s, i) {
      var b = document.createElement("button");
      b.className = "btn sm";
      b.textContent = (i + 1) + ". " + s.name;
      b.addEventListener("click", function () { cur = i; render(); });
      stepBox.appendChild(b);
    });
    root.querySelectorAll("#bf-goals button").forEach(function (b) {
      b.addEventListener("click", function () { goal = b.getAttribute("data-g"); cur = 0; render(); });
    });

    function render() {
      var g = goal;
      root.querySelectorAll("#bf-goals button").forEach(function (b) { b.classList.toggle("primary", b.getAttribute("data-g") === g); });
      $("bf-cmd").textContent = command(g);
      if (!STEPS[cur].on(g)) cur = 0;
      stepBox.querySelectorAll("button").forEach(function (b, i) {
        var on = STEPS[i].on(g);
        b.disabled = !on;
        b.textContent = (i + 1) + ". " + STEPS[i].name + (on ? "" : " (건너뜀)");
        b.classList.toggle("on", i === cur);
      });
      var s = STEPS[cur];
      $("bf-detail").innerHTML =
        "<p><b>" + (cur + 1) + ". " + esc(s.name) + "</b></p>" +
        "<p>명령: <code>" + esc(val(s.cmd, g)) + "</code></p>" +
        "<p>입력: " + esc(val(s.inp, g)) + "</p>" +
        "<p>출력: " + esc(val(s.out, g)) + "</p>" +
        "<p>근거: <code>" + esc(val(s.src, g)) + "@09453ff8</code></p>";

      var a = args(g);
      $("bf-top").textContent = isSim(g) ? "SimTop" : "XSTop";
      $("bf-out").textContent = { "verilog": "build/rtl/XSTop.sv", "sim-verilog": "build/rtl/SimTop.sv", "sim-chirrtl": "build/rtl/SimTop.fir", "emu": "build/emu", "gsim": "build/emu (GSIM)" }[g];
      $("bf-dt").textContent = a.a.indexOf("--enable-difftest") >= 0 ? "전체" : "기본만";
      $("bf-ft").textContent = target(g) === "systemverilog" ? "예" : "아니오";

      var v = $("bf-verdict"), msg, cls = "ok";
      if (!isSim(g) && (P.chiseldb || P.constantin)) { cls = "warn"; msg = "WITH_CHISELDB·WITH_CONSTANTIN은 SIM_ARGS에만 붙는다. verilog 명령에는 아무 변화가 없다 (B4)"; }
      else if (!isSim(g) && P.release) { cls = "warn"; msg = "RELEASE=1은 SIM_ARGS만 바꾼다. verilog는 원래 릴리스 옵션이다 (Makefile:266-284)"; }
      else if (isSim(g) && a.a.indexOf("--enable-difftest") < 0) { cls = "warn"; msg = (P.release ? "RELEASE=1" : "FPGA=1") + "이면 --enable-difftest가 빠진다. DiffTest는 AlwaysBasicDiff의 기본 포트만 남는다 (D1)"; }
      else if (g === "gsim") { msg = "--target chirrtl: firtool 없이 SimTop.fir에서 멈추고 GSIM이 그것을 읽는다 (#6374)"; }
      else msg = (a.mode === "release" ? "릴리스" : "디버그") + " 옵션으로 " + (isSim(g) ? "SimTop" : "XSTop") + "을 만든다. 명령은 make -n 출력과 같다" + (isSim(g) ? " (time.log용 echo·date 두 줄만 생략, Makefile:335-336)" : "");
      v.className = "verdict " + cls;
      v.textContent = msg;
    }
    render();
  })();

  /* ---------------- DiffTest mismatch finder ---------------- */
  (function () {
    var root = $("sim-diff");
    if (!root) return;
    /* Synthetic program. Slot rules follow Rob.scala:1743-1772 (valid, skip, rfwen, nFused) and the
       TRAP opcode 0x6b (CustomInstructions.scala:10). REF behaviour is inferred (difftest submodule). */
    var PROG = [
      { pc: 0x80000000, asm: "addi a0, x0, 5", rd: "a0", v: 5 },
      { pc: 0x80000004, asm: "addi a1, x0, 7", rd: "a1", v: 7 },
      { pc: 0x80000008, asm: "add a2, a0, a1", rd: "a2", v: 12, alu: true },
      { pc: 0x8000000c, asm: "lw t0, 0(s1)  # UART", rd: "t0", v: 0x41, skip: "MMIO" },
      { pc: 0x80000010, asm: "csrr t1, mcycle", rd: "t1", v: 1234, skip: "PerfCnt" },
      { pc: 0x80000014, asm: "addi x0, x0, 0", rd: "x0", v: 0, x0: true },
      { pc: 0x80000018, asm: "lui t2,1 + addi t2,t2,-1", rd: "t2", v: 0xfff, fused: 1, half: 0x1000 },
      { pc: 0x80000020, asm: "sub a2, a2, a0", rd: "a2", v: 7 },
      { pc: 0x80000024, asm: "addi a0, x0, 0", rd: "a0", v: 0, end: true },
      { pc: 0x80000028, asm: "trap a0  (0x0005006b)", rd: "", v: 0, trap: true }
    ];
    /* commit groups per cycle; null = ROB walk cycle (isCommit = 0, not compared) */
    var CYC = [[0, 1, 2], null, [3, 4, 5], [6, 7, 8, 9]];
    var SCN = ["ok", "alu", "noskip", "rfdelay", "nofuse", "bad"];
    var scn = "ok", t = 0;

    function hex(x) { return "0x" + x.toString(16); }
    /* Build the full row list for a scenario, stopping at the first mismatch. */
    function simulate(s) {
      var rows = [], refN = 0, cmp = 0, skp = 0, stop = null, trap = null;
      for (var c = 0; c < CYC.length && !stop && !trap; c++) {
        var grp = CYC[c];
        if (!grp) { rows.push({ c: c, walk: true }); continue; }
        for (var k = 0; k < grp.length; k++) {
          var ins = PROG[grp[k]];
          var dut = ins.v, ref = ins.v, kind = "done", label = "일치";
          if (s === "bad" && ins.end) { dut = ref = 1; }
          if (s === "alu" && ins.alu) dut = ins.v + 1;
          if (s === "rfdelay" && !ins.x0 && !ins.trap && !ins.skip) dut = "?";
          var step = 1 + (ins.fused || 0);
          if (s === "nofuse" && ins.fused) { step = 1; ref = ins.half; }
          refN += step;
          var dutS = ins.trap ? "code " + (s === "bad" ? 1 : 0) : (ins.x0 ? "-" : ins.rd + "=" + (dut === "?" ? "이전 값" : hex(dut)));
          var refS = ins.trap ? "code " + (s === "bad" ? 1 : 0) : (ins.x0 ? "-" : ins.rd + "=" + hex(ref));
          if (ins.skip && s !== "noskip") { kind = "amber"; label = "skip(" + ins.skip + ")"; refS = "DUT 값 복사 (추론)"; skp++; }
          else if (ins.skip && s === "noskip") { ref = 0; refS = ins.rd + "=0x0 (추론)"; kind = "blocked"; label = "불일치"; }
          else if (ins.x0) { kind = "none"; label = "rfwen=0"; cmp++; }
          else if (ins.trap) { kind = "run"; label = "TRAP"; cmp++; trap = s === "bad" ? 1 : 0; }
          else if (dut !== ref) { kind = "blocked"; label = "불일치"; }
          else cmp++;
          if (ins.fused) label += " nFused=" + (s === "nofuse" ? "무시" : "1");
          rows.push({ c: c, slot: k, ins: ins, asm: (s === "bad" && ins.end) ? "addi a0, x0, 1" : ins.asm, dut: dutS, ref: refS, kind: kind, label: label });
          if (kind === "blocked") { stop = { c: c, slot: k, ins: ins }; cmp++; break; }
        }
      }
      return { rows: rows, refN: refN, cmp: cmp, skp: skp, stop: stop, trap: trap };
    }

    var body = $("dt-body");
    var scnBtns = root.querySelectorAll("#dt-scn button");
    scnBtns.forEach(function (b, i) {
      b.addEventListener("click", function () { scn = SCN[i]; t = CYC.length; render(); });
    });
    $("dt-step").addEventListener("click", function () { if (t < CYC.length) t++; render(); });
    $("dt-reset").addEventListener("click", function () { t = 0; render(); });

    function render() {
      scnBtns.forEach(function (b, i) { b.classList.toggle("primary", SCN[i] === scn); });
      var full = simulate(scn);
      var lastC = full.rows.length ? full.rows[full.rows.length - 1].c : 0;
      var shown = full.rows.filter(function (r) { return r.c < t; });
      var refN = 0, cmp = 0, skp = 0;
      body.innerHTML = shown.map(function (r) {
        var curCls = r.c === t - 1 ? ' class="cur"' : "";
        if (r.walk) return "<tr" + curCls + "><td>" + (r.c + 1) + "</td><td>-</td><td colspan=\"4\">ROB walk: isCommit=0이라 valid=0</td><td><span class=\"chip wait\">비교 안 함</span></td></tr>";
        refN += 1 + (scn === "nofuse" ? 0 : (r.ins.fused || 0));
        if (r.kind === "amber") skp++; else cmp++;
        return "<tr" + curCls + "><td>" + (r.c + 1) + "</td><td>" + r.slot + "</td><td><code>" + hex(r.ins.pc).slice(2) + "</code></td><td><code>" +
          esc(r.asm) + "</code></td><td>" + esc(r.dut) + "</td><td>" + esc(r.ref) + "</td><td><span class=\"chip " + r.kind + "\">" + esc(r.label) + "</span></td></tr>";
      }).join("") || "<tr><td colspan=\"7\">아직 커밋 없음. 한 사이클을 눌러 시작</td></tr>";
      var done = t > lastC;
      $("dt-cyc").textContent = Math.min(t, CYC.length) + " / " + CYC.length;
      $("dt-cmp").textContent = cmp;
      $("dt-skip").textContent = skp;
      $("dt-ref").textContent = refN;
      var v = $("dt-verdict");
      if (t === 0) { v.className = "verdict grey"; v.textContent = "사이클 0: 아직 아무것도 커밋하지 않았다. 한 사이클을 누르세요"; return; }
      if (!done) { v.className = "verdict grey"; v.textContent = "사이클 " + t + "까지 모든 비교가 통과했다"; return; }
      if (full.stop) {
        var s = full.stop;
        var why = { alu: "DUT의 add가 1 크게 계산했다. 첫 오답 자리에서 바로 멈춘다",
                    noskip: "UART 값은 REF가 알 수 없다. 코어는 멀쩡한데 skip이 없어 멈췄다 (D3)",
                    rfdelay: "RAT는 t-2, RF는 t-3 사진이라 새 물리 레지스터의 값이 아직 없다고 본 합성 시나리오다 (D5, 추론)",
                    nofuse: "REF가 lui 하나만 실행해 t2=0x1000에 머문다. 융합 슬롯은 nFused+1개로 세야 한다 (D4)" }[scn];
        v.className = "verdict bad";
        v.textContent = "ABORT: 사이클 " + (s.c + 1) + " 슬롯 " + s.slot + ", pc " + hex(s.ins.pc) + ". " + why;
      } else if (full.trap === 0) {
        v.className = "verdict ok"; v.textContent = "HIT GOOD TRAP (code 0): REF가 " + full.refN + "개 명령어를 함께 실행했고 모든 비교가 통과했다";
      } else {
        v.className = "verdict warn"; v.textContent = "HIT BAD TRAP (code 1): DiffTest는 모두 통과했지만 프로그램 스스로 실패를 보고했다. 비교 통과와 테스트 성공은 다르다";
      }
    }
    render();
  })();
})();

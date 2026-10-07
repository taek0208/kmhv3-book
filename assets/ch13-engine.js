/* ch13 engine: a simplified cycle model of the KMHv3 pipeline with the real constants from the code.
   Shared by ch13-lab.js and ch13-exp.js through window.KMH13. Source of every constant is noted next to it
   (paths relative to src/main/scala/xiangshan/, commit 09453ff8). "(추론)" = counted from Reg/RegNext
   boundaries in the code, not checked against an RTL waveform. */
(function () {
  "use strict";

  var C = {
    W: 8,              /* DecodeWidth / RenameWidth / CommitWidth: Parameters.scala:81-83 */
    BANK: 8,           /* ROB bankNum, commit stays inside one aligned 8-entry line: backend/rob/Rob.scala:173 */
    ROB: 352,          /* RobSize: Parameters.scala:114 */
    ROB_DISPATCH: 336, /* allowEnqueueForDispatch: RobSize - 2*RenameWidth, Rob.scala:972 (used by Dispatch, CtrlBlock.scala:800) */
    ROB_ENQ: 344,      /* allowEnqueue: RobSize - RenameWidth, Rob.scala:971 */
    /* issue ports per cycle (int scheduler, Parameters.scala:345-444): ALU0-5, of which ALU4/ALU5 also carry Mul,
       BJU0-2, LDU0-2, STA0-1 */
    PORTS: { alu: 6, mul: 2, br: 3, ld: 3, st: 2 },
    /* dependent select = producer select + WAKE: 1 + FU latency (alu CertainLatency(0) FuConfig.scala:343/68,
       mul CertainLatency(2) :364, load UncertainLatency(3) :477) through MultiWakeupQueue lastConnect Reg
       (issue/MultiWakeupQueue.scala:47,76) and the load wakeup RegNext (issue/IssueQueue.scala:974) (추론) */
    WAKE: { alu: 1, mul: 3, br: 1, ld: 4, st: 1 },
    /* EX cycles = latency + 1; load = S0..S3 (mem/pipeline/NewLoadUnit.scala) */
    EXLEN: { alu: 1, mul: 3, br: 1, ld: 4, st: 1 },
    /* select -> OG0 (+1, deqDelay Reg IssueQueue.scala:889) -> OG1 (+2, DataPath.scala:515) -> EX (+3) */
    SEL_TO_EX: 3,
    /* branch EX cycle E -> correct-path first decode E+10 (G9 in the fact sheet, 추론) */
    REDIRECT_TO_DECODE: 10
  };

  var OPS = {
    add: "alu", sub: "alu", and: "alu", or: "alu", xor: "alu", sll: "alu", srl: "alu", sra: "alu", slt: "alu",
    addi: "alu", andi: "alu", ori: "alu", xori: "alu", slli: "alu", srli: "alu", li: "alu", mv: "alu", nop: "alu",
    mul: "mul", mulw: "mul", mulh: "mul",
    ld: "ld", lw: "ld", lwu: "ld", lh: "ld", lhu: "ld", lb: "ld", lbu: "ld",
    sd: "st", sw: "st", sh: "st", sb: "st",
    beq: "br", bne: "br", blt: "br", bge: "br", bltu: "br", bgeu: "br", j: "br"
  };
  var KIND_NAME = { alu: "ALU", mul: "MUL", br: "BJU", ld: "LOAD", st: "STORE" };
  var MAX_INS = 16;

  /* "op rd, rs1, rs2", "ld rd, imm(rs1)", "sd rs2, imm(rs1)", "beq rs1, rs2, L". Flags: !miss on a load,
     !mp on a branch. '#' starts a comment. x0 never creates a dependency. */
  function parse(text) {
    var prog = [], errs = [];
    String(text || "").split("\n").forEach(function (raw, ln) {
      var line = raw.replace(/#.*/, "").trim();
      if (!line) return;
      var miss = /!miss\b/i.test(line), mp = /!mp\b/i.test(line);
      var body = line.replace(/!\w+/g, "").trim();
      var m = body.match(/^([a-z]+)\s*(.*)$/i);
      if (!m) { errs.push((ln + 1) + "행을 읽지 못했다"); return; }
      var op = m[1].toLowerCase(), kind = OPS[op];
      if (!kind) { errs.push((ln + 1) + "행: " + op + "는 지원하지 않는다"); return; }
      var regs = (m[2].match(/\bx([12][0-9]|3[01]|[0-9])\b/g) || []).map(function (r) { return +r.slice(1); });
      var rd = null, rs = regs;
      if (kind !== "st" && kind !== "br") { rd = regs.length ? regs[0] : null; rs = regs.slice(1); }
      if (op === "nop") { rd = null; rs = []; }
      if (rd === 0) rd = null;
      rs = rs.filter(function (r) { return r !== 0; });
      prog.push({ text: body + (miss ? " !miss" : "") + (mp ? " !mp" : ""), op: op, kind: kind, rd: rd, rs: rs,
        miss: kind === "ld" && miss, mp: kind === "br" && mp });
    });
    if (prog.length > MAX_INS) { errs.push("명령은 " + MAX_INS + "개까지만 쓴다 (나머지 무시)"); prog = prog.slice(0, MAX_INS); }
    return { prog: prog, errs: errs };
  }

  function bump(map, k) { map[k] = (map[k] || 0) + 1; }

  function portFree(use, kind, c) {
    var u = use[c] || { alu: 0, mul: 0, br: 0, ld: 0, st: 0 };
    if (kind === "mul") return u.mul < C.PORTS.mul && u.alu + u.mul < C.PORTS.alu;
    if (kind === "alu") return u.alu + u.mul < C.PORTS.alu;
    return u[kind] < C.PORTS[kind];
  }
  function takePort(use, kind, c) {
    if (!use[c]) use[c] = { alu: 0, mul: 0, br: 0, ld: 0, st: 0 };
    use[c][kind] += 1;
  }

  /* In-order decode/rename/dispatch (8 per cycle), out-of-order select (oldest first, port limits),
     in-order commit (aligned 8-entry ROB line). opt: {missLat, robOff}. */
  function simulate(prog, opt) {
    opt = opt || {};
    var missLat = opt.missLat === undefined ? 20 : opt.missLat;
    var robOff = opt.robOff || 0;
    var decodeCnt = {}, portUse = {}, writer = {};
    var rows = [], ghosts = [];
    var minD = 1, prevD = 0, prevC = -1, prevLine = -1, maxC = 0;
    prog.forEach(function (ins, i) {
      var D = Math.max(minD, prevD);
      while ((decodeCnt[D] || 0) >= C.W) D += 1;
      bump(decodeCnt, D);
      prevD = D;
      var DS = D + 2, S = DS + 1, why = "의존 없음: dispatch 다음 cycle에 바로 select";
      ins.rs.forEach(function (r) {
        var p = writer[r];
        if (!p) return;
        var t = p.S + p.wake;
        if (t > S) { S = t; why = "x" + r + " 생산자 #" + p.i + "(" + KIND_NAME[p.kind] + (p.miss ? " miss" : "") + ") select " + p.S + " + " + p.wake + " = " + t; }
      });
      var S0 = S;
      while (!portFree(portUse, ins.kind, S)) S += 1;
      if (S > S0) why += " → " + (ins.kind === "mul" ? "MUL 포트 2개(ALU4·5)" : KIND_NAME[ins.kind] + " 포트") + "가 차서 " + (S - S0) + " cycle 더 대기";
      takePort(portUse, ins.kind, S);
      var exS = S + C.SEL_TO_EX, exE = exS + C.EXLEN[ins.kind] - 1;
      var X = ins.miss ? exE + missLat : exE;
      var wake = C.WAKE[ins.kind] + (ins.miss ? missLat : 0);
      if (ins.rd !== null) writer[ins.rd] = { S: S, wake: wake, i: i, kind: ins.kind, miss: ins.miss };
      var WB = X + 1;
      var idx = robOff + i, line = Math.floor(idx / C.BANK);
      var Cc = Math.max(WB + 1, prevC);
      var cwhy = "writeback 다음 cycle";
      if (prevC >= WB + 1) cwhy = "앞 명령의 커밋을 기다림";
      if (prevLine >= 0 && line !== prevLine && prevC + 1 > Cc) { Cc = prevC + 1; cwhy = "앞 line을 다 커밋한 다음 cycle에야 새 line"; }
      prevC = Cc; prevLine = line;
      maxC = Math.max(maxC, Cc);
      var row = { i: i, ins: ins, F: D - 1, D: D, R: D + 1, DS: DS, S: S, exS: exS, exE: exE, X: X, WB: WB, C: Cc,
        robIdx: idx, line: line, why: why, cwhy: cwhy };
      if (ins.mp) {
        row.E = exS;
        minD = Math.max(minD, exS + C.REDIRECT_TO_DECODE);
        prevD = Math.max(prevD, minD);
        ghosts.push({ after: i, from: D + 1, to: exS + 2, E: exS });
      }
      rows.push(row);
    });
    return { rows: rows, ghosts: ghosts, maxC: maxC, missLat: missLat, robOff: robOff };
  }

  /* Stage letter of one row at cycle c (null = not in the pipeline). */
  function stageAt(r, c) {
    if (c === r.F) return ["F", "F"];
    if (c === r.D) return ["D", "D"];
    if (c === r.R) return ["R", "R"];
    if (c === r.DS) return ["DS", "DS"];
    if (c > r.DS && c < r.S) return ["·", "W"];
    if (c === r.S) return ["IS", "IS"];
    if (c === r.S + 1) return ["OG0", "OG"];
    if (c === r.S + 2) return ["OG1", "OG"];
    if (c >= r.exS && c <= r.exE) return ["EX", "EX"];
    if (c > r.exE && c <= r.X) return ["M", "M"];
    if (c === r.WB) return ["WB", "WB"];
    if (c > r.WB && c < r.C) return ["·", "RW"];
    if (c === r.C) return ["C", "C"];
    return null;
  }

  /* Per-cycle counts for the stepper readout. */
  function cycleStats(res, t) {
    var s = { decode: 0, select: 0, commit: 0, committed: 0, rob: 0 };
    res.rows.forEach(function (r) {
      if (r.D === t) s.decode += 1;
      if (r.S === t) s.select += 1;
      if (r.C === t) s.commit += 1;
      if (r.C <= t) s.committed += 1;
      if (r.DS + 1 <= t && t <= r.C) s.rob += 1; /* ROB enq is RegNext of dispatch: CtrlBlock.scala:796-799 */
    });
    return s;
  }

  var PRESETS = [
    { name: "의존 ALU 체인", text: [
      "# 매 명령이 바로 앞 명령의 x1을 읽는다",
      "add x1, x1, x2", "add x1, x1, x2", "add x1, x1, x2", "add x1, x1, x2",
      "add x1, x1, x2", "add x1, x1, x2", "add x1, x1, x2", "add x1, x1, x2"].join("\n") },
    { name: "독립 16개", text: (function () {
      var a = ["# 서로 독립인 ALU 16개: 폭 8과 ALU 포트 6이 보인다"];
      for (var k = 1; k <= 16; k++) a.push("add x" + k + ", x20, x21");
      return a.join("\n");
    })() },
    { name: "MUL 체인", text: [
      "# MUL 결과는 select 3 cycle 뒤에야 쓸 수 있다",
      "mul x1, x1, x2", "mul x1, x1, x2", "mul x1, x1, x2", "mul x1, x1, x2",
      "add x3, x1, x2      # MUL 결과 소비", "add x4, x20, x21    # 독립"].join("\n") },
    { name: "load hit/miss", text: [
      "ld  x1, 0(x10)          # hit",
      "add x2, x1, x3          # load-to-use 4",
      "ld  x4, 64(x10) !miss   # miss",
      "add x5, x4, x3          # miss 결과 대기",
      "add x6, x20, x21        # 독립: 일찍 끝나지만",
      "add x7, x20, x22        # 커밋은 miss 뒤로 밀린다",
      "mul x8, x20, x21",
      "add x9, x8, x6"].join("\n") },
    { name: "분기 오예측", text: [
      "ld  x1, 0(x10)",
      "beq x1, x0, L !mp       # load 값으로 판정, 오예측",
      "add x2, x20, x21        # 여기부터 정답 경로",
      "add x3, x2, x21",
      "add x4, x20, x22",
      "add x5, x4, x3"].join("\n") }
  ];

  /* ROB occupancy model for one load miss at the ROB head followed by an endless stream of independent
     instructions. Dispatch 8/cycle; its permission is a Reg computed from numValidEntries + dispatchNum
     (Rob.scala:971-972); requests reach the ROB one cycle later (RegNext, CtrlBlock.scala:796-799).
     limit = threshold Dispatch uses (336 real; 344 as a what-if). Other resources (IQ, freelist, LSQ) are
     assumed unlimited. */
  function robRun(missLat, limit, T) {
    T = T || missLat + 90;
    var rob = [], inflight = [], next = 0;
    var allowDisp = true, allowEnq = true;
    var occ = [], dispatched = [], stall = 0, firstStall = -1, dropped = 0, firstDrop = -1, peak = 0, resume = -1;
    var headReady = 1 + missLat; /* the load enters the ROB at cycle 1 and can commit missLat cycles later */
    for (var t = 0; t <= T; t++) {
      var numValid = rob.length;
      var arriving = inflight; inflight = [];
      var dispatchNum = allowEnq ? arriving.length : 0;
      if (allowEnq) arriving.forEach(function (e) { rob.push(e); });
      else if (arriving.length) { dropped += arriving.length; if (firstDrop < 0) firstDrop = t; }
      var c = 0;
      while (c < C.W && rob.length && rob[0].ready <= t && rob[0].enq < t) {
        var e = rob.shift(); c += 1;
        if (e.idx % C.BANK === C.BANK - 1) break; /* line end: next line next cycle */
      }
      var d = 0;
      if (allowDisp) {
        for (var k = 0; k < C.W; k++, next++) inflight.push({ idx: next, enq: t + 1, ready: next === 0 ? headReady : t + 1 + 5 });
        d = C.W;
        if (firstStall >= 0 && resume < 0) resume = t;
      } else {
        stall += 1;
        if (firstStall < 0) firstStall = t;
      }
      var s = numValid + dispatchNum;
      allowEnq = s <= C.ROB_ENQ;
      allowDisp = s <= limit;
      peak = Math.max(peak, rob.length);
      occ.push(rob.length);
      dispatched.push(d);
    }
    return { occ: occ, dispatched: dispatched, stall: stall, firstStall: firstStall, dropped: dropped, firstDrop: firstDrop,
      peak: peak, resume: resume, headReady: headReady, T: T };
  }

  /* Misprediction penalty from branch EX (E) to the first correct-path EX, fact-sheet G9 (추론):
     E -> E+2 redirect reaches FTQ/BPU, +8 frontend refill to decode, +3 decode/rename/dispatch->select, +3 to EX. */
  function penalty(o) {
    var parts = [
      { k: "redirect 전달", v: 2 },
      { k: "앞단 재충전", v: 8 },
      { k: "decode~select", v: 3 },
      { k: "select~EX", v: 3 }
    ];
    if (o.aheadMiss) parts.push({ k: "ftqIdxAhead 불일치", v: 1 });
    if (o.icMiss > 0) parts.push({ k: "ICache miss", v: o.icMiss });
    if (o.walk) {
      var w = Math.ceil(o.younger / C.W);
      var extra = Math.max(0, w - 8);
      parts.push({ k: "ROB walk 초과분", v: extra, walk: w });
    }
    var total = parts.reduce(function (a, p) { return a + p.v; }, 0);
    return { total: total, parts: parts };
  }

  window.KMH13 = { C: C, parse: parse, simulate: simulate, stageAt: stageAt, cycleStats: cycleStats,
    PRESETS: PRESETS, robRun: robRun, penalty: penalty, KIND_NAME: KIND_NAME, MAX_INS: MAX_INS };
})();

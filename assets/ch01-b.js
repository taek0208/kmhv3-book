/* ch01-b.js: 1장 시뮬레이터 D~G (ROB 원형 큐, 리네이밍 놀이터, 코어 블록도, config 탐색기). */

function ch01bSeg(id, onPick) {
  var bs = Array.prototype.slice.call(document.getElementById(id).querySelectorAll("button"));
  bs.forEach(function (b, i) {
    b.addEventListener("click", function () {
      bs.forEach(function (x) { x.classList.toggle("on", x === b); });
      onPick(i);
    });
  });
  return bs;
}

/* ---------- D. ROB 원형 큐 ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-rob");
  if (!root) return;
  var W = 8;            /* RenameWidth = CommitWidth = 8 (Parameters.scala:82-83) */
  var PERIOD = 300;     /* 합성: 300번째 명령어마다 미스 하나 */
  var MAXC = 1200, sizes = [352, 48], N = 352, S;
  var P = Book.bind(root, function () { reset(); });

  function reset() {
    S = { cyc: 0, head: 0, occ: 0, allow: true, pend: 0, seq: 0, cmt: 0, full: 0, ent: new Array(N), hist: [] };
    if (anim) anim.stop();
    cv.redraw(); show();
  }
  function lat(seq) { return (seq % PERIOD === PERIOD - 1 && P.miss > 0) ? P.miss : 1 + (seq * 7) % 4; }
  function step() {
    var occ0 = S.occ, k = 0;
    /* G2: head부터 완료된 것만, 같은 8칸 줄 안에서, 최대 8개 */
    var lineEnd = Math.floor(S.head / W) * W + W;
    while (k < W && S.occ > 0 && S.head < lineEnd) {
      var e = S.ent[S.head];
      if (e.done > S.cyc) break;
      S.ent[S.head] = null; S.head = (S.head + 1) % N; S.occ--; S.cmt++; k++;
      if (S.head === 0) break;
    }
    /* 지난 사이클에 디스패치한 묶음이 RegNext 1단(CtrlBlock.scala:797)을 지나 ROB에 들어온다 */
    var enq = 0;
    for (; enq < S.pend && S.occ < N; enq++) {
      var idx = (S.head + S.occ) % N, l = lat(S.seq);
      S.ent[idx] = { done: S.cyc + 1 + l, miss: l > 4 }; S.occ++; S.seq++;
    }
    /* G1: 지난 사이클에 계산한 allowEnqueueForDispatch(레지스터)로 디스패치 */
    if (S.allow) S.pend = W; else { S.pend = 0; S.full++; }
    S.allow = occ0 + enq <= N - 2 * W; /* Rob.scala:972 */
    S.cyc++;
    S.hist.push(S.occ); if (S.hist.length > 400) S.hist.shift();
  }

  var cv = Book.canvas(document.getElementById("rob-cv"), function (ctx, w, h) {
    if (!S) return;
    var R = Math.min(h * 0.4, w * 0.24), cx = R + 14, cy = h / 2, a0 = -Math.PI / 2, da = Math.PI * 2 / N;
    ctx.lineWidth = Math.max(6, R * 0.22);
    for (var i = 0; i < N; i++) {
      var e = S.ent[i], col = !e ? Book.css("grey-soft") : e.done <= S.cyc ? Book.css("ok") : e.miss ? Book.css("bad") : Book.css("warn");
      ctx.beginPath(); ctx.strokeStyle = col;
      ctx.arc(cx, cy, R, a0 + i * da + da * 0.08, a0 + (i + 1) * da - da * 0.08); ctx.stroke();
    }
    var lwR = ctx.lineWidth;
    [[S.head, "head", "accent", R + lwR], [(S.head + S.occ) % N, "tail", "accent-2", R - lwR - 6]].forEach(function (m) {
      var ang = a0 + m[0] * da, x = cx + Math.cos(ang) * m[3], y = cy + Math.sin(ang) * m[3]; /* head는 바깥, tail은 안쪽 */
      Book.text(ctx, m[1], x, y, { size: 10, weight: "700", align: "center", color: Book.css(m[2]) });
    });
    Book.text(ctx, S.occ + "/" + N, cx, cy - 8, { size: 16, weight: "700", align: "center", mono: true });
    Book.text(ctx, S.allow ? "디스패치 허가" : "디스패치 막힘", cx, cy + 12, { size: 11, align: "center", color: Book.css(S.allow ? "ok" : "bad") });
    /* 오른쪽: 점유 이력 */
    var x0 = cx + R + 30, x1 = w - 8, y0 = 18, y1 = h - 24;
    if (x1 - x0 < 60) return;
    ctx.lineWidth = 1; ctx.strokeStyle = Book.css("border"); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    var yN = function (v) { return y1 - (v / N) * (y1 - y0); };
    ctx.setLineDash([4, 4]); ctx.strokeStyle = Book.css("text-faint");
    ctx.beginPath(); ctx.moveTo(x0, yN(N - 2 * W)); ctx.lineTo(x1, yN(N - 2 * W)); ctx.stroke(); ctx.setLineDash([]);
    Book.text(ctx, "N−16 = " + (N - 2 * W), x1 - 2, yN(N - 2 * W) + 9, { size: 10, align: "right", color: Book.css("text-dim"), mono: true });
    Book.line(ctx, S.hist.map(function (v, j) { return [x0 + j * (x1 - x0) / 400, yN(v)]; }), Book.css("accent"), 2);
    Book.text(ctx, "점유 이력(최근 400사이클)", x0, 9, { size: 11, color: Book.css("text-dim") });
    Book.text(ctx, "0", x0 - 4, y1, { size: 10, align: "right", mono: true, color: Book.css("text-faint") });
    Book.text(ctx, String(N), x0 - 4, y0, { size: 10, align: "right", mono: true, color: Book.css("text-faint") });
  });

  function show() {
    document.getElementById("rob-ro-c").textContent = S.cyc;
    document.getElementById("rob-ro-occ").textContent = S.occ + " / " + N;
    document.getElementById("rob-ro-full").textContent = S.full;
    document.getElementById("rob-ro-ipc").textContent = S.cyc ? (S.cmt / S.cyc).toFixed(2) : "0";
    var v = document.getElementById("rob-verdict"), he = S.ent[S.head];
    if (!S.cyc) { v.className = "verdict grey"; v.textContent = "대기: 재생을 누른다"; }
    else if (!S.allow) { v.className = "verdict bad"; v.textContent = "디스패치 막힘: 점유 " + S.occ + ", 새 명령어는 디스패치 앞에서 기다린다"; }
    else if (he && he.miss && he.done > S.cyc) { v.className = "verdict warn"; v.textContent = "head가 미스 대기 중: 뒤는 끝나도 커밋 못 한다"; }
    else if (S.cyc >= MAXC) { v.className = "verdict ok"; v.textContent = MAXC + "사이클 끝: IPC " + (S.cmt / S.cyc).toFixed(2); }
    else { v.className = "verdict ok"; v.textContent = "흐름 정상: 들어오는 만큼 나간다"; }
  }

  var acc = 0, anim = null;
  anim = Book.loop(cv.ctx.canvas, function (dt) {
    acc += dt; if (acc < 0.03) return true; acc = 0;
    step(); step(); cv.redraw(); show();
    return S.cyc < MAXC;
  });
  ch01bSeg("rob-size", function (i) { N = sizes[i]; reset(); });
  document.getElementById("rob-play").addEventListener("click", function () { if (S.cyc >= MAXC) reset(); anim.start(); });
  document.getElementById("rob-step").addEventListener("click", function () { anim.stop(); step(); cv.redraw(); show(); });
  document.getElementById("rob-reset").addEventListener("click", function () { reset(); });
  reset();
})();

/* ---------- E. 리네이밍 놀이터 ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-ren");
  if (!root) return;
  var PROG = [
    { op: "add", rd: 1, rs: [2, 3] }, { op: "mul", rd: 4, rs: [1, 5] }, { op: "add", rd: 1, rs: [6, 7] },
    { op: "sub", rd: 8, rs: [1, 4] }, { op: "addi", rd: 4, rs: [9], imm: 1 }, { op: "or", rd: 10, rs: [4, 1] }
  ];
  var FREE0 = 223; /* StdFreeList(IntPhyRegs - 1 = 223), p1부터 (Rename.scala:117, StdFreeList.scala:37) */
  var S;
  function txt(p, map) {
    return p.op + " " + (map ? "p" + map.d : "x" + p.rd) + "," + p.rs.map(function (x, i) { return map ? "p" + map.s[i] : "x" + x; }).join(",") + (p.imm !== undefined ? "," + p.imm : "");
  }
  /* 의존 깊이: raw만(리네임 후) 또는 raw+war+waw(이름 그대로) */
  function depth(all) {
    var d = [];
    PROG.forEach(function (p, i) {
      var m = 0;
      for (var j = 0; j < i; j++) {
        var q = PROG[j], raw = p.rs.indexOf(q.rd) >= 0;
        var war = q.rs.indexOf(p.rd) >= 0, waw = q.rd === p.rd;
        if (raw || (all && (war || waw))) m = Math.max(m, d[j]);
      }
      d.push(m + 1);
    });
    return Math.max.apply(null, d);
  }
  function reset() { S = { i: 0, rat: {}, next: 1, out: [] }; for (var x = 0; x < 32; x++) S.rat[x] = 0; render(); }
  function step() {
    if (S.i >= PROG.length) return;
    var p = PROG[S.i], s = p.rs.map(function (x) { return S.rat[x]; });
    var old = S.rat[p.rd], d = S.next++;
    S.rat[p.rd] = d;
    S.out.push({ s: s, d: d, old: old, reuse: PROG.slice(0, S.i).some(function (q) { return q.rd === p.rd; }) });
    S.i++; render();
  }
  function render() {
    var h = "<tr><th>#</th><th>원래</th><th>리네임 후</th><th>이전 대응</th></tr>";
    PROG.forEach(function (p, i) {
      var o = S.out[i];
      h += "<tr" + (i === S.i - 1 ? ' class="cur"' : "") + "><td>" + (i + 1) + "</td><td><code>" + txt(p) + "</code></td>" +
        (o ? '<td class="new"><code>' + txt(p, o) + "</code></td><td><code>x" + p.rd + ":p" + o.old + "</code></td>" : "<td>-</td><td>-</td>") + "</tr>";
    });
    document.getElementById("ren-table").innerHTML = h;
    var a = "<tr><th>RAT</th>", b = "<tr><td>물리</td>";
    for (var x = 1; x <= 10; x++) { a += "<th>x" + x + "</th>"; b += "<td" + (S.rat[x] ? ' class="new"' : "") + "><code>p" + S.rat[x] + "</code></td>"; }
    document.getElementById("ren-rat").innerHTML = a + "</tr>" + b + "</tr>";
    var done = S.i >= PROG.length;
    document.getElementById("ren-ro-i").textContent = S.i + " / " + PROG.length;
    document.getElementById("ren-ro-free").textContent = FREE0 - S.i;
    document.getElementById("ren-ro-depth").textContent = depth(true) + " → " + (done ? depth(false) : "?");
    var v = document.getElementById("ren-verdict");
    if (!S.i) { v.className = "verdict grey"; v.textContent = "대기: RAT 리셋값은 모두 p0, 프리 리스트는 p1부터"; return; }
    var p = PROG[S.i - 1], o = S.out[S.i - 1];
    if (done) { v.className = "verdict ok"; v.textContent = "끝: 의존 깊이 " + depth(true) + " → " + depth(false) + ". 남은 것은 RAW뿐이다"; }
    else if (o.reuse) { v.className = "verdict ok"; v.textContent = "x" + p.rd + "을 다시 쓴다: 새 이름 p" + o.d + ". 이전 값 p" + o.old + "을 읽는 명령어와 분리됐다(WAR·WAW 소멸)"; }
    else { v.className = "verdict grey"; v.textContent = "x" + p.rd + " → p" + o.d + " (프리 리스트 맨 앞)"; }
  }
  document.getElementById("ren-step").addEventListener("click", step);
  document.getElementById("ren-all").addEventListener("click", function () { while (S.i < PROG.length) step(); });
  document.getElementById("ren-reset").addEventListener("click", reset);
  reset();
})();

/* ---------- F. 코어 블록도 ---------- */
(function () {
  "use strict";
  var svg = document.getElementById("blk-svg");
  if (!svg) return;
  var GH = "https://github.com/OpenXiangShan/XiangShan/blob/09453ff8f44e9d2b526e6149c60e1dc3f08c7192/";
  var X = "src/main/scala/xiangshan/";
  /* [이름, 덩어리, x, y, w, 역할, 수치[], 경로, 줄, 장 파일, 장 이름] */
  var B = [
    ["Bpu", "Frontend", 12, 30, 112, "다음 페치 블록의 시작 PC와 분기를 예측한다.", ["메인 BTB 8192엔트리 4-way (mbtb/Parameters.scala:23-24)", "TAGE 8테이블 × 4096, 히스토리 4~397 (tage/Parameters.scala:27-34)", "RAS 16 / 32 (ras/Parameters.scala:22-23)"], "frontend/bpu/Bpu.scala", 49, "ch02-bpu.html", "2장 · 3장"],
    ["Ftq", "Frontend", 130, 30, 112, "예측 결과(페치 목표)를 줄 세워 ICache·IFU에 내주고, 커밋·리다이렉트를 BPU에 되돌린다.", ["FtqSize 64 (ftq/FtqParameters.scala:23)"], "frontend/ftq/Ftq.scala", 64, "ch04-fetch.html", "4장"],
    ["ICache", "Frontend", 248, 30, 112, "명령어 바이트를 공급하는 L1 명령어 캐시.", ["256 set × 4 way × 64B = 64KB", "페치 MSHR 4, 프리페치 MSHR 10 (icache/Parameters.scala:29-38)"], "frontend/icache/ICache.scala", 36, "ch04-fetch.html", "4장"],
    ["Ifu", "Frontend", 12, 76, 112, "받은 바이트를 명령어로 자르고 예측을 검사한다.", ["FetchBlockSize 64B (FrontendParameters.scala:28)", "페이지 경계를 넘는 페치는 지원하지 않음 (Parameters.scala:224 주석)"], "frontend/ifu/Ifu.scala", 48, "ch04-fetch.html", "4장"],
    ["IBuffer", "Frontend", 130, 76, 112, "명령어를 쌓아 두고 백엔드에 한 사이클 8개씩 넘긴다.", ["Size 48, 쓰기 뱅크 4, 읽기 뱅크 8 (ibuffer/Parameters.scala:23-25)", "출력 cfVec = DecodeWidth 8 (Bundle.scala:430)"], "frontend/ibuffer/IBuffer.scala", 41, "ch04-fetch.html", "4장"],
    ["ITLB", "Frontend", 248, 76, 112, "명령어 가상 주소를 물리 주소로 바꾼다. 미스는 L2TLB로 간다.", ["48 way (Parameters.scala:222)", "포트 1개 (Parameters.scala:224)"], "frontend/Frontend.scala", 194, "ch10-cache-mmu.html", "10장"],
    ["DecodeStage", "Backend", 12, 152, 83, "명령어를 uop으로 해석한다(CtrlBlock 안).", ["DecodeWidth 8 (Parameters.scala:81)"], "backend/vector/Decoder/DecodeStage.scala", 18, "ch05-decode-rename.html", "5장"],
    ["Rename", "Backend", 99, 152, 83, "아키텍처 레지스터를 물리 레지스터로 바꾸고 프리 리스트를 관리한다.", ["RenameWidth 8, 스냅샷 4 (Parameters.scala:82, :88)", "정수 프리 리스트 223칸 (Rename.scala:117)"], "backend/rename/Rename.scala", 43, "ch05-decode-rename.html", "5장"],
    ["Dispatch", "Backend", 186, 152, 83, "uop을 이슈 큐, ROB, LSQ에 나눠 넣는다.", ["ROB 입장 요청은 레지스터 1단 (CtrlBlock.scala:797)"], "backend/dispatch/Dispatch.scala", 53, "ch06-dispatch-issue.html", "6장"],
    ["Rob", "Backend", 273, 152, 87, "프로그램 순서 장부. 완료된 것을 순서대로 커밋하고 예외를 처리한다.", ["RobSize 352, RabSize 352 (Parameters.scala:114-115)", "CommitWidth 8, 8뱅크 (Parameters.scala:83, Rob.scala:173)"], "backend/rob/Rob.scala", 54, "ch08-rob-redirect.html", "8장"],
    ["Region", "Backend", 12, 198, 112, "정수 구역: 이슈 큐 → 레지스터 읽기 → 실행 → 라이트백.", ["이슈 큐 13개, 실행 유닛 16개: ALU0-5, BJU0-2, LDU0-2, STA0-1, STD0-1 (Parameters.scala:341-452)", "정수 물리 레지스터 224, 4뱅크 (Parameters.scala:121-125)"], "backend/Region.scala", 40, "ch07-execute.html", "6장 · 7장"],
    ["FltRegion", "Backend", 130, 198, 112, "부동소수 구역.", ["FEX0-3 (Parameters.scala:456 이후)", "FP 물리 레지스터 256 (Parameters.scala:127-128)"], "backend/float/FltRegionModule.scala", 45, "ch07-execute.html", "7장"],
    ["VecRegion", "Backend", 248, 198, 112, "벡터 구역(RVV).", ["VFEX0-3, VSTD0-1", "VLEN 128 (Parameters.scala:53), 벡터 물리 레지스터 128"], "backend/vector/VecRegionModule.scala", 40, "ch11-vector.html", "11장"],
    ["NewLoadUnit", "MemBlock", 12, 280, 83, "로드 파이프라인. 주소 변환, DCache 읽기, 스토어 포워딩.", ["LoadPipelineWidth 3 (Parameters.scala:166)", "MemBlock.scala:512에서 LduCnt개 생성"], "mem/pipeline/NewLoadUnit.scala", 2062, "ch09-loadstore.html", "9장"],
    ["NewStoreUnit", "MemBlock", 99, 280, 83, "스토어 주소 파이프라인. 데이터는 StdExeUnit이 따로 받는다.", ["StorePipelineWidth 2 (Parameters.scala:167)", "StdExeUnit × StdCnt (MemBlock.scala:513-514)"], "mem/pipeline/NewStoreUnit.scala", 887, "ch09-loadstore.html", "9장"],
    ["LsqWrapper", "MemBlock", 186, 280, 83, "로드 큐와 스토어 큐. 메모리 순서 위반을 찾는다.", ["LQ 120, RAR 96, RAW 56, Replay 120 (Parameters.scala:101-105)", "SQ 64 × 2 (Parameters.scala:109-110)"], "mem/lsqueue/LSQWrapper.scala", 86, "ch09-loadstore.html", "9장"],
    ["Sbuffer", "MemBlock", 273, 280, 87, "커밋된 스토어를 모아 DCache에 쓴다.", ["StoreBufferSize 16, 비우기 임계 9 (Parameters.scala:176-177)"], "mem/sbuffer/Sbuffer.scala", 191, "ch09-loadstore.html", "9장"],
    ["DCacheWrapper", "MemBlock", 12, 326, 112, "L1 데이터 캐시.", ["DefaultConfig 64KB = 256 set × 4 way (Configs.scala:300, :587)", "miss 16, probe 8, release 18 엔트리 (Parameters.scala:281-283)"], "cache/dcache/DCacheWrapper.scala", 1859, "ch10-cache-mmu.html", "10장"],
    ["L2TLBWrapper", "MemBlock", 130, 326, 112, "ITLB·DTLB 미스를 받아 페이지 테이블을 걷는다(PTW).", ["MemBlock.scala:332에서 생성, ITLB와도 연결 (XSCore.scala:221)"], "cache/mmu/L2TLB.scala", 1232, "ch10-cache-mmu.html", "10장"],
    ["PrefetcherWrapper", "MemBlock", 248, 326, 112, "데이터 프리페처 묶음.", ["StreamStride, Berti, SMS (Parameters.scala:163)"], "mem/prefetch/PrefetcherWrapper.scala", 81, "ch10-cache-mmu.html", "10장"],
    ["L2Top", "XSTile", 384, 30, 68, "코어 밖, 타일 안의 L2 묶음. L1들의 미스를 받는다.", ["CoupledL2 2MB = 4 bank × 1024 set × 8 way (Configs.scala:339, :586)", "L2Top.scala:138에서 CoupledL2 생성"], "L2Top.scala", 396, "ch10-cache-mmu.html", "10장"]
  ];
  var NS = "http://www.w3.org/2000/svg", sel = 0, nodes = [];
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e); return e;
  }
  [["Frontend", 4, 120], ["Backend", 128, 116], ["MemBlock", 256, 118]].forEach(function (g) {
    el("rect", { class: "box-grey", x: 4, y: g[1], width: 372, height: g[2], rx: 10 }, svg);
    el("text", { class: "lbl-b", x: 14, y: g[1] + 18 }, svg, g[0]);
  });
  el("rect", { class: "box-grey", x: 380, y: 4, width: 76, height: 370, rx: 10 }, svg);
  el("text", { class: "lbl-dim", x: 418, y: 395, "text-anchor": "middle" }, svg, "XSTile");
  el("text", { class: "lbl-dim", x: 190, y: 395, "text-anchor": "middle" }, svg, "XSCore = Frontend + Backend + MemBlock");
  B.forEach(function (b, i) {
    var h = b[0] === "L2Top" ? 336 : 38;
    var g = el("g", { class: "blk", tabindex: 0, role: "button", "aria-label": b[0] }, svg);
    el("rect", { class: "box", x: b[2], y: b[3], width: b[4], height: h, rx: 6 }, g);
    var t = el("text", { class: "lbl", x: b[2] + b[4] / 2, y: b[3] + (b[0] === "L2Top" ? 160 : 24), "text-anchor": "middle" }, g, b[0]);
    if (b[0].length * 7.6 > b[4] - 6) t.setAttribute("style", "font-size:" + Math.max(10, Math.floor((b[4] - 6) / b[0].length / 0.56)) + "px");
    if (b[0] === "L2Top") el("text", { class: "lbl-mono", x: b[2] + b[4] / 2, y: b[3] + 184, "text-anchor": "middle" }, g, "2MB");
    g.addEventListener("click", function () { pick(i); });
    g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(i); } });
    nodes.push(g);
  });
  function pick(i) {
    sel = (i + B.length) % B.length;
    var b = B[sel];
    nodes.forEach(function (g, j) { g.querySelector("rect").setAttribute("class", j === sel ? "box-acc" : "box"); });
    var path = "src/main/scala/xiangshan/" + b[7];
    document.getElementById("blk-info").innerHTML = "<h4><code>" + b[0] + "</code> · " + b[1] + "</h4><p style=\"margin:0\">" + b[5] + "</p><ul>" +
      b[6].map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul>" +
      '<div class="src"><a href="' + GH + path + "#L" + b[8] + '" target="_blank" rel="noopener">' + path + ":" + b[8] + "</a></div>" +
      '<p style="margin:6px 0 0"><a href="' + b[9] + '">' + b[10] + "에서 자세히</a></p>";
    document.getElementById("blk-ro-name").textContent = b[0];
    document.getElementById("blk-ro-grp").textContent = b[1];
    document.getElementById("blk-ro-ch").textContent = b[10];
  }
  document.getElementById("blk-prev").addEventListener("click", function () { pick(sel - 1); });
  document.getElementById("blk-next").addEventListener("click", function () { pick(sel + 1); });
  pick(0);
})();

/* ---------- G. config 탐색기 ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-cfg");
  if (!root) return;
  var L1 = [16, 32, 64, 128], L2 = [128, 256, 512, 1024, 2048, 4096], BK = [1, 2, 4, 8];
  /* Configs.scala:94-96 (Minimal), :584-587 (Default) */
  var PRE = [
    { name: "DefaultConfig", l1: 2, l2: 4, bk: 2, llcMB: 32, llcWays: 16 },
    { name: "MinimalConfig", l1: 1, l2: 0, bk: 0, llcMB: 4, llcWays: 8 }
  ];
  var cur = 0, ids = ["cfg-l1", "cfg-l2", "cfg-bk"], sl = ids.map(function (i) { return document.getElementById(i); });
  function kb(n) { return n >= 1024 ? n / 1024 + "MB" : n + "KB"; }
  function fill(e) { if (window.Euiyun && Euiyun.fill) Euiyun.fill(e); }
  function render() {
    var p = PRE[cur], l1 = L1[+sl[0].value], l2 = L2[+sl[1].value], bk = BK[+sl[2].value];
    var l1s = l1 * 1024 / 4 / 64;            /* C:300  sets = n*1024/ways/64, ways = 4 */
    var l2s = l2 * 1024 / bk / 8 / 64;       /* C:339  l2sets = nKB*1024/banks/ways/64, ways = 8 */
    var llcs = p.llcMB * 1024 * 1024 / 4 / p.llcWays / 64; /* C:382 */
    document.getElementById("cfg-l1-out").textContent = kb(l1);
    document.getElementById("cfg-l2-out").textContent = kb(l2);
    document.getElementById("cfg-bk-out").textContent = bk;
    document.getElementById("cfg-table").innerHTML =
      "<tr><th>캐시</th><th class=\"num\">크기</th><th class=\"num\">way</th><th class=\"num\">bank</th><th class=\"num\">set/bank</th><th>공식</th></tr>" +
      "<tr><td>L1D</td><td class=\"num\">" + kb(l1) + "</td><td class=\"num\">4</td><td class=\"num\">1</td><td class=\"num\">" + l1s + "</td><td class=\"mono\">C:300</td></tr>" +
      "<tr><td>L2</td><td class=\"num\">" + kb(l2) + "</td><td class=\"num\">8</td><td class=\"num\">" + bk + "</td><td class=\"num\">" + l2s + "</td><td class=\"mono\">C:339</td></tr>" +
      "<tr><td>LLC</td><td class=\"num\">" + p.llcMB + "MB</td><td class=\"num\">" + p.llcWays + "</td><td class=\"num\">4</td><td class=\"num\">" + llcs + "</td><td class=\"mono\">C:382</td></tr>";
    document.getElementById("cfg-ro-l1").textContent = l1s;
    document.getElementById("cfg-ro-l2").textContent = l2s;
    document.getElementById("cfg-ro-llc").textContent = llcs;
    var same = +sl[0].value === p.l1 && +sl[1].value === p.l2 && +sl[2].value === p.bk, v = document.getElementById("cfg-verdict");
    v.className = "verdict " + (same ? "ok" : "warn");
    v.textContent = same ? p.name + " 그대로 (Configs.scala)" : p.name + "에서 바꿈: 공식만 계산, 빌드 가능 여부는 미확인";
  }
  function preset(i) {
    cur = i; var p = PRE[i];
    sl[0].value = p.l1; sl[1].value = p.l2; sl[2].value = p.bk; sl.forEach(fill); render();
  }
  sl.forEach(function (s) { s.addEventListener("input", render); });
  ch01bSeg("cfg-preset", preset);
  preset(0);
})();

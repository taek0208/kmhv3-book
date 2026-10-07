/* Chapter 10 sims 5-8: PLRU vs LRU, page walk stepper, Stride predict, Stream bit vector.
   Rules follow XiangShan @09453ff8 (MainPipe.scala, PageTableWalker.scala, L2TLB.scala, TLB.scala,
   L1StridePrefetcher.scala, L1StreamPrefetcher.scala). Tree-PLRU bit meaning is assumed (utility not checked out).
   Addresses, table PPNs and access orders are synthetic. Helpers c10seg/c10hex/c10cells come from ch10-a.js. */

/* ---------- Sim 5: one 4-way set, tree PLRU (no empty-way priority) vs true LRU ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-plru");
  if (!root) return;
  var pc = c10cells(document.getElementById("plru-p"), 4), lc = c10cells(document.getElementById("plru-l"), 4);
  var S;
  function reset() {
    S = { pw: [null, null, null, null], b: [0, 0, 0], lw: [null, null, null, null], age: [0, 0, 0, 0], t: 0,
          ph: 0, pm: 0, lh: 0, lm: 0, mark: [-1, -1], msg: "블록 버튼을 눌러 접근하세요", cls: "grey" };
    draw();
  }
  /* b0: 0 -> victim in ways 0-1, 1 -> ways 2-3; b1: victim in 0-1 pair; b2: victim in 2-3 pair (assumed encoding) */
  function pvictim() { return S.b[0] === 0 ? (S.b[1] ? 1 : 0) : (S.b[2] ? 3 : 2); }
  function ptouch(w) { if (w < 2) { S.b[0] = 1; S.b[1] = w === 0 ? 1 : 0; } else { S.b[0] = 0; S.b[2] = w === 2 ? 1 : 0; } }
  function lvictim() {
    for (var i = 0; i < 4; i++) if (S.lw[i] === null) return i;
    var v = 0; for (var j = 1; j < 4; j++) if (S.age[j] < S.age[v]) v = j; return v;
  }
  function access(x) {
    S.t++;
    var pw = S.pw.indexOf(x), lw = S.lw.indexOf(x), pe = null, le = null, out = [];
    if (pw >= 0) { S.ph++; out.push("PLRU hit way " + pw); }
    else { pw = pvictim(); S.pm++; pe = S.pw[pw]; out.push("PLRU miss → way " + pw + (pe ? " (" + pe + " 쫓아냄)" : " (빈 칸)")); S.pw[pw] = x; }
    ptouch(pw);
    if (lw >= 0) { S.lh++; out.push("LRU hit way " + lw); }
    else { lw = lvictim(); S.lm++; le = S.lw[lw]; out.push("LRU miss → way " + lw + (le ? " (" + le + " 쫓아냄)" : " (빈 칸)")); S.lw[lw] = x; }
    S.age[lw] = S.t;
    S.mark = [pw, lw];
    S.msg = x + ": " + out.join(" / ");
    S.cls = pe !== le ? "warn" : "ok";
  }
  function draw() {
    function paint(cells, ws, mark) {
      cells.forEach(function (c, i) {
        c.className = "c10-cell" + (i === mark ? " L" : ws[i] ? "" : " V");
        c.innerHTML = "<b>way " + i + "</b>" + (ws[i] || "비어 있음");
      });
    }
    paint(pc, S.pw, S.mark[0]); paint(lc, S.lw, S.mark[1]);
    document.getElementById("plru-pbits").textContent = "트리 비트 b0 b1 b2 = " + S.b.join(" ") + " → victim way " + pvictim();
    var ord = [0, 1, 2, 3].filter(function (i) { return S.lw[i]; }).sort(function (a, b) { return S.age[a] - S.age[b]; })
      .map(function (i) { return S.lw[i]; });
    document.getElementById("plru-lord").textContent = "오래된 순: " + (ord.join(" → ") || "-");
    document.getElementById("plru-ph").textContent = S.ph + " / " + S.pm;
    document.getElementById("plru-lh").textContent = S.lh + " / " + S.lm;
    document.getElementById("plru-next").textContent = "way " + pvictim() + " / way " + lvictim();
    var v = document.getElementById("plru-verdict"); v.className = "verdict " + S.cls; v.textContent = S.msg;
  }
  root.querySelectorAll("#plru-btns [data-a]").forEach(function (b) {
    b.addEventListener("click", function () { access(b.getAttribute("data-a")); draw(); });
  });
  document.getElementById("plru-seq").addEventListener("click", function () {
    reset(); "ABCDADE".split("").forEach(access); draw();
  });
  document.getElementById("plru-inv").addEventListener("click", function () {
    var was = S.pw[1];
    S.pw[1] = null; S.lw[1] = null; S.mark = [-1, -1];
    S.msg = "Probe가 way 1" + (was ? " (" + was + ")" : "") + "을 무효화. 교체 상태는 그대로 (추론)"; S.cls = "grey";
    draw();
  });
  document.getElementById("plru-reset").addEventListener("click", reset);
  reset();
})();

/* ---------- Sim 6: page walk stepper (PageTableWalker.scala:202-216, 367-386, 601; L2TLB.scala:349-353, 405-408; TLB.scala:462-463) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-walk");
  if (!root) return;
  var P = Book.bind(root, function () { reset(); });
  var mode = c10seg(document.getElementById("walk-mode"), reset);
  var op = c10seg(document.getElementById("walk-op"), reset);
  var hit = c10seg(document.getElementById("walk-hit"), reset);
  var ad = c10seg(document.getElementById("walk-ad"), reset);
  var steps = [], shown = 0;
  var SATP = 0x80000;
  function parseVa() {
    var t = String(P.wva).trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]{1,12}$/i.test(t)) return null;
    return parseInt(t, 16);
  }
  function vpn(va, i) { return Math.floor(va / Math.pow(2, 12 + 9 * i)) % 512; }
  function h(v) { return "0x" + v.toString(16); }
  /* synthetic next-table PPN for level i (deterministic) */
  function tablePpn(i, va) { return SATP + 0x100 * (4 - i) + (vpn(va, i + 1) & 0xff); }
  function build() {
    var va = parseVa();
    steps = [];
    if (va === null) return false;
    var top = mode() === 0 ? 3 : 2, hs = hit();
    var start = hs === 0 ? top : hs === 1 ? 1 : hs === 2 ? 0 : -1;
    if (hs === 3) steps.push({ lv: "-", who: "PtwCache", addr: "-", line: "-", note: "leaf PTE가 캐시에 있음: 메모리 읽기 없이 응답", mem: 0 });
    else if (start < top) steps.push({ lv: "-", who: "PtwCache", addr: "-", line: "-", note: "레벨 " + (top === start + 1 ? top : top + "~" + (start + 1)) + " PTE 캐시 hit, 레벨 " + start + " 테이블 위치를 앎", mem: 0 });
    var mem = 0;
    for (var lv = start; lv >= 0; lv--) {
      var ppn = lv === top ? SATP : tablePpn(lv, va);
      var addr = ppn * 4096 + vpn(va, lv) * 8;
      mem++;
      var who = lv >= 1 ? "PTW" : "LLPTW";
      steps.push({ lv: lv, who: who, addr: h(addr), line: h(Math.floor(addr / 64) * 64),
        note: "satp/테이블 PPN " + h(ppn) + " + VPN" + lv + "(" + vpn(va, lv) + ")×8" + (lv === 1 ? " → PtwCache로 되돌려 보냄, 캐시가 l1Hit로 LLPTW에 넘김" : lv === 0 ? " → leaf" : ""), mem: mem });
    }
    var leafPpn = 0x90000 + vpn(va, 0);
    var isSt = op() === 1, a = ad() !== 1, d = ad() !== 2;
    var pf = isSt ? (!a || !d) : !a;
    steps.push({ lv: "L1 TLB", who: "perm_check", addr: "-", line: "-", final: true, pf: pf,
      note: pf ? (isSt ? "store: A=" + (+a) + " D=" + (+d) + " → (!a || !d) → store page fault" : "load: A=0 → load page fault")
               : "권한 통과 → PA " + h(leafPpn * 4096 + va % 4096), mem: mem });
    return true;
  }
  function reset() { shown = 0; build(); draw(); }
  function draw() {
    var tbl = document.getElementById("walk-tbl"), v = document.getElementById("walk-verdict");
    if (!steps.length) { tbl.innerHTML = "<tr><td>가상주소를 16진 12자리 이하로 입력하세요</td></tr>"; v.className = "verdict bad"; v.textContent = "주소 형식 오류"; return; }
    var html = "<tr><th>#</th><th>레벨</th><th>담당</th><th>PTE 주소</th><th>64B 라인</th><th>설명</th></tr>";
    for (var i = 0; i < shown; i++) {
      var s = steps[i];
      html += "<tr><td class='num'>" + (i + 1) + "</td><td>" + s.lv + "</td><td>" + s.who + "</td><td class='num'>" + s.addr + "</td><td class='num'>" + s.line + "</td><td>" + s.note + "</td></tr>";
    }
    tbl.innerHTML = html;
    var last = shown ? steps[shown - 1] : null;
    document.getElementById("walk-mem").textContent = String(last ? last.mem : 0);
    var whos = steps.slice(0, shown).map(function (s) { return s.who; }).filter(function (w) { return w === "PTW" || w === "LLPTW"; });
    document.getElementById("walk-who").textContent = whos.length ? whos.filter(function (w, i) { return whos.indexOf(w) === i; }).join(" → ") : (shown ? "PtwCache" : "-");
    document.getElementById("walk-step").textContent = shown + " / " + steps.length;
    if (!last) { v.className = "verdict grey"; v.textContent = "다음 단계를 누르세요 (총 " + steps.length + "단계)"; }
    else if (last.final) { v.className = "verdict " + (last.pf ? "bad" : "ok"); v.textContent = last.note; }
    else { v.className = "verdict grey"; v.textContent = "진행 중: " + last.note; }
  }
  document.getElementById("walk-next").addEventListener("click", function () { if (shown < steps.length) shown++; draw(); });
  document.getElementById("walk-all").addEventListener("click", function () { shown = steps.length; draw(); });
  document.getElementById("walk-reset").addEventListener("click", reset);
  reset();
})();

/* ---------- Sim 7: Stride predict (L1StridePrefetcher.scala:40-61, 94-140, 225-262) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-stride");
  if (!root) return;
  var ran = false;
  var P = Book.bind(root, function () { if (ran) run(); });
  var pick = c10seg(document.getElementById("stride-pick"), function () { if (ran) run(); });
  var CONF_TH = 3, MAX_CONF = 7, L1R = 2, L2R = 5, BASE = 0x10000, N = 12;
  function run() {
    ran = true;
    var st = P.st, rows = [], first = -1, sent = 0, firstL1 = null;
    var e = null; /* table entry for this PC */
    for (var k = 1; k <= N; k++) {
      var va = BASE + (k - 1) * st + (P.jump && k >= 7 ? 4096 : 0);
      var r = { k: k, va: va, d: "-", conf: "", act: "" };
      if (!e) { e = { pre: va, stride: 0, conf: 0 }; r.conf = "0"; r.act = "할당 (stride 0, conf 0)"; }
      else {
        var d = va - e.pre, blk = Math.floor(Math.abs(d) / 64);
        var valid = blk !== 0 && blk !== 1, match = Math.abs(d) === e.stride && d >= 0, before = e.conf;
        var send = valid && match && before >= CONF_TH;
        r.d = String(d);
        if (valid) {
          if (match) { e.conf = Math.min(MAX_CONF, e.conf + 1); r.act = "일치"; }
          else { e.conf = Math.max(0, e.conf - 1); if (before <= 1) { e.stride = Math.abs(d); r.act = "불일치, stride ← " + Math.abs(d); } else r.act = "불일치, stride 유지"; }
        } else r.act = "|Δ|>>6 = " + blk + " → 무시";
        e.pre = va; /* ALWAYS_UPDATE_PRE_VADDR = true */
        r.conf = before + "→" + e.conf;
        if (send) {
          sent++; if (first < 0) { first = k; firstL1 = va + (st << L1R); }
          r.act += " · 요청 L1 " + c10hex(va + (st << L1R)) + ", L2 " + c10hex(va + (st << L2R)) + "*";
        }
      }
      rows.push(r);
    }
    var html = "<tr><th>#</th><th>vaddr</th><th class='num'>Δ</th><th>conf</th><th>동작</th></tr>";
    rows.forEach(function (r) { html += "<tr><td class='num'>" + r.k + "</td><td class='num'>" + c10hex(r.va) + "</td><td class='num'>" + r.d + "</td><td class='num'>" + r.conf + "</td><td>" + r.act + "</td></tr>"; });
    document.getElementById("stride-tbl").innerHTML = html;
    document.getElementById("stride-first").textContent = first < 0 ? "안 나감" : first + "번째";
    document.getElementById("stride-l1").textContent = firstL1 === null ? "-" : c10hex(firstL1);
    document.getElementById("stride-n").textContent = sent + " / " + N;
    var answers = [3, 4, 6, -1], guess = answers[pick()], out = document.getElementById("stride-out");
    var ok = guess === first;
    out.className = "verdict " + (ok ? "ok" : "bad");
    out.textContent = (ok ? "맞음: " : "틀림: ") + (first < 0 ? "간격 " + st + "B는 |Δ|>>6 ≤ 1이라 stride_valid가 거짓, 요청 없음" :
      first + "번째 접근에서 처음 요청 (갱신 전 conf ≥ 3). * L2 요청은 fdbkDegree > 0일 때만");
  }
  document.getElementById("stride-run").addEventListener("click", run);
  document.getElementById("stride-tbl").innerHTML = "<tr><th>#</th><th>vaddr</th><th class='num'>Δ</th><th>conf</th><th>동작</th></tr><tr><td colspan='5'>답을 고르고 실행하면 12번의 접근이 표로 나타난다</td></tr>";
})();

/* ---------- Sim 8: Stream bit vector (L1StreamPrefetcher.scala:16-19, 86-118, 284-286, 311-343, 390) ---------- */
(function () {
  "use strict";
  var root = document.getElementById("sim-stream");
  if (!root) return;
  var TH = 12, L1D = 64, L2D = 640, L3D = 960, REG = 0x400;
  var P = Book.bind(root, function () { reset(); });
  var pat = c10seg(document.getElementById("stream-pat"), function () { reset(); });
  var cells = c10cells(document.getElementById("stream-grid"), 16);
  var S, timer = null;
  function order() {
    var o = [];
    for (var i = 0; i < 16; i++) o.push(i);
    if (pat() === 1) o.reverse();
    if (pat() === 2) { var r = Book.rng(77); for (var j = 15; j > 0; j--) { var k = r.int(0, j), t = o[j]; o[j] = o[k]; o[k] = t; } }
    return o;
  }
  function reset() {
    stop();
    S = { ord: order(), i: 0, valid: false, bits: [], cnt: 0, active: false, decr: false, sent: 0, sentAt: [], last: null, msg: "" };
    for (var b = 0; b < 16; b++) S.bits.push(false);
    S.msg = "구역 시작 블록 " + c10hex(REG) + ". 접근 순서: " + (pat() === 0 ? "증가" : pat() === 1 ? "감소" : "무작위") +
      (P.nb ? (pat() === 1 ? " · 위 구역(+1)이 active" : " · 아래 구역(−1)이 active") : "");
    draw();
  }
  function step() {
    if (S.i >= 16) return false;
    var bit = S.ord[S.i++], nbActive = !!P.nb, can;
    /* the checkbox models region+1 present&active for decreasing order, region-1 otherwise */
    var plusOneHit = nbActive && pat() === 1;
    if (!S.valid) {
      S.valid = true; S.bits[bit] = true; S.cnt = 1; S.active = nbActive; S.decr = plusOneHit; can = true;
    } else {
      can = !S.bits[bit];
      if (can) S.cnt++;
      S.bits[bit] = true;
      if (S.cnt >= TH || nbActive) S.active = true;
      S.decr = S.decr || plusOneHit;
    }
    var send = S.active && can, blk = REG + bit, sgn = S.decr ? -1 : 1;
    if (send) {
      S.sent++; S.sentAt.push(bit); S.last = blk + sgn * L1D;
      S.msg = S.i + "번째 접근 블록 " + c10hex(blk) + " → 요청 L1 " + c10hex(blk + sgn * L1D) + "(2라인), L2 " + c10hex(blk + sgn * L2D) +
        "(4라인)*, L3 " + c10hex(blk + sgn * L3D) + "(8라인)*" + (S.decr ? " · 감소 방향" : "");
    } else {
      S.msg = S.i + "번째 접근 블록 " + c10hex(blk) + " · cnt " + S.cnt + (S.active ? "" : " < " + TH + ", 아직 비활성 → 요청 없음");
    }
    draw();
    return S.i < 16;
  }
  function draw() {
    cells.forEach(function (c, i) {
      var on = S.bits[i], sent = S.sentAt.indexOf(i) >= 0;
      c.className = "c10-cell" + (sent ? " P" : on ? " L" : "");
      c.textContent = i.toString(16);
    });
    document.getElementById("stream-cnt").textContent = S.cnt + " / " + (S.active ? "active" : "inactive");
    document.getElementById("stream-n").textContent = String(S.sent);
    document.getElementById("stream-l1").textContent = S.last === null ? "-" : c10hex(S.last);
    document.getElementById("stream-log").textContent = S.msg + (S.sent ? "  (* fdbkDegree > 0일 때)" : "");
  }
  var runBtn = document.getElementById("stream-run");
  function stop() { if (timer) { clearInterval(timer); timer = null; } if (runBtn) runBtn.textContent = "재생"; }
  runBtn.addEventListener("click", function () {
    if (timer) { stop(); return; }
    if (S.i >= 16) reset();
    runBtn.textContent = "멈춤";
    timer = setInterval(function () { if (!step()) stop(); }, 350);
  });
  document.getElementById("stream-step").addEventListener("click", function () { stop(); step(); });
  document.getElementById("stream-reset").addEventListener("click", reset);
  reset();
})();

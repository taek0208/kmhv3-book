/* Chapter 05 sims, part B: integer rename stepper (sim-ren) and move-elimination PREDICT (sim-mv). */

/* Commit-time free rule shared by both sims (RenameTable.scala:148-163):
   old_pdest(i) = arch value before the write (or an earlier port's data in the same group, same addr);
   ports without a write get old_pdest 0; after the group is written,
   need_free(i) = every arch entry != old_pdest(i) && no earlier port in the group has the same old_pdest. */
window.C5CommitGroup = function (arch, writes) {
  var olds = writes.map(function (w) {
    if (!w || !w.rd) return 0;
    var old = arch[w.rd];
    arch[w.rd] = w.p;
    return old;
  });
  /* earlier same-addr ports in the group: the loop above already chains them, since arch is updated in order */
  return olds.map(function (old, i) {
    var dup = olds.slice(0, i).indexOf(old) >= 0;
    var free = arch.every(function (v) { return v !== old; }) && !dup;
    return { old: old, free: free };
  });
};

/* sim-ren. Rules: int spec/arch RAT start all p0 (RenameTable.scala:97); free list p1..p223 (Rename.scala:117);
   canAllocate = RegNext(free after this cycle's allocation >= RenameWidth 8) (StdFreeList.scala:68, 96-98);
   in-group bypass: nearest earlier writer of the same logical reg wins (Rename.scala:684-709);
   pdest(i) = list[head + #earlier allocations] (StdFreeList.scala:82-87); rd = x0 allocates nothing. */
(function () {
  "use strict";
  var root = document.getElementById("sim-ren");
  if (!root) return;
  var W = 8, NPHYS = 224;
  var P = Book.bind(root, function () { stop(); reset(); });
  var view = document.getElementById("ren-view"), st;

  function instr(n) {
    var r = Book.rng(7000 + n);
    var rd = r.next() < 0.12 ? 0 : r.int(1, 8);
    return { rd: rd, rs1: r.int(0, 8), rs2: r.int(1, 8) };
  }
  function reset() {
    var free = [];
    for (var p = 1; p < NPHYS; p++) free.push(p);
    st = { cyc: 0, n: 0, spec: new Array(32).fill(0), arch: new Array(32).fill(0), free: free,
           can: true, inflight: [], groups: 0, stall: 0, last: null, lastFreed: [], stalled: false };
    render();
  }
  function step() {
    st.cyc++; st.lastFreed = [];
    var g = st.inflight[0];
    if (g && st.cyc - g.cyc >= P.lag) {
      st.inflight.shift();
      var res = C5CommitGroup(st.arch, g.uops.map(function (u) { return u.rd ? { rd: u.rd, p: u.pdest } : null; }));
      res.forEach(function (r) { if (r.free) { st.free.push(r.old); st.lastFreed.push(r.old); } });
    }
    st.stalled = !st.can;
    if (st.can) {
      var uops = [], local = {};
      for (var i = 0; i < W; i++) {
        var x = instr(st.n++), u = { rd: x.rd, rs1: x.rs1, rs2: x.rs2 };
        u.byp1 = x.rs1 !== 0 && local[x.rs1] !== undefined;
        u.byp2 = local[x.rs2] !== undefined;
        u.p1 = x.rs1 === 0 ? 0 : (u.byp1 ? local[x.rs1] : st.spec[x.rs1]);
        u.p2 = u.byp2 ? local[x.rs2] : st.spec[x.rs2];
        if (x.rd) { u.pdest = st.free.shift(); local[x.rd] = u.pdest; }
        uops.push(u);
      }
      Object.keys(local).forEach(function (k) { st.spec[k] = local[k]; });
      st.inflight.push({ cyc: st.cyc, uops: uops });
      st.last = uops; st.groups++;
    } else st.stall++;
    st.can = st.free.length >= W; /* registered: used next cycle */
    render();
  }
  function cell(txt, cls) { return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + txt + "</td>"; }
  function render() {
    var h = '<table class="c5-tbl"><tr><th>#</th><th>명령</th><th>rs1→</th><th>rs2→</th><th>rd→</th></tr>';
    (st.last || []).forEach(function (u, i) {
      h += "<tr>" + cell(i) + cell("add x" + u.rd + ", x" + u.rs1 + ", x" + u.rs2) +
        cell("p" + u.p1 + (u.byp1 ? " 우회" : ""), u.byp1 ? "hl" : "") + cell("p" + u.p2 + (u.byp2 ? " 우회" : ""), u.byp2 ? "hl" : "") +
        cell(u.rd ? "p" + u.pdest : "할당 없음", u.rd ? "ok" : "bad") + "</tr>";
    });
    if (!st.last) h += '<tr><td colspan="5">아직 리네임한 그룹 없음</td></tr>';
    h += '</table><table class="c5-tbl" style="margin-top:10px"><tr><th>RAT</th>';
    for (var r = 1; r <= 8; r++) h += "<th>x" + r + "</th>";
    h += "</tr><tr><td>spec</td>";
    for (r = 1; r <= 8; r++) h += cell("p" + st.spec[r], st.spec[r] !== st.arch[r] ? "hl" : "");
    h += "</tr><tr><td>arch</td>";
    for (r = 1; r <= 8; r++) h += cell("p" + st.arch[r]);
    view.innerHTML = h + "</tr></table>";
    document.getElementById("ren-ro-cyc").textContent = st.cyc;
    document.getElementById("ren-ro-free").textContent = st.free.length;
    var can = document.getElementById("ren-ro-can");
    can.textContent = st.can ? "1" : "0"; can.className = st.can ? "ok" : "bad";
    document.getElementById("ren-ro-grp").textContent = st.groups;
    document.getElementById("ren-ro-stall").textContent = st.stall;
    var v = document.getElementById("ren-verdict");
    if (!st.cyc) { v.className = "verdict grey"; v.textContent = "대기: 프리 리스트 p1~p223, RAT 전부 p0"; }
    else if (st.stalled) { v.className = "verdict bad"; v.textContent = "스톨: 지난 사이클 빈 항목 < 8이라 그룹 전체 대기"; }
    else v.className = "verdict ok", v.textContent = "그룹 리네임" + (st.lastFreed.length ? ", 커밋으로 " + st.lastFreed.length + "개 해제" : "");
  }
  var anim = Book.loop(view, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.2) return true;
    anim.acc = 0; step();
    return st.cyc < 300;
  });
  var play = document.getElementById("ren-play");
  function stop() { anim.stop(); play.textContent = "재생"; }
  document.getElementById("ren-step").addEventListener("click", function () { stop(); step(); });
  play.addEventListener("click", function () {
    if (anim.running) stop();
    else { if (st.cyc >= 300) reset(); anim.start(); play.textContent = "일시정지"; }
  });
  document.getElementById("ren-reset").addEventListener("click", function () { stop(); reset(); });
  reset();
})();

/* sim-mv. Move = `addi rd, rs1, 0` with rd != 0 (SimpleDecodeChannel.scala:38, 170): no allocation
   (Rename.scala:459), pdest = psrc of rs1 (Rename.scala:680, 736). Commit one instruction per group and
   free with C5CommitGroup (the arch-RAT scan). The answer comes from running these rules. */
(function () {
  "use strict";
  var root = document.getElementById("sim-mv");
  if (!root) return;
  var PROG = [
    { t: "addi x5, x0, 7", rd: 5, rs1: 0, imm: 7 }, { t: "mv x6, x5", rd: 6, rs1: 5, imm: 0 },
    { t: "addi x5, x5, 1", rd: 5, rs1: 5, imm: 1 }, { t: "mv x7, x6", rd: 7, rs1: 6, imm: 0 },
    { t: "addi x6, x0, 3", rd: 6, rs1: 0, imm: 3 }, { t: "addi x7, x0, 4", rd: 7, rs1: 0, imm: 4 }
  ];
  var CIRC = ["①", "②", "③", "④", "⑤", "⑥"];
  var renamed, st;
  var getPick = C5Seg(document.getElementById("mv-choice"));

  function rename() {
    var spec = new Array(32).fill(0), next = 1;
    return PROG.map(function (x) {
      var mv = x.imm === 0 && x.rd !== 0; /* the BitPat fixes funct3 = 000 (addi) and imm = 0 */
      var p = mv ? spec[x.rs1] : next++;
      spec[x.rd] = p;
      return { t: x.t, rd: x.rd, p: p, mv: mv };
    });
  }
  function reset() {
    renamed = rename();
    st = { k: 0, arch: new Array(32).fill(0), log: [], freedAt: null, freed: [] };
    var h = "<tr><th></th><th>명령</th><th>무브</th><th>rd → 물리</th></tr>";
    renamed.forEach(function (u, i) {
      h += "<tr><td>" + CIRC[i] + "</td><td>" + u.t + "</td><td" + (u.mv ? ' class="hl">예' : ">아니오") +
        "</td><td>x" + u.rd + " → p" + u.p + (u.mv ? " (할당 없음)" : "") + "</td></tr>";
    });
    document.getElementById("mv-prog").innerHTML = h;
    renderLog();
  }
  function commitOne() {
    if (st.k >= renamed.length) return;
    var u = renamed[st.k];
    var r = C5CommitGroup(st.arch, [{ rd: u.rd, p: u.p }])[0];
    var holders = [];
    st.arch.forEach(function (v, i) { if (v === r.old) holders.push("x" + i); });
    if (r.free) { st.freed.push("p" + r.old); if (r.old === 1 && st.freedAt === null) st.freedAt = st.k + 1; }
    st.log.push({ i: st.k, x5: st.arch[5], x6: st.arch[6], x7: st.arch[7], old: r.old, free: r.free, holders: holders });
    st.k++;
  }
  function renderLog() {
    var h = "<tr><th>커밋</th><th>x5</th><th>x6</th><th>x7</th><th>old</th><th>판정</th></tr>";
    st.log.forEach(function (e) {
      h += "<tr><td>" + CIRC[e.i] + "</td><td>p" + e.x5 + "</td><td>p" + e.x6 + "</td><td>p" + e.x7 + "</td><td>p" + e.old + "</td>" +
        (e.free ? '<td class="ok">해제</td>' : '<td class="bad">보류: ' + e.holders.slice(0, 3).join(",") + (e.holders.length > 3 ? " 등" : "") + "</td>") + "</tr>";
    });
    document.getElementById("mv-log").innerHTML = st.log.length ? h : "";
    document.getElementById("mv-ro-c").textContent = st.k + " / 6";
    document.getElementById("mv-ro-save").textContent = renamed.filter(function (u) { return u.mv; }).length;
    document.getElementById("mv-ro-free").textContent = st.freed.length ? st.freed.join(", ") : "-";
  }
  document.getElementById("mv-step").addEventListener("click", function () { commitOne(); renderLog(); });
  document.getElementById("mv-reset").addEventListener("click", function () {
    reset();
    var out = document.getElementById("mv-out");
    out.className = "verdict grey"; out.textContent = "아직 실행하지 않음";
  });
  document.getElementById("mv-run").addEventListener("click", function () {
    while (st.k < renamed.length) commitOne();
    renderLog();
    var map = { 3: 0, 5: 1, 6: 2 }, actual = st.freedAt === null ? 3 : (map[st.freedAt] !== undefined ? map[st.freedAt] : -1);
    var pick = getPick(), out = document.getElementById("mv-out");
    var label = st.freedAt === null ? "해제 안 됨" : CIRC[st.freedAt - 1] + " 커밋 때 해제";
    out.className = "verdict " + (pick === actual ? "ok" : "warn");
    out.textContent = (pick === actual ? "맞았다. " : "빗나갔다. ") + "실제: p1은 " + label + ". 그 전까지는 arch RAT의 다른 이름이 p1을 가리켰다.";
  });
  reset();
})();

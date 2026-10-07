/* Chapter 05 sims, part C: snapshot vs RAB-walk recovery length (sim-rec).
   Snapshot creation (Rename.scala:767-771, CtrlBlock.scala:775-780): a group creates one when
   (head - lastSnapshotHead >= RobCommitWidth*4 = 32 || no snapshot) && !lastCycleCreateSnpt
   && some uop in the group is FuType.jmp && the queue (RenameSnapshotNum = 4) is not full.
   Selection (CtrlBlock.scala:644-657): youngest valid snapshot with head < R, or head == R && !flushItself.
   Walk: from the snapshot head (or from the commit point C) through R; RabCommitWidth = 8 entries per cycle. */
(function () {
  "use strict";
  var root = document.getElementById("sim-rec");
  if (!root) return;
  var GROUP = 8, DIST = 8 * 4, QUEUE = 4, ROB = 352, WALKW = 8;
  var enable = true, res;
  var P = Book.bind(root, function () { calc(); cv.redraw(); show(); });
  C5Seg(document.getElementById("rec-seg"), function (i) { enable = i === 0; calc(); cv.redraw(); show(); });
  var cv = Book.canvas(document.getElementById("rec-cv"), draw);

  function calc() {
    var R = Math.round(P.r), per = Math.round(P.p), snaps = [], lastHead = null, lastCreated = false, jumps = [];
    for (var j = per - 1; j < ROB; j += per) jumps.push(j);
    for (var h = 0; h < ROB; h += GROUP) {
      var hasJump = jumps.some(function (x) { return x >= h && x < h + GROUP; });
      var allow = enable && (lastHead === null || h - lastHead >= DIST) && !lastCreated;
      var create = allow && hasJump && snaps.length < QUEUE; /* head is stalled: nothing dequeues */
      if (create) { snaps.push(h); lastHead = h; }
      lastCreated = create;
    }
    var sel = null;
    for (var k = snaps.length - 1; k >= 0; k--) if (snaps[k] <= R) { sel = k; break; }
    var walk = sel === null ? R + 1 : R - snaps[sel] + 1;
    res = { R: R, jumps: jumps, snaps: snaps, sel: sel, walk: walk, arch: R + 1 };
  }

  function draw(ctx, w, h) {
    if (!res) calc();
    var L = 16, Rr = w - 16, x = function (i) { return L + (i / ROB) * (Rr - L); };
    var dim = Book.css("text-dim"), acc = Book.css("accent"), bad = Book.css("bad"), warn = Book.css("warn");
    var yAxis = 64, ySnap = 104, yS = 168, yA = 222;
    Book.text(ctx, "robIdx 0 (C) → 351", L, 16, { size: 12, color: dim });
    ctx.save(); ctx.strokeStyle = Book.css("border"); ctx.lineWidth = 1;
    for (var g = 0; g <= ROB; g += GROUP) { ctx.beginPath(); ctx.moveTo(x(g), yAxis - 4); ctx.lineTo(x(g), yAxis + 4); ctx.stroke(); }
    ctx.strokeStyle = Book.css("text-dim"); ctx.beginPath(); ctx.moveTo(L, yAxis); ctx.lineTo(Rr, yAxis); ctx.stroke(); ctx.restore();
    ctx.fillStyle = warn;
    res.jumps.forEach(function (j) { ctx.beginPath(); ctx.arc(x(j), yAxis - 12, 2.5, 0, 7); ctx.fill(); });
    Book.text(ctx, "점: 점프 uop", L, 36, { size: 11, color: dim });
    res.snaps.forEach(function (s, i) {
      var sx = x(s), on = i === res.sel;
      ctx.fillStyle = on ? acc : Book.css("text-faint");
      ctx.beginPath(); ctx.moveTo(sx, ySnap - 14); ctx.lineTo(sx + 7, ySnap); ctx.lineTo(sx - 7, ySnap); ctx.closePath(); ctx.fill();
      Book.text(ctx, "S" + (i + 1), sx, ySnap + 12, { size: 11, color: on ? acc : dim, align: "center", mono: true });
    });
    if (!res.snaps.length) Book.text(ctx, "스냅샷 없음", L, ySnap - 4, { size: 12, color: dim });
    var rx = x(res.R);
    ctx.save(); ctx.strokeStyle = bad; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, yAxis - 22); ctx.lineTo(rx, yA + 18); ctx.stroke(); ctx.restore();
    Book.text(ctx, "R=" + res.R, Math.min(rx + 4, w - 52), yAxis - 30, { size: 12, color: bad, mono: true });
    var s0 = res.sel === null ? null : res.snaps[res.sel];
    Book.text(ctx, "스냅샷 경로", L, yS - 20, { size: 12, color: dim });
    if (s0 !== null) Book.roundRect(ctx, x(s0), yS - 9, Math.max(3, rx - x(s0)), 18, 4, Book.css("accent-soft"), acc);
    else Book.text(ctx, "쓸 스냅샷 없음 → arch 경로", L, yS, { size: 12, color: bad });
    Book.text(ctx, "arch 경로 (C부터)", L, yA - 20, { size: 12, color: dim });
    Book.roundRect(ctx, x(0), yA - 9, Math.max(3, rx - x(0)), 18, 4, Book.css("warn-soft"), warn);
    Book.text(ctx, "워크 " + res.walk + "항목 vs " + res.arch + "항목", L, h - 22, { size: 13, color: Book.css("text"), weight: 600 });
  }

  function show() {
    document.getElementById("rec-ro-n").textContent = res.snaps.length + " / 4";
    document.getElementById("rec-ro-s").textContent = res.sel === null ? "-" : String(res.snaps[res.sel]);
    document.getElementById("rec-ro-w").textContent = res.walk;
    document.getElementById("rec-ro-c").textContent = Math.ceil(res.walk / WALKW);
    document.getElementById("rec-ro-a").textContent = res.arch + " (" + Math.ceil(res.arch / WALKW) + "사이클)";
    var v = document.getElementById("rec-verdict");
    if (res.sel === null) { v.className = "verdict warn"; v.textContent = (enable ? "R 이전 스냅샷 없음" : "스냅샷 꺼짐") + ": arch RAT에서 " + res.arch + "항목 워크"; }
    else { v.className = "verdict ok"; v.textContent = "S" + (res.sel + 1) + "(head " + res.snaps[res.sel] + ") 사용: " + res.walk + "항목 워크"; }
  }
  calc(); show();
})();

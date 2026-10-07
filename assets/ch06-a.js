/* ch06-a.js: 6장 시뮬레이터 A(디스패치 분산), B(웨이크업-셀렉트 사슬), C(에이지 매트릭스 PREDICT).
   모든 입력은 합성 데이터다. 규칙과 상수는 XiangShan @09453ff8 코드에서 가져왔다. */

/* A. 디스패치: ALU uop를 6개 ALU 이슈 큐에 나누기
   - 큐 크기 18,18,18,20,20,20 (Parameters.scala:344-380), numEnq 2
   - k번째 ALU uop -> 정렬의 (k % 6)번째 큐 (Dispatch.scala:499), 정렬 규칙은 sortedIQ 주석
   - 한 큐에 같은 사이클 최대 numEnq개, 큐가 안 받으면 0개, 막힌 uop 뒤는 모두 막힘 (Dispatch.scala:584, 643-649)
   - 그룹의 uop가 모두 나가야 다음 그룹 (Dispatch.scala:165)
   - opt 켬이면 막힌 uop를 다음 사이클에 다시 고른다 (Dispatch.scala:570-576) */
(function () {
  "use strict";
  var root = document.getElementById("sim-disp");
  if (!root) return;
  var CAP = [18, 18, 18, 20, 20, 20], NENQ = 2, T = 300;
  var WEIGHT = [0, 0.9, 0.2, 0.6, 0.1, 0.8]; /* 합성: 큐마다 소비 속도가 다르다 */
  var mode = 0, res = null;
  var P = Book.bind(root, function () { run(); });
  var cv = Book.canvas(document.getElementById("disp-cv"), draw);
  var segBtns = Array.prototype.slice.call(root.querySelectorAll("#disp-mode button"));
  segBtns.forEach(function (b, i) {
    b.addEventListener("click", function () {
      mode = i;
      segBtns.forEach(function (x) { x.classList.toggle("on", x === b); });
      run();
    });
  });

  /* IQSort: 점유 오름차순, 동점이면 번호 큰 큐가 앞 (Dispatch.scala:453-468).
     opt 켬이면 그 결과를 3개씩 묶어 다시 정렬하고, 동점이면 묶음 안 순서가 뒤집힌다
     (IQSortUpdate, :474-496, 499). 단순화: 재정렬에 이번 그룹 배정 수를 더하지 않는다. */
  function sortedIQ(occ, opt) {
    var idx = [0, 1, 2, 3, 4, 5];
    idx.sort(function (a, b) { return occ[a] - occ[b] || b - a; });
    if (!opt) return idx;
    return [0, 3].reduce(function (out, s) {
      var seg = [s, s + 1, s + 2];
      seg.sort(function (a, b) { return occ[idx[a]] - occ[idx[b]] || b - a; });
      return out.concat(seg.map(function (k) { return idx[k]; }));
    }, []);
  }

  function simulate() {
    var rng = Book.rng(606);
    var p = WEIGHT.map(function (w) { return 0.95 - P.skew * w; });
    var occ = [0, 0, 0, 0, 0, 0], sum = [0, 0, 0, 0, 0, 0], pend = [];
    var fired = 0, stall = 0, groups = 0;
    for (var t = 0; t < T; t++) {
      var snap = occ.slice();
      /* 단순화: "빈칸 2개 이상이면 받는다" (Dispatch.scala:956 주석). 실제 enq.ready는 5절 규칙 */
      var ready = CAP.map(function (c, i) { return c - snap[i] >= NENQ; });
      var ord = sortedIQ(snap, mode === 0);
      if (pend.length === 0) {
        groups += 1;
        for (var k = 0; k < P.n; k++) pend.push({ iq: mode === 2 ? k % 6 : ord[k % 6] });
      } else if (mode === 0) {
        pend.forEach(function (u, j) { u.iq = ord[j % 6]; });
      }
      /* uopBlockByIQ는 앞 uop부터 센 누적 수라서, 한 uop가 막히면 뒤 uop도 모두 막힌다 (Dispatch.scala:584, 644, 649) */
      var cnt = [0, 0, 0, 0, 0, 0], left = [], blocked = false;
      pend.forEach(function (u) {
        cnt[u.iq] += 1;
        if (!ready[u.iq] || cnt[u.iq] > NENQ) blocked = true;
        if (blocked) left.push(u); else { occ[u.iq] += 1; fired += 1; }
      });
      if (left.length) stall += 1;
      pend = left;
      for (var i = 0; i < 6; i++) {
        if (snap[i] > 0 && rng.next() < p[i]) occ[i] -= 1;
        sum[i] += occ[i];
      }
    }
    var avg = sum.map(function (s) { return s / T; });
    return { avg: avg, thr: fired / T, stall: stall / T, groups: groups, p: p };
  }

  function run() { res = simulate(); cv.redraw(); show(); }

  function draw(ctx, w, h) {
    if (!res) res = simulate();
    var f = Book.frame(ctx, w, h, { x: [0, 6], y: [0, 20], xticks: 6, yticks: 4, xlabel: "ALU 이슈 큐", ylabel: "평균 점유 칸", xfmt: function () { return ""; }, yfmt: function (v) { return v.toFixed(0); } });
    for (var i = 0; i < 6; i++) {
      var x0 = f.x(i + 0.18), x1 = f.x(i + 0.82);
      var y = f.y(res.avg[i]);
      Book.roundRect(ctx, x0, y, x1 - x0, f.y(0) - y, 3, Book.css("accent"), null);
      ctx.save(); ctx.strokeStyle = Book.css("bad"); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0 - 3, f.y(CAP[i] - NENQ)); ctx.lineTo(x1 + 3, f.y(CAP[i] - NENQ)); ctx.stroke(); ctx.restore();
      Book.text(ctx, "ALU" + i, (x0 + x1) / 2, f.box.y1 + 12, { size: 11, align: "center", mono: true, color: Book.css("text-dim") });
      Book.text(ctx, "p=" + res.p[i].toFixed(2), (x0 + x1) / 2, y - 9, { size: 10, align: "center", mono: true, color: Book.css("text-dim") });
    }
  }

  function show() {
    document.getElementById("disp-thr").firstChild.textContent = res.thr.toFixed(2);
    document.getElementById("disp-stall").textContent = (res.stall * 100).toFixed(1) + "%";
    var mx = Math.max.apply(null, res.avg), mn = Math.min.apply(null, res.avg);
    document.getElementById("disp-spread").textContent = (mx - mn).toFixed(1);
    document.getElementById("disp-groups").textContent = String(res.groups);
    var v = document.getElementById("disp-verdict");
    var name = ["opt 켬", "opt 끔", "슬롯 고정(가상)"][mode];
    if (res.stall > 0.3) { v.className = "verdict bad"; v.textContent = name + ": 사이클의 " + (res.stall * 100).toFixed(0) + "%에서 그룹이 막힌다"; }
    else if (res.stall > 0.05) { v.className = "verdict warn"; v.textContent = name + ": 가끔 막힌다 (" + (res.stall * 100).toFixed(0) + "%)"; }
    else { v.className = "verdict ok"; v.textContent = name + ": 거의 막히지 않는다"; }
  }
  run();
})();

/* B. 웨이크업-셀렉트 사슬 (I1 -> I2 -> I3 -> I4 -> I5, 각자 앞 uop 결과를 쓴다)
   - 생산자가 T에 선택되면 웨이크업은 T + 지연 + 1에 도착 (MultiWakeupQueue.scala:44-47, 한 단 레지스터)
   - comp/enq 칸은 도착한 사이클에 바로 선택 가능 (EntryBundles.scala:474-475 canIssueBypass)
   - simp 칸은 srcState 레지스터에 적힌 다음 사이클부터 (EntryBundles.scala:41, 387)
   - 지연: Alu 0 (FuConfig.scala:343), Mul 2 (FuConfig.scala:364) */
(function () {
  "use strict";
  var root = document.getElementById("sim-wake");
  if (!root) return;
  var SCN = [
    { name: "ALU 사슬", fu: ["alu", "alu", "alu", "alu", "alu"], lat: [0, 0, 0, 0, 0] },
    { name: "MUL 섞기", fu: ["alu", "mul", "alu", "alu", "mul"], lat: [0, 2, 0, 0, 2] }
  ];
  var NCOL = 12, scn = 0, cur = 0;
  var simpBox = document.getElementById("wake-simp");
  var scrub = document.getElementById("wake-t");
  var segBtns = Array.prototype.slice.call(root.querySelectorAll("#wake-scn button"));
  segBtns.forEach(function (b, i) {
    b.addEventListener("click", function () {
      scn = i; segBtns.forEach(function (x) { x.classList.toggle("on", x === b); });
      reset();
    });
  });

  function plan() {
    var s = SCN[scn], simp = simpBox.checked, sel = [0], rdy = [0];
    for (var i = 1; i < 5; i++) {
      rdy[i] = sel[i - 1] + s.lat[i - 1] + 1;
      sel[i] = rdy[i] + (simp ? 1 : 0);
    }
    return { sel: sel, rdy: rdy, s: s };
  }

  function render() {
    var pl = plan(), html = "<tr><th class=\"rl\">uop</th>";
    for (var c = 0; c < NCOL; c++) html += "<th class=\"" + (c === cur ? "now" : "") + "\">" + c + "</th>";
    html += "</tr>";
    for (var i = 0; i < 5; i++) {
      html += "<tr><th class=\"rl\">I" + (i + 1) + " " + pl.s.fu[i] + "(" + pl.s.lat[i] + ")</th>";
      for (c = 0; c < NCOL; c++) {
        var txt = "", cls = "";
        if (c <= cur) {
          var isW = i > 0 && c === pl.rdy[i], isS = c === pl.sel[i];
          if (isW && isS) { txt = "W·S"; cls = "s"; }
          else if (isS) { txt = "S"; cls = "s"; }
          else if (isW) { txt = "W"; cls = "w"; }
          else if (c < pl.sel[i]) { txt = (i > 0 && c > pl.rdy[i]) ? "r" : "·"; cls = "f"; }
        }
        if (c === cur) cls += " now";
        html += "<td class=\"" + cls + "\">" + txt + "</td>";
      }
      html += "</tr>";
    }
    document.getElementById("wake-grid").innerHTML = html;
    var done = pl.sel.filter(function (x) { return x <= cur; }).length;
    var gaps = [];
    for (i = 1; i < 5; i++) gaps.push(pl.sel[i] - pl.sel[i - 1]);
    document.getElementById("wake-cyc").textContent = String(cur);
    document.getElementById("wake-done").textContent = done + " / 5";
    document.getElementById("wake-last").firstChild.textContent = String(pl.sel[4]);
    document.getElementById("wake-gaps").textContent = gaps.join(", ");
    var v = document.getElementById("wake-verdict");
    var b2b = gaps.every(function (g, k) { return g === pl.s.lat[k] + 1; });
    v.className = "verdict " + (b2b ? "ok" : "warn");
    v.textContent = b2b ? "도착한 사이클에 바로 선택: 간격 = 지연 + 1" : "도착 다음 사이클에 선택: 간격마다 1사이클 손해";
    document.getElementById("wake-tout").textContent = String(cur);
  }

  function setCur(t) { cur = Math.max(0, Math.min(NCOL - 1, t)); scrub.value = cur; if (window.Euiyun) Euiyun.fill(scrub); render(); }
  function reset() { anim.stop(); setCur(0); }
  var anim = Book.loop(root, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.45) return true;
    anim.acc = 0;
    setCur(cur + 1);
    return cur < NCOL - 1;
  });
  scrub.addEventListener("input", function () { anim.stop(); setCur(parseInt(scrub.value, 10)); });
  simpBox.addEventListener("change", function () { render(); });
  document.getElementById("wake-step").addEventListener("click", function () { anim.stop(); setCur(cur + 1); });
  document.getElementById("wake-play").addEventListener("click", function () { if (cur >= NCOL - 1) setCur(0); anim.start(); });
  document.getElementById("wake-reset").addEventListener("click", reset);
  setCur(0);
})();

/* C. 에이지 매트릭스 PREDICT
   - age(i)(j)는 상삼각만 저장; 같은 사이클 진입이면 앞 포트가 더 오래 (AgeDetector.scala:61-80)
   - i만 들어오면 행 i = false, j만 들어오면 true (AgeDetector.scala:73-79)
   - out(i) = canIssue(i) && AND_j(age(i,j) | ~canIssue(j)) (AgeDetector.scala:92-96) */
(function () {
  "use strict";
  var root = document.getElementById("sim-age");
  if (!root) return;
  var N = 6;
  /* 합성 진입 이력: 사이클마다 [포트0 칸, 포트1 칸] */
  var HIST = [[3, 1], [5], [0, 4], [2]];
  var age = [];
  for (var i = 0; i < N; i++) { age.push([]); for (var j = 0; j < N; j++) age[i].push(false); }
  function getAge(r, c) { return r < c ? age[r][c] : (r === c ? true : !age[c][r]); }
  HIST.forEach(function (ports) {
    var port = function (x) { return ports.indexOf(x); };
    var next = age.map(function (row) { return row.slice(); });
    for (var r = 0; r < N; r++) {
      for (var c = r + 1; c < N; c++) {
        var ei = port(r) >= 0, ej = port(c) >= 0;
        if (ei && ej) next[r][c] = !(port(c) < port(r));
        else if (ei) next[r][c] = false;
        else if (ej) next[r][c] = true;
      }
    }
    age = next;
  });
  function oldest(can) {
    var out = [];
    for (var r = 0; r < N; r++) {
      var ok = can[r];
      for (var c = 0; c < N; c++) ok = ok && (getAge(r, c) || !can[c]);
      if (ok) out.push(r);
    }
    return out;
  }
  var can = [false, false, true, false, true, true];
  var checked = false;
  var PICK = [2, 4, 5];
  var pickBtns = Array.prototype.slice.call(root.querySelectorAll("#age-pick button"));
  pickBtns.forEach(function (b) {
    b.addEventListener("click", function () { pickBtns.forEach(function (x) { x.classList.toggle("on", x === b); }); });
  });
  var rdyBtns = Array.prototype.slice.call(root.querySelectorAll("#age-rdy button"));
  rdyBtns.forEach(function (b, k) {
    b.addEventListener("click", function () { can[k] = !can[k]; render(); });
  });

  function render() {
    rdyBtns.forEach(function (b, k) { b.classList.toggle("on", can[k]); });
    var sel = oldest(can);
    var html = "<tr><th class=\"rl\">i \\ j</th>";
    for (var c = 0; c < N; c++) html += "<th>E" + c + "</th>";
    html += "</tr>";
    for (var r = 0; r < N; r++) {
      html += "<tr><th class=\"rl\">E" + r + (can[r] ? " 준비" : "") + "</th>";
      for (c = 0; c < N; c++) {
        var v = getAge(r, c) ? 1 : 0;
        var cls = r === c ? "f" : (checked && sel[0] === r ? "s" : (v ? "w" : ""));
        html += "<td class=\"" + cls + "\">" + (checked ? v : "?") + "</td>";
      }
      html += "</tr>";
    }
    document.getElementById("age-mat").innerHTML = html;
    var order = [];
    for (r = 0; r < N; r++) order.push(r);
    order.sort(function (a, b) { return getAge(a, b) ? -1 : 1; });
    document.getElementById("age-order").textContent = checked ? order.map(function (x) { return "E" + x; }).join(" > ") : "확인 후 공개";
    document.getElementById("age-sel").textContent = checked ? (sel.length ? "E" + sel[0] : "없음") : "?";
    document.getElementById("age-cnt").textContent = String(can.filter(Boolean).length);
  }

  document.getElementById("age-run").addEventListener("click", function () {
    var k = pickBtns.findIndex(function (b) { return b.classList.contains("on"); });
    can = [false, false, true, false, true, true];
    checked = true;
    var actual = oldest(can)[0];
    var out = document.getElementById("age-out");
    var hit = PICK[k] === actual;
    out.className = "verdict " + (hit ? "ok" : "warn");
    out.textContent = (hit ? "맞았다. " : "빗나갔다. ") + "선택은 E" + actual + ": 준비된 E2·E4·E5 중 가장 먼저 들어온 칸이다. 이제 준비 버튼을 눌러 바꿔 보라.";
    render();
  });
  render();
})();

/* ch06-b.js: 6장 시뮬레이터 D(세 층 이슈 큐와 백프레셔), E(로드 miss 취소 PREDICT). 합성 데이터. */

/* D. 이슈 큐 하나 (ALU3~5 모양: 20칸 = enq 2 / simp 6 / comp 12, Parameters.scala:363-380)
   - 선택: comp > simp > enq, 영역 안에서는 먼저 들어온 칸 (IssueQueue.scala:579-583)
   - comp/enq는 웨이크업 도착 사이클에 선택 가능, simp는 다음 사이클부터 (EntryBundles.scala:474-475)
   - enq -> comp: enq 유효 수 <= comp 빈칸 && simp 전부 비었음 (Entries.scala:193)
   - enq -> simp: 아니면, enq 유효 수 <= simp 받을 수 있는 칸 (Entries.scala:194)
   - simp -> comp: 가장 오래된 2칸까지, comp 빈칸 >= idx+1 (Entries.scala:196, IssueQueue.scala:403)
   - enq.ready = (simp 빈칸 >= 2 || enq 비었음) && enq에 issued 없음 (IssueQueue.scala:1041-1056)
   - 단순화: 선택된 칸은 다음 사이클 끝에 비운다 (실제 응답 시점은 7장) */
(function () {
  "use strict";
  var root = document.getElementById("sim-fill");
  if (!root) return;
  var NE = 2, NS = 6, NC = 12, T = 60;
  var snaps = [], cur = 0;
  var P = Book.bind(root, function () { build(); setCur(cur); });
  var cv = Book.canvas(document.getElementById("fill-cv"), draw);
  var scrub = document.getElementById("fill-t");

  function cnt(a) { return a.filter(Boolean).length; }
  function clone(a) { return a.map(function (e) { return e ? Object.assign({}, e) : null; }); }

  function build() {
    var rng = Book.rng(66);
    var enq = [null, null], simp = [null, null, null, null, null, null], comp = [];
    for (var i = 0; i < NC; i++) comp.push(null);
    var stamp = 0, nextId = 1, issued = 0, dispatched = 0, stallCyc = 0;
    snaps = [];
    for (var t = 0; t < T; t++) {
      var freeSimp = NS - cnt(simp), enqValid = cnt(enq);
      var enqHasIssued = enq.some(function (e) { return e && e.iss; });
      var enqReady = (freeSimp >= 2 || enqValid === 0) && !enqHasIssued;
      if (!enqReady) stallCyc += 1;
      snaps.push({ enq: clone(enq), simp: clone(simp), comp: clone(comp), t: t, enqReady: enqReady, freeSimp: freeSimp, enqHasIssued: enqHasIssued, issued: issued, dispatched: dispatched, stallCyc: stallCyc });
      /* 1. 선택: 한 사이클 하나 (ALU 포트 하나) */
      var pick = null;
      [[comp, 0], [simp, 1], [enq, 0]].some(function (pr) {
        var best = null;
        pr[0].forEach(function (e) {
          if (e && !e.iss && e.rdy + pr[1] <= t && (!best || e.st < best.st)) best = e;
        });
        if (best) { pick = best; return true; }
        return false;
      });
      if (pick) { pick.sel = t; issued += 1; }
      /* 2. 이동 (현재 상태로 판단) */
      var freeComp = NC - cnt(comp);
      var simpEmpty = cnt(simp) === 0;
      var toComp = enqValid <= freeComp && simpEmpty;
      var movers = simp.map(function (e, k) { return e && !e.iss ? k : -1; }).filter(function (k) { return k >= 0; })
        .sort(function (a, b) { return simp[a].st - simp[b].st; }).slice(0, 2);
      var s2c = toComp ? [] : movers.filter(function (k, idx) { return freeComp >= idx + 1; });
      var simpReadyCnt = simp.filter(function (e, k) { return !e || s2c.indexOf(k) >= 0; }).length;
      var toSimp = !toComp && enqValid <= simpReadyCnt;
      var nComp = comp.slice(), nSimp = simp.slice(), nEnq = enq.slice();
      s2c.forEach(function (k) {
        var e = simp[k]; nSimp[k] = null;
        var slot = nComp.indexOf(null); e.st = stamp++; nComp[slot] = e;
      });
      enq.forEach(function (e, k) {
        if (!e || e.iss) return;
        if (toComp) { var s = nComp.indexOf(null); e.st = stamp++; nComp[s] = e; nEnq[k] = null; }
        else if (toSimp) { var s2 = nSimp.indexOf(null); e.st = stamp++; nSimp[s2] = e; nEnq[k] = null; }
      });
      /* 3. 선택된 칸 처리: 선택 사이클엔 iss 표시, 다음 사이클 끝에 비움 (단순화) */
      [nEnq, nSimp, nComp].forEach(function (arr) {
        arr.forEach(function (e, k) {
          if (!e) return;
          if (e.iss) arr[k] = null;
          else if (e.sel === t) e.iss = true;
        });
      });
      /* 4. 디스패치: enq.ready면 포트 k -> enq 칸 k */
      if (enqReady) {
        for (var p = 0; p < P.w; p++) {
          var dep = rng.next() < P.dep;
          nEnq[p] = { id: nextId++, rdy: dep ? Math.max(P.m, t + 1) : t + 1, dep: dep, iss: false, st: stamp++ };
          dispatched += 1;
        }
      }
      enq = nEnq; simp = nSimp; comp = nComp;
    }
  }

  function slotHtml(arr, t) {
    return arr.map(function (e) {
      if (!e) return "<div class=\"slot\">·</div>";
      var cls = e.iss ? "is" : (e.rdy <= t ? "rd" : "wt");
      return "<div class=\"slot " + cls + "\">" + e.id + "</div>";
    }).join("");
  }

  function draw(ctx, w, h) {
    if (!snaps.length) build();
    var f = Book.frame(ctx, w, h, { x: [0, T - 1], y: [0, 20], xticks: 6, yticks: 4, xlabel: "사이클", ylabel: "점유 칸", xfmt: function (v) { return v.toFixed(0); }, yfmt: function (v) { return v.toFixed(0); } });
    snaps.forEach(function (s) {
      if (!s.enqReady) { ctx.fillStyle = Book.css("bad-soft"); ctx.fillRect(f.x(s.t - 0.5), f.box.y0, f.x(1) - f.x(0), f.box.y1 - f.box.y0); }
    });
    Book.hline(ctx, f, 20, Book.css("bad"), "용량 20", [5, 4]);
    Book.line(ctx, snaps.map(function (s) { return [f.x(s.t), f.y(cnt(s.enq) + cnt(s.simp) + cnt(s.comp))]; }), Book.css("accent"), 2);
    Book.line(ctx, snaps.map(function (s) { return [f.x(s.t), f.y(cnt(s.comp))]; }), Book.css("accent-2"), 1.5, [4, 3]);
    Book.vline(ctx, f, cur, Book.css("text-dim"), "t=" + cur, [2, 3]);
  }

  function setCur(t) {
    cur = Math.max(0, Math.min(T - 1, t));
    scrub.value = cur; if (window.Euiyun) Euiyun.fill(scrub);
    document.getElementById("fill-tout").textContent = String(cur);
    var s = snaps[cur];
    document.getElementById("fill-enq").innerHTML = slotHtml(s.enq, cur);
    document.getElementById("fill-simp").innerHTML = slotHtml(s.simp, cur);
    document.getElementById("fill-comp").innerHTML = slotHtml(s.comp, cur);
    document.getElementById("fill-occ").textContent = cnt(s.enq) + " / " + cnt(s.simp) + " / " + cnt(s.comp);
    document.getElementById("fill-disp").textContent = String(s.dispatched);
    document.getElementById("fill-iss").textContent = String(s.issued);
    document.getElementById("fill-stall").textContent = s.stallCyc + " 사이클";
    var v = document.getElementById("fill-verdict");
    if (s.enqReady) { v.className = "verdict ok"; v.textContent = "t=" + cur + " enq.ready = 1: 디스패치를 받는다"; }
    else {
      v.className = "verdict bad";
      v.textContent = "t=" + cur + " enq.ready = 0: " + (s.enqHasIssued ? "enq 칸에 issued uop가 남아 있다" : "simp 빈칸이 " + s.freeSimp + "개뿐이다");
    }
    cv.redraw();
  }

  var anim = Book.loop(cv.ctx.canvas, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.2) return true;
    anim.acc = 0;
    setCur(cur + 1);
    return cur < T - 1;
  });
  scrub.addEventListener("input", function () { anim.stop(); setCur(parseInt(scrub.value, 10)); });
  document.getElementById("fill-step").addEventListener("click", function () { anim.stop(); setCur(cur + 1); });
  document.getElementById("fill-play").addEventListener("click", function () { if (cur >= T - 1) setCur(0); anim.start(); });
  document.getElementById("fill-reset").addEventListener("click", function () { anim.stop(); setCur(0); });
  build();
  setCur(0);
})();

/* E. 로드 miss 취소 PREDICT
   - 로드 웨이크업을 받은 소스: 자기 로드 파이프 dep := 1 (EntryBundles.scala:317-329)
   - 매 사이클 dep <<= 1 (EntryBundles.scala:233-235), 일반 생산자 웨이크업은 dep << 1을 물려준다
   - LoadShouldCancel = (ld1Cancel && dep(0)) || (ld2Cancel && dep(1)) (Bundles.scala:1838-1844), ld1Cancel = 0 (MemBlock.scala:910)
   - 취소되면 srcState와 issued가 풀린다 (EntryBundles.scala:387, 452-455)
   - 합성 정렬: 로드 웨이크업이 t=2에 IQ에 도착, ld2Cancel은 t=4 (추론, 단계 정렬은 9장) */
(function () {
  "use strict";
  var root = document.getElementById("sim-cancel");
  if (!root) return;
  var COLS = 6, WAKE = 2, CANCEL_T = 4;
  var miss = true, checked = false;
  /* uop: 이름, 소스(누구의 웨이크업), 지연 */
  var UOPS = [
    { n: "L (load)", src: null },
    { n: "b = L+1", src: 0 },
    { n: "c = b+1", src: 1 },
    { n: "d = x+1", src: -1 }
  ];
  function model(isMiss) {
    var st = UOPS.map(function () { return { sel: -1, dep: [], cancel: -1 }; });
    st[0].sel = 0;
    st[3].sel = 2;
    for (var t = 0; t < COLS; t++) {
      for (var u = 1; u < 3; u++) {
        var s = st[u], prev = t > 0 ? s.dep[t - 1] : 0;
        var dep = prev << 1 & 3;
        if (s.cancel < 0 && s.sel < 0) {
          if (u === 1 && t === WAKE) { s.sel = t; dep = 1; }
          if (u === 2 && st[1].sel >= 0 && st[1].cancel < 0 && t === st[1].sel + 1) { s.sel = t; dep = (st[1].dep[t - 1] << 1) & 3; }
        }
        if (t > 0 && s.cancel < 0 && isMiss && t === CANCEL_T && (prev & 2)) { s.cancel = t; s.sel = -1; }
        s.dep[t] = dep;
      }
      st[0].dep[t] = 0; st[3].dep[t] = 0;
    }
    return st;
  }
  function bits(v) { return (v >> 1 & 1) + "" + (v & 1); }
  var pickBtns = Array.prototype.slice.call(root.querySelectorAll("#cx-pick button"));
  pickBtns.forEach(function (b) { b.addEventListener("click", function () { pickBtns.forEach(function (x) { x.classList.toggle("on", x === b); }); }); });
  var modeBtns = Array.prototype.slice.call(root.querySelectorAll("#cx-mode button"));
  modeBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { miss = i === 1; modeBtns.forEach(function (x) { x.classList.toggle("on", x === b); }); render(); });
  });

  function render() {
    var st = model(miss), html = "<tr><th class=\"rl\">uop</th>";
    for (var c = 0; c < COLS; c++) html += "<th>t" + c + "</th>";
    html += "</tr>";
    var cancelled = [];
    UOPS.forEach(function (u, i) {
      html += "<tr><th class=\"rl\">" + u.n + "</th>";
      var firstSel = i === 1 ? WAKE : (i === 2 ? WAKE + 1 : st[i].sel);
      for (var t = 0; t < COLS; t++) {
        var txt = "", cls = "";
        if (!checked && t >= WAKE) { txt = "?"; cls = "f"; }
        else if (i === 0) {
          if (t === 0) { txt = "S"; cls = "s"; }
          else if (t === WAKE) { txt = "W→"; cls = "w"; }
          else if (t === CANCEL_T) { txt = miss ? "miss" : "hit"; cls = miss ? "x" : "w"; }
        } else if (i === 3) {
          if (t === st[3].sel) { txt = "S 00"; cls = "s"; }
        } else {
          var reg = t > 0 ? st[i].dep[t - 1] : 0; /* 그 사이클에 레지스터에 든 dep */
          if (st[i].cancel === t) { txt = "취소 " + bits(reg); cls = "x"; }
          else if (t === firstSel) { txt = "W·S"; cls = "s"; }
          else if (st[i].cancel >= 0 && t > st[i].cancel) { txt = "대기"; cls = "f"; }
          else if (t > firstSel && reg) { txt = bits(reg); cls = ""; }
        }
        html += "<td class=\"" + cls + "\">" + txt + "</td>";
      }
      html += "</tr>";
      if (st[i].cancel >= 0) cancelled.push(u.n.split(" ")[0]);
    });
    document.getElementById("cx-grid").innerHTML = html;
    document.getElementById("cx-n").textContent = checked ? String(cancelled.length) : "?";
    document.getElementById("cx-who").textContent = checked ? (cancelled.length ? cancelled.join(", ") : "없음") : "?";
    document.getElementById("cx-d").textContent = checked ? "dep 00: 영향 없음" : "?";
    return cancelled;
  }

  document.getElementById("cx-run").addEventListener("click", function () {
    checked = true; miss = true;
    modeBtns.forEach(function (x, i) { x.classList.toggle("on", i === 1); });
    var c = render();
    var key = c.join(",");
    var actual = key === "b" ? 0 : key === "b,c" ? 1 : key === "b,c,d" ? 2 : 3;
    var k = pickBtns.findIndex(function (b) { return b.classList.contains("on"); });
    var out = document.getElementById("cx-out");
    out.className = "verdict " + (k === actual ? "ok" : "warn");
    out.textContent = (k === actual ? "맞았다. " : "빗나갔다. ") + "실제: " + pickBtns[actual].textContent + ". t4에 dep(1)이 켜진 소스만 ld2Cancel에 걸린다.";
  });
  render();
})();

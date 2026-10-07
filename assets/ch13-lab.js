/* ch13 big pipeline simulator (section 3): per-instruction Gantt F/D/R/DS/IS/OG0/OG1/EX/WB/C with a cycle
   stepper. Model and constants live in ch13-engine.js (window.KMH13). */
(function () {
  "use strict";
  var root = document.getElementById("sim-lab");
  if (!root || !window.KMH13) return;
  var K = window.KMH13;
  var $ = function (id) { return document.getElementById(id); };
  var prog = [], res = null, t = 0, preset = 0, sel = -1;

  var ta = $("lab-prog"), table = $("lab-gantt"), scrub = root.querySelector('input[data-k="t"]');
  var P = Book.bind(root, function () { run(false); });

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function run(resetT) {
    var parsed = K.parse(ta.value);
    prog = parsed.prog;
    res = K.simulate(prog, { missLat: P.miss, robOff: P.off });
    scrub.max = String(res.maxC + 1);
    if (resetT) t = res.maxC + 1;
    t = Math.min(Math.round(resetT ? t : P.t), res.maxC + 1);
    if (resetT) { scrub.value = String(t); }
    if (window.Euiyun) window.Euiyun.fill(scrub);
    P.t = t;
    root.querySelector('output[data-for="t"]').textContent = String(t);
    render();
    show(parsed.errs);
  }

  function render() {
    if (!res) return;
    var n = res.maxC + 1, h = ['<thead><tr><th class="lab">명령 \\ cycle</th>'];
    for (var c = 0; c <= n; c++) h.push('<th class="' + (c === t ? "now" : "") + '">' + c + "</th>");
    h.push("</tr></thead><tbody>");
    res.rows.forEach(function (r) {
      h.push('<tr data-i="' + r.i + '"' + (r.i === sel ? ' class="sel"' : "") + '><td class="lab" title="' + esc(r.ins.text) + '">#' + r.i + " " + esc(r.ins.text.replace(/\s+/g, " ").slice(0, 24)) + "</td>");
      for (var c2 = 0; c2 <= n; c2++) {
        var s = K.stageAt(r, c2), cls = [];
        if (s) cls.push("st-" + s[1]);
        if (c2 > t) cls.push("fut");
        if (c2 === t) cls.push("now");
        if (r.E === c2) cls.push("mp");
        h.push('<td class="' + cls.join(" ") + '">' + (s ? s[0] : "") + "</td>");
      }
      h.push("</tr>");
      res.ghosts.forEach(function (g) {
        if (g.after !== r.i) return;
        h.push('<tr><td class="lab">오경로 명령들 (E+2에 flush)</td>');
        for (var c3 = 0; c3 <= n; c3++) {
          var on = c3 >= g.from && c3 <= g.to;
          h.push('<td class="' + (on ? "st-X" : "") + (c3 > t ? " fut" : "") + (c3 === t ? " now" : "") + '">' + (on ? "x" : "") + "</td>");
        }
        h.push("</tr>");
      });
    });
    h.push("</tbody>");
    table.innerHTML = h.join("");
  }

  function show(errs) {
    var N = res.rows.length;
    var st = K.cycleStats(res, t);
    $("lab-ro-t").textContent = t;
    $("lab-ro-dsc").textContent = st.decode + " / " + st.select + " / " + st.commit;
    $("lab-ro-rob").textContent = st.rob;
    $("lab-ro-done").textContent = st.committed + " / " + N;
    var first = N ? res.rows[0].D : 0;
    $("lab-ro-last").textContent = N ? res.maxC : "-";
    $("lab-ro-ipc").textContent = N ? (N / (res.maxC - first + 1)).toFixed(2) : "-";
    var v = $("lab-verdict");
    if (errs.length) { v.className = "verdict bad"; v.textContent = errs.join(" · "); return; }
    if (!N) { v.className = "verdict grey"; v.textContent = "명령이 없다. 프리셋을 고르거나 직접 써 보자."; return; }
    var iqWait = res.rows.slice().sort(function (a, b) { return (b.S - b.DS) - (a.S - a.DS); })[0];
    var robWait = res.rows.slice().sort(function (a, b) { return (b.C - b.WB) - (a.C - a.WB); })[0];
    var msg = [];
    if (res.ghosts.length) {
      var g = res.ghosts[0], nx = res.rows[g.after + 1];
      msg.push("분기 #" + g.after + " EX " + g.E + " → 정답 경로 첫 decode " + (g.E + K.C.REDIRECT_TO_DECODE) + (nx ? ", 첫 EX " + nx.exS + " (+" + (nx.exS - g.E) + ")" : ""));
    }
    if (iqWait.S - iqWait.DS > 1) msg.push("IQ 대기 최장 #" + iqWait.i + " " + (iqWait.S - iqWait.DS - 1) + " cycle");
    if (robWait.C - robWait.WB > 1) msg.push("ROB 대기 최장 #" + robWait.i + " " + (robWait.C - robWait.WB - 1) + " cycle (" + robWait.cwhy + ")");
    if (!msg.length) msg.push("막힘 없음: 모든 명령이 최소 사이클로 지나갔다");
    v.className = "verdict " + (msg.length > 1 || res.ghosts.length ? "warn" : "ok");
    v.textContent = msg.join(" · ");
    detail();
  }

  function detail() {
    var d = $("lab-detail");
    var r = res && res.rows[sel];
    if (!r) { d.textContent = "행을 누르면 그 명령의 사이클 내역과 이유가 여기에 나온다."; return; }
    d.textContent = "#" + r.i + " " + r.ins.text.replace(/\s+/g, " ") + " · F " + r.F + " · D " + r.D + " · R " + r.R + " · DS " + r.DS +
      " · IS " + r.S + " (" + r.why + ") · EX " + r.exS + (r.exE > r.exS ? "~" + r.exE : "") + (r.X > r.exE ? " · miss 대기 ~" + r.X : "") +
      " · WB " + r.WB + " · C " + r.C + " (" + r.cwhy + ") · ROB idx " + r.robIdx + " = line " + r.line + "의 bank " + (r.robIdx % 8);
  }

  table.addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-i]");
    if (!tr) return;
    sel = +tr.getAttribute("data-i");
    render(); detail();
  });

  function setT(v) {
    t = Math.max(0, Math.min(res.maxC + 1, v));
    scrub.value = String(t);
    P.t = t;
    if (window.Euiyun) window.Euiyun.fill(scrub);
    root.querySelector('output[data-for="t"]').textContent = String(t);
    render(); show([]);
  }

  var btns = Array.prototype.slice.call($("lab-preset").querySelectorAll("button"));
  function loadPreset(i) {
    preset = i; sel = -1;
    btns.forEach(function (b, j) { b.classList.toggle("on", j === i); });
    ta.value = K.PRESETS[i].text;
    run(true);
  }
  btns.forEach(function (b, i) { b.addEventListener("click", function () { anim.stop(); loadPreset(i); }); });
  ta.addEventListener("input", function () { anim.stop(); run(true); });

  var anim = Book.loop(table, function (dt) {
    anim.acc = (anim.acc || 0) + dt;
    if (anim.acc < 0.35) return true;
    anim.acc = 0;
    setT(t + 1);
    return t < res.maxC + 1;
  });
  $("lab-step").addEventListener("click", function () { anim.stop(); setT(t >= res.maxC + 1 ? 0 : t + 1); });
  $("lab-play").addEventListener("click", function () {
    if (anim.running) { anim.stop(); return; }
    if (t >= res.maxC + 1) setT(0);
    anim.start();
  });
  $("lab-reset").addEventListener("click", function () { anim.stop(); setT(0); });
  $("lab-all").addEventListener("click", function () { anim.stop(); setT(res.maxC + 1); });

  loadPreset(0);
})();

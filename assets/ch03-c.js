/* ch03-c.js: RAS state machine. Sizes and rules from src/main/scala/xiangshan/frontend/bpu/ras/
   Parameters.scala:22-35, Ras.scala:66-113, RasStack.scala:67-422 @09453ff8. One button = one cycle;
   the 1-cycle delays of commit and redirect are omitted. Return addresses are call-site numbers. */
(function () {
  "use strict";
  var root = document.getElementById("sim-ras");
  if (!root) return;
  var QN = 32, CN = 16, CMAX = 7, NEAR = QN - 2;
  var S;
  function reset() {
    S = {
      q: [], cs: [], tosr: -1, tosw: 0, bos: 0, ssp: 0, sctr: 0, nsp: 0, /* tosr starts one before tosw */
      infl: [], truth: [], site: 1, hit: 0, ret: 0, ck: null, msg: "대기: 버튼 하나가 한 사이클이다", cls: "grey"
    };
    for (var i = 0; i < QN; i++) S.q.push({ addr: 0, ctr: 0, nos: 0 });
    for (var j = 0; j < CN; j++) S.cs.push({ addr: 0, ctr: 0 });
    render();
  }
  function m(v, n) { return ((v % n) + n) % n; }
  function inRange(r, w) { return r >= S.bos && r < w; } /* tosrInRange, RasStack.scala:89-96 */
  function top() { return inRange(S.tosr, S.tosw) ? S.q[m(S.tosr, QN)] : S.cs[S.ssp]; }
  function near() { return S.tosw - S.bos > NEAR; } /* RasStack.scala:416-422 */
  function meta() { return { ssp: S.ssp, sctr: S.sctr, tosr: S.tosr, tosw: S.tosw, nos: S.q[m(S.tosr, QN)].nos }; }

  function call(addr) {
    var mt = meta();
    S.infl.push({ type: "call", meta: mt });
    S.truth.push(addr);
    if (near()) { S.msg = "nearOverflow: tosw−bos = " + (S.tosw - S.bos) + " > 30, push를 하지 않는다 (G-R1)"; S.cls = "bad"; return; }
    var te = top();
    var same = te.addr === addr;
    S.q[m(S.tosw, QN)] = { addr: addr, ctr: same && te.ctr < CMAX ? S.sctr + 1 : 0, nos: S.tosr }; /* writeEntry */
    S.tosr = S.tosw; S.tosw++;
    if (same && S.sctr < CMAX) { S.sctr++; S.msg = "call " + addr + ": 꼭대기와 같은 주소라 sctr만 " + S.sctr + "로 올린다"; }
    else { S.ssp = m(S.ssp + 1, CN); S.sctr = 0; S.msg = "call " + addr + ": queue[" + m(S.tosr, QN) + "]에 쓰고 ssp=" + S.ssp; }
    S.cls = "ok";
  }
  function ret() {
    var pred = top().addr, exp = S.truth.length ? S.truth.pop() : null;
    S.infl.push({ type: "ret", meta: meta() });
    if (exp !== null) { S.ret++; if (pred === exp) S.hit++; }
    var tail = exp === null ? " (호출 없이 return)" : pred === exp ? " 적중" : " 틀림, 정답 " + exp;
    S.cls = exp === null ? "warn" : pred === exp ? "ok" : "bad";
    if (near()) { S.msg = "return: 예측 " + pred + tail + ". nearOverflow라 pop은 하지 않는다"; return; }
    var wasIn = inRange(S.tosr, S.tosw), nos = S.q[m(S.tosr, QN)].nos;
    if (S.sctr > 0) S.sctr--;
    else if (inRange(nos, S.tosw)) { S.ssp = m(S.ssp - 1, CN); S.sctr = S.q[m(nos, QN)].ctr; }
    else { S.ssp = m(S.ssp - 1, CN); S.sctr = S.cs[S.ssp].ctr; }
    if (wasIn) S.tosr = nos;
    S.msg = "return: 예측 " + pred + tail;
  }
  function commitOne(op) {
    var mt = op.meta, ct = S.cs[S.nsp], nspU = mt.ssp !== S.nsp ? mt.ssp : S.nsp;
    if (op.type === "call") {
      var addr = S.q[m(mt.tosw, QN)].addr; /* commitPushAddr = specQueue(metaTosw) */
      if (ct.ctr < CMAX && ct.addr === addr) { S.cs[nspU].ctr = ct.ctr + 1; S.nsp = nspU; }
      else { S.nsp = m(nspU + 1, CN); S.cs[S.nsp] = { addr: addr, ctr: 0 }; }
      S.bos = mt.tosw;
      return;
    }
    if (op.type === "ret") {
      if (ct.ctr > 0) { S.cs[nspU].ctr = ct.ctr - 1; S.nsp = nspU; } else S.nsp = m(nspU - 1, CN);
    }
    if (mt.tosw - S.bos > 2) S.bos = mt.tosw - 1;
  }
  function commitAll() {
    var n = S.infl.length;
    S.infl.forEach(commitOne);
    S.infl = []; S.ck = null;
    S.msg = n + "개 커밋: commit stack에 반영하고 bos=" + S.bos; S.cls = n ? "ok" : "grey";
  }
  function mark() {
    var mt = meta();
    S.infl.push({ type: "br", meta: mt });
    S.ck = { meta: mt, n: S.infl.length, truth: S.truth.slice() };
    S.msg = "조건 분기 예측: 이 시점의 tosr/tosw/ssp/sctr를 meta로 저장"; S.cls = "grey";
  }
  function redirect() {
    if (!S.ck) { S.msg = "체크포인트가 없다: 먼저 '분기 예측'을 누른다"; S.cls = "warn"; return; }
    var mt = S.ck.meta;
    if (!(mt.tosw < S.tosw || !near())) { S.msg = "nearOverflow이고 redirect tosw가 앞서지 않아 받지 않는다"; S.cls = "bad"; return; }
    var dropped = S.infl.length - S.ck.n;
    S.tosr = mt.tosr; S.tosw = mt.tosw; S.ssp = mt.ssp; S.sctr = mt.sctr; /* RasStack.scala:389-393 */
    S.infl = S.infl.slice(0, S.ck.n); S.truth = S.ck.truth; S.ck = null;
    S.msg = "redirect: 포인터만 되돌림. 틀린 경로 연산 " + dropped + "개가 버려졌다 (G-R2)"; S.cls = "ok";
  }

  function cell(txt, ctr, cls) {
    return "<div class=\"ras-cell " + cls + "\">" + txt + "<br>" + ctr + "</div>";
  }
  function render() {
    var live = {}, p;
    for (p = S.bos; p < S.tosw; p++) live[m(p, QN)] = true;
    var tin = inRange(S.tosr, S.tosw), rows = ["", ""];
    for (var i = 0; i < QN; i++) {
      var e = S.q[i], c = live[i] ? "live" : "";
      if (tin && m(S.tosr, QN) === i) c += " top";
      if (m(S.tosw, QN) === i) c += " w";
      if (m(S.bos, QN) === i) c += " b";
      rows[i < 16 ? 0 : 1] += cell(e.addr ? e.addr : "·", e.addr ? e.ctr : "", c);
    }
    document.getElementById("ras-q0").innerHTML = rows[0];
    document.getElementById("ras-q1").innerHTML = rows[1];
    var cs = "";
    for (var j = 0; j < CN; j++) {
      var ce = S.cs[j], cc = "live";
      if (j === S.nsp) cc += " top";
      if (j === S.ssp) cc += " w";
      cs += cell(ce.addr ? ce.addr : "·", ce.addr ? ce.ctr : "", cc);
    }
    document.getElementById("ras-cs").innerHTML = cs;
    document.getElementById("ras-ptr").textContent = S.tosr + " / " + S.tosw + " / " + S.bos;
    document.getElementById("ras-sp").textContent = S.ssp + "·" + S.sctr + " / " + S.nsp;
    var exp = S.truth.length ? S.truth[S.truth.length - 1] : "-";
    document.getElementById("ras-top").textContent = (top().addr || "·") + " / " + exp + (tin ? " (queue)" : " (stack)");
    document.getElementById("ras-hit").textContent = S.ret ? S.hit + " / " + S.ret : "-";
    var v = document.getElementById("ras-verdict");
    v.className = "verdict " + S.cls;
    v.textContent = S.msg + (near() ? " · nearOverflow" : "");
  }
  function on(id, fn) { document.getElementById(id).addEventListener("click", function () { fn(); render(); }); }
  on("ras-callA", function () { call(1); });
  on("ras-callN", function () { S.site++; call(S.site); });
  on("ras-ret", ret);
  on("ras-commit", commitAll);
  on("ras-mark", mark);
  on("ras-redir", redirect);
  on("ras-reset", reset);
  reset();
})();

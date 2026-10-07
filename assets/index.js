/* Cover sim: a simple CPI stack. Ideal CPI = 1/8 (commit width, Parameters.scala:83), branch mispredict
   penalty 16 cycles (ch13 estimate, 추론), memory misses add latency/MLP each. Not a measurement. */
(function () {
  "use strict";
  var root = document.getElementById("sim-hero");
  if (!root) return;
  var WIDTH = 8, PENALTY = 16;
  var P = Book.bind(root, function () { cv.redraw(); cap(); });
  var cv = Book.canvas(document.getElementById("hero-cv"), draw);

  function parts() {
    return [
      { k: "이상(1/8)", v: 1 / WIDTH, c: Book.css("accent") },
      { k: "분기 실패", v: P.bm * PENALTY / 1000, c: Book.css("accent-2") },
      { k: "메모리 미스", v: P.mm * P.lat / P.mlp / 1000, c: Book.css("warn") }
    ];
  }

  function draw(ctx, w, h) {
    var ps = parts(), cpi = ps.reduce(function (s, p) { return s + p.v; }, 0);
    var top = Math.max(1, Math.ceil(cpi * 4) / 4);
    var f = Book.frame(ctx, w, h, { x: [0, 1], y: [0, top], xlabel: "", ylabel: "CPI (명령당 사이클)", xticks: 1, xfmt: function () { return ""; }, yfmt: function (v) { return v.toFixed(2); } });
    var bw = Math.min(110, (f.box.x1 - f.box.x0) * 0.32), x0 = (f.box.x0 + f.box.x1) / 2 - bw / 2, acc = 0;
    ps.forEach(function (p) {
      if (p.v <= 0) return;
      var y1 = f.y(acc), y2 = f.y(acc + p.v);
      ctx.fillStyle = p.c; ctx.fillRect(x0, y2, bw, y1 - y2);
      if (y1 - y2 > 16) Book.text(ctx, p.k + " " + p.v.toFixed(2), x0 + bw + 8, (y1 + y2) / 2, { size: 12, color: Book.css("text"), base: "middle" });
      acc += p.v;
    });
    Book.text(ctx, "IPC " + (1 / cpi).toFixed(2), x0 + bw / 2, f.y(acc) - 8, { size: 14, weight: 700, color: Book.css("text"), align: "center", base: "bottom" });
  }

  function cap() {
    var ps = parts(), cpi = ps[0].v + ps[1].v + ps[2].v;
    var worst = ps[1].v >= ps[2].v ? "분기 예측 실패" : "메모리 미스";
    document.getElementById("hero-cap").innerHTML = "<b>IPC " + (1 / cpi).toFixed(2) + "</b> (최대 8). CPI " + cpi.toFixed(3) +
      " 중 " + (ps[0].v / cpi * 100).toFixed(0) + "%만 실제 일. 가장 큰 손실: " + worst + ". 2-3장과 9-10장이 이 손실을 줄이는 장치들이다.";
  }
  cap();
})();

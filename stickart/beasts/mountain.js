// 纯表现层：无状态、无时钟、无随机、无网络，同输入同画面
/* =====================================================================
 * StickArt · mountain（山道带 · 中级）
 * 依赖（按序）：stickart-core.js、quad.js、serpent.js
 * 黑熊 / 巨蟒
 * ===================================================================== */
(function (global) {
"use strict";
var SA = global.StickArt;

SA.register({
  id: "black_bear", category: "beast",
  label: { zh: "黑熊", en: "black_bear" },
  size: { width: 230, height: 165 },
  actions: ["idle","walk","attack","hurt","howl","dead"],
  color: "#5d6358",
  draw: function (ctx,W,H,st) { return SA.drawQuad(ctx,W,H,st,
    { legF:.4, lenF:1.05, bodyD:.16, sxOff:.16, hxOff:.15, neckLen:.13, headLen:.05,
      ear:"round", earLen:.07, tail:"short", backArch:.14 }); }
});

SA.register({
  id: "giant_python", category: "beast",
  label: { zh: "巨蟒", en: "giant_python" },
  size: { width: 260, height: 150 },
  actions: ["idle","walk","attack","hurt","dead"],
  color: "#6a725a",
  draw: function (ctx,W,H,st) { return SA.drawSerpent(ctx,W,H,st,
    { amp:.1, freq:1.5, len:.7, head:"long", pattern:1, headLift:.05 }); }
});
})(typeof window !== "undefined" ? window : globalThis);

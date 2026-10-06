// 纯表现层：无状态、无时钟、无随机、无网络，同输入同画面
/* =====================================================================
 * StickArt · village（村口带 · 低级）
 * 依赖（按序）：stickart-core.js、quad.js、serpent.js
 * 野狗 / 野猪崽 / 竹青蛇
 * ===================================================================== */
(function (global) {
"use strict";
var SA = global.StickArt;

SA.register({
  id: "wild_dog", category: "beast",
  label: { zh: "野狗", en: "wild_dog" },
  size: { width: 220, height: 160 },
  actions: ["idle","walk","attack","hurt","howl","dead"],
  color: "#8a8066",
  draw: function (ctx,W,H,st) { return SA.drawQuad(ctx,W,H,st,
    { legF:.36, lenF:.92, bodyD:.11, neckLen:.15, headLen:.07,
      ear:"point", tail:"up", tailLen:.17, mane:.15 }); }
});

SA.register({
  id: "boar_piglet", category: "beast",
  label: { zh: "野猪崽", en: "boar_piglet" },
  size: { width: 220, height: 150 },
  actions: ["idle","walk","attack","hurt","dead"],
  color: "#7a7264",
  draw: function (ctx,W,H,st) { return SA.drawQuad(ctx,W,H,st,
    { legF:.28, lenF:.95, bodyD:.15, sxOff:.16, hxOff:.14, neckLen:.12, headLen:.04,
      ear:"boar", earLen:.06, tail:"short", backArch:.16 }); }
});

SA.register({
  id: "bamboo_snake", category: "beast",
  label: { zh: "竹青蛇", en: "bamboo_snake" },
  size: { width: 220, height: 120 },
  actions: ["idle","walk","attack","hurt","dead"],
  color: "#6f8a6a",
  draw: function (ctx,W,H,st) { return SA.drawSerpent(ctx,W,H,st,
    { amp:.1, freq:2.2, len:.6, head:"tri", headLift:.07 }); }
});
})(typeof window !== "undefined" ? window : globalThis);

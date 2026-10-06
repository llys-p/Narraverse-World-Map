/* =====================================================================
 * SandboxDrawingKit · appearance-modern（跨题材外观配置，18 种）
 * 武侠 / 都市 / 科幻 / 西幻；复用 K.drawHumanoid，app.cfg 由本表提供。
 * 风格化近似：西装/宇航等借奇幻人体表达，非精确现代装束；需经引擎接入。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;

var MODERN = {
  /* ---- 武侠 ---- */
  w_youxia:  { tunic:"#6a7050", legs:"#565038", skin:"#e0ad82", hair:"#3a2e22", helm:"hat", hatColor:"#6a7050", weapon:"sword" },
  w_biaoshi: { tunic:"#8a6a44", legs:"#5f4a34", skin:"#d9a578", helm:"hat", hatColor:"#7a5a38", weapon:"spear" },
  w_liehu:   { tunic:"#7a6a48", legs:"#5a4a36", skin:"#d9a578", hair:"#3a2e22", helm:"hat", hatColor:"#726040", weapon:"bow" },
  w_jianke:  { tunic:"#4a5258", legs:"#3a4044", skin:"#e0ad82", hair:"#2a2620", helm:"none", weapon:"sword" },
  /* ---- 都市 ---- */
  m_office:   { tunic:"#3a424c", legs:"#2c333b", skin:"#e0ad82", hair:"#2a2620", helm:"none", weapon:"none" },
  m_police:   { tunic:"#2b3c66", legs:"#243152", skin:"#d9a578", helm:"hat", hatColor:"#243152", weapon:"none" },
  m_delivery: { tunic:"#d8a038", legs:"#3a4048", skin:"#d9a578", helm:"hat", hatColor:"#c8902a", weapon:"none" },
  m_student:  { tunic:"#5a7a9a", legs:"#3a4a5a", skin:"#e0ad82", hair:"#2a2620", helm:"none", weapon:"none" },
  m_doctor:   { tunic:"#e8ecec", legs:"#5a6268", skin:"#e0ad82", hair:"#3a2e22", helm:"none", weapon:"none" },
  /* ---- 科幻 ---- */
  s_astro:    { tunic:"#e6e8ea", legs:"#c6cacd", skin:"#e0ad82", armor:true, metal:"#e6e8ea", helm:"greathelm", weapon:"none" },
  s_engineer: { tunic:"#c06a2e", legs:"#4a4a4e", skin:"#d9a578", helm:"hat", hatColor:"#b06028", weapon:"hammer" },
  s_marine:   { tunic:"#4a5a3a", legs:"#3a4430", skin:"#d0a070", armor:true, metal:"#6a7a5a", helm:"helm", weapon:"spear" },
  s_robot:    { tunic:"#8b9096", legs:"#6f747a", skin:"#9aa0a6", armor:true, metal:"#9aa0a6", helm:"greathelm", weapon:"none" },
  s_pilot:    { tunic:"#6a5238", legs:"#3a3430", skin:"#d9a578", helm:"helm", metal:"#7a6238", weapon:"none" },
  /* ---- 西幻 ---- */
  f_squire:   { tunic:"#8a8a6a", legs:"#5a5644", skin:"#e0ad82", hair:"#3a2e22", weapon:"dagger", helm:"coif", hatColor:"#7a7a5a" },
  f_hunter:   { tunic:"#5a6a4a", legs:"#453c2e", skin:"#d9a578", helm:"hat", hatColor:"#566444", weapon:"bow" },
  f_pilgrim:  { tunic:"#b8a878", legs:"#7a6a4a", skin:"#d9a578", helm:"hood", hatColor:"#a89868", weapon:"staff", robe:true },
  f_merchant: { tunic:"#8a6a52", legs:"#5a4636", skin:"#d9a578", beard:"#5a4030", helm:"hat", hatColor:"#7a5a44", weapon:"none", belt:"#6a4a30" }
};

var LABELS = {
  w_youxia:"侠客", w_biaoshi:"镖师", w_liehu:"猎户", w_jianke:"剑客",
  m_office:"上班族", m_police:"警察", m_delivery:"快递员", m_student:"学生", m_doctor:"医生",
  s_astro:"宇航员", s_engineer:"工程师", s_marine:"星际士兵", s_robot:"机器人", s_pilot:"飞行员",
  f_squire:"侍从", f_hunter:"猎人", f_pilgrim:"朝圣者", f_merchant:"商人"
};

function drawModernPreset(ctx, W, H, st, app, theme, phase) {
  app.cfg = MODERN[app.arch];
  K.drawHumanoid(ctx, W, H, st, app, theme, phase);
  return { bounds:{x:0.34,y:0.03,w:0.32,h:0.95},
    anchors:{ head:{x:0.5,y:0.15}, feet:{x:0.5,y:0.96}, grip:{x:0.62,y:0.5} } };
}

Object.keys(MODERN).forEach(function (id) {
  K.register({ id:id, category:"appearance",
    label:{ zh:LABELS[id], en:id }, defaultColor:"#cccccc",
    size:{ width:96, height:128 }, actions:[],
    states:["pose:idle/guard/cast","facing","selected"], params:[],
    source:"kit/appearance-modern.js", draw:drawModernPreset,
    limits:["风格化近似，非精确现代装束","需经 stickman 引擎接入联调"] });
});
})(typeof window !== "undefined" ? window : globalThis);

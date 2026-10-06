// 纯表现层：无状态、无时钟、无随机、无网络，同输入同画面
/* =====================================================================
 * StickArt · core（注册表 + 调度）
 * 全局唯一命名空间 window.StickArt
 *   register(entry) / get(id) / list()
 *   draw(ctx, id, opt)  opt={action,phase,facing,color,scale,seed}
 * 组件原生头朝画面左侧(-x)；facing='right' 由 core 统一镜像，
 * 组件内部不处理镜像。core 只做调度与镜像，不决定任何世界事实。
 * ===================================================================== */
(function (global) {
"use strict";
var registry = {};

function register(entry) {
  if (!entry || !entry.id || !entry.draw)
    throw new Error("StickArt.register: 需要 {id, draw}");
  registry[entry.id] = entry;
}
function get(id) { return registry[id]; }
function list() { return Object.keys(registry); }

function draw(ctx, id, opt) {
  var e = registry[id];
  if (!e) throw new Error("StickArt.draw: 未注册 id '" + id + "'");
  opt = opt || {};
  var W = e.size.width, H = e.size.height;
  var st = {
    action: opt.action || "idle",
    phase: opt.phase || 0,
    facing: opt.facing || "left",
    color: opt.color || e.color || "#5e6d57",
    seed: opt.seed != null ? opt.seed : 0
  };
  var scale = opt.scale || 1;

  ctx.save();
  if (scale !== 1) { ctx.translate(W/2, H); ctx.scale(scale, scale); ctx.translate(-W/2, -H); }
  if (st.facing === "right") { ctx.translate(W, 0); ctx.scale(-1, 1); }

  var out;
  try { out = e.draw(ctx, W, H, st); } finally { ctx.restore(); }

  if (out && st.facing === "right") {
    if (out.bounds) out.bounds.x = 1 - out.bounds.x - (out.bounds.w || 0);
    if (out.anchors) Object.keys(out.anchors).forEach(function (k) {
      out.anchors[k].x = 1 - out.anchors[k].x;
    });
  }
  return out || { supported:true };
}

global.StickArt = {
  version: "1.0.0",
  register: register, get: get, list: list, draw: draw
};
if (typeof module !== "undefined" && module.exports)
  module.exports = global.StickArt;
})(typeof window !== "undefined" ? window : globalThis);

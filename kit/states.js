/* =====================================================================
 * SandboxDrawingKit · states（状态/姿态增强）
 * 1) K.drawStateMark：对任意实体叠加 alert/hurt/sleep/dead 标记
 * 2) 为参数化四足 horse/wolf/bear 增强 run/alert/hurt/dead
 * 纯表现层：不决定血量/生死事实，只按宿主给的 visualState 画。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;
var line=K.u.line, dot=K.u.dot, fillPts=K.u.fillPts, shade=K.u.shade,
  ellipseFill=K.u.ellipseFill, ellipseStroke=K.u.ellipseStroke;

/* ---------------- 通用状态标记 ----------------
 * kind: 'alert'|'hurt'|'sleep'|'dead'；head 为头部像素点；W/H 盒尺寸 */
K.drawStateMark = function (ctx, kind, head, W, H, theme, phase) {
  var s = Math.max(2, W*0.022);
  ctx.save(); ctx.lineCap="round";
  if (kind === "alert") {
    ctx.strokeStyle=theme.accent; ctx.fillStyle=theme.accent; ctx.lineWidth=s;
    line(ctx,{x:head.x,y:head.y-s*5.5},{x:head.x,y:head.y-s*1.2});
    dot(ctx,{x:head.x,y:head.y+s*1.4},s*0.9);
  } else if (kind === "hurt") {
    ctx.strokeStyle="#e8e0c8"; ctx.lineWidth=s*1.3;
    line(ctx,{x:head.x-s*3.2,y:head.y-s},{x:head.x+s*2.4,y:head.y+s});
    ctx.strokeStyle="rgba(208,80,70,0.8)"; ctx.lineWidth=s;
    line(ctx,{x:head.x-s,y:head.y+s*2},{x:head.x+s,y:head.y+s*3.4});
  } else if (kind === "sleep") {
    ctx.fillStyle=theme.foreground; ctx.font=(s*5)+"px sans-serif";
    ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText("Z",head.x+s,head.y-s*4);
    ctx.fillText("z",head.x+s*4.5,head.y-s*7);
  } else if (kind === "dead") {
    ctx.strokeStyle="#25221d"; ctx.lineWidth=s;
    line(ctx,{x:head.x-s*2,y:head.y-s*2},{x:head.x+s*2,y:head.y+s*2});
    line(ctx,{x:head.x-s*2,y:head.y+s*2},{x:head.x+s*2,y:head.y-s*2});
    ctx.fillStyle="rgba(20,22,26,0.35)";
    ctx.fillRect(0,0,W,H);
  }
  ctx.restore();
};

/* ---------------- horse / wolf / bear 姿态增强 ---------------- */
function speedLines(ctx, W, H, theme) {
  ctx.save(); ctx.strokeStyle=theme.accent; ctx.globalAlpha=0.6;
  ctx.lineWidth=Math.max(1.5,W*0.018); ctx.lineCap="round";
  [[0.12,0.4],[0.06,0.52],[0.12,0.64]].forEach(function (q) {
    line(ctx,{x:q[0]*W,y:q[1]*H},{x:(q[0]+0.1)*W,y:q[1]*H});
  });
  ctx.restore();
}
["horse","wolf","bear"].forEach(function (id) {
  var e = K.get(id); if (!e) return;
  var orig = e.draw;
  e.draw = function (ctx, W, H, st, app, theme, phase) {
    var r;
    if (st.action === "run") {
      var st2 = Object.assign({}, st, { action:"walk" });
      r = orig(ctx, W, H, st2, app, theme, (phase*2.3)%1);
      speedLines(ctx, W, H, theme);
      return r;
    }
    r = orig(ctx, W, H, st, app, theme, phase);
    if (st.action === "alert") K.drawStateMark(ctx,"alert",{x:0.8*W,y:0.22*H},W,H,theme,phase);
    if (st.action === "hurt")  K.drawStateMark(ctx,"hurt", {x:0.74*W,y:0.32*H},W,H,theme,phase);
    if (st.action === "dead")  K.drawStateMark(ctx,"dead", {x:0.74*W,y:0.3*H},W,H,theme,phase);
    if (st.action === "sleep") K.drawStateMark(ctx,"sleep",{x:0.8*W,y:0.2*H},W,H,theme,phase);
    return r;
  };
  e.actions = ["idle","walk","run","alert","hurt","sleep","dead"];
  e.states = ["facing","selected"];
});
})(typeof window !== "undefined" ? window : globalThis);

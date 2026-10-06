/* =====================================================================
 * SandboxDrawingKit · fixtures（门 door：locked/closed/open；路口入口 entrance）
 * 画法提取自原“绘制组件对照页.html”。纯装饰/可交互由宿主区分，组件不自行判定。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;
var shade = K.u.shade, line = K.u.line, fillPts = K.u.fillPts,
  dot = K.u.dot, polygonFill = K.u.polygonFill,
  drawSelectedFrame = K.u.drawSelectedFrame;

/* ---------------- 门 ---------------- */
function drawDoor(ctx, W, H, st, app, theme) {
  var locked = st.locked, open = st.open;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(W * 0.05, H * 0.04, W * 0.9, H * 0.92);
  ctx.fillStyle = shade(app.color, 0.8);
  ctx.fillRect(W * 0.03, H * 0.02, W * 0.94, H * 0.96);
  ctx.fillStyle = app.color;
  if (open) {
    polygonFill(ctx, [
      { x: W * 0.09, y: H * 0.08 }, { x: W * 0.09, y: H * 0.92 },
      { x: W * 0.36, y: H * 0.82 }, { x: W * 0.36, y: H * 0.18 }
    ]);
    ctx.fillStyle = "#141a16";
    ctx.fillRect(W * 0.36, H * 0.18, W * 0.5, H * 0.66);
  } else {
    ctx.fillRect(W * 0.09, H * 0.08, W * 0.82, H * 0.84);
    ctx.fillStyle = shade(app.color, 0.6);
    dot(ctx, { x: W * 0.85, y: H * 0.52 }, Math.max(2, W * 0.03));
    if (locked) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(W * 0.45, H * 0.52, W * 0.1, H * 0.12);
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.52, W * 0.05, Math.PI, 0);
      ctx.stroke();
    }
  }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.03, y: 0.02, w: 0.94, h: 0.96 },
    anchors: { threshold: { x: 0.5, y: 0.92 }, handle: { x: 0.85, y: 0.52 } }
  };
}

/* ---------------- 路口入口 ---------------- */
function drawEntrance(ctx, W, H, st, app, theme) {
  ctx.save();
  ctx.strokeStyle = app.color; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.25, H * 0.9);
  ctx.lineTo(W * 0.25, H * 0.42);
  ctx.arc(W * 0.5, H * 0.42, W * 0.25, Math.PI, 0);
  ctx.lineTo(W * 0.75, H * 0.9);
  ctx.stroke();
  if (st.open) {
    ctx.fillStyle = theme.accent;
    polygonFill(ctx, [
      { x: W * 0.5, y: H * 0.74 },
      { x: W * 0.4, y: H * 0.58 },
      { x: W * 0.6, y: H * 0.58 }
    ]);
    ctx.fillStyle = "rgba(141,206,191,0.18)";
    ctx.fillRect(W * 0.27, H * 0.42, W * 0.46, H * 0.48);
  } else {
    ctx.strokeStyle = theme.foreground; ctx.lineWidth = 3;
    line(ctx, { x: W * 0.3, y: H * 0.5 }, { x: W * 0.7, y: H * 0.5 });
  }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.22, y: 0.4, w: 0.56, h: 0.52 },
    anchors: { center: { x: 0.5, y: 0.7 } }
  };
}

/* ---------------- 注册 ---------------- */
K.register({
  id: "door", category: "fixture",
  label: { zh: "门", en: "Door" }, defaultColor: "#b39160",
  size: { width: 96, height: 160 },
  actions: [], states: ["closed", "open", "locked", "selected"],
  params: ["color"], source: "kit/fixtures.js",
  draw: drawDoor, limits: []
});
K.register({
  id: "entrance", category: "fixture",
  label: { zh: "路口入口", en: "Entrance" }, defaultColor: "#b39160",
  size: { width: 128, height: 96 },
  actions: [], states: ["closed", "open", "selected"],
  params: ["color"], source: "kit/fixtures.js",
  draw: drawEntrance, limits: []
});
})(typeof window !== "undefined" ? window : globalThis);

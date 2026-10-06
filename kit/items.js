/* =====================================================================
 * SandboxDrawingKit · items（钥匙 / 药瓶 / 剑 / 箱子）
 * 画法提取自原“绘制组件对照页.html”。箱子支持 closed/open/locked；
 * held 物品返回 grip 锚点供宿主对齐手，组件不推断归属。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;
var shade = K.u.shade, rgba = K.u.rgba, line = K.u.line, fillPts = K.u.fillPts,
  ellipseFill = K.u.ellipseFill, dot = K.u.dot, roundRectPath = K.u.roundRectPath,
  drawSelectedFrame = K.u.drawSelectedFrame;

/* ---------------- 钥匙 ---------------- */
function drawKey(ctx, W, H, st, app, theme) {
  var col = app.color;
  function P(x, y) { return { x: x * W, y: y * H }; }
  ctx.save();
  if (st.held) { ctx.translate(W / 2, H / 2); ctx.rotate(-0.5); ctx.translate(-W / 2, -H / 2); }
  ctx.lineCap = "round"; ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, W * 0.06);
  ctx.beginPath();
  ctx.arc(P(0.32, 0.45).x, P(0.32, 0.45).y, 0.10 * W, 0, Math.PI * 2);
  ctx.stroke();
  line(ctx, P(0.42, 0.45), P(0.74, 0.45));
  line(ctx, P(0.625, 0.45), P(0.625, 0.65));
  line(ctx, P(0.72, 0.45), P(0.72, 0.65));
  if (app.variant === "cyber") {
    ctx.strokeStyle = theme.accent; ctx.lineWidth = Math.max(1, W * 0.02);
    ctx.beginPath();
    ctx.arc(P(0.32, 0.45).x, P(0.32, 0.45).y, 0.13 * W, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (!st.held) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ellipseFill(ctx, P(0.55, 0.8), 0.28 * W, 0.06 * H);
  }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.2, y: 0.3, w: 0.58, h: 0.5 },
    anchors: { grip: { x: 0.55, y: 0.45 } }
  };
}

/* ---------------- 药瓶 ---------------- */
function drawPotion(ctx, W, H, st, app, theme) {
  function P(x, y) { return { x: x * W, y: y * H }; }
  ctx.save();
  ctx.lineJoin = "round";
  ctx.fillStyle = shade(app.color, 0.7);
  ctx.fillRect(W * 0.40, H * 0.06, W * 0.20, H * 0.10);
  ctx.fillStyle = "rgba(200,220,230,0.5)";
  ctx.fillRect(W * 0.42, H * 0.16, W * 0.16, H * 0.16);
  var bx = W * 0.22, by = H * 0.30, bw = W * 0.56, bh = H * 0.58;
  ctx.beginPath(); roundRectPath(ctx, bx, by, bw, bh, W * 0.12);
  ctx.save(); ctx.clip();
  ctx.fillStyle = "rgba(210,225,235,0.35)"; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = app.color; ctx.globalAlpha = 0.85;
  ctx.fillRect(bx, by + bh * 0.42, bw, bh * 0.58);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = shade(app.color, 0.7); ctx.lineWidth = 2;
  roundRectPath(ctx, bx, by, bw, bh, W * 0.12); ctx.stroke();
  ctx.fillStyle = "rgba(245,240,225,0.9)";
  ctx.fillRect(W * 0.30, H * 0.52, W * 0.40, H * 0.18);
  ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2;
  line(ctx, P(0.30, 0.38), P(0.30, 0.78));
  if (app.variant === "cyber") {
    ctx.fillStyle = theme.accent;
    dot(ctx, P(0.5, 0.20), Math.max(2, W * 0.04));
  }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.2, y: 0.04, w: 0.6, h: 0.86 },
    anchors: { grip: { x: 0.5, y: 0.2 } }
  };
}

/* ---------------- 剑 ---------------- */
function drawSword(ctx, W, H, st, app, theme) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  if (st.held) ctx.rotate(-0.35);
  ctx.translate(-W / 2, -H / 2);
  var cx = W * 0.5, topY = H * 0.08, guardY = H * 0.72,
    gripY = H * 0.92, halfW = W * 0.09;
  ctx.fillStyle = app.variant === "cyber" ? "rgba(141,206,191,0.55)" : app.color;
  fillPts(ctx, [
    { x: cx, y: topY },
    { x: cx + halfW, y: guardY },
    { x: cx - halfW, y: guardY }
  ]);
  ctx.strokeStyle = app.variant === "cyber" ? theme.accent : "#ffffff";
  ctx.lineWidth = 2;
  line(ctx, { x: cx, y: topY + 4 }, { x: cx, y: guardY - 2 });
  ctx.strokeStyle = shade(app.color, 0.8);
  ctx.lineWidth = Math.max(3, W * 0.06);
  line(ctx, { x: cx - halfW * 1.5, y: guardY }, { x: cx + halfW * 1.5, y: guardY });
  ctx.strokeStyle = "#5a4632";
  ctx.lineWidth = Math.max(3, W * 0.07);
  line(ctx, { x: cx, y: guardY }, { x: cx, y: gripY });
  if (!st.held) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ellipseFill(ctx, { x: cx, y: H * 0.95 }, W * 0.2, H * 0.04);
  }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.36, y: 0.06, w: 0.28, h: 0.9 },
    anchors: { grip: { x: 0.5, y: 0.82 } }
  };
}

/* ---------------- 箱子（closed/open/locked） ---------------- */
function drawChest(ctx, W, H, st, app, theme) {
  var open = st.open;
  ctx.save();
  ctx.lineJoin = "round";
  var bx = W * 0.1, by = H * 0.42, bw = W * 0.8, bh = H * 0.46;
  ctx.fillStyle = app.color;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = shade(app.color, 0.6); ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  if (open) {
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(bx + W * 0.03, by + bh * 0.08, bw - W * 0.06, bh * 0.5);
    ctx.fillStyle = shade(app.color, 1.08);
    fillPts(ctx, [
      { x: bx, y: by }, { x: bx + bw, y: by },
      { x: bx + bw * 0.86, y: by - H * 0.16 },
      { x: bx + bw * 0.14, y: by - H * 0.16 }
    ]);
  } else {
    ctx.fillStyle = shade(app.color, 1.08);
    ctx.fillRect(bx, by - H * 0.16, bw, H * 0.16);
    ctx.fillStyle = shade(app.color, 0.7);
    ctx.fillRect(W * 0.46, by - H * 0.05, W * 0.08, H * 0.1);
    if (st.locked) {
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W * 0.5, by - H * 0.06, W * 0.04, Math.PI, 0);
      ctx.stroke();
    }
  }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.1, y: 0.24, w: 0.8, h: 0.64 },
    anchors: { lid: { x: 0.5, y: 0.42 } }
  };
}

/* ---------------- 注册 ---------------- */
K.register({
  id: "key", category: "item",
  label: { zh: "钥匙", en: "Key" }, defaultColor: "#b57b25",
  size: { width: 96, height: 64 },
  actions: [], states: ["held", "selected", "variant"],
  params: ["color", "variant"], source: "kit/items.js",
  draw: drawKey, limits: ["held 时 bounds 为近似"]
});
K.register({
  id: "potion", category: "item",
  label: { zh: "药瓶", en: "Potion" }, defaultColor: "#b04a3e",
  size: { width: 64, height: 96 },
  actions: [], states: ["selected", "variant"],
  params: ["color", "variant"], source: "kit/items.js",
  draw: drawPotion, limits: []
});
K.register({
  id: "sword", category: "item",
  label: { zh: "剑", en: "Sword" }, defaultColor: "#dfe6ff",
  size: { width: 64, height: 128 },
  actions: [], states: ["held", "selected", "variant"],
  params: ["color", "variant"], source: "kit/items.js",
  draw: drawSword, limits: ["held 时 bounds 为近似"]
});
K.register({
  id: "chest", category: "item",
  label: { zh: "箱子", en: "Chest" }, defaultColor: "#9a7a4e",
  size: { width: 128, height: 96 },
  actions: [], states: ["closed", "open", "locked", "selected"],
  params: ["color"], source: "kit/items.js",
  draw: drawChest, limits: []
});
})(typeof window !== "undefined" ? window : globalThis);

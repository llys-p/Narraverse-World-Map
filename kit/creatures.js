/* =====================================================================
 * SandboxDrawingKit · creatures（四足 dog/cat；鸟 bird）
 * 画法提取自原“绘制组件对照页.html”，工程化封装并扩展动作/状态。
 * action: idle / walk / run / lie / sleep / alert / hurt / dead
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;
var shade = K.u.shade, line = K.u.line, fillPts = K.u.fillPts,
  ellipseFill = K.u.ellipseFill, dot = K.u.dot, polygonFill = K.u.polygonFill,
  drawSelectedFrame = K.u.drawSelectedFrame, clamp = K.u.clamp;

/* ---------------- 四足配置 ---------------- */
var QUADRUPEDS = {
  dog: {
    body: { cx: 0.44, cy: 0.55, rx: 0.24, ry: 0.20 },
    head: { cx: 0.71, cy: 0.38, rx: 0.125, ry: 0.175 },
    snout: { x: 0.78, y: 0.38, w: 0.125, h: 0.125 },
    ear: [[0.64, 0.28], [0.61, 0.08], [0.74, 0.22]],
    legs: [[0.29, 0.65], [0.40, 0.65], [0.54, 0.65], [0.64, 0.65]],
    legLen: 0.25,
    tail: { from: [0.22, 0.50], to: [0.125, 0.275] },
    eye: [0.75, 0.325], nose: [0.90, 0.40]
  },
  cat: {
    body: { cx: 0.45, cy: 0.56, rx: 0.22, ry: 0.18 },
    head: { cx: 0.70, cy: 0.38, rx: 0.13, ry: 0.13 },
    snout: { x: 0.76, y: 0.40, w: 0.06, h: 0.06 },
    ear: [[0.62, 0.30], [0.60, 0.08], [0.70, 0.24]],
    legs: [[0.32, 0.66], [0.42, 0.66], [0.55, 0.66], [0.64, 0.66]],
    legLen: 0.22,
    tail: { from: [0.24, 0.52], to: [0.10, 0.20] },
    eye: [0.72, 0.35], nose: [0.82, 0.40]
  }
};

function quadBounds(cfg) {
  var minX = Math.min(cfg.tail.to[0], cfg.nose[0]) - 0.02;
  var maxX = Math.max(cfg.snout.x + cfg.snout.w, cfg.nose[0]) + 0.02;
  var minY = Math.min(cfg.ear[0][1], cfg.ear[1][1], cfg.ear[2][1]) - 0.02;
  var maxY = cfg.legs[0][1] + cfg.legLen + 0.02;
  return {
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    anchors: { head: { x: cfg.head.cx, y: cfg.head.cy }, feet: { x: cfg.body.cx, y: maxY - 0.02 } }
  };
}

/* 闭眼 / X 眼 / 感叹 / Z */
function closedEye(ctx, p, s) { ctx.lineWidth = Math.max(1, s); line(ctx, {x:p.x-s*2,y:p.y}, {x:p.x+s*2,y:p.y}); }
function xEye(ctx, p, s) { ctx.lineWidth = Math.max(1, s); line(ctx,{x:p.x-s*2,y:p.y-s*2},{x:p.x+s*2,y:p.y+s*2}); line(ctx,{x:p.x-s*2,y:p.y+s*2},{x:p.x+s*2,y:p.y-s*2}); }
function alertMark(ctx, p, s, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1.5, s);
  line(ctx, {x:p.x,y:p.y-s*5},{x:p.x,y:p.y-s}); dot(ctx,{x:p.x,y:p.y+s*1.6},s*0.9);
}
function zzz(ctx, p, s, color) {
  ctx.fillStyle = color; ctx.font = (s*6)+"px sans-serif"; ctx.textAlign="left"; ctx.textBaseline="middle";
  ctx.fillText("Z", p.x, p.y); ctx.fillText("z", p.x+s*5, p.y-s*4); ctx.fillText("z", p.x+s*9, p.y-s*7);
}

function drawQuadruped(ctx, W, H, st, app, theme, phase) {
  var cfg = QUADRUPEDS[app.arch], main = app.color, dark = shade(main, 0.62);
  var act = st.action;
  function P(x, y) { return { x: x*W, y: y*H }; }
  ctx.save();
  if (st.facing === "left") { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  /* ---------------- 死亡：仰躺，腿朝天，X 眼 ---------------- */
  if (act === "dead") {
    var bcy = 0.60;
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, W*0.04);
    line(ctx, P(cfg.tail.from[0], bcy+0.05), P(cfg.tail.to[0]+0.05, bcy+0.12));
    ctx.fillStyle = main;
    ellipseFill(ctx, P(cfg.body.cx, bcy), cfg.body.rx*W, cfg.body.ry*H);
    cfg.legs.forEach(function (L, i) {
      line(ctx, P(L[0], bcy-cfg.body.ry*0.7), P(L[0]+(i%2?0.03:-0.02), bcy-cfg.body.ry-cfg.legLen*0.75));
    });
    var hcx = cfg.head.cx+0.03, hcy = bcy-0.16;
    ellipseFill(ctx, P(hcx, hcy), cfg.head.rx*W, cfg.head.ry*H);
    ctx.strokeStyle = "#25221d";
    xEye(ctx, P(cfg.eye[0]+0.03, hcy), W*0.018);
    if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
    ctx.restore(); return quadBounds(cfg);
  }

  /* ---------------- 趴卧 / 睡眠：身体下沉，腿折叠，头搁地 ---------------- */
  if (act === "lie" || act === "sleep") {
    var bcy2 = cfg.body.cy + 0.14;
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, W*0.04);
    line(ctx, P(cfg.tail.from[0], bcy2+0.04), P(cfg.tail.to[0]+0.06, bcy2+0.1));
    ctx.fillStyle = main;
    ellipseFill(ctx, P(cfg.body.cx, bcy2), cfg.body.rx*W, cfg.body.ry*0.66*H);
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, W*0.035);
    cfg.legs.forEach(function (L) {
      var sy = bcy2+cfg.body.ry*0.45;
      line(ctx, P(L[0], sy), P(L[0]+0.05, sy+0.06));
      line(ctx, P(L[0]+0.05, sy+0.06), P(L[0]+0.13, sy+0.06));
    });
    var hcx2 = cfg.head.cx+0.09, hcy2 = bcy2+0.03;
    ellipseFill(ctx, P(hcx2, hcy2), cfg.head.rx*W, cfg.head.ry*0.78*H);
    var s2 = P(cfg.snout.x+0.09, hcy2+0.02);
    ctx.fillRect(s2.x, s2.y, cfg.snout.w*W*0.8, cfg.snout.h*H*0.5);
    polygonFill(ctx, cfg.ear.map(function (q){ return P(q[0]+0.09, q[1]+0.06); }));
    ctx.strokeStyle = "#25221d";
    closedEye(ctx, P(cfg.eye[0]+0.09, hcy2), W*0.018);
    dot(ctx, P(cfg.nose[0]+0.09, hcy2+0.03), Math.max(1.5, W*0.02));
    if (act === "sleep") zzz(ctx, P(hcx2+0.12, hcy2-0.12), W*0.02, theme.foreground);
    if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
    ctx.restore(); return quadBounds(cfg);
  }

  /* ---------------- 站立系：idle / walk / run / alert / hurt ---------------- */
  var running = act === "run";
  var freq = running ? 2.4 : 1;
  var amp = running ? 0.15 : (act === "walk" ? 0.075 : 0);
  var sw = Math.sin(phase*Math.PI*2*freq);
  var lift = running ? -0.03 : 0;
  var headDY = act === "alert" ? -0.07 : (act === "hurt" ? 0.05 : (running ? -0.02 : 0));
  var headDX = act === "hurt" ? -0.04 : 0;

  /* 尾（run 时向后拉直） */
  ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, W*0.04);
  var tailTo = running ? [cfg.tail.to[0]-0.02, cfg.tail.to[1]+0.12] : cfg.tail.to;
  line(ctx, P(cfg.tail.from[0], cfg.tail.from[1]+lift), P(tailTo[0], tailTo[1]+lift));

  ctx.fillStyle = main;
  ellipseFill(ctx, P(cfg.body.cx, cfg.body.cy+lift), cfg.body.rx*W, cfg.body.ry*H);

  /* 腿 */
  cfg.legs.forEach(function (Lg, i) {
    var d = (i % 2 === 0) ? sw : -sw;
    var gall = running ? Math.abs(Math.cos(phase*Math.PI*2*freq))*-0.03 : 0;
    line(ctx, P(Lg[0], Lg[1]+lift), P(Lg[0]+d*amp, Lg[1]+cfg.legLen+gall));
  });

  /* 头 / 耳 / 吻 */
  var hx = cfg.head.cx+headDX, hy = cfg.head.cy+lift+headDY;
  ellipseFill(ctx, P(hx, hy), cfg.head.rx*W, cfg.head.ry*H);
  var sn = P(cfg.snout.x+headDX, cfg.snout.y+lift+headDY);
  ctx.fillRect(sn.x, sn.y, cfg.snout.w*W, cfg.snout.h*H);
  var earUp = act === "alert" ? -0.05 : 0;
  polygonFill(ctx, cfg.ear.map(function (q){ return P(q[0]+headDX, q[1]+lift+headDY+earUp); }));

  /* 眼 */
  var eyeP = P(cfg.eye[0]+headDX, cfg.eye[1]+lift+headDY);
  if (act === "hurt") { ctx.strokeStyle = "#25221d"; closedEye(ctx, eyeP, W*0.018); }
  else if (act === "alert") { ctx.fillStyle = "#25221d"; dot(ctx, eyeP, Math.max(2, W*0.03)); }
  else if (app.variant === "cyber") { ctx.fillStyle = theme.accent; dot(ctx, eyeP, Math.max(2, W*0.03)); }
  else { ctx.fillStyle = "#25221d"; dot(ctx, eyeP, Math.max(1.5, W*0.022)); }
  dot(ctx, P(cfg.nose[0]+headDX, cfg.nose[1]+lift+headDY), Math.max(1.5, W*0.02));

  /* 项圈 / 赛博 */
  if (app.variant === "collar") {
    ctx.strokeStyle = theme.accent; ctx.lineWidth = Math.max(2, W*0.05);
    ctx.beginPath(); ctx.arc(P(hx-0.06, hy+0.06).x, P(hx-0.06, hy+0.06).y, W*0.05, 0.2, Math.PI-0.2); ctx.stroke();
  }

  /* 状态标记 */
  if (act === "alert") alertMark(ctx, P(hx, hy-0.05), W*0.02, theme.accent);
  if (act === "hurt") {
    ctx.strokeStyle = "#e8e0c8"; ctx.lineWidth = Math.max(2, W*0.05);
    line(ctx, P(hx-0.08, hy-0.05), P(hx+0.06, hy+0.05));
    ctx.strokeStyle = shade(main, 0.5); ctx.lineWidth = Math.max(1, W*0.02);
    line(ctx, P(cfg.body.cx-0.1, cfg.body.cy+lift), P(cfg.body.cx-0.04, cfg.body.cy+0.06+lift));
  }

  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return quadBounds(cfg);
}

/* ---------------- 鸟 ---------------- */
function drawBird(ctx, W, H, st, app, theme, phase) {
  var main = app.color, flying = st.action === "fly", act = st.action;
  var flap = flying ? -Math.cos(phase*Math.PI*2) : 0;
  function P(x, y) { return { x: x*W, y: y*H }; }
  ctx.save();
  if (st.facing === "left") { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  if (act === "dead") {
    ctx.fillStyle = shade(main, 0.85);
    ellipseFill(ctx, P(0.5, 0.62), 0.26*W, 0.22*H);
    ctx.strokeStyle = shade(main,0.6); ctx.lineWidth = Math.max(1.5,W*0.03);
    line(ctx,P(0.3,0.5),P(0.24,0.34)); line(ctx,P(0.6,0.5),P(0.66,0.34));
    ctx.strokeStyle="#25221d"; xEye(ctx,P(0.62,0.58),W*0.02);
    if (st.selected) drawSelectedFrame(ctx,W,H,theme.accent);
    ctx.restore();
    return { bounds:{x:0.1,y:0.3,w:0.8,h:0.6}, anchors:{head:{x:0.62,y:0.58},feet:{x:0.5,y:0.8}} };
  }

  ctx.fillStyle = shade(main, 0.85);
  polygonFill(ctx, [[0.24, 0.52], [0.06, 0.44], [0.06, 0.62]].map(function (p){ return P(p[0], p[1]); }));
  ctx.fillStyle = main;
  ellipseFill(ctx, P(0.46, 0.55), 0.26*W, 0.30*H);
  if (!flying && app.variant !== "cyber" && act !== "hurt") {
    ctx.strokeStyle = shade(main, 0.6); ctx.lineWidth = Math.max(1.5, W*0.03);
    line(ctx, P(0.44, 0.82), P(0.44, 0.98));
    line(ctx, P(0.54, 0.82), P(0.54, 0.98));
  }
  ellipseFill(ctx, P(0.66, 0.30), 0.15*W, 0.15*H);
  ctx.fillStyle = shade(main, 0.7);
  polygonFill(ctx, [[0.78, 0.28], [0.92, 0.33], [0.78, 0.38]].map(function (p){ return P(p[0], p[1]); }));
  ctx.strokeStyle = shade(main, 0.8); ctx.lineWidth = Math.max(2, W*0.05);
  if (flying) line(ctx, P(0.52, 0.42), P(0.46, 0.18+flap*0.24));
  else line(ctx, P(0.52, 0.42), P(0.34, 0.62));
  var eyeB = P(0.68, 0.28);
  if (act === "hurt") { ctx.strokeStyle="#25221d"; closedEye(ctx, eyeB, W*0.02); }
  else if (app.variant === "cyber") { ctx.fillStyle = theme.accent; dot(ctx, eyeB, Math.max(2, W*0.03)); }
  else { ctx.fillStyle = "#25221d"; dot(ctx, eyeB, Math.max(1.4, W*0.02)); }
  if (st.selected) drawSelectedFrame(ctx, W, H, theme.accent);
  ctx.restore();
  return {
    bounds: { x: 0.05, y: 0.13, w: 0.87, h: 0.85 },
    anchors: { head: { x: 0.66, y: 0.30 }, feet: { x: 0.5, y: 0.98 } }
  };
}

/* ---------------- 注册 ---------------- */
var QUAD_ACTIONS = ["idle","walk","run","lie","sleep","alert","hurt","dead"];
K.register({
  id: "dog", category: "creature",
  label: { zh: "狗", en: "Dog" }, defaultColor: "#a98458",
  size: { width: 96, height: 64 },
  actions: QUAD_ACTIONS, states: ["facing","selected","variant"],
  params: ["color","variant"], source: "kit/creatures.js", draw: drawQuadruped,
  limits: ["姿态为简化表现"]
});
K.register({
  id: "cat", category: "creature",
  label: { zh: "猫", en: "Cat" }, defaultColor: "#75695c",
  size: { width: 96, height: 64 },
  actions: QUAD_ACTIONS, states: ["facing","selected","variant"],
  params: ["color","variant"], source: "kit/creatures.js", draw: drawQuadruped,
  limits: ["姿态为简化表现"]
});
K.register({
  id: "bird", category: "creature",
  label: { zh: "鸟", en: "Bird" }, defaultColor: "#8a6f52",
  size: { width: 80, height: 72 },
  actions: ["idle","fly","hurt","dead"], states: ["facing","selected","variant"],
  params: ["color","variant"], source: "kit/creatures.js", draw: drawBird,
  limits: ["姿态为简化表现"]
});
})(typeof window !== "undefined" ? window : globalThis);

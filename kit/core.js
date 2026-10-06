/* =====================================================================
 * SandboxDrawingKit · core
 * 命名空间 / 工具 / 注册表 / drawEntity / drawBackdrop / describeCapabilities
 * 纯表现层：不启动 RAF/定时器、不访问存储、不联网、不注册鼠标、不决定结果、
 * 不修改 entity/view/scene。同参数同 phase 同画面。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit || (global.SandboxDrawingKit = {});
K.version = "0.1.0";
K._registry = {};

/* ---------------- 工具 ---------------- */
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function hex2rgb(hex) {
  var h = String(hex == null ? "#edf0e9" : hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  if (isNaN(n)) n = 0xedf0e9;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, f) {
  var c = hex2rgb(hex);
  return "rgb(" + Math.round(clamp(c.r * f, 0, 255)) + "," +
    Math.round(clamp(c.g * f, 0, 255)) + "," + Math.round(clamp(c.b * f, 0, 255)) + ")";
}
function rgba(hex, a) { var c = hex2rgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }
function validHex(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function path2(ctx, pts) {
  ctx.beginPath();
  pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
}
function fillPts(ctx, pts) { path2(ctx, pts); ctx.closePath(); ctx.fill(); }
function strokePts(ctx, pts) { path2(ctx, pts); ctx.stroke(); }
function ellipseFill(ctx, c, rx, ry) { ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function ellipseStroke(ctx, c, rx, ry) { ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
function dot(ctx, p, r) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); }
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawSelectedFrame(ctx, W, H, accent) {
  ctx.save();
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
  roundRectPath(ctx, 2, 2, W - 4, H - 4, 5); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}
var u = {
  clamp: clamp, hex2rgb: hex2rgb, shade: shade, rgba: rgba, validHex: validHex,
  line: line, path2: path2, fillPts: fillPts, strokePts: strokePts,
  ellipseFill: ellipseFill, ellipseStroke: ellipseStroke, dot: dot,
  roundRectPath: roundRectPath, drawSelectedFrame: drawSelectedFrame
};
u.polygonFill = fillPts; // 兼容旧画法命名
K.u = u;

/* ---------------- 注册表 ---------------- */
K.register = function (entry) {
  if (!entry || !entry.id) throw new Error("register requires an entry with id");
  K._registry[entry.id] = entry;
  return entry;
};
K.get = function (id) { return K._registry[id]; };
K.has = function (id) { return !!K._registry[id]; };

function normTheme(theme) {
  theme = theme || {};
  return {
    surface: theme.surface || "#202522",
    foreground: theme.foreground || "#edf0e9",
    accent: theme.accent || "#d5a17d"
  };
}

/* ---------------- 后备（未知 archetype） ---------------- */
function drawFallback(ctx, W, H, app, theme) {
  ctx.save();
  ctx.strokeStyle = theme.foreground; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  roundRectPath(ctx, 4, 4, W - 8, H - 8, 8); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.foreground; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = Math.max(11, H * 0.16) + "px sans-serif";
  ctx.fillText("? " + (app.label || app.arch || "未知"), W / 2, H / 2);
  ctx.restore();
  return { bounds: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }, anchors: {} };
}

/* ---------------- drawEntity ----------------
 * entity: { id, kind, archetype, appearance:{color,variant}, visualState:{action,open,locked,held,selected} }
 * view:   { x, y, width, height, phase, facing, selected, theme }
 * 返回    { supported, bounds:{x,y,width,height}(CSS px), anchors:{...}(CSS px) }
 * ----------------------------------------------------------------------- */
K.drawEntity = function (ctx, entity, view) {
  if (!ctx || !entity || !view) throw new Error("drawEntity requires ctx, entity, view");
  var arch = entity.archetype;
  var entry = K._registry[arch];
  var W = view.width, H = view.height;
  var vs = entity.visualState || {};
  var facing = view.facing || "right";
  var st = {
    action: vs.action || "idle",
    pose: vs.pose || "idle",
    open: !!vs.open, locked: !!vs.locked, held: !!vs.held,
    facing: facing,
    selected: (view.selected !== undefined ? view.selected : vs.selected) || false
  };
  var ap0 = entity.appearance || {};
  var app = {
    arch: arch,
    color: ap0.color || (entry && entry.defaultColor) || "#a98458",
    variant: ap0.variant || "plain",
    label: entity.label || entity.name
  };
  var theme = normTheme(view.theme);
  var nb = { x: 0, y: 0, w: 1, h: 1 }, na = {};
  var supported = false, diagnostics = null;

  ctx.save();
  try {
    ctx.translate(view.x || 0, view.y || 0);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (facing === "left") { ctx.translate(W, 0); ctx.scale(-1, 1); }
    if (entry && typeof entry.draw === "function") {
      var hasActions = entry.actions && entry.actions.length;
      var known = hasActions ? entry.actions.indexOf(st.action) !== -1 : true;
      var eff = known ? st.action : "idle";
      if (!known) diagnostics = "unknown-action:" + st.action + "->idle";
      st.action = eff;
      var r = entry.draw(ctx, W, H, st, app, theme, view.phase || 0);
      supported = true;
      if (r) { nb = r.bounds || nb; na = r.anchors || {}; }
    } else {
      var fr = drawFallback(ctx, W, H, app, theme);
      nb = fr.bounds;
    }
  } finally {
    ctx.restore();
  }

  if (facing === "left") {
    nb = { x: 1 - (nb.x + nb.w), y: nb.y, w: nb.w, h: nb.h };
    Object.keys(na).forEach(function (k) {
      var a = na[k];
      if (a && typeof a.x === "number") a.x = 1 - a.x;
    });
  }

  var out = {
    supported: supported,
    bounds: {
      x: (view.x || 0) + nb.x * W,
      y: (view.y || 0) + nb.y * H,
      width: nb.w * W, height: nb.h * H
    },
    anchors: (function () {
      var o = {};
      Object.keys(na).forEach(function (k) {
        var a = na[k];
        if (!a) return;
        o[k] = { x: (view.x || 0) + a.x * W, y: (view.y || 0) + a.y * H };
      });
      return o;
    })()
  };
  if (!supported) out.reason = "unknown-archetype:" + arch;
  if (diagnostics) out.diagnostics = diagnostics;
  return out;
};

/* ---------------- drawBackdrop ----------------
 * scene: { sky:[c0,c1], objects:[{type:'rect'|'circle'|'poly', ...}] }
 * view:  { x, y, width, height }
 * ----------------------------------------------------------------------- */
K.drawBackdrop = function (ctx, scene, view) {
  var fallbackW = ctx.canvas ? ctx.canvas.width : 0;
  var fallbackH = ctx.canvas ? ctx.canvas.height : 0;
  var v = view || { x: 0, y: 0, width: fallbackW, height: fallbackH };
  var W = v.width, H = v.height;
  ctx.save();
  try {
    ctx.translate(v.x || 0, v.y || 0);
    function X(q) { return q * W / 100; }
    function Y(q) { return q * H / 100; }
    var sky = (scene && scene.sky) || ["#2a3340", "#10151a"];
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ((scene && scene.objects) || []).forEach(function (o) {
      ctx.fillStyle = o.color; ctx.beginPath();
      if (o.type === "rect") {
        ctx.rect(X(o.x), Y(o.y), X(o.w), Y(o.h));
      } else if (o.type === "circle") {
        var r = Math.min(W, H) * o.r / 100;
        ctx.ellipse(X(o.x), Y(o.y), r, r, 0, 0, Math.PI * 2);
      } else {
        (o.points || []).forEach(function (p, i) {
          i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]));
        });
        ctx.closePath();
      }
      ctx.fill();
    });
  } finally {
    ctx.restore();
  }
  return { supported: true, bounds: { x: v.x, y: v.y, width: W, height: H }, anchors: {} };
};

/* ---------------- describeCapabilities（从注册表派生） ---------------- */
K.describeCapabilities = function () {
  var cats = {};
  var list = Object.keys(K._registry).map(function (id) {
    var e = K._registry[id];
    cats[e.category] = (cats[e.category] || 0) + 1;
    return {
      id: id, category: e.category,
      label: e.label, defaultColor: e.defaultColor,
      size: e.size, actions: e.actions, states: e.states,
      params: e.params, limits: e.limits
    };
  });
  return { version: K.version, count: list.length, categories: cats, components: list };
};

if (typeof module !== "undefined" && module.exports) module.exports = K;
})(typeof window !== "undefined" ? window : globalThis);

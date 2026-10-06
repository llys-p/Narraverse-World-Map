/* =====================================================================
 * SandboxDrawingKit · accessories（可叠加配件，14 种）
 * K.drawAccessory(ctx, id, anchor, view)：anchor 像素点（人物 head/back/hand）
 * 注册项可在盒内独立展示（默认锚点）。纯表现，不改人物事实。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;
var line=K.u.line, dot=K.u.dot, fillPts=K.u.fillPts, shade=K.u.shade,
  ellipseFill=K.u.ellipseFill, ellipseStroke=K.u.ellipseStroke,
  roundRectPath=K.u.roundRectPath;
function rr(ctx,x,y,w,h,r){ roundRectPath(ctx,x,y,w,h,r); ctx.fill(); }

var ACCFN = {
  /* ---- 头部 ---- */
  douli: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#b89a5a";
    fillPts(ctx,[{x:cx-.5*s,y:cy+.12*s},{x:cx+.5*s,y:cy+.12*s},{x:cx,y:cy-.5*s}]);
    ellipseFill(ctx,{x:cx,y:cy+.12*s},.56*s,.08*s);
  },
  gangkui: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#9aa2aa";
    ctx.beginPath(); ctx.arc(cx,cy,.42*s,Math.PI,0); ctx.closePath(); ctx.fill();
    ellipseFill(ctx,{x:cx,y:cy+.02*s},.46*s,.07*s);
    ctx.strokeStyle=shade("#9aa2aa",.7); ctx.lineWidth=Math.max(1,s*.05);
    line(ctx,{x:cx,y:cy-.4*s},{x:cx,y:cy-.02*s});
  },
  limao: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#3a3430";
    ctx.fillRect(cx-.22*s,cy-.56*s,.44*s,.62*s);
    ellipseFill(ctx,{x:cx,y:cy+.05*s},.5*s,.07*s);
    ctx.fillStyle="#5a2a34"; ctx.fillRect(cx-.22*s,cy-.18*s,.44*s,.08*s);
  },
  doupeng: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#7a6a52";
    ellipseFill(ctx,{x:cx,y:cy},.42*s,.5*s);
    ctx.fillStyle="rgba(20,22,26,0.55)";
    ellipseFill(ctx,{x:cx,y:cy+.08*s},.26*s,.32*s);
  },
  guanghuan: function (ctx,cx,cy,s,t) {
    ctx.strokeStyle="#e3c35a"; ctx.lineWidth=Math.max(1.5,s*.07);
    ellipseStroke(ctx,{x:cx,y:cy-.5*s},.4*s,.16*s);
  },
  yanjing: function (ctx,cx,cy,s,t) {
    ctx.strokeStyle="#5a5248"; ctx.lineWidth=Math.max(1,s*.05);
    ellipseStroke(ctx,{x:cx-.18*s,y:cy},.16*s,.16*s);
    ellipseStroke(ctx,{x:cx+.18*s,y:cy},.16*s,.16*s);
    line(ctx,{x:cx-.02*s,y:cy},{x:cx+.02*s,y:cy});
  },
  humu: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#33424c";
    ellipseFill(ctx,{x:cx-.24*s,y:cy},.2*s,.16*s);
    ellipseFill(ctx,{x:cx+.24*s,y:cy},.2*s,.16*s);
    ctx.fillStyle="rgba(180,220,230,0.7)";
    dot(ctx,{x:cx-.28*s,y:cy-.04*s},.05*s); dot(ctx,{x:cx+.2*s,y:cy-.04*s},.05*s);
    ctx.strokeStyle="#2a3036"; ctx.lineWidth=Math.max(2,s*.08);
    line(ctx,{x:cx-.46*s,y:cy-.12*s},{x:cx+.46*s,y:cy-.12*s});
  },
  erji: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#3a4048";
    ellipseFill(ctx,{x:cx-.42*s,y:cy+.02*s},.15*s,.22*s);
    ellipseFill(ctx,{x:cx+.42*s,y:cy+.02*s},.15*s,.22*s);
    ctx.strokeStyle="#3a4048"; ctx.lineWidth=Math.max(2,s*.08);
    ctx.beginPath(); ctx.arc(cx,cy+.02*s,.44*s,Math.PI*1.15,Math.PI*1.85); ctx.stroke();
  },
  /* ---- 背部 ---- */
  beibao: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#8a6a44";
    rr(ctx,cx-.32*s,cy-.4*s,.64*s,.82*s,.08*s);
    ctx.fillStyle="#7a5a38";
    rr(ctx,cx-.32*s,cy-.4*s,.64*s,.22*s,.08*s);
    ctx.fillStyle="#6a4e32";
    rr(ctx,cx-.14*s,cy+.06*s,.28*s,.22*s,.05*s);
    ctx.fillStyle="#b8a878";
    ellipseFill(ctx,{x:cx,y:cy-.46*s},.2*s,.12*s);
  },
  pifeng: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#9a3b34";
    fillPts(ctx,[{x:cx-.26*s,y:cy-.4*s},{x:cx+.26*s,y:cy-.4*s},
      {x:cx+.34*s,y:cy+.5*s},{x:cx-.34*s,y:cy+.5*s}]);
    ctx.strokeStyle=shade("#9a3b34",.7); ctx.lineWidth=Math.max(1,s*.04);
    line(ctx,{x:cx,y:cy-.38*s},{x:cx,y:cy+.48*s});
  },
  /* ---- 手持 ---- */
  yuandun: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#b0a68c";
    ellipseFill(ctx,{x:cx,y:cy},.42*s,.42*s);
    ctx.fillStyle="#8a8070";
    ellipseFill(ctx,{x:cx,y:cy},.14*s,.14*s);
    ctx.strokeStyle=shade("#b0a68c",.7); ctx.lineWidth=Math.max(1.5,s*.05);
    line(ctx,{x:cx-.36*s,y:cy},{x:cx+.36*s,y:cy});
    line(ctx,{x:cx,y:cy-.36*s},{x:cx,y:cy+.36*s});
  },
  changjian: function (ctx,cx,cy,s,t) {
    ctx.fillStyle="#dfe6ff";
    fillPts(ctx,[{x:cx,y:cy-.62*s},{x:cx+.07*s,y:cy-.02*s},{x:cx-.07*s,y:cy-.02*s}]);
    ctx.strokeStyle="#6a4e32"; ctx.lineWidth=Math.max(2,s*.07);
    line(ctx,{x:cx-.14*s,y:cy},{x:cx+.14*s,y:cy});
    ctx.strokeStyle="#4a3624"; ctx.lineWidth=Math.max(2,s*.08);
    line(ctx,{x:cx,y:cy},{x:cx,y:cy+.2*s});
    ctx.fillStyle="#b06a3a"; dot(ctx,{x:cx,y:cy+.24*s},.06*s);
  },
  gong: function (ctx,cx,cy,s,t) {
    ctx.strokeStyle="#7a5a38"; ctx.lineWidth=Math.max(2,s*.06);
    ctx.beginPath(); ctx.arc(cx,cy,.42*s,-0.8,0.8); ctx.stroke();
    ctx.strokeStyle="rgba(240,240,230,0.85)"; ctx.lineWidth=Math.max(1,s*.02);
    line(ctx,{x:cx+Math.cos(-.8)*.42*s,y:cy+Math.sin(-.8)*.42*s},
            {x:cx+Math.cos(.8)*.42*s,y:cy+Math.sin(.8)*.42*s});
  },
  fazhang: function (ctx,cx,cy,s,t) {
    ctx.strokeStyle="#5a4228"; ctx.lineWidth=Math.max(2,s*.05);
    line(ctx,{x:cx,y:cy+.3*s},{x:cx,y:cy-.4*s});
    if (K.glowDot) K.glowDot(ctx,{x:cx,y:cy-.46*s},.2*s,"#7bd0e0",0.85);
    dot(ctx,{x:cx,y:cy-.4*s},.08*s);
  }
};

var TYPE = {
  douli:"head",gangkui:"head",limao:"head",doupeng:"head",guanghuan:"head",
  yanjing:"head",humu:"head",erji:"head", beibao:"back",pifeng:"back",
  yuandun:"hand",changjian:"hand",gong:"hand",fazhang:"hand"
};
function defaultAnchor(id, W, H) {
  var tp = TYPE[id];
  if (tp==="head") return { x:W/2, y:H*.34 };
  if (tp==="back") return { x:W*.42, y:H*.52 };
  return { x:W*.6, y:H*.5 };
}

K.drawAccessory = function (ctx, id, anchor, view) {
  var v = view||{}, W=v.width, H=v.height, t=v.theme||{accent:"#d5a17d",foreground:"#edf0e9"};
  var s = v.scale || Math.min(W,H)*.3;
  var def = defaultAnchor(id,W,H);
  var anc = anchor || { x:(v.x||0)+def.x, y:(v.y||0)+def.y };
  var fn = ACCFN[id];
  ctx.save();
  try { if (fn) fn(ctx, anc.x, anc.y, s, t, v.phase||0); } finally { ctx.restore(); }
  return { supported:!!fn, bounds:{x:anc.x-s,y:anc.y-s,width:2*s,height:2*s},
    anchors:{ mount:anc }, reason:fn?undefined:"unknown-accessory:"+id };
};

function drawAccessoryEntry(ctx,W,H,st,app,theme,phase) {
  var anc = defaultAnchor(app.arch,W,H);
  K.drawAccessory(ctx, app.arch, anc, {width:W,height:H,theme:theme,phase:phase});
  return { bounds:{x:0.05,y:0.05,w:0.9,h:0.9}, anchors:{ mount:anc } };
}

Object.keys(ACCFN).forEach(function (id) {
  K.register({ id:id, category:"accessory",
    label:{zh:{douli:"斗笠",gangkui:"钢盔",limao:"礼帽",doupeng:"兜帽",guanghuan:"光环",
      yanjing:"眼镜",humu:"护目镜",erji:"耳机",beibao:"背包",pifeng:"披风",
      yuandun:"圆盾",changjian:"长剑",gong:"弓",fazhang:"法杖"}[id], en:id},
    defaultColor:"#cccccc", size:{width:96,height:96}, actions:[],
    states:[], params:[], source:"kit/accessories.js", draw:drawAccessoryEntry,
    limits:["独立展示为默认位置；宿主用 K.drawAccessory 锚定人物"] });
});
})(typeof window !== "undefined" ? window : globalThis);

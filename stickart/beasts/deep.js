// 纯表现层：无状态、无时钟、无随机、无网络，同输入同画面
/* =====================================================================
 * StickArt · deep（深山带 · 高级）
 * 依赖（按序）：stickart-core.js、quad.js
 * 影狼 / 岩傀儡（岩傀儡线宽 1.5 倍、棱角岩石轮廓、无毛发）
 * ===================================================================== */
(function (global) {
"use strict";
var SA = global.StickArt, PI = Math.PI, sin = Math.sin;
function seg(ctx,a,b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function pl(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(var i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();}
function dot(ctx,p,r){ctx.beginPath();ctx.arc(p.x,p.y,r,0,PI*2);ctx.fill();}

/* ---------------- 岩傀儡 ---------------- */
function drawGolem(ctx,W,H,st){
  ctx.strokeStyle=st.color; ctx.fillStyle=st.color;
  ctx.lineWidth=Math.max(2,W*0.018)*1.5;
  ctx.lineCap="round"; ctx.lineJoin="miter"; ctx.miterLimit=6;
  var ground=H-4, cx=W/2, ph=st.phase, act=st.action;

  if(act==="dead"){ golemDead(ctx,W,H,cx,ground);
    return { bounds:{x:.1,y:.8,w:.8,h:.16},
      anchors:{head:{x:.3,y:.92},mouth:{x:.32,y:.94},tail:{x:.8,y:.92}} };
  }

  var gy=ground-H*.62, bodyH=H*.28;
  var lean=0, armSwing=0, legPh=0, eyeClosed=false, bob=sin(ph*1.2)*.6;
  switch(act){
    case "walk": legPh=sin(ph*3); bob=Math.abs(sin(ph*3))*1.2; break;
    case "attack": lean=-10; armSwing=1; break;
    case "hurt": lean=8; eyeClosed=true; break;
  }
  var ox=lean;

  /* 腿 */
  var hipL={x:cx-14+ox,y:gy+bodyH}, hipR={x:cx+16+ox,y:gy+bodyH};
  var fL=2,fR=-2;
  if(act==="walk"){fL=legPh*7;fR=-legPh*7;}
  else if(act==="attack"){fL=-14;fR=10;}
  else if(act==="hurt"){fL=6;fR=-8;}
  var midY=(gy+bodyH+ground)/2;
  pl(ctx,[hipL,{x:hipL.x+fL*.4,y:midY},{x:hipL.x+fL,y:ground}]);
  pl(ctx,[hipR,{x:hipR.x+fR*.4,y:midY},{x:hipR.x+fR,y:ground}]);
  /* 脚（岩块） */
  pl(ctx,[{x:hipL.x+fL-6,y:ground},{x:hipL.x+fL+6,y:ground},{x:hipL.x+fL+5,y:ground-7},{x:hipL.x+fL-5,y:ground-7}]);
  pl(ctx,[{x:hipR.x+fR-6,y:ground},{x:hipR.x+fR+6,y:ground},{x:hipR.x+fR+5,y:ground-7},{x:hipR.x+fR-5,y:ground-7}]);

  /* 躯干（不规则岩块） */
  var shL={x:cx-30+ox,y:gy+bob}, shR={x:cx+26+ox,y:gy+4+bob},
      waR={x:cx+20+ox,y:gy+bodyH}, waL={x:cx-22+ox,y:gy+bodyH+4};
  pl(ctx,[shL,shR,waR,waL,shL]);
  /* 裂纹 */
  seg(ctx,{x:cx-8+ox,y:gy+10},{x:cx-2+ox,y:gy+20});
  seg(ctx,{x:cx+10+ox,y:gy+8},{x:cx+6+ox,y:gy+22});
  if(act==="hurt"){seg(ctx,{x:cx-16+ox,y:gy+14},{x:cx-8+ox,y:gy+30});}

  /* 头（小岩块，在 -x 半区） */
  var hc={x:cx-18+ox,y:gy-15+bob};
  pl(ctx,[{x:hc.x-9,y:hc.y+2},{x:hc.x-2,y:hc.y-8},{x:hc.x+9,y:hc.y-3},
    {x:hc.x+7,y:hc.y+8},{x:hc.x-4,y:hc.y+9},{x:hc.x-9,y:hc.y+2}]);
  seg(ctx,{x:shL.x+6,y:gy},{x:hc.x+8,y:hc.y+6});
  var eye={x:hc.x-3,y:hc.y-1};
  if(eyeClosed)seg(ctx,{x:eye.x-3,y:eye.y},{x:eye.x+3,y:eye.y});
  else dot(ctx,eye,2.2);

  /* 臂 */
  if(armSwing===1){
    pl(ctx,[shL,{x:cx-52+ox,y:gy+30},{x:cx-58+ox,y:gy+54}]);
    var f1={x:cx-58+ox,y:gy+54};
    pl(ctx,[{x:f1.x-8,y:f1.y},{x:f1.x+8,y:f1.y},{x:f1.x+7,y:f1.y-12},{x:f1.x-7,y:f1.y-12},{x:f1.x-8,y:f1.y}]);
    pl(ctx,[shR,{x:cx+40+ox,y:gy+34}]);
  } else {
    var sw=act==="walk"?legPh*4:0;
    pl(ctx,[shL,{x:cx-40+ox+sw*.5,y:gy+bodyH*.55},{x:cx-42+ox+sw,y:gy+bodyH+6}]);
    var f2={x:cx-42+ox+sw,y:gy+bodyH+6};
    pl(ctx,[{x:f2.x-6,y:f2.y},{x:f2.x+6,y:f2.y},{x:f2.x+5,y:f2.y-9},{x:f2.x-5,y:f2.y-9},{x:f2.x-6,y:f2.y}]);
    pl(ctx,[shR,{x:cx+36+ox-sw*.4,y:gy+bodyH*.6},{x:cx+38+ox-sw,y:gy+bodyH+4}]);
  }

  return { bounds:{x:.18,y:.2,w:.64,h:.74},
    anchors:{ head:{x:hc.x/W,y:hc.y/H}, mouth:{x:(hc.x-6)/W,y:hc.y/H}, tail:{x:.7,y:.6} } };
}

function golemDead(ctx,W,H,cx,ground){
  function block(c,bw,bh,ir){
    var pts=[];
    for(var i=0;i<5;i++){
      var a=i/4, x=c.x-bw/2+a*bw,
        y=(i===0||i===4)?ground:ground-bh+ (ir[i]||0);
      pts.push({x:x,y:y});
    }
    pts.push({x:c.x-bw/2,y:ground});
    pl(ctx,pts);
  }
  block({x:cx-2},46,26,[-6,-2,-8,-3]);      /* 躯干块 */
  block({x:cx+34},30,16,[-4,-2,-5]);        /* 肩块 */
  block({x:cx-40},26,14,[-3,-5,-2]);        /* 拳块 */
  block({x:cx+48},22,12,[-2,-4]);           /* 拳块 */
  var hc={x:cx-44};
  pl(ctx,[{x:hc.x-12,y:ground},{x:hc.x-6,y:ground-14},{x:hc.x+6,y:ground-10},
    {x:hc.x+12,y:ground},{x:hc.x-12,y:ground}]);
  seg(ctx,{x:hc.x-6,y:ground-8},{x:hc.x+2,y:ground-8}); /* 眼闭 */
}

/* ---------------- 注册 ---------------- */
SA.register({
  id: "shadow_wolf", category: "beast",
  label: { zh: "影狼", en: "shadow_wolf" },
  size: { width: 230, height: 165 },
  actions: ["idle","walk","attack","hurt","howl","dead"],
  color: "#5e6d57",
  draw: function (ctx,W,H,st) { return SA.drawQuad(ctx,W,H,st,
    { legF:.4, lenF:1.08, bodyD:.11, neckLen:.18, headLen:.08,
      ear:"point", earLen:.09, tail:"down", tailLen:.24, mane:.7 }); }
});
SA.register({
  id: "rock_golem", category: "beast",
  label: { zh: "岩傀儡", en: "rock_golem" },
  size: { width: 220, height: 180 },
  actions: ["idle","walk","attack","hurt","dead"],
  color: "#7a7c72",
  draw: drawGolem
});
})(typeof window !== "undefined" ? window : globalThis);

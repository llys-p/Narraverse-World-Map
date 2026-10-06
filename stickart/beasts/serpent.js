// 纯表现层：无状态、无时钟、无随机、无网络，同输入同画面
/* =====================================================================
 * StickArt · serpent（蛇类通用线条骨架）
 * 依赖：stickart-core.js。暴露 StickArt.drawSerpent(ctx,W,H,st,cfg)
 * 纯描边单色；蛇身为一条连续曲线，头原生朝 -x。
 * 动作：idle / walk(滑行) / attack(扑咬) / hurt / dead(贴地软瘫)。
 * ===================================================================== */
(function (global) {
"use strict";
var SA = global.StickArt, PI = Math.PI, sin = Math.sin;

function setup(ctx,W,H,st){
  ctx.strokeStyle=st.color; ctx.fillStyle=st.color;
  ctx.lineWidth=Math.max(2,W*0.018);
  ctx.lineCap="round"; ctx.lineJoin="round";
}
function seg(ctx,a,b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function pl(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(var i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();}
function dot(ctx,p,r){ctx.beginPath();ctx.arc(p.x,p.y,r,0,PI*2);ctx.fill();}

var DEF = { amp:.11, freq:2, len:.62, head:"tri", pattern:0, headLift:.06 };

function drawSerpent(ctx,W,H,st,c0){
  var cfg={},k; for(k in DEF)cfg[k]=DEF[k]; for(k in c0)cfg[k]=c0[k];
  setup(ctx,W,H,st);
  var ground=H-4, ph=st.phase, act=st.action;

  var tailX=W*.87, baseY=ground-6;
  var headX=W*.27, headY=baseY-H*cfg.headLift;
  var amp=cfg.amp*H, wave=ph*.6, dead=false;

  switch(act){
    case "walk": wave=-ph*5; headY=baseY; break;
    case "attack": headX=W*.13; headY=baseY+H*.02; wave=ph*.4; break;
    case "hurt": headX=W*.31; headY=baseY+H*.03; amp*=1.3; wave=ph*1.2; break;
    case "dead": dead=true; amp=cfg.amp*H*.18; headY=ground-4; wave=0; break;
  }

  /* 蛇身：u=0 头 → 1 尾 */
  var N=44, pts=[];
  for(var i=0;i<=N;i++){
    var u=i/N;
    var x=headX+u*(tailX-headX);
    var y=baseY+amp*sin(u*cfg.freq*PI*2+wave);
    if(dead)y=ground-4+sin(u*PI)*2;
    pts.push({x:x,y:y});
  }
  pl(ctx,pts);

  /* 头 */
  var hp={x:headX,y:headY};
  if(cfg.head==="long"){
    var tip={x:headX-13,y:headY};
    pl(ctx,[{x:headX+5,y:headY-6},tip,{x:headX+5,y:headY+6}]);
    var eye={x:headX-2,y:headY-4};
    if(dead||act==="hurt")seg(ctx,{x:eye.x-3,y:eye.y},{x:eye.x+3,y:eye.y});
    else dot(ctx,eye,2.4);
    dot(ctx,tip,1.6);
  } else {
    var t2={x:headX-10,y:headY};
    pl(ctx,[{x:headX+3,y:headY-5},t2,{x:headX+3,y:headY+5},{x:headX+3,y:headY-5}]);
    var e2={x:headX-1,y:headY-3};
    if(dead||act==="hurt")seg(ctx,{x:e2.x-3,y:e2.y},{x:e2.x+3,y:e2.y});
    else dot(ctx,e2,2.3);
    dot(ctx,t2,1.6);
  }

  /* 信子：attack 常吐；idle 偶吐；dead/hurt 不吐 */
  var tongue = act==="attack" ? 1 : (act==="idle" && sin(ph*2)>.3 ? .7 : 0);
  if(tongue>0){
    var bx=cfg.head==="long"?headX-13:headX-10;
    var ex=bx-9*tongue;
    seg(ctx,{x:bx,y:headY},{x:ex,y:headY});
    seg(ctx,{x:ex,y:headY},{x:ex-3*tongue,y:headY-2});
    seg(ctx,{x:ex,y:headY},{x:ex-3*tongue,y:headY+2});
  }

  /* 蟒的斑纹（短斜线，纯描边） */
  if(cfg.pattern>0){
    for(var j=1;j<7;j++){
      var u=j/7, bx2=headX+u*(tailX-headX),
        by2=baseY+amp*sin(u*cfg.freq*PI*2+wave);
      seg(ctx,{x:bx2-2,y:by2-5},{x:bx2+2,y:by2+5});
    }
  }

  return {
    bounds:{x:.1,y:.4,w:.8,h:.5},
    anchors:{ head:{x:headX/W,y:headY/H}, mouth:{x:(headX-10)/W,y:headY/H} }
  };
}

SA.drawSerpent = drawSerpent;
})(typeof window !== "undefined" ? window : globalThis);

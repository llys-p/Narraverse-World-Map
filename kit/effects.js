/* =====================================================================
 * effects · 技能/粒子特效（通过 K.drawEffect 调用）
 * 画法机械提取自原“扩展素材库.html”，仅工程化封装；不重复实现。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;
var clamp=K.u.clamp,hex2rgb=K.u.hex2rgb,shade=K.u.shade,rgba=K.u.rgba,validHex=K.u.validHex,
 line=K.u.line,path2=K.u.path2,fillPts=K.u.fillPts,strokePts=K.u.strokePts,
 ellipseFill=K.u.ellipseFill,ellipseStroke=K.u.ellipseStroke,dot=K.u.dot,
 roundRectPath=K.u.roundRectPath,drawSelectedFrame=K.u.drawSelectedFrame;
/* glowDot/swordMini/bolt 由 effects 模块加载后挂到 K；运行时委托以兼容加载顺序 */
function glowDot(){return K.glowDot&&K.glowDot.apply(null,arguments);}
function swordMini(){return K.swordMini&&K.swordMini.apply(null,arguments);}
function bolt(){return K.bolt&&K.bolt.apply(null,arguments);}
/* ================= 技能 / 粒子特效（确定性，phase 驱动） ================= */
function glowDot(ctx,c,r,color,a){
  ctx.save();ctx.fillStyle=rgba(color,a==null?.22:a);
  ctx.beginPath();ctx.arc(c.x,c.y,r*2.1,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.fill();ctx.restore();
}
function swordMini(ctx,x,y,len,angle,color){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.lineJoin='round';
  ctx.fillStyle=color;
  ctx.beginPath();ctx.moveTo(0,-len);ctx.lineTo(len*.13,-len*.08);ctx.lineTo(-len*.13,-len*.08);ctx.closePath();ctx.fill();
  ctx.strokeStyle=shade(color,.7);ctx.lineWidth=Math.max(1,len*.06);
  ctx.beginPath();ctx.moveTo(-len*.18,-len*.08);ctx.lineTo(len*.18,-len*.08);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-len*.08);ctx.lineTo(0,len*.16);ctx.stroke();
  ctx.restore();
}
function bolt(ctx,a,b,color,phase){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);
  var segs=6;
  for(var i=1;i<segs;i++){var t=i/segs;var jx=Math.sin(i*12.9+phase*40)*(1-Math.abs(t-.5))*14;
    ctx.lineTo(a.x+(b.x-a.x)*t+jx,a.y+(b.y-a.y)*t);}
  ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
}
var FX={
 jianqi:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   for(var i=0;i<3;i++){var t=(p+i/3)%1;var x=W*(.15+t*.7);
     ctx.save();ctx.globalAlpha=(1-t)*.8;ctx.fillStyle='#eef4ff';
     ctx.beginPath();ctx.arc(x,c.y,W*.16,-.6,.6);ctx.lineTo(x,c.y);ctx.closePath();ctx.fill();ctx.restore();}},
 feijian:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   for(var i=0;i<5;i++){var a=p*Math.PI*2+i*Math.PI*2/5;
     swordMini(ctx,c.x+Math.cos(a)*W*.26,c.y+Math.sin(a)*H*.3,W*.2,a+Math.PI/2,'#dfe6ff');}},
 leiqiu:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   glowDot(ctx,c,W*.1,'#bfe0ff',.3);
   for(var i=0;i<6;i++){var a=i*Math.PI/3+p*2;
     bolt(ctx,c,{x:c.x+Math.cos(a)*W*.3,y:c.y+Math.sin(a)*H*.3},'#cfe8ff',p);}},
 huoqiu:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   glowDot(ctx,c,W*.16,'#e0703a',.3);glowDot(ctx,c,W*.1,'#ffd25a',.4);
   for(var i=0;i<8;i++){var a=i*Math.PI/4+p*3;var r=W*(.2+((p+i/8)%1)*.12);
     glowDot(ctx,{x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r},W*.02,'#ffb050',.3);}},
 bingci:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};var pu=1+Math.sin(p*Math.PI*2)*.12;
   for(var i=0;i<8;i++){var a=i*Math.PI/4;var x=c.x+Math.cos(a)*W*.3*pu,y=c.y+Math.sin(a)*H*.3*pu;
     ctx.fillStyle='rgba(150,210,240,.85)';
     fillPts(ctx,[{x:c.x+Math.cos(a)*W*.05,y:c.y+Math.sin(a)*H*.05},{x:x,y:y},{x:c.x+Math.cos(a+.3)*W*.06,y:c.y+Math.sin(a+.3)*H*.06}]);}},
 fengren:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   for(var i=0;i<3;i++){var a=p*4+i*Math.PI*2/3;
     ctx.save();ctx.strokeStyle=rgba('#8fd0c0',.7);ctx.lineWidth=W*.03;
     ctx.beginPath();ctx.arc(c.x,c.y,W*.24,a,a+1.1);ctx.stroke();ctx.restore();}},
 shuijian:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   ctx.save();ctx.strokeStyle=rgba('#6aa8e0',.6);ctx.lineWidth=W*.05;
   ctx.beginPath();ctx.arc(c.x,c.y,W*.2,p*3,p*3+1.4);ctx.stroke();ctx.restore();
   for(var i=0;i<6;i++){var t=(p+i/6)%1;
     glowDot(ctx,{x:c.x+Math.cos(p*3+.7)*W*.26*t,y:c.y+Math.sin(p*3+.7)*H*.26*t},W*.018,'#8fc4ee',.3);}},
 zhiliao:function(ctx,W,H,p,th){var c={x:W/2,y:H*.62};
   ctx.strokeStyle='#8ae08a';ctx.lineWidth=3;line(ctx,{x:c.x,y:c.y-H*.16},{x:c.x,y:c.y+H*.06});
   line(ctx,{x:c.x-W*.12,y:c.y-H*.05},{x:c.x+W*.12,y:c.y-H*.05});
   for(var i=0;i<8;i++){var t=(p+i/8)%1;
     glowDot(ctx,{x:c.x+Math.sin(i)*W*.14,y:c.y+H*.22-t*H*.5},W*.016,i%2?'#e3c35a':'#8ae08a',.3);}},
 huguang:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   ctx.save();
   for(var i=3;i>=1;i--){ctx.strokeStyle=rgba('#d5a17d',.18+i*.06);ctx.lineWidth=2;
     ellipseStroke(ctx,c,W*.18*i*.9,H*.26*i*.9);}
   ctx.restore();
   ctx.fillStyle=th.foreground;ellipseFill(ctx,{x:c.x,y:c.y+H*.05},W*.05,H*.14);dot(ctx,{x:c.x,y:c.y-H*.12},W*.06);},
 fazhen:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   ctx.save();ctx.strokeStyle=rgba('#d5a17d',.8);ctx.lineWidth=2;
   ellipseStroke(ctx,c,W*.34,H*.34);ellipseStroke(ctx,c,W*.26,H*.26);
   ctx.rotate(p*Math.PI*2);
   for(var i=0;i<6;i++){var a=i*Math.PI/3;
     line(ctx,{x:c.x+Math.cos(a)*W*.26,y:c.y+Math.sin(a)*H*.26},{x:c.x+Math.cos(a+Math.PI/3)*W*.26,y:c.y+Math.sin(a+Math.PI/3)*H*.26});}
   ctx.restore();
   for(var j=0;j<8;j++){var a2=j*Math.PI/4+p*2;glowDot(ctx,{x:c.x+Math.cos(a2)*W*.3,y:c.y+Math.sin(a2)*H*.3},W*.014,'#e3c35a',.3);}},
 fulu:function(ctx,W,H,p,th){var c={x:W/2,y:H*.44};
   ctx.save();ctx.translate(c.x,c.y);ctx.rotate(Math.sin(p*6)*.1);
   ctx.fillStyle='#e8dcc0';ctx.fillRect(-W*.09,-H*.16,W*.18,H*.32);
   ctx.strokeStyle='#c0403a';ctx.lineWidth=1.5;
   line(ctx,{x:-W*.05,y:-H*.1},{x:W*.05,y:-H*.1});line(ctx,{x:0,y:-H*.1},{x:0,y:H*.08});
   ctx.restore();
   for(var i=0;i<6;i++){var t=(p+i/6)%1;
     glowDot(ctx,{x:c.x+Math.sin(i*2)*W*.08,y:c.y-H*.18-t*H*.2},W*.016,'#e08a4a',.3);}},
 leiji:function(ctx,W,H,p,th){var c={x:W/2,y:H*.82};var top={x:W/2+Math.sin(p*8)*W*.1,y:H*.06};
   bolt(ctx,top,c,'#ffe08a',p);bolt(ctx,{x:top.x+8,y:top.y+10},{x:c.x+W*.12,y:c.y},'#fff2b0',p);
   glowDot(ctx,c,W*.08,'#ffe08a',.3);},
 duwu:function(ctx,W,H,p,th){var c={x:W/2,y:H*.6};
   for(var i=0;i<7;i++){var a=i*2+p;
     ctx.save();ctx.fillStyle=rgba('#8ac060',.18);
     ellipseFill(ctx,{x:c.x+Math.sin(a)*W*.22,y:c.y+Math.cos(a*.7)*H*.16},W*.13,H*.1);ctx.restore();}},
 jianzhen:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   for(var i=0;i<8;i++){var a=p*Math.PI*2+i*Math.PI/4;
     swordMini(ctx,c.x+Math.cos(a)*W*.3,c.y+Math.sin(a)*H*.3,W*.16,a-Math.PI/2,'#cfe0f0');}}
};
function heart(ctx,x,y,s,color){
  ctx.save();ctx.translate(x,y);ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(-s*.5,-s*.2,s*.5,0,Math.PI*2);ctx.arc(s*.5,-s*.2,s*.5,0,Math.PI*2);
  ctx.moveTo(-s,.0);ctx.lineTo(0,s*.9);ctx.lineTo(s,0);ctx.closePath();ctx.fill();ctx.restore();
}
Object.assign(FX,{
 feisheng:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   ctx.save();var g=ctx.createLinearGradient(0,H,0,0);
   g.addColorStop(0,'rgba(255,220,120,.05)');g.addColorStop(1,'rgba(255,240,180,.5)');
   ctx.fillStyle=g;ctx.fillRect(c.x-W*.1,0,W*.2,H);ctx.restore();
   ellipseStroke(ctx,{x:c.x,y:H*.8},W*.16,H*.05);
   for(var i=0;i<8;i++){var t=(p+i/8)%1;glowDot(ctx,{x:c.x+Math.sin(i*2)*W*.08,y:H*.85-t*H*.8},W*.016,'#ffe8a0',.3);}},
 baolie:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};var t=p;
   ctx.save();ctx.strokeStyle=rgba('#ffb060',1-t);ctx.lineWidth=3;
   ellipseStroke(ctx,c,W*.4*t,H*.4*t);ctx.restore();
   for(var i=0;i<10;i++){var a=i*Math.PI*2/10;
     glowDot(ctx,{x:c.x+Math.cos(a)*W*.4*t,y:c.y+Math.sin(a)*H*.4*t},W*.02,'#ffd28a',.3);}},
 bingdong:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   ctx.save();ctx.strokeStyle='rgba(160,220,245,.9)';ctx.lineWidth=2;
   for(var i=0;i<6;i++){var a=i*Math.PI/3;
     line(ctx,{x:c.x,y:c.y},{x:c.x+Math.cos(a)*W*.3,y:c.y+Math.sin(a)*H*.3});}
   ctx.beginPath();ctx.arc(c.x,c.y,W*.2,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle='rgba(180,225,245,.3)';ctx.fill();ctx.restore();},
 meihuo:function(ctx,W,H,p,th){var c={x:W/2,y:H*.7};
   for(var i=0;i<6;i++){var t=(p+i/6)%1;
     heart(ctx,c.x+Math.sin(i*2.5)*W*.16,c.y-t*H*.6,W*.07,rgba('#e07aa0',1-t));}},
 zhaohuan:function(ctx,W,H,p,th){var c={x:W/2,y:H*.7};
   ctx.save();ctx.strokeStyle=rgba('#8dcebf',.8);ctx.lineWidth=2;
   ellipseStroke(ctx,c,W*.26,H*.1);ctx.rotate(p*2);
   for(var i=0;i<6;i++){var a=i*Math.PI/3;line(ctx,c,{x:c.x+Math.cos(a)*W*.24,y:c.y+Math.sin(a)*H*.18});}
   ctx.restore();
   ctx.save();var g=ctx.createLinearGradient(0,H,0,H*.3);
   g.addColorStop(0,'rgba(141,206,191,.05)');g.addColorStop(1,'rgba(160,240,225,.5)');
   ctx.fillStyle=g;ctx.fillRect(c.x-W*.08,H*.3,W*.16,H*.5);ctx.restore();},
 foguang:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   ctx.save();for(var i=3;i>=1;i--){ctx.strokeStyle=rgba('#e3c35a',.12+i*.08);ctx.lineWidth=2;
     ellipseStroke(ctx,{x:c.x,y:c.y-H*.05},W*.13*i,H*.16*i);}ctx.restore();
   ctx.strokeStyle='#e3c35a';ctx.lineWidth=2.4;var u=W*.05,x=c.x,y=c.y-H*.05;
   line(ctx,{x:x-u,y:y},{x:x+u,y:y});line(ctx,{x:x,y:y-u},{x:x,y:y+u});
   line(ctx,{x:x-u,y:y-u},{x:x-u,y:y});line(ctx,{x:x+u,y:y},{x:x+u,y:y+u});},
 moyan:function(ctx,W,H,p,th){var c={x:W/2,y:H*.82};
   [[.5,.34],[.32,.5],[.68,.5]].forEach(function(t,i){
     ctx.fillStyle=rgba(i?'#5a2a6a':'#8a3a7a',.7);
     var f=Math.sin(p*6+i)*.04;
     fillPts(ctx,[{x:c.x-W*t[1],y:c.y},{x:c.x+f*W,y:c.y-H*t[0]},{x:c.x+W*t[1],y:c.y}]);});
   glowDot(ctx,{x:c.x,y:c.y-H*.1},W*.05,'#c050a0',.3);},
 xingchen:function(ctx,W,H,p,th){
   for(var i=0;i<5;i++){var t=(p+i/5)%1;var x=W*(.9-t*.8),y=H*(.05+t*.7);
     ctx.strokeStyle=rgba('#fff0c0',1-t);ctx.lineWidth=2;
     line(ctx,{x:x+W*.08,y:y-H*.08},{x:x,y:y});glowDot(ctx,{x:x,y:y},W*.018,'#fff2c0',.3);}},
 shunyi:function(ctx,W,H,p,th){var c={x:W/2,y:H/2};
   for(var i=2;i>=0;i--){var t=((p+i/3)%1);
     ctx.save();ctx.globalAlpha=.25*(1-t);ctx.fillStyle='#8fd0ff';
     ellipseFill(ctx,{x:c.x-W*.3+t*W*.5,y:c.y+H*.05},W*.05,H*.14);
     dot(ctx,{x:c.x-W*.3+t*W*.5,y:c.y-H*.12},W*.06);ctx.restore();}},
 dici:function(ctx,W,H,p,th){
   for(var i=0;i<6;i++){var x=W*(.12+i*.15),h=H*(.18+Math.sin(p*6+i)*.05);
     ctx.fillStyle=rgba('#a08a66',.85);
     fillPts(ctx,[{x:x-W*.04,y:H*.84},{x:x,y:H*.84-h},{x:x+W*.04,y:H*.84}]);}},
 tengman:function(ctx,W,H,p,th){var g=p;
   ctx.strokeStyle='#5a8a4a';ctx.lineWidth=W*.03;ctx.beginPath();
   for(var i=0;i<=8;i++){var t=i/8;var x=W*.2+Math.sin(t*6+p)*W*.12,y=H*.85-t*H*.65;
     i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
   ctx.fillStyle='#7ab05a';ellipseFill(ctx,{x:W*.3,y:H*.4},W*.04,H*.03);},
 jianyu:function(ctx,W,H,p,th){
   for(var i=0;i<7;i++){var t=(p+i/7)%1;var x=W*(.08+(i*1.3)%W/ W),y=-H*.1+t*H*1.1;
     swordMini(ctx,x,y,W*.14,Math.PI,'#cfe0f0');}},
 danhuo:function(ctx,W,H,p,th){var c={x:W/2,y:H*.7};
   ctx.fillStyle='#6a5040';ctx.fillRect(c.x-W*.2,c.y,W*.4,H*.14);
   glowDot(ctx,{x:c.x,y:c.y-H*.04},W*.08,'#e08a4a',.3);
   for(var i=0;i<6;i++){var t=(p+i/6)%1;
     glowDot(ctx,{x:c.x+Math.sin(i*2)*W*.14,y:c.y-H*.06-t*H*.3},W*.014,'#ffb060',.3);}}
});
/* ================= 道具 ================= */

/* ---------------- drawEffect 独立试验接口 ----------------
 * effect:{ archetype }, view:{ x,y,width,height,phase|progress, theme, from,to,seed }
 * 纯视觉：不产生伤害/回血/召唤等世界事实。
 * ------------------------------------------------------------------ */
K.glowDot = glowDot; K.swordMini = swordMini; K.bolt = bolt;
K.drawEffect = function (ctx, effect, view) {
  var id = effect.archetype || effect.id;
  var fn = FX[id];
  var W = view.width, H = view.height;
  var phase = view.phase != null ? view.phase : (view.progress != null ? view.progress : 0);
  var theme = (function (t) {
    t = t || {};
    return {surface:t.surface||"#14181c",foreground:t.foreground||"#edf0e9",accent:t.accent||"#d5a17d"};
  })(view.theme);
  var supported = !!fn;
  ctx.save();
  try {
    ctx.translate(view.x||0, view.y||0);
    ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
    if (fn) fn(ctx,W,H,phase,theme);
  } finally { ctx.restore(); }
  var out = {supported:supported,bounds:{x:view.x||0,y:view.y||0,width:W,height:H},anchors:{}};
  if (!supported) out.reason = "unknown-effect:"+id;
  return out;
};
K.register({id:"jianqi",category:"effect",label:{zh:"剑气斩",en:"jianqi"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"feijian",category:"effect",label:{zh:"御剑术",en:"feijian"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"leiqiu",category:"effect",label:{zh:"掌心雷",en:"leiqiu"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"huoqiu",category:"effect",label:{zh:"火球术",en:"huoqiu"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"bingci",category:"effect",label:{zh:"冰刺术",en:"bingci"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"fengren",category:"effect",label:{zh:"风刃",en:"fengren"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"shuijian",category:"effect",label:{zh:"水箭",en:"shuijian"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"zhiliao",category:"effect",label:{zh:"治疗术",en:"zhiliao"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"huguang",category:"effect",label:{zh:"护体罡气",en:"huguang"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"fazhen",category:"effect",label:{zh:"法阵",en:"fazhen"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"fulu",category:"effect",label:{zh:"符箓",en:"fulu"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"leiji",category:"effect",label:{zh:"雷击",en:"leiji"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"duwu",category:"effect",label:{zh:"毒雾",en:"duwu"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"jianzhen",category:"effect",label:{zh:"剑阵",en:"jianzhen"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"feisheng",category:"effect",label:{zh:"飞升光柱",en:"feisheng"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"baolie",category:"effect",label:{zh:"爆裂",en:"baolie"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"bingdong",category:"effect",label:{zh:"冰冻",en:"bingdong"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"meihuo",category:"effect",label:{zh:"魅惑",en:"meihuo"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"zhaohuan",category:"effect",label:{zh:"召唤阵",en:"zhaohuan"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"foguang",category:"effect",label:{zh:"佛光",en:"foguang"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"moyan",category:"effect",label:{zh:"魔焰",en:"moyan"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"xingchen",category:"effect",label:{zh:"流星",en:"xingchen"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"shunyi",category:"effect",label:{zh:"瞬移",en:"shunyi"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"dici",category:"effect",label:{zh:"地刺",en:"dici"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"tengman",category:"effect",label:{zh:"藤蔓",en:"tengman"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"jianyu",category:"effect",label:{zh:"剑雨",en:"jianyu"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});
K.register({id:"danhuo",category:"effect",label:{zh:"丹火",en:"danhuo"},defaultColor:"#d5a17d",size:{width:128,height:128},actions:[],states:["phase/progress"],params:["from", "to", "seed", "style"],source:"kit/effects.js",draw:null,limits:["纯视觉，不产生伤害/回血/召唤等世界事实", "需宿主提供锚点/progress/phase", "通过 K.drawEffect 调用"]});})(typeof window !== "undefined" ? window : globalThis);

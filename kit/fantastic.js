/* =====================================================================
 * creatures · 奇幻生物
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
function drawDragon(ctx,W,H,st,app,theme,phase){
  var main=app.color,dark=shade(main,.6),w2=Math.sin(phase*Math.PI*2)*0.02;
  function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();if(st.facing==='left'){ctx.translate(W,0);ctx.scale(-1,1);}ctx.lineCap='round';ctx.lineJoin='round';
  // 翼
  ctx.fillStyle=dark;
  fillPts(ctx,[P(.42,.4),P(.3,.06),P(.52,.3)]);
  fillPts(ctx,[P(.5,.42),P(.62,.1),P(.6,.34)]);
  // 身（粗 S）
  ctx.strokeStyle=main;ctx.lineWidth=H*.12;
  ctx.beginPath();ctx.moveTo(W*.08,H*.74);
  ctx.quadraticCurveTo(W*.22,H*(.5+w2),W*.4,H*.62);
  ctx.quadraticCurveTo(W*.58,H*(.7+w2),W*.7,H*.42);ctx.stroke();
  // 爪
  ctx.strokeStyle=dark;ctx.lineWidth=W*.03;
  line(ctx,P(.38,.64),P(.36,.82));line(ctx,P(.5,.66),P(.52,.82));
  // 头、角、眼
  ctx.fillStyle=main;ellipseFill(ctx,P(.76,.36),W*.09,H*.08);
  ctx.strokeStyle=shade(main,1.3);ctx.lineWidth=W*.02;
  line(ctx,P(.72,.3),P(.68,.18));line(ctx,P(.8,.29),P(.8,.16));
  ctx.fillStyle='#221d18';dot(ctx,P(.78,.34),W*.016);
  // 尾刺
  ctx.fillStyle=dark;fillPts(ctx,[P(.08,.74),P(.0,.66),P(.04,.8)]);
  ctx.restore();
}
function drawSlime(ctx,W,H,st,app,theme){
  var main=app.color;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();
  ctx.fillStyle=rgba(main,.62);
  ctx.beginPath();ctx.moveTo(W*.2,H*.82);
  ctx.quadraticCurveTo(W*.16,H*.34,W*.5,H*.3);
  ctx.quadraticCurveTo(W*.84,H*.34,W*.8,H*.82);
  ctx.lineTo(W*.68,H*.78);ctx.lineTo(W*.56,H*.84);ctx.lineTo(W*.44,H*.78);ctx.lineTo(W*.32,H*.84);ctx.closePath();ctx.fill();
  ctx.fillStyle='#221d18';dot(ctx,P(.42,.56),W*.026);dot(ctx,P(.58,.56),W*.026);
  ctx.strokeStyle='#221d18';ctx.lineWidth=1.5;line(ctx,P(.42,.68),P(.58,.68));
  ctx.fillStyle='rgba(255,255,255,.5)';ellipseFill(ctx,P(.38,.44),W*.04,H*.05);
  ctx.restore();
}
function drawGriffin(ctx,W,H,st,app,theme,phase){
  var body=app.color,headc=shade(body,1.2),flap=st.action==='fly'?-Math.cos(phase*Math.PI*2):0;
  function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=shade(body,.8);
  fillPts(ctx,[P(.5,.4),P(.34,.1+flap*.1),P(.5,.34)]);
  ctx.fillStyle=body;ellipseFill(ctx,P(.45,.6),W*.24,H*.2);
  ctx.strokeStyle=shade(body,.6);ctx.lineWidth=W*.035;
  [[.3,.66,.3,.84],[.42,.66,.42,.84],[.54,.66,.54,.84],[.62,.66,.62,.84]].forEach(function(l){
    line(ctx,P(l[0],l[1]),P(l[2],l[3]));});
  ellipseFill(ctx,P(.7,.4),W*.09,H*.08);
  ctx.fillStyle=headc;fillPts(ctx,[P(.74,.38),P(.9,.4),P(.74,.46)]);
  ctx.fillStyle='#221d18';dot(ctx,P(.72,.38),W*.016);
  ctx.restore();
}
function drawGargoyle(ctx,W,H,st,app,theme){
  var main=app.color,dark=shade(main,.7);function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=dark;fillPts(ctx,[P(.4,.5),P(.2,.12),P(.5,.42)]);fillPts(ctx,[P(.6,.5),P(.8,.12),P(.5,.42)]);
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.62),W*.2,H*.24);
  ellipseFill(ctx,P(.5,.38),W*.09,H*.08);
  ctx.strokeStyle=dark;ctx.lineWidth=W*.03;line(ctx,P(.44,.32),P(.4,.2));line(ctx,P(.56,.32),P(.6,.2));
  ctx.fillStyle='#e0c060';dot(ctx,P(.47,.37),W*.014);dot(ctx,P(.53,.37),W*.014);
  ctx.restore();
}
function drawImp(ctx,W,H,st,app,theme,phase){
  var main=app.color,dark=shade(main,.65);function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=dark;fillPts(ctx,[P(.42,.46),P(.2,.24),P(.46,.4)]);fillPts(ctx,[P(.58,.46),P(.8,.24),P(.54,.4)]);
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.6),W*.16,H*.22);ellipseFill(ctx,P(.5,.36),W*.09,H*.08);
  ctx.strokeStyle=dark;ctx.lineWidth=W*.02;line(ctx,P(.46,.3),P(.42,.18));line(ctx,P(.54,.3),P(.58,.18));
  ctx.fillStyle='#221d18';dot(ctx,P(.47,.35),W*.013);dot(ctx,P(.53,.35),W*.013);
  // 三叉
  ctx.strokeStyle='#c8c4b4';ctx.lineWidth=W*.02;
  line(ctx,P(.74,.72),P(.74,.3));[.7,.74,.78].forEach(function(x){line(ctx,P(x,.36),P(x,.28));});
  ctx.restore();
}
function drawElemental(ctx,W,H,st,app,theme,phase){
  var main=app.color,f=Math.sin(phase*Math.PI*2)*0.03;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();
  [[.5,.34,.42],[.34,.46,.3],[.66,.46,.3]].forEach(function(t){
    ctx.fillStyle=rgba(main,.5);
    fillPts(ctx,[P(t[0]-t[2],.8),P(t[0],t[1]+f),P(t[0]+t[2],.8)]);});
  ctx.fillStyle=shade(main,1.3);ellipseFill(ctx,P(.5,.62),W*.1,H*.14);
  ctx.fillStyle='#221d18';dot(ctx,P(.46,.58),W*.016);dot(ctx,P(.54,.58),W*.016);
  ctx.restore();
}
function drawBeholder(ctx,W,H,st,app,theme,phase){
  var main=app.color;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineCap='round';
  [.3,.42,.58,.7].forEach(function(x,i){ctx.strokeStyle=shade(main,.8);ctx.lineWidth=W*.015;
    line(ctx,P(x,.3),P(x,.14+(i%2)*.04));ctx.fillStyle=shade(main,1.2);dot(ctx,P(x,.12+(i%2)*.04),W*.025);
    ctx.fillStyle='#221d18';dot(ctx,P(x,.12+(i%2)*.04),W*.012);});
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.55),W*.3,H*.3);
  ctx.fillStyle='#fff';ellipseFill(ctx,P(.5,.5),W*.1,H*.11);
  ctx.fillStyle=app.color;ellipseFill(ctx,P(.5,.5),W*.06,H*.07);
  ctx.fillStyle='#221d18';dot(ctx,P(.5,.5),W*.03);
  ctx.strokeStyle='#221d18';ctx.lineWidth=1.5;
  for(var i=-3;i<=3;i++){line(ctx,P(.5+i*.03,.66),P(.5+i*.03,.72));}
  ctx.restore();
}

/* 独角兽：复用马结构 + 前额角 */
var FANTFN={dragon:drawDragon,slime:drawSlime,griffin:drawGriffin,gargoyle:drawGargoyle,imp:drawImp,elemental:drawElemental,beholder:drawBeholder};

function drawFantasticLib(ctx,W,H,st,app,theme,phase){
  var r=FANTFN[app.arch](ctx,W,H,st,app,theme,phase);
  return r||{bounds:{x:0.06,y:0.08,w:0.88,h:0.86},
    anchors:{head:{x:0.5,y:0.35},feet:{x:0.5,y:0.9}}};
}
K.register({id:"dragon",category:"creature",label:{zh:"龙",en:"dragon"},defaultColor:"#8a3a3a",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});
K.register({id:"slime",category:"creature",label:{zh:"史莱姆",en:"slime"},defaultColor:"#7ac060",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});
K.register({id:"griffin",category:"creature",label:{zh:"狮鹫",en:"griffin"},defaultColor:"#b08a50",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});
K.register({id:"gargoyle",category:"creature",label:{zh:"石像鬼",en:"gargoyle"},defaultColor:"#8b8e86",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});
K.register({id:"imp",category:"creature",label:{zh:"小恶魔",en:"imp"},defaultColor:"#b0504a",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});
K.register({id:"elemental",category:"creature",label:{zh:"元素",en:"elemental"},defaultColor:"#e0703a",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});
K.register({id:"beholder",category:"creature",label:{zh:"眼魔",en:"beholder"},defaultColor:"#8a5aa0",size:{width:140,height:112},actions:["idle"],states:["facing", "selected"],params:["color"],source:"kit/fantastic.js",draw:drawFantasticLib,limits:["bounds 为通用近似"]});})(typeof window !== "undefined" ? window : globalThis);

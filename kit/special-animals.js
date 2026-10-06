/* =====================================================================
 * creatures · 特殊结构动物（蛇/鱼/蝙蝠/蜘蛛/蟹/蛙/龟/鸡/猫头鹰/鼠）
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
function drawSnake(ctx,W,H,st,app,theme,phase){
  var main=app.color,w2=Math.sin(phase*Math.PI*2)*0.03;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();if(st.facing==='left'){ctx.translate(W,0);ctx.scale(-1,1);}ctx.lineCap='round';
  ctx.strokeStyle=main;ctx.lineWidth=H*0.1;
  ctx.beginPath();ctx.moveTo(W*.08,H*.62);
  ctx.quadraticCurveTo(W*.25,H*(.3+w2),W*.42,H*.6);
  ctx.quadraticCurveTo(W*.6,H*(.9+w2),W*.78,H*.56);ctx.stroke();
  ctx.fillStyle=main;ellipseFill(ctx,P(.83,.52),W*.06,H*.08);
  ctx.fillStyle='#221d18';dot(ctx,P(.85,.48),W*.014);
  ctx.strokeStyle='#d94a4a';ctx.lineWidth=1.5;
  line(ctx,P(.89,.5),P(.95,.46));line(ctx,P(.89,.5),P(.95,.55));
  ctx.restore();
}
function drawFish(ctx,W,H,st,app,theme){
  var main=app.color;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();if(st.facing==='left'){ctx.translate(W,0);ctx.scale(-1,1);}ctx.lineJoin='round';
  ctx.fillStyle=shade(main,.85);fillPts(ctx,[P(.16,.5),P(.03,.3),P(.03,.7)]);
  ctx.fillStyle=main;ellipseFill(ctx,P(.46,.5),W*.3,H*.23);
  fillPts(ctx,[P(.42,.3),P(.56,.3),P(.5,.44)]);
  ctx.fillStyle='#fff';dot(ctx,P(.62,.42),W*.028);ctx.fillStyle='#221d18';dot(ctx,P(.62,.42),W*.014);
  ctx.restore();
}
function drawBat(ctx,W,H,st,app,theme,phase){
  var main=app.color,flap=-Math.cos(phase*Math.PI*2);function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=main;
  [-.5,.5].forEach(function(sd){var sh=P(.5,.46),tip=P(.5+sd*.46,.36+flap*.14),m1=P(.5+sd*.22,.62);
    fillPts(ctx,[sh,tip,m1]);});
  ctx.fillStyle=shade(main,1.12);ellipseFill(ctx,P(.5,.56),W*.07,H*.11);ellipseFill(ctx,P(.5,.38),W*.06,H*.06);
  ctx.fillStyle='#221d18';dot(ctx,P(.47,.36),W*.012);dot(ctx,P(.53,.36),W*.012);
  ctx.restore();
}
function drawSpider(ctx,W,H,st,app,theme){
  var main=app.color,dark=shade(main,.6);function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineCap='round';
  ctx.strokeStyle=shade(main,1.15);ctx.lineWidth=W*.022;
  for(var i=0;i<4;i++){var yy=.4+i*.07;
    line(ctx,P(.46,.42),P(.2,yy));line(ctx,P(.54,.42),P(.8,yy));}
  ctx.fillStyle=shade(main,.82);ellipseFill(ctx,P(.5,.62),W*.15,H*.18);
  ctx.fillStyle=shade(main,1.12);ellipseFill(ctx,P(.5,.4),W*.1,H*.07);
  ctx.fillStyle='#e05050';dot(ctx,P(.46,.37),W*.012);dot(ctx,P(.54,.37),W*.012);
  ctx.restore();
}
function drawCrab(ctx,W,H,st,app,theme){
  var main=app.color,dark=shade(main,.65);function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineCap='round';
  ctx.strokeStyle=dark;ctx.lineWidth=W*.02;
  for(var i=0;i<3;i++){line(ctx,P(.32,.6),P(.16,.5+i*.1));line(ctx,P(.68,.6),P(.84,.5+i*.1));}
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.58),W*.25,H*.17);
  ctx.fillStyle=dark;ellipseFill(ctx,P(.18,.45),W*.08,H*.06);ellipseFill(ctx,P(.82,.45),W*.08,H*.06);
  ctx.fillStyle='#fff';dot(ctx,P(.44,.44),W*.02);dot(ctx,P(.56,.44),W*.02);
  ctx.fillStyle='#221d18';dot(ctx,P(.44,.44),W*.01);dot(ctx,P(.56,.44),W*.01);
  ctx.restore();
}
function drawFrog(ctx,W,H,st,app,theme){
  var main=app.color;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=shade(main,.85);
  fillPts(ctx,[P(.3,.72),P(.12,.55),P(.2,.5)]);fillPts(ctx,[P(.7,.72),P(.88,.55),P(.8,.5)]);
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.6),W*.28,H*.22);
  ctx.fillStyle='#fff';ellipseFill(ctx,P(.4,.38),W*.07,H*.07);ellipseFill(ctx,P(.6,.38),W*.07,H*.07);
  ctx.fillStyle='#221d18';dot(ctx,P(.4,.38),W*.026);dot(ctx,P(.6,.38),W*.026);
  ctx.strokeStyle=shade(main,.6);ctx.lineWidth=1.5;line(ctx,P(.32,.58),P(.68,.58));
  ctx.restore();
}
function drawTurtle(ctx,W,H,st,app,theme){
  var main=app.color,dark=shade(main,.7);function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=dark;ellipseFill(ctx,P(.2,.66),W*.06,H*.05);ellipseFill(ctx,P(.5,.72),W*.06,H*.05);
  ellipseFill(ctx,P(.8,.62),W*.07,H*.06);
  ctx.fillStyle=main;ellipseFill(ctx,P(.45,.55),W*.3,H*.26);
  ctx.strokeStyle=dark;ctx.lineWidth=1.5;
  line(ctx,P(.3,.45),P(.6,.45));line(ctx,P(.35,.65),P(.55,.65));
  ellipseFill(ctx,P(.82,.5),W*.06,H*.05);
  ctx.restore();
}
function drawChicken(ctx,W,H,st,app,theme,phase){
  var main=app.color,nod=Math.sin(phase*Math.PI*2)*0.02;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineCap='round';
  ctx.strokeStyle=shade(main,.7);ctx.lineWidth=W*.03;
  line(ctx,P(.44,.72),P(.42,.95));line(ctx,P(.56,.72),P(.58,.95));
  ctx.fillStyle=shade(main,.85);fillPts(ctx,[P(.6,.5),P(.78,.42),P(.72,.6)]);
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.6),W*.2,H*.24);
  ellipseFill(ctx,P(.52,.3+nod),W*.08,H*.07);
  ctx.fillStyle='#d94a4a';
  fillPts(ctx,[P(.47,.24+nod),P(.5,.16+nod),P(.53,.24+nod),P(.56,.16+nod),P(.58,.25+nod)]);
  ctx.fillStyle='#e8b54a';fillPts(ctx,[P(.57,.3+nod),P(.7,.27+nod),P(.57,.36+nod)]);
  ctx.fillStyle='#d94a4a';ellipseFill(ctx,P(.5,.4+nod),W*.03,H*.04);
  ctx.restore();
}
function drawOwl(ctx,W,H,st,app,theme){
  var main=app.color;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=main;ellipseFill(ctx,P(.5,.55),W*.24,H*.3);
  ctx.fillStyle=shade(main,.7);fillPts(ctx,[P(.42,.28),P(.4,.16),P(.48,.26)]);fillPts(ctx,[P(.58,.28),P(.6,.16),P(.52,.26)]);
  ctx.fillStyle='#fff';ellipseFill(ctx,P(.4,.4),W*.08,H*.09);ellipseFill(ctx,P(.6,.4),W*.08,H*.09);
  ctx.fillStyle='#221d18';dot(ctx,P(.4,.4),W*.03);dot(ctx,P(.6,.4),W*.03);
  ctx.fillStyle='#e8b54a';fillPts(ctx,[P(.47,.48),P(.53,.48),P(.5,.55)]);
  ctx.restore();
}
function drawMouse(ctx,W,H,st,app,theme){
  var main=app.color;function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();ctx.lineCap='round';
  ctx.strokeStyle=shade(main,.7);ctx.lineWidth=W*.02;
  ctx.beginPath();ctx.moveTo(W*.3,H*.62);ctx.quadraticCurveTo(W*.1,H*.7,W*.12,H*.85);ctx.stroke();
  ctx.fillStyle=main;ellipseFill(ctx,P(.45,.6),W*.2,H*.16);
  ellipseFill(ctx,P(.66,.52),W*.1,H*.1);
  ctx.fillStyle='#e8a8b8';ellipseFill(ctx,P(.62,.42),W*.05,H*.06);ellipseFill(ctx,P(.72,.42),W*.05,H*.06);
  ctx.fillStyle='#221d18';dot(ctx,P(.7,.5),W*.014);
  ctx.restore();
}
/* ================= 奇幻生物 ================= */
var SPECIALFN={snake:drawSnake,fish:drawFish,bat:drawBat,spider:drawSpider,crab:drawCrab,frog:drawFrog,turtle:drawTurtle,chicken:drawChicken,owl:drawOwl,mouse:drawMouse};

function drawSpecialLib(ctx,W,H,st,app,theme,phase){
  var r=SPECIALFN[app.arch](ctx,W,H,st,app,theme,phase);
  return r||{bounds:{x:0.05,y:0.1,w:0.9,h:0.84},
    anchors:{head:{x:0.5,y:0.35},feet:{x:0.5,y:0.9}}};
}
K.register({id:"snake",category:"creature",label:{zh:"蛇",en:"snake"},defaultColor:"#6a8a5a",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"fish",category:"creature",label:{zh:"鱼",en:"fish"},defaultColor:"#7a9ab8",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"bat",category:"creature",label:{zh:"蝙蝠",en:"bat"},defaultColor:"#9aa4c4",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"spider",category:"creature",label:{zh:"蜘蛛",en:"spider"},defaultColor:"#8c6a90",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"crab",category:"creature",label:{zh:"蟹",en:"crab"},defaultColor:"#d06a4a",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"frog",category:"creature",label:{zh:"蛙",en:"frog"},defaultColor:"#7aa85a",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"turtle",category:"creature",label:{zh:"龟",en:"turtle"},defaultColor:"#6a9a5a",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"chicken",category:"creature",label:{zh:"鸡",en:"chicken"},defaultColor:"#e0b050",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"owl",category:"creature",label:{zh:"猫头鹰",en:"owl"},defaultColor:"#8a7a5a",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});
K.register({id:"mouse",category:"creature",label:{zh:"老鼠",en:"mouse"},defaultColor:"#9a948c",size:{width:120,height:96},actions:["idle"],states:["facing", "selected", "variant"],params:["color", "variant"],source:"kit/special-animals.js",draw:drawSpecialLib,limits:["附加动作/状态未实现", "bounds 为通用近似"]});})(typeof window !== "undefined" ? window : globalThis);

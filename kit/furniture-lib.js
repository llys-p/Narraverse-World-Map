/* =====================================================================
 * fixtures · 家具
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
var FURN={
 bed:function(ctx,W,H){
   ctx.fillStyle='#8a6a54';ctx.fillRect(W*.1,H*.56,W*.8,H*.1);
   ctx.fillStyle='#dccfb8';roundRectPath(ctx,W*.12,H*.46,W*.76,H*.18,H*.04);ctx.fill();
   ctx.fillStyle='#8a6a54';ctx.fillRect(W*.1,H*.4,W*.06,H*.34);
   ctx.fillStyle='#f0e8d8';ellipseFill(ctx,{x:W*.26,y:H*.5},W*.08,H*.05);},
 table:function(ctx,W,H){
   ctx.fillStyle='#8a6a4a';ctx.fillRect(W*.18,H*.46,W*.64,H*.08);
   ctx.fillRect(W*.22,H*.54,W*.05,H*.3);
   ctx.fillRect(W*.73,H*.54,W*.05,H*.3);},
 chair:function(ctx,W,H){
   ctx.fillStyle='#8a6a4a';ctx.fillRect(W*.3,H*.52,W*.4,H*.07);
   ctx.fillRect(W*.3,H*.3,W*.06,H*.24);ctx.fillRect(W*.64,H*.3,W*.06,H*.24);
   ctx.fillRect(W*.33,H*.59,W*.04,H*.25);ctx.fillRect(W*.63,H*.59,W*.04,H*.25);},
 bookshelf:function(ctx,W,H){
   ctx.fillStyle='#7a5a3c';ctx.fillRect(W*.2,H*.2,W*.6,H*.62);
   ctx.fillStyle='#5a422c';[.34,.5,.66].forEach(function(y){ctx.fillRect(W*.22,H*y,W*.56,H*.02);});
   [[.26,.27],[.4,.27],[.55,.43],[.3,.59],[.6,.59]].forEach(function(b,i){
     ctx.fillStyle=['#a05a4a','#4a6a8a','#6a8a5a','#b08a4a','#7a5a8a'][i];
     ctx.fillRect(W*b[0],H*b[1],W*.07,H*.06);});},
 counter:function(ctx,W,H){
   ctx.fillStyle='#8a6a54';ctx.fillRect(W*.16,H*.5,W*.68,H*.32);
   ctx.fillStyle='#5a4632';ctx.fillRect(W*.14,H*.46,W*.72,H*.06);},
 throne:function(ctx,W,H){
   ctx.fillStyle='#7a4a3a';ctx.fillRect(W*.3,H*.24,W*.4,H*.1);
   ctx.fillStyle='#9a6a4a';ctx.fillRect(W*.3,H*.34,W*.4,H*.3);
   ctx.fillStyle='#d5a17d';ctx.fillRect(W*.26,H*.4,W*.06,H*.24);ctx.fillRect(W*.68,H*.4,W*.06,H*.24);
   ctx.fillStyle='#c04050';ellipseFill(ctx,{x:W*.5,y:H*.3},W*.1,H*.14);},
 barrel:function(ctx,W,H){
   ctx.fillStyle='#8a6a44';ellipseFill(ctx,{x:W*.5,y:H*.52},W*.22,H*.32);
   ctx.strokeStyle='#5a4632';ctx.lineWidth=2;
   line(ctx,{x:W*.3,y:H*.4},{x:W*.7,y:H*.4});line(ctx,{x:W*.3,y:H*.64},{x:W*.7,y:H*.64});},
 crate:function(ctx,W,H){
   ctx.fillStyle='#9a7a4e';ctx.fillRect(W*.24,H*.34,W*.52,H*.42);
   ctx.strokeStyle='#6a5038';ctx.lineWidth=2;ctx.strokeRect(W*.24,H*.34,W*.52,H*.42);
   line(ctx,{x:W*.26,y:H*.36},{x:W*.74,y:H*.74});
   line(ctx,{x:W*.74,y:H*.36},{x:W*.26,y:H*.74});},
 fireplace:function(ctx,W,H,p){
   ctx.fillStyle='#6a5a52';ctx.fillRect(W*.22,H*.24,W*.56,H*.58);
   ctx.fillStyle='#2a201c';ctx.fillRect(W*.3,H*.5,W*.4,H*.3);
   glowDot(ctx,{x:W*.5,y:H*.66+Math.sin(p*8)*H*.01},W*.1,'#e0703a',.3);glowDot(ctx,{x:W*.5,y:H*.66},W*.05,'#ffd26a',.4);},
 anvil:function(ctx,W,H){
   ctx.fillStyle='#5a5e66';
   fillPts(ctx,[{x:W*.28,y:H*.4},{x:W*.72,y:H*.4},{x:W*.66,y:H*.5},{x:W*.6,y:H*.58},{x:W*.4,y:H*.58},{x:W*.34,y:H*.5}]);
   ctx.fillRect(W*.38,H*.58,W*.24,H*.1);ctx.fillRect(W*.3,H*.68,W*.4,H*.06);},
 forge:function(ctx,W,H,p){
   ctx.fillStyle='#6a5248';ctx.fillRect(W*.2,H*.4,W*.6,H*.42);
   ctx.fillStyle='#2a201c';ctx.fillRect(W*.28,H*.5,W*.44,H*.22);
   glowDot(ctx,{x:W*.5,y:H*.6+Math.sin(p*9)*H*.01},W*.09,'#e0703a',.3);
   ctx.strokeStyle=rgba('#888',.4);ctx.lineWidth=2;line(ctx,{x:W*.34,y:H*.4},{x:W*.3,y:H*.2});},
 wardrobe:function(ctx,W,H){
   ctx.fillStyle='#8a6a54';ctx.fillRect(W*.26,H*.2,W*.48,H*.62);
   ctx.strokeStyle='#5a4632';ctx.lineWidth=2;ctx.strokeRect(W*.26,H*.2,W*.48,H*.62);
   line(ctx,{x:W*.5,y:H*.2},{x:W*.5,y:H*.82});
   ctx.fillStyle='#e3c35a';dot(ctx,{x:W*.46,y:H*.52},W*.02);dot(ctx,{x:W*.54,y:H*.52},W*.02);}
};
/* ================= 户外 / 建筑设施 ================= */

function drawFurnLib(ctx,W,H,st,app,theme,phase){
  FURN[app.arch](ctx,W,H,phase,theme);
  return {bounds:{x:0.05,y:0.1,w:0.9,h:0.84},anchors:{feet:{x:0.5,y:0.9}}};
}
K.register({id:"bed",category:"fixture",label:{zh:"床",en:"bed"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"table",category:"fixture",label:{zh:"桌",en:"table"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"chair",category:"fixture",label:{zh:"椅",en:"chair"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"bookshelf",category:"fixture",label:{zh:"书架",en:"bookshelf"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"counter",category:"fixture",label:{zh:"柜台",en:"counter"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"throne",category:"fixture",label:{zh:"王座",en:"throne"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"barrel",category:"fixture",label:{zh:"木桶",en:"barrel"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"crate",category:"fixture",label:{zh:"木箱",en:"crate"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"fireplace",category:"fixture",label:{zh:"壁炉",en:"fireplace"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"anvil",category:"fixture",label:{zh:"铁砧",en:"anvil"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"forge",category:"fixture",label:{zh:"熔炉",en:"forge"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});
K.register({id:"wardrobe",category:"fixture",label:{zh:"衣柜",en:"wardrobe"},defaultColor:"#cccccc",size:{width:120,height:96},actions:[],states:["selected"],params:[],source:"kit/furniture-lib.js",draw:drawFurnLib,limits:["纯装饰家具，不自行变为可拿物品"]});})(typeof window !== "undefined" ? window : globalThis);

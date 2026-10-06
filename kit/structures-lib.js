/* =====================================================================
 * fixtures · 设施/建筑
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
var STRUCT2={
 fence:function(ctx,W,H){
   ctx.fillStyle='#8a6a44';[.15,.35,.55,.75].forEach(function(x){ctx.fillRect(W*x,H*.4,W*.03,H*.42);});
   ctx.fillRect(W*.12,H*.5,W*.68,H*.03);ctx.fillRect(W*.12,H*.66,W*.68,H*.03);},
 stairs:function(ctx,W,H){
   ctx.fillStyle='#9a8a78';
   for(var i=0;i<5;i++){ctx.fillRect(W*(.2+i*.12),H*(.78-i*.1),W*.14,H*(.1+i*.1));}},
 bridge:function(ctx,W,H){
   ctx.fillStyle='#8a6a4a';ctx.fillRect(W*.12,H*.56,W*.76,H*.1);
   [.15,.35,.55,.75].forEach(function(x){ctx.fillRect(W*x,H*.4,W*.03,H*.18);});
   ctx.fillRect(W*.12,H*.44,W*.76,H*.03);},
 well:function(ctx,W,H){
   ctx.fillStyle='#8a7a66';ellipseFill(ctx,{x:W*.5,y:H*.7},W*.24,H*.12);
   ctx.fillStyle='#6a5a44';ctx.fillRect(W*.3,H*.34,W*.03,H*.34);ctx.fillRect(W*.67,H*.34,W*.03,H*.34);
   ctx.fillRect(W*.28,H*.3,W*.44,H*.04);},
 altar:function(ctx,W,H,p){
   ctx.fillStyle='#9a8a7a';
   fillPts(ctx,[{x:W*.3,y:H*.7},{x:W*.7,y:H*.7},{x:W*.64,y:H*.5},{x:W*.36,y:H*.5}]);
   glowDot(ctx,{x:W*.5,y:H*.44+Math.sin(p*6)*H*.01},W*.06,'#e3c35a',.3);
   ctx.strokeStyle='#b08a4a';line(ctx,{x:W*.44,y:H*.56},{x:W*.56,y:H*.56});},
 tent:function(ctx,W,H){
   ctx.fillStyle='#a88a5a';fillPts(ctx,[{x:W*.18,y:H*.8},{x:W*.5,y:H*.24},{x:W*.82,y:H*.8}]);
   ctx.fillStyle='#5a4632';fillPts(ctx,[{x:W*.46,y:H*.8},{x:W*.5,y:H*.5},{x:W*.54,y:H*.8}]);},
 campfire:function(ctx,W,H,p){
   ctx.strokeStyle='#6a4a32';ctx.lineWidth=W*.03;
   line(ctx,{x:W*.34,y:H*.78},{x:W*.64,y:H*.6});line(ctx,{x:W*.64,y:H*.78},{x:W*.34,y:H*.6});
   glowDot(ctx,{x:W*.5,y:H*.58+Math.sin(p*9)*H*.01},W*.1,'#e0703a',.3);glowDot(ctx,{x:W*.5,y:H*.58},W*.05,'#ffd26a',.4);},
 portal:function(ctx,W,H,p){var c={x:W/2,y:H*.52};
   ctx.strokeStyle='#8dcebf';ctx.lineWidth=3;ellipseStroke(ctx,c,W*.3,H*.36);
   for(var i=0;i<3;i++){ctx.save();ctx.strokeStyle=rgba('#bff0e4',.6);ctx.lineWidth=2;
     ctx.beginPath();ctx.arc(c.x,c.y,W*(.1+i*.06),p*3+i,p*3+i+1.3);ctx.stroke();ctx.restore();}},
 statue:function(ctx,W,H){
   ctx.fillStyle='#8b8e86';ctx.fillRect(W*.36,H*.74,W*.28,H*.08);
   ellipseFill(ctx,{x:W*.5,y:H*.58},W*.08,H*.2);dot(ctx,{x:W*.5,y:H*.34},W*.07);},
 fountain:function(ctx,W,H,p){
   ctx.fillStyle='#9a8a82';ellipseFill(ctx,{x:W*.5,y:H*.74},W*.3,H*.12);
   ctx.fillRect(W*.47,H*.5,W*.06,H*.24);
   glowDot(ctx,{x:W*.5,y:H*.44+Math.sin(p*5)*H*.02},W*.05,'#8fc4ee',.3);
   ctx.strokeStyle=rgba('#bfe0ff',.6);ctx.lineWidth=1.5;
   line(ctx,{x:W*.5,y:H*.44},{x:W*.36,y:H*.6});line(ctx,{x:W*.5,y:H*.44},{x:W*.64,y:H*.6});},
 sign:function(ctx,W,H){
   ctx.fillStyle='#6a4a32';ctx.fillRect(W*.47,H*.5,W*.06,H*.34);
   ctx.fillStyle='#a88a5a';ctx.fillRect(W*.3,H*.36,W*.4,H*.2);},
 signpost:function(ctx,W,H){
   ctx.fillStyle='#6a4a32';ctx.fillRect(W*.48,H*.3,W*.05,H*.54);
   ctx.fillStyle='#a88a5a';ctx.fillRect(W*.3,H*.36,W*.3,H*.08);ctx.fillRect(W*.52,H*.5,W*.3,H*.08);},
 cage:function(ctx,W,H){
   ctx.strokeStyle='#7a8088';ctx.lineWidth=2;ctx.strokeRect(W*.24,H*.24,W*.52,H*.54);
   for(var i=0;i<4;i++){line(ctx,{x:W*(.3+i*.12),y:H*.24},{x:W*(.3+i*.12),y:H*.78});}},
 gravestone:function(ctx,W,H){
   ctx.fillStyle='#8b8e86';
   ctx.beginPath();ctx.moveTo(W*.32,H*.8);ctx.lineTo(W*.32,H*.4);ctx.arc(W*.5,H*.4,W*.18,Math.PI,0);
   ctx.lineTo(W*.68,H*.8);ctx.closePath();ctx.fill();
   ctx.strokeStyle='#5a5e56';ctx.lineWidth=2;line(ctx,{x:W*.5,y:H*.48},{x:W*.5,y:H*.66});line(ctx,{x:W*.42,y:H*.56},{x:W*.58,y:H*.56});},
 windmill:function(ctx,W,H,p){var c={x:W*.5,y:H*.34};
   ctx.fillStyle='#b09a7a';ctx.fillRect(W*.36,H*.34,W*.28,H*.48);
   ctx.save();ctx.translate(c.x,c.y);ctx.rotate(p*Math.PI*2);ctx.fillStyle='#8a6a4a';
   for(var i=0;i<4;i++){ctx.save();ctx.rotate(i*Math.PI/2);ctx.fillRect(-W*.02,-W*.2,W*.04,W*.2);ctx.restore();}
   ctx.restore();dot(ctx,c,W*.03);},
 cauldron:function(ctx,W,H,p){var c={x:W*.5,y:H*.62};
   ctx.fillStyle='#4a4e54';ellipseFill(ctx,c,W*.26,H*.18);
   ctx.strokeStyle='#3a3e44';ctx.lineWidth=W*.02;
   line(ctx,{x:W*.34,y:H*.66},{x:W*.3,y:H*.82});line(ctx,{x:W*.66,y:H*.66},{x:W*.7,y:H*.82});
   glowDot(ctx,{x:W*.5,y:H*.5+Math.sin(p*6)*H*.01},W*.05,'#8ac060',.3);}
};


function drawStructLib(ctx,W,H,st,app,theme,phase){
  STRUCT2[app.arch](ctx,W,H,phase,theme);
  return {bounds:{x:0.05,y:0.06,w:0.9,h:0.9},anchors:{feet:{x:0.5,y:0.9}}};
}
K.register({id:"fence",category:"fixture",label:{zh:"栅栏",en:"fence"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"stairs",category:"fixture",label:{zh:"楼梯",en:"stairs"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"bridge",category:"fixture",label:{zh:"桥",en:"bridge"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"well",category:"fixture",label:{zh:"水井",en:"well"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"altar",category:"fixture",label:{zh:"祭坛",en:"altar"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"tent",category:"fixture",label:{zh:"帐篷",en:"tent"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"campfire",category:"fixture",label:{zh:"篝火",en:"campfire"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"portal",category:"fixture",label:{zh:"传送门",en:"portal"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"statue",category:"fixture",label:{zh:"雕像",en:"statue"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"fountain",category:"fixture",label:{zh:"喷泉",en:"fountain"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"sign",category:"fixture",label:{zh:"告示牌",en:"sign"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"signpost",category:"fixture",label:{zh:"路标",en:"signpost"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"cage",category:"fixture",label:{zh:"笼子",en:"cage"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"gravestone",category:"fixture",label:{zh:"墓碑",en:"gravestone"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"windmill",category:"fixture",label:{zh:"风车",en:"windmill"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});
K.register({id:"cauldron",category:"fixture",label:{zh:"大锅",en:"cauldron"},defaultColor:"#cccccc",size:{width:120,height:104},actions:[],states:["selected"],params:[],source:"kit/structures-lib.js",draw:drawStructLib,limits:["可交互/装饰由宿主区分"]});})(typeof window !== "undefined" ? window : globalThis);

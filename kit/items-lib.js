/* =====================================================================
 * items · 道具
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
var ITEMS={
 scroll:function(ctx,W,H){var c={x:W/2,y:H/2};
   ctx.fillStyle='#e8e0c8';roundRectPath(ctx,W*.16,H*.4,W*.68,H*.2,H*.06);ctx.fill();
   ctx.fillStyle='#8a6a44';ellipseFill(ctx,{x:W*.16,y:c.y},W*.05,H*.12);ellipseFill(ctx,{x:W*.84,y:c.y},W*.05,H*.12);},
 book:function(ctx,W,H){var c={x:W/2,y:H/2};
   ctx.fillStyle='#7a4a3c';ctx.fillRect(W*.2,H*.3,W*.6,H*.4);
   ctx.fillStyle='#f0e8d4';ctx.fillRect(W*.24,H*.34,W*.52,H*.32);
   ctx.strokeStyle='#7a4a3c';ctx.lineWidth=2;line(ctx,{x:W*.5,y:H*.34},{x:W*.5,y:H*.66});},
 ring:function(ctx,W,H){var c={x:W/2,y:H*.58};
   ctx.strokeStyle='#e3c35a';ctx.lineWidth=W*.04;ellipseStroke(ctx,c,W*.16,H*.2);
   glowDot(ctx,{x:c.x,y:c.y-H*.2},W*.03,'#e05a7a',.3);},
 crown2:function(ctx,W,H){var c={x:W/2,y:H*.56};
   ctx.fillStyle='#e3c35a';ctx.fillRect(W*.3,H*.56,W*.4,H*.08);
   [-.15,-.05,.05,.15].forEach(function(k){fillPts(ctx,[{x:c.x+k*W- W*.02,y:H*.56},{x:c.x+k*W+W*.02,y:H*.56},{x:c.x+k*W,y:H*.4}]);});
   glowDot(ctx,{x:c.x,y:H*.5},W*.02,'#e05a5a',.3);},
 gem:function(ctx,W,H){var c={x:W/2,y:H/2};
   ctx.fillStyle='#7bd0e0';
   fillPts(ctx,[{x:W*.32,y:H*.4},{x:W*.68,y:H*.4},{x:W*.6,y:H*.72},{x:W*.4,y:H*.72}]);
   ctx.strokeStyle='#bfe8f0';ctx.lineWidth=1.5;line(ctx,{x:W*.32,y:H*.4},{x:W*.5,y:H*.28});line(ctx,{x:W*.68,y:H*.4},{x:W*.5,y:H*.28});
   line(ctx,{x:W*.5,y:H*.4},{x:W*.5,y:H*.72});},
 pouch:function(ctx,W,H){var c={x:W/2,y:H*.5};
   ctx.fillStyle='#8a6a44';
   fillPts(ctx,[{x:W*.32,y:H*.42},{x:W*.68,y:H*.42},{x:W*.62,y:H*.8},{x:W*.38,y:H*.8}]);
   ctx.strokeStyle='#5a4632';ctx.lineWidth=2;line(ctx,{x:W*.34,y:H*.44},{x:W*.66,y:H*.44});
   glowDot(ctx,{x:c.x,y:H*.38},W*.02,'#e3c35a',.3);},
 torch:function(ctx,W,H,p){var c={x:W/2,y:H*.6};
   ctx.fillStyle='#6a4a32';ctx.fillRect(c.x-W*.025,H*.42,W*.05,H*.4);
   glowDot(ctx,{x:c.x,y:H*.36+Math.sin(p*8)*H*.01},W*.07,'#e08a4a',.3);glowDot(ctx,{x:c.x,y:H*.36},W*.04,'#ffd26a',.4);},
 rope:function(ctx,W,H){var c={x:W/2,y:H*.58};
   ctx.strokeStyle='#c8b488';ctx.lineWidth=W*.03;
   ellipseStroke(ctx,c,W*.2,H*.14);ellipseStroke(ctx,c,W*.13,H*.09);
   line(ctx,{x:c.x+W*.18,y:c.y},{x:c.x+W*.3,y:c.y-H*.2});},
 map:function(ctx,W,H){var c={x:W/2,y:H/2};
   ctx.fillStyle='#e8e0c8';ctx.fillRect(W*.24,H*.28,W*.52,H*.44);
   ctx.fillStyle='#c8b488';fillPts(ctx,[{x:W*.76,y:H*.28},{x:W*.76,y:H*.4},{x:W*.64,y:H*.28}]);
   ctx.strokeStyle='#9a7a54';ctx.lineWidth=1.5;
   line(ctx,{x:W*.34,y:H*.5},{x:W*.5,y:H*.42});glowDot(ctx,{x:W*.6,y:H*.6},W*.018,'#d94a4a',.3);},
 lantern:function(ctx,W,H,p){var c={x:W/2,y:H*.52};
   ctx.strokeStyle='#5a4632';ctx.lineWidth=2;
   ctx.strokeRect(W*.36,H*.4,W*.28,H*.34);
   line(ctx,{x:c.x,y:H*.34},{x:c.x,y:H*.28});
   glowDot(ctx,{x:c.x,y:H*.56+Math.sin(p*8)*H*.008},W*.07,'#ffd26a',.3);},
 apple:function(ctx,W,H){var c={x:W/2,y:H*.58};
   ctx.fillStyle='#d94a4a';ellipseFill(ctx,c,W*.18,H*.2);
   ctx.strokeStyle='#5a4632';ctx.lineWidth=2;line(ctx,{x:c.x,y:H*.4},{x:c.x,y:H*.34});
   ctx.fillStyle='#6a9a4a';ellipseFill(ctx,{x:c.x+W*.06,y:H*.36},W*.04,H*.03);},
 bread:function(ctx,W,H){var c={x:W/2,y:H*.56};
   ctx.fillStyle='#d8b070';ellipseFill(ctx,c,W*.26,H*.16);
   ctx.strokeStyle='#b08a50';ctx.lineWidth=1.5;
   line(ctx,{x:W*.4,y:H*.5},{x:W*.42,y:H*.6});line(ctx,{x:W*.52,y:H*.48},{x:W*.54,y:H*.6});},
 meat:function(ctx,W,H){var c={x:W/2,y:H*.52};
   ctx.fillStyle='#b05a44';ellipseFill(ctx,c,W*.2,H*.14);
   ctx.fillStyle='#e8dcc0';ellipseFill(ctx,{x:W*.3,y:c.y},W*.05,H*.06);ellipseFill(ctx,{x:W*.7,y:c.y},W*.05,H*.06);},
 bomb:function(ctx,W,H,p){var c={x:W/2,y:H*.6};
   ctx.fillStyle='#33383e';ellipseFill(ctx,c,W*.2,H*.22);
   ctx.strokeStyle='#8a7a5a';ctx.lineWidth=2;line(ctx,{x:c.x+W*.08,y:H*.42},{x:c.x+W*.14,y:H*.34});
   glowDot(ctx,{x:c.x+W*.14,y:H*.32+Math.sin(p*12)*H*.01},W*.02,'#ffb050',.3);},
 amulet:function(ctx,W,H){var c={x:W/2,y:H*.4};
   ctx.strokeStyle='#e3c35a';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc(c.x,H*.46,W*.2,Math.PI*1.1,Math.PI*1.9);ctx.stroke();
   glowDot(ctx,{x:c.x,y:H*.62},W*.04,'#7bd0e0',.3);},
 feather:function(ctx,W,H){var c={x:W/2,y:H/2};
   ctx.strokeStyle='#a8c0d0';ctx.lineWidth=1.5;
   line(ctx,{x:W*.34,y:H*.78},{x:W*.6,y:H*.24});
   for(var i=0;i<5;i++){var t=.3+i*.1;line(ctx,{x:W*(.36+t*.4),y:H*(.76-t*.5)},{x:W*(.3+t*.5),y:H*(.78-t*.5)});}},
 ingot:function(ctx,W,H){var c={x:W/2,y:H*.56};
   ctx.fillStyle='#e3c35a';
   fillPts(ctx,[{x:W*.3,y:H*.6},{x:W*.4,y:H*.42},{x:W*.6,y:H*.42},{x:W*.7,y:H*.6},{x:W*.62,y:H*.68},{x:W*.38,y:H*.68}]);},
 compass:function(ctx,W,H,p){var c={x:W/2,y:H*.54};
   ctx.strokeStyle='#c8b488';ctx.lineWidth=2;ellipseStroke(ctx,c,W*.24,H*.24);
   ctx.fillStyle='#d94a4a';var a=p*2;
   fillPts(ctx,[{x:c.x,y:c.y-Math.cos(a)*H*.16},{x:c.x+W*.02,y:c.y},{x:c.x,y:c.y+Math.cos(a)*H*.05}]);}
};
/* ================= 家具 ================= */

function drawItemLib(ctx,W,H,st,app,theme,phase){
  ITEMS[app.arch](ctx,W,H,phase,theme);
  return {bounds:{x:0.1,y:0.1,w:0.8,h:0.8},anchors:{grip:{x:0.5,y:0.5}}};
}
K.register({id:"scroll",category:"item",label:{zh:"卷轴",en:"scroll"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"book",category:"item",label:{zh:"书",en:"book"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"ring",category:"item",label:{zh:"戒指",en:"ring"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"crown2",category:"item",label:{zh:"王冠",en:"crown2"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"gem",category:"item",label:{zh:"宝石",en:"gem"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"pouch",category:"item",label:{zh:"钱袋",en:"pouch"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"torch",category:"item",label:{zh:"火把",en:"torch"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"rope",category:"item",label:{zh:"绳索",en:"rope"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"map",category:"item",label:{zh:"地图",en:"map"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"lantern",category:"item",label:{zh:"灯笼",en:"lantern"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"apple",category:"item",label:{zh:"苹果",en:"apple"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"bread",category:"item",label:{zh:"面包",en:"bread"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"meat",category:"item",label:{zh:"肉",en:"meat"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"bomb",category:"item",label:{zh:"炸弹",en:"bomb"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"amulet",category:"item",label:{zh:"护身符",en:"amulet"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"feather",category:"item",label:{zh:"羽毛",en:"feather"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"ingot",category:"item",label:{zh:"金元宝",en:"ingot"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});
K.register({id:"compass",category:"item",label:{zh:"罗盘",en:"compass"},defaultColor:"#cccccc",size:{width:96,height:96},actions:[],states:["selected"],params:[],source:"kit/items-lib.js",draw:drawItemLib,limits:["bounds 为通用近似"]});})(typeof window !== "undefined" ? window : globalThis);

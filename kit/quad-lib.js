/* =====================================================================
 * creatures · 参数化四足（坐骑/家畜/野兽）
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
function drawQuad(ctx,W,H,st,app,theme,phase){
  var cfg=app.cfg,main=app.color,dark=shade(main,0.6),light=shade(main,1.25);
  var walk=st.action==='walk',sw=walk?Math.sin(phase*Math.PI*2):0,amp=0.06;
  function P(x,y){return{x:x*W,y:y*H};}
  ctx.save();if(st.facing==='left'){ctx.translate(W,0);ctx.scale(-1,1);}
  ctx.lineCap='round';ctx.lineJoin='round';
  // 尾（折点）
  if(cfg.tail){ctx.strokeStyle=cfg.tailDark?dark:dark;ctx.lineWidth=Math.max(2,W*0.035);
    var tp=cfg.tail.map(function(q){return P(q[0],q[1]);});strokePts(ctx,tp);}
  // 腿
  cfg.legs.forEach(function(L,i){var d=(i%2===0)?sw:-sw;
    ctx.strokeStyle=dark;ctx.lineWidth=Math.max(2,W*(cfg.legW||0.045));
    line(ctx,P(L.x,L.y),P(L.x+d*amp,L.y+L.len));
    if(cfg.hoof){ctx.fillStyle=dark;var f=P(L.x+d*amp,L.y+L.len);ctx.fillRect(f.x-0.025*W,f.y-0.015*H,0.05*W,0.03*H);}});
  // 身体
  ctx.fillStyle=cfg.wool?light:main;
  ellipseFill(ctx,P(cfg.body.cx,cfg.body.cy),cfg.body.rx*W,cfg.body.ry*H);
  if(cfg.wool){ // 卷毛：身体周围叠小圆
    ctx.fillStyle=light;
    for(var a=0;a<9;a++){var ang=a/9*Math.PI*2;var bx=cfg.body.cx+Math.cos(ang)*cfg.body.rx*0.9,by=cfg.body.cy+Math.sin(ang)*cfg.body.ry*0.85;
      ellipseFill(ctx,P(bx,by),cfg.body.rx*W*0.32,cfg.body.ry*H*0.5);}}
  if(cfg.hump){cfg.hump.forEach(function(h){ellipseFill(ctx,P(h.cx,h.cy),h.rx*W,h.ry*H);});}
  // 颈
  if(cfg.neck){ctx.fillStyle=cfg.wool?light:main;fillPts(ctx,cfg.neck.map(function(q){return P(q[0],q[1]);}));}
  // 头
  ctx.fillStyle=cfg.wool?light:main;ellipseFill(ctx,P(cfg.head.cx,cfg.head.cy),cfg.head.rx*W,cfg.head.ry*H);
  if(cfg.snout){var s=P(cfg.snout.x,cfg.snout.y);ctx.fillRect(s.x,s.y,cfg.snout.w*W,cfg.snout.h*H);}
  if(cfg.mane){ctx.strokeStyle=dark;ctx.lineWidth=Math.max(2,W*0.04);
    strokePts(ctx,cfg.mane.map(function(q){return P(q[0],q[1]);}));}
  if(cfg.ear){cfg.ear.forEach(function(e){fillPts(ctx,e.map(function(q){return P(q[0],q[1]);}));});}
  if(cfg.horn){ctx.fillStyle=cfg.hornColor||'#e6dcc4';
    cfg.horn.forEach(function(h){fillPts(ctx,h.map(function(q){return P(q[0],q[1]);}));});}
  if(cfg.udder){ctx.fillStyle='rgba(230,170,170,0.9)';ellipseFill(ctx,P(cfg.udder.cx,cfg.udder.cy),cfg.udder.rx*W,cfg.udder.ry*H);}
  ctx.fillStyle='#221d18';
  dot(ctx,P(cfg.eye[0],cfg.eye[1]),Math.max(1.4,W*0.02));
  if(cfg.nose)dot(ctx,P(cfg.nose[0],cfg.nose[1]),Math.max(1.3,W*0.016));
  if(st.selected)drawSelectedFrame(ctx,W,H,theme.accent);
  ctx.restore();
}

var QUADS={
 horse:{body:{cx:.42,cy:.60,rx:.27,ry:.21},
  neck:[[.57,.54],[.62,.46],[.70,.28],[.76,.31],[.68,.52]],
  head:{cx:.78,cy:.27,rx:.10,ry:.07},snout:{x:.81,y:.28,w:.13,h:.06},
  ear:[[[.72,.22],[.70,.12],[.77,.20]]],
  legs:[{x:.23,y:.57,len:.42},{x:.33,y:.57,len:.42},{x:.52,y:.57,len:.42},{x:.61,y:.57,len:.42}],hoof:true,
  tail:[[.16,.52],[.12,.62],[.13,.86]],tailDark:true,
  mane:[[.61,.46],[.66,.36],[.71,.28]],
  eye:[.80,.25],nose:[.92,.30]},
 donkey:{body:{cx:.44,cy:.60,rx:.25,ry:.2},
  neck:[[.58,.54],[.63,.47],[.70,.33],[.75,.36],[.67,.53]],
  head:{cx:.77,cy:.32,rx:.10,ry:.07},snout:{x:.80,y:.34,w:.12,h:.07},
  ear:[[[.71,.30],[.69,.12],[.75,.24]],[[.77,.29],[.78,.12],[.82,.26]]],
  legs:[{x:.25,y:.57,len:.38},{x:.34,y:.57,len:.38},{x:.53,y:.57,len:.38},{x:.61,y:.57,len:.38}],hoof:true,
  tail:[[.18,.53],[.15,.64]],eye:[.79,.30],nose:[.90,.36]},
 cow:{body:{cx:.45,cy:.57,rx:.30,ry:.24},
  head:{cx:.74,cy:.42,rx:.12,ry:.10},snout:{x:.80,y:.45,w:.16,h:.11},
  ear:[[[.66,.40],[.62,.36],[.70,.44]],[[.82,.40],[.86,.36],[.80,.44]]],
  horn:[[[.68,.34],[.64,.26],[.70,.32]],[[.80,.34],[.84,.26],[.78,.32]]],
  legs:[{x:.24,y:.60,len:.3},{x:.33,y:.60,len:.3},{x:.55,y:.60,len:.3},{x:.64,y:.60,len:.3}],hoof:true,
  udder:{cx:.42,cy:.78,rx:.09,ry:.07},
  tail:[[.16,.50],[.13,.66]],eye:[.76,.40],nose:[.92,.50]},
 sheep:{body:{cx:.45,cy:.58,rx:.26,ry:.24},wool:true,
  head:{cx:.77,cy:.52,rx:.09,ry:.08},snout:{x:.81,y:.53,w:.09,h:.07},
  ear:[[[.72,.47],[.70,.42],[.75,.48]]],
  legs:[{x:.28,y:.66,len:.24},{x:.36,y:.66,len:.24},{x:.54,y:.66,len:.24},{x:.61,y:.66,len:.24}],hoof:true,
  tail:[[.20,.56],[.17,.62]],eye:[.79,.50],nose:[.88,.56]},
 pig:{body:{cx:.45,cy:.60,rx:.29,ry:.25},
  head:{cx:.71,cy:.53,rx:.11,ry:.10},snout:{x:.79,y:.52,w:.13,h:.10},
  ear:[[[.66,.46],[.64,.38],[.71,.47]],[[.73,.45],[.75,.37],[.77,.47]]],
  legs:[{x:.27,y:.70,len:.2},{x:.36,y:.70,len:.2},{x:.53,y:.70,len:.2},{x:.62,y:.70,len:.2}],
  tail:[[.17,.58],[.13,.56],[.14,.52]],eye:[.73,.50],nose:[.90,.56]},
 wolf:{body:{cx:.43,cy:.56,rx:.25,ry:.18},
  neck:[[.57,.50],[.62,.44],[.68,.34],[.73,.37],[.66,.50]],
  head:{cx:.74,cy:.33,rx:.10,ry:.08},snout:{x:.80,y:.34,w:.13,h:.06},
  ear:[[[.68,.29],[.66,.18],[.74,.28]],[[.75,.28],[.77,.18],[.80,.28]]],
  legs:[{x:.25,y:.58,len:.36},{x:.34,y:.58,len:.36},{x:.52,y:.58,len:.36},{x:.60,y:.58,len:.36}],
  tail:[[.18,.50],[.10,.42]],eye:[.76,.31],nose:[.91,.37]},
 deer:{body:{cx:.43,cy:.56,rx:.25,ry:.18},
  neck:[[.57,.50],[.62,.42],[.68,.28],[.73,.31],[.66,.50]],
  head:{cx:.74,cy:.27,rx:.09,ry:.07},snout:{x:.79,y:.28,w:.1,h:.06},
  ear:[[[.69,.23],[.67,.14],[.74,.22]],[[.78,.22],[.80,.13],[.82,.22]]],
  horn:[[[.70,.20],[.66,.04],[.72,.16],[.69,.02],[.74,.15]],[[.78,.20],[.82,.04],[.77,.16],[.80,.02],[.76,.15]]],
  legs:[{x:.25,y:.58,len:.4},{x:.33,y:.58,len:.4},{x:.52,y:.58,len:.4},{x:.60,y:.58,len:.4}],hoof:true,
  tail:[[.19,.52],[.16,.58]],eye:[.76,.25],nose:[.88,.30]},
 bear:{body:{cx:.45,cy:.58,rx:.30,ry:.28},
  head:{cx:.72,cy:.42,rx:.12,ry:.10},snout:{x:.79,y:.44,w:.12,h:.08},
  ear:[[[.64,.35],[.63,.28],[.69,.36]],[[.78,.34],[.80,.27],[.82,.36]]],
  legs:[{x:.27,y:.62,len:.3},{x:.37,y:.62,len:.3},{x:.53,y:.62,len:.3},{x:.62,y:.62,len:.3}],
  tail:[[.18,.56],[.15,.6]],eye:[.73,.40],nose:[.88,.48]},
 fox:{body:{cx:.42,cy:.58,rx:.21,ry:.15},
  neck:[[.55,.52],[.60,.46],[.65,.38],[.70,.40],[.63,.52]],
  head:{cx:.71,cy:.37,rx:.09,ry:.07},snout:{x:.77,y:.38,w:.12,h:.05},
  ear:[[[.65,.33],[.63,.22],[.71,.32]],[[.74,.32],[.76,.21],[.79,.32]]],
  legs:[{x:.28,y:.60,len:.28},{x:.35,y:.60,len:.28},{x:.49,y:.60,len:.28},{x:.56,y:.60,len:.28}],
  tail:[[.22,.56],[.13,.60],[.09,.52]],eye:[.73,.35],nose:[.87,.40]},
 rabbit:{body:{cx:.46,cy:.62,rx:.22,ry:.2},
  head:{cx:.68,cy:.48,rx:.1,ry:.09},snout:{x:.74,y:.49,w:.08,h:.06},
  ear:[[[.65,.42],[.62,.14],[.70,.40]],[[.72,.41],[.72,.13],[.77,.40]]],
  legs:[{x:.33,y:.66,len:.22},{x:.55,y:.66,len:.3}],
  tail:[[.27,.60],[.24,.58]],eye:[.70,.46],nose:[.80,.51]},
 lion:{body:{cx:.43,cy:.57,rx:.27,ry:.21},
  neck:[[.57,.51],[.62,.45],[.68,.35],[.73,.38],[.66,.50]],
  head:{cx:.74,cy:.33,rx:.12,ry:.11},snout:{x:.81,y:.35,w:.12,h:.07},
  ear:[[[.66,.28],[.65,.22],[.70,.30]],[[.80,.28],[.82,.22],[.83,.30]]],
  legs:[{x:.25,y:.58,len:.36},{x:.34,y:.58,len:.36},{x:.52,y:.58,len:.36},{x:.60,y:.58,len:.36}],
  tail:[[.17,.50],[.12,.58],[.13,.64]],eye:[.76,.31],nose:[.91,.38]},
 camel:{body:{cx:.43,cy:.58,rx:.27,ry:.2},
  hump:[{cx:.36,cy:.38,rx:.1,ry:.12},{cx:.5,cy:.4,rx:.1,ry:.1}],
  neck:[[.58,.52],[.64,.44],[.71,.26],[.77,.29],[.68,.51]],
  head:{cx:.79,cy:.25,rx:.09,ry:.07},snout:{x:.82,y:.26,w:.12,h:.06},
  ear:[[[.74,.21],[.72,.14],[.78,.20]]],
  legs:[{x:.24,y:.56,len:.42},{x:.33,y:.56,len:.42},{x:.52,y:.56,len:.42},{x:.61,y:.56,len:.42}],hoof:true,
  tail:[[.17,.5],[.14,.58]],eye:[.81,.23],nose:[.92,.28]}
};
/* ================= 特殊动物 ================= */

QUADS.unicorn={body:{cx:.42,cy:.60,rx:.27,ry:.21},
  neck:[[.57,.54],[.62,.46],[.70,.28],[.76,.31],[.68,.52]],
  head:{cx:.78,cy:.27,rx:.10,ry:.07},snout:{x:.81,y:.28,w:.13,h:.06},
  ear:[[[.72,.22],[.70,.13],[.77,.20]]],
  horn:[[[.80,.20],[.82,.02],[.83,.20]]],hornColor:'#f0e6c8',
  legs:[{x:.23,y:.57,len:.42},{x:.33,y:.57,len:.42},{x:.52,y:.57,len:.42},{x:.61,y:.57,len:.42}],hoof:true,
  tail:[[.16,.52],[.13,.86]],mane:[[.61,.46],[.66,.36],[.71,.28]],
  eye:[.80,.25],nose:[.92,.30]};
/* 石魔像：人形岩石 */

function drawQuadLib(ctx,W,H,st,app,theme,phase){
  app.cfg=QUADS[app.arch];
  drawQuad(ctx,W,H,st,app,theme,phase);
  return {bounds:{x:0.08,y:0.08,w:0.84,h:0.88},
    anchors:{head:{x:0.78,y:0.3},feet:{x:0.5,y:0.92}}};
}
K.register({id:"horse",category:"creature",label:{zh:"马",en:"horse"},defaultColor:"#8a6a4a",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"donkey",category:"creature",label:{zh:"驴",en:"donkey"},defaultColor:"#9a9488",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"cow",category:"creature",label:{zh:"牛",en:"cow"},defaultColor:"#8a6a52",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"sheep",category:"creature",label:{zh:"羊",en:"sheep"},defaultColor:"#e8e4d6",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"pig",category:"creature",label:{zh:"猪",en:"pig"},defaultColor:"#d8a0a8",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"camel",category:"creature",label:{zh:"骆驼",en:"camel"},defaultColor:"#b89a6a",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"unicorn",category:"creature",label:{zh:"独角兽",en:"unicorn"},defaultColor:"#f0ece4",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"rabbit",category:"creature",label:{zh:"兔",en:"rabbit"},defaultColor:"#b8a890",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"wolf",category:"creature",label:{zh:"狼",en:"wolf"},defaultColor:"#8a8278",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"deer",category:"creature",label:{zh:"鹿",en:"deer"},defaultColor:"#a87a52",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"bear",category:"creature",label:{zh:"熊",en:"bear"},defaultColor:"#7a5a42",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"fox",category:"creature",label:{zh:"狐",en:"fox"},defaultColor:"#c0704a",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});
K.register({id:"lion",category:"creature",label:{zh:"狮",en:"lion"},defaultColor:"#b89050",size:{width:128,height:96},actions:["idle", "walk"],states:["facing", "selected"],params:["color"],source:"kit/quad-lib.js",draw:drawQuadLib,limits:["run/hurt/dead 未实现", "bounds 为通用近似"]});})(typeof window !== "undefined" ? window : globalThis);

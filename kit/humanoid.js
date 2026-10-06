/* =====================================================================
 * appearance presets · 人物外观预设（西方/仙侠/种族）
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
function drawHumanoid(ctx,W,H,st,app,theme,phase){
  var cfg=app.cfg,bs=cfg.bodyScale||1,cx=W/2,s=H*bs,y0=(H-s)/2;
  function Y(k){return y0+k*s;}
  function X(k){return cx+k*s;}
  var pose=st.pose||'idle';
  var breathe=Math.sin(phase*Math.PI*2)*0.006*s;
  var skin=cfg.skin||'#e8b58a',tunic=cfg.tunic,legs=cfg.legs||shade(tunic,0.8),metal=cfg.metal||'#b9bec4';
  var headR=0.085*s,head={x:cx,y:Y(0.15)};
  var shY=Y(0.27)+breathe,hipY=Y(0.56),kneeY=Y(0.76),footY=Y(0.96);
  var shL={x:X(-0.11),y:shY},shR={x:X(0.11),y:shY},hipL={x:X(-0.075),y:hipY},hipR={x:X(0.075),y:hipY};
  var handL={x:X(-0.13),y:Y(0.54)},handR={x:X(0.13),y:Y(0.54)};
  if(pose==='guard'){handR={x:X(0.18),y:Y(0.40)};handL={x:X(-0.16),y:Y(0.44)};}
  if(pose==='cast'){handR={x:X(0.05),y:Y(0.42)};handL={x:X(-0.05),y:Y(0.42)};}

  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';

  if(cfg.cape){var sway=Math.sin(phase*Math.PI*2)*0.012*s;
    ctx.fillStyle=cfg.cape;
    fillPts(ctx,[{x:shL.x-0.02*s,y:shY},{x:shR.x+0.02*s,y:shY},
      {x:X(0.14)+sway,y:Y(0.74)},{x:X(-0.14)+sway,y:Y(0.74)}]);}

  if(cfg.robe){
    ctx.fillStyle=tunic;
    fillPts(ctx,[shL,shR,{x:X(0.13),y:footY},{x:X(-0.13),y:footY}]);
    ctx.strokeStyle=shade(tunic,0.7);ctx.lineWidth=1.5;
    line(ctx,{x:cx,y:shY},{x:cx,y:footY});
    ctx.fillStyle=cfg.boot||'#3a2f26';
    ctx.fillRect(X(-0.1),footY-0.02*s,0.08*s,0.05*s);ctx.fillRect(X(0.02),footY-0.02*s,0.08*s,0.05*s);
  }else{
    ctx.strokeStyle=legs;ctx.lineWidth=0.075*s;
    line(ctx,hipL,{x:X(-0.06),y:kneeY});line(ctx,{x:X(-0.06),y:kneeY},{x:X(-0.07),y:footY});
    line(ctx,hipR,{x:X(0.06),y:kneeY});line(ctx,{x:X(0.06),y:kneeY},{x:X(0.07),y:footY});
    ctx.fillStyle=cfg.boot||shade(legs,0.6);
    ctx.fillRect(X(-0.11),footY-0.04*s,0.09*s,0.05*s);ctx.fillRect(X(0.02),footY-0.04*s,0.09*s,0.05*s);
  }

  ctx.fillStyle=tunic;
  fillPts(ctx,[shL,shR,hipR,hipL]);
  if(cfg.armor){
    ctx.fillStyle=metal;
    fillPts(ctx,[{x:X(-0.085),y:shY+0.01*s},{x:X(0.085),y:shY+0.01*s},
      {x:X(0.07),y:hipY},{x:X(-0.07),y:hipY}]);
    ctx.strokeStyle=shade(metal,0.7);ctx.lineWidth=1.5;
    line(ctx,{x:cx,y:shY+0.02*s},{x:cx,y:hipY});
  }
  ctx.strokeStyle=cfg.belt||shade(tunic,0.55);ctx.lineWidth=0.05*s;
  line(ctx,{x:X(-0.09),y:hipY},{x:X(0.09),y:hipY});

  if(cfg.armor||cfg.pauldrons){ctx.fillStyle=metal;
    ellipseFill(ctx,shL,0.055*s,0.045*s);ellipseFill(ctx,shR,0.055*s,0.045*s);}

  var elL={x:X(-0.15),y:Y(0.42)},elR={x:X(0.15),y:Y(0.42)};
  if(pose==='guard'){elR={x:X(0.2),y:Y(0.46)};}
  if(pose==='cast'){elR={x:X(0.05),y:Y(0.45)};elL={x:X(-0.05),y:Y(0.45)};
    ctx.strokeStyle=cfg.sleeve?shade(tunic,cfg.sleeve):tunic;ctx.lineWidth=0.06*s;
    line(ctx,shL,elL);line(ctx,shR,elR);
    ctx.fillStyle=skin;dot(ctx,{x:X(0),y:Y(0.42)},0.045*s);
  }else{
    ctx.strokeStyle=cfg.sleeve?shade(tunic,cfg.sleeve):tunic;ctx.lineWidth=0.06*s;
    line(ctx,shL,elL);line(ctx,elL,handL);line(ctx,shR,elR);line(ctx,elR,handR);
    ctx.fillStyle=skin;dot(ctx,handL,0.04*s);dot(ctx,handR,0.04*s);
  }

  ctx.fillStyle=skin;dot(ctx,head,headR);
  if(cfg.skeleton){ctx.fillStyle='#1a1712';
    dot(ctx,{x:head.x-0.032*s,y:head.y-0.012*s},0.02*s);
    dot(ctx,{x:head.x+0.032*s,y:head.y-0.012*s},0.02*s);
    fillPts(ctx,[{x:head.x-0.012*s,y:head.y+0.02*s},{x:head.x+0.012*s,y:head.y+0.02*s},{x:head.x,y:head.y+0.045*s}]);
    ctx.strokeStyle='#1a1712';ctx.lineWidth=1;
    for(var dd=-2;dd<=2;dd++)line(ctx,{x:head.x+dd*0.012*s,y:head.y+0.045*s},{x:head.x+dd*0.012*s,y:head.y+0.07*s});
  }else{ctx.fillStyle='#2a221c';
    dot(ctx,{x:head.x-0.03*s,y:head.y-0.01*s},0.011*s);
    dot(ctx,head.x+0.03*s?{x:head.x+0.03*s,y:head.y-0.01*s}:{x:head.x+0.03*s,y:head.y-0.01*s},0.011*s);}
  if(cfg.bun){ctx.fillStyle=cfg.hair||'#2a2420';
    ctx.beginPath();ctx.arc(head.x,head.y,headR,Math.PI*1.02,Math.PI*1.98);ctx.closePath();ctx.fill();
    ellipseFill(ctx,{x:head.x,y:head.y-headR*1.05},headR*.5,headR*.42);
    ctx.strokeStyle='#c8a24a';ctx.lineWidth=1.5;
    line(ctx,{x:head.x-headR*.6,y:head.y-headR*.85},{x:head.x+headR*.6,y:head.y-headR*.7});}
  else if(cfg.hair){ctx.fillStyle=cfg.hair;
    ctx.beginPath();ctx.arc(head.x,head.y,headR,Math.PI*1.05,Math.PI*1.95);ctx.closePath();ctx.fill();}
  if(cfg.beard){ctx.fillStyle=cfg.beard;
    fillPts(ctx,[{x:head.x-0.05*s,y:head.y+0.03*s},{x:head.x+0.05*s,y:head.y+0.03*s},
      {x:head.x+0.03*s,y:head.y+headR*1.5},{x:head.x-0.03*s,y:head.y+headR*1.5}]);}

  drawHeadgear(ctx,cfg,head,headR,s,X,Y);

  if(cfg.offhand==='shield')drawShield(ctx,handL,cfg,0.11*s);
  if(cfg.offhand==='tome'){ctx.fillStyle='#7a5a3c';ctx.fillRect(handL.x-0.06*s,handL.y-0.07*s,0.12*s,0.14*s);
    ctx.fillStyle='#e8e0c8';ctx.fillRect(handL.x-0.05*s,handL.y-0.06*s,0.1*s,0.12*s);}

  if(cfg.weapon && cfg.weapon!=='none' && cfg.weapon!=='dual')
    drawWeapon(ctx,cfg.weapon,handR,cfg,pose,s,X,Y);
  if(cfg.weapon==='dual'){drawWeapon(ctx,'dagger',handR,cfg,pose,s,X,Y);drawWeapon(ctx,'dagger',handL,cfg,pose,s,X,Y);}

  if(st.selected)drawSelectedFrame(ctx,W,H,theme.accent);
  ctx.restore();
}

/* ---------- 帽 / 头盔 ---------- */
function drawHeadgear(ctx,cfg,head,r,s){
  var t=cfg.helm||'none',metal=cfg.metal||'#b9bec4',hc=cfg.hatColor||cfg.tunic;
  ctx.save();ctx.lineJoin='round';
  if(t==='wizard'){ctx.fillStyle=hc;
    fillPts(ctx,[{x:head.x-0.13*s,y:head.y-0.02*s},{x:head.x+0.13*s,y:head.y-0.02*s},
      {x:head.x+0.02*s,y:head.y-0.5*s},{x:head.x-0.04*s,y:head.y-0.46*s}]);
    ctx.fillRect(head.x-0.15*s,head.y-0.05*s,0.3*s,0.04*s);}
  else if(t==='hood'){ctx.fillStyle=hc;
    ellipseFill(ctx,{x:head.x,y:head.y-0.02*s},r*1.28,r*1.35);
    ctx.fillStyle=cfg.skin||'#e8b58a';ellipseFill(ctx,head,r*0.82,r*0.9);}
  else if(t==='helm'){ctx.fillStyle=metal;ellipseFill(ctx,{x:head.x,y:head.y-0.02*s},r*1.1,r*1.15);
    ctx.fillStyle='#2a2e33';ctx.fillRect(head.x-0.07*s,head.y-0.02*s,0.14*s,0.035*s);
    ctx.fillStyle=shade(metal,0.7);ctx.fillRect(head.x-0.012*s,head.y-0.05*s,0.024*s,0.12*s);}
  else if(t==='greathelm'){ctx.fillStyle=metal;
    fillPts(ctx,[{x:head.x-0.1*s,y:head.y-0.12*s},{x:head.x+0.1*s,y:head.y-0.12*s},
      {x:head.x+0.1*s,y:head.y+0.08*s},{x:head.x-0.1*s,y:head.y+0.08*s}]);
    ctx.fillStyle='#1c1f23';ctx.fillRect(head.x-0.07*s,head.y-0.02*s,0.14*s,0.03*s);}
  else if(t==='coif'){ctx.fillStyle=hc;ellipseFill(ctx,{x:head.x,y:head.y-0.01*s},r*1.12,r*1.12);
    ctx.fillStyle=cfg.skin;ellipseFill(ctx,head,r*0.8,r*0.9);
    ctx.fillStyle=hc;ctx.fillRect(head.x-0.02*s,head.y+r*0.6,0.04*s,0.12*s);}
  else if(t==='crown'){ctx.fillStyle='#e3c35a';
    ctx.fillRect(head.x-0.1*s,head.y-r*0.9,0.2*s,0.04*s);
    [-0.09,-0.03,0.03,0.09].forEach(function(k){
      fillPts(ctx,[{x:head.x+k*s-0.015*s,y:head.y-r*0.7},{x:head.x+k*s+0.015*s,y:head.y-r*0.7},{x:head.x+k*s,y:head.y-r*1.25}]);});
    ctx.fillStyle='#d9534f';dot(ctx,{x:head.x,y:head.y-r*0.9},0.018*s);}
  else if(t==='circlet'){ctx.strokeStyle='#e3c35a';ctx.lineWidth=0.02*s;
    ctx.beginPath();ctx.arc(head.x,head.y,r*1.05,Math.PI*1.1,Math.PI*1.9);ctx.stroke();
    ctx.fillStyle='#7bd0e0';dot(ctx,{x:head.x,y:head.y-r*0.95},0.02*s);}
  else if(t==='horns'){ctx.fillStyle=metal;ellipseFill(ctx,{x:head.x,y:head.y-0.03*s},r*1.05,r*0.9);
    ctx.strokeStyle='#d8cbb0';ctx.lineWidth=0.03*s;
    ctx.beginPath();ctx.moveTo(head.x-0.07*s,head.y-r*0.6);ctx.quadraticCurveTo(head.x-0.16*s,head.y-r*1.5,head.x-0.12*s,head.y-r*1.9);ctx.stroke();
    ctx.beginPath();ctx.moveTo(head.x+0.07*s,head.y-r*0.6);ctx.quadraticCurveTo(head.x+0.16*s,head.y-r*1.5,head.x+0.12*s,head.y-r*1.9);ctx.stroke();}
  else if(t==='hat'){ctx.fillStyle=hc;
    ctx.fillRect(head.x-0.16*s,head.y-0.05*s,0.32*s,0.035*s);
    fillPts(ctx,[{x:head.x-0.08*s,y:head.y-0.05*s},{x:head.x+0.08*s,y:head.y-0.05*s},{x:head.x+0.04*s,y:head.y-0.3*s},{x:head.x-0.04*s,y:head.y-0.28*s}]);}
  else if(t==='band'){ctx.strokeStyle=shade(cfg.tunic,0.6);ctx.lineWidth=0.025*s;
    ctx.beginPath();ctx.arc(head.x,head.y,r*1.02,Math.PI*1.1,Math.PI*1.9);ctx.stroke();}
  else if(t==='lotus'){ctx.fillStyle='#e3c35a';
    ctx.fillRect(head.x-.1*s,head.y-r*.8,.2*s,.035*s);
    [-.07,0,.07].forEach(function(k){fillPts(ctx,[{x:head.x+k*s-.02*s,y:head.y-r*.6},{x:head.x+k*s+.02*s,y:head.y-r*.6},{x:head.x+k*s,y:head.y-r*1.2}]);});}
  else if(t==='mask'){ctx.fillStyle=hc;ellipseFill(ctx,head,r*0.95,r*1.0);
    ctx.fillStyle='#1c1f23';dot(ctx,{x:head.x-0.035*s,y:head.y-0.01*s},0.018*s);dot(ctx,{x:head.x+0.035*s,y:head.y-0.01*s},0.018*s);}
  ctx.restore();
}

/* ---------- 盾 ---------- */
function drawShield(ctx,hand,cfg,r){
  ctx.save();ctx.lineJoin='round';
  ctx.fillStyle=cfg.shieldColor||cfg.metal||'#b9bec4';
  fillPts(ctx,[{x:hand.x,y:hand.y-r},{x:hand.x+r*0.85,y:hand.y-r*0.6},
    {x:hand.x+r*0.7,y:hand.y+r*0.5},{x:hand.x,y:hand.y+r},{x:hand.x-r*0.7,y:hand.y+r*0.5},{x:hand.x-r*0.85,y:hand.y-r*0.6}]);
  ctx.strokeStyle=cfg.accent||'#d5a17d';ctx.lineWidth=2;
  line(ctx,{x:hand.x,y:hand.y-r*0.7},{x:hand.x,y:hand.y+r*0.7});
  line(ctx,{x:hand.x-r*0.55,y:hand.y},{x:hand.x+r*0.55,y:hand.y});
  ctx.restore();
}

/* ---------- 武器 ---------- */
function drawWeapon(ctx,type,hand,cfg,pose,s){
  var metal=cfg.metal||'#dfe6ff',wood=cfg.shaft||'#6a4e32',acc=cfg.accent||'#d5a17d';
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  function up(k){return{x:hand.x,y:hand.y-k*s};}
  if(type==='sword'||type==='dagger'){var L=type==='sword'?0.42:0.22,w=type==='sword'?0.05:0.035;
    ctx.fillStyle=cfg.blade||metal;
    fillPts(ctx,[{x:hand.x,y:hand.y-L*s},{x:hand.x+w*s,y:hand.y-0.02*s},{x:hand.x-w*s,y:hand.y-0.02*s}]);
    ctx.strokeStyle=shade(wood,1.1);ctx.lineWidth=w*1.4*s;
    line(ctx,{x:hand.x-w*1.6*s,y:hand.y-0.03*s},{x:hand.x+w*1.6*s,y:hand.y-0.03*s});
    ctx.strokeStyle=wood;ctx.lineWidth=w*1.2*s;
    line(ctx,{x:hand.x,y:hand.y},{x:hand.x,y:hand.y+0.08*s});}
  else if(type==='axe'){ctx.strokeStyle=wood;ctx.lineWidth=0.035*s;line(ctx,hand,up(0.42));
    ctx.fillStyle=metal;
    ctx.beginPath();ctx.moveTo(hand.x,hand.y-0.3*s);ctx.quadraticCurveTo(hand.x+0.16*s,hand.y-0.34*s,hand.x+0.05*s,hand.y-0.16*s);ctx.closePath();ctx.fill();}
  else if(type==='hammer'){ctx.strokeStyle=wood;ctx.lineWidth=0.035*s;line(ctx,hand,up(0.4));
    ctx.fillStyle=metal;ctx.fillRect(hand.x-0.09*s,hand.y-0.46*s,0.18*s,0.08*s);}
  else if(type==='spear'){ctx.strokeStyle=wood;ctx.lineWidth=0.025*s;line(ctx,{x:hand.x,y:hand.y+0.08*s},up(0.62));
    ctx.fillStyle=metal;fillPts(ctx,[up(0.62),{x:hand.x+0.04*s,y:hand.y-0.54*s},{x:hand.x-0.04*s,y:hand.y-0.54*s}]);}
  else if(type==='staff'){ctx.strokeStyle=wood;ctx.lineWidth=0.03*s;line(ctx,{x:hand.x,y:hand.y+0.1*s},up(0.6));
    if(cfg.staffGem){ctx.fillStyle=cfg.staffGem;dot(ctx,up(0.62),0.035*s);
      ctx.strokeStyle=cfg.staffGem;ctx.lineWidth=1.5;ellipseStroke(ctx,up(0.62),0.06*s,0.06*s);}
    else{ctx.fillStyle='#d8d0b0';
      fillPts(ctx,[{x:hand.x,y:hand.y-0.6*s},{x:hand.x+0.05*s,y:hand.y-0.66*s},{x:hand.x,y:hand.y-0.72*s},{x:hand.x-0.05*s,y:hand.y-0.66*s}]);}}
  else if(type==='bow'){ctx.strokeStyle=wood;ctx.lineWidth=0.025*s;
    ctx.beginPath();ctx.arc(hand.x+0.02*s,hand.y-0.2*s,0.24*s,-0.7,0.7);ctx.stroke();
    ctx.strokeStyle='rgba(240,240,230,0.8)';ctx.lineWidth=1;
    var bx=hand.x+0.02*s;ctx.beginPath();
    ctx.moveTo(bx+Math.cos(-0.7)*0.24*s,hand.y-0.2*s+Math.sin(-0.7)*0.24*s);
    ctx.lineTo(bx+Math.cos(0.7)*0.24*s,hand.y-0.2*s+Math.sin(0.7)*0.24*s);ctx.stroke();}
  else if(type==='instrument'){ctx.strokeStyle=shade(wood,0.8);ctx.lineWidth=0.025*s;
    line(ctx,{x:hand.x-0.02*s,y:hand.y-0.02*s},{x:hand.x+0.1*s,y:hand.y-0.3*s});
    ctx.fillStyle=cfg.lute||'#9a6a3c';ellipseFill(ctx,{x:hand.x-0.05*s,y:hand.y+0.04*s},0.09*s,0.11*s);}
  else if(type==='orb'){ctx.fillStyle=cfg.orbColor||acc;dot(ctx,{x:hand.x,y:hand.y-0.06*s},0.06*s);
    ctx.strokeStyle=cfg.orbColor||acc;ctx.lineWidth=1.5;ellipseStroke(ctx,{x:hand.x,y:hand.y-0.06*s},0.09*s,0.09*s);}
  else if(type==='fan'){var c=hand;
    ctx.fillStyle=cfg.fanColor||'#dcc6a0';
    ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.arc(c.x,c.y,.22*s,Math.PI*1.15,Math.PI*1.85);ctx.closePath();ctx.fill();
    ctx.strokeStyle=wood;ctx.lineWidth=1;
    for(var fa=-2;fa<=2;fa++){var ang=Math.PI*(1.25+fa*.15);line(ctx,c,{x:c.x+Math.cos(ang)*.22*s,y:c.y+Math.sin(ang)*.22*s});}}
  else if(type==='horsetail'){ctx.strokeStyle=wood;ctx.lineWidth=.025*s;
    line(ctx,{x:hand.x,y:hand.y+.08*s},up(.5));
    ctx.strokeStyle=cfg.tailHair||'#e8e2d2';ctx.lineWidth=1.1;
    for(var ha=-2;ha<=2;ha++){line(ctx,up(.5),{x:hand.x+ha*.02*s,y:hand.y-.68*s});}}
  ctx.restore();
}
var CLASS={
 warrior:{tunic:'#7d838a',legs:'#5d5346',metal:'#b9bec4',skin:'#e8b58a',hair:'#4a3a2a',armor:true,weapon:'sword',offhand:'shield'},
 mage:{tunic:'#3b5a8a',skin:'#e8b58a',hair:'#d8d4cc',beard:'#e8e4dc',helm:'wizard',hatColor:'#2c4268',robe:true,weapon:'staff',cape:'#334c78',staffGem:'#7bd0e0'},
 priest:{tunic:'#e6e2d4',skin:'#e8b58a',hair:'#6a5a44',helm:'hood',hatColor:'#e6e2d4',robe:true,weapon:'staff',staffGem:'#e3c35a'},
 rogue:{tunic:'#39414a',skin:'#e0ad82',helm:'coif',hatColor:'#2f363d',weapon:'dual'},
 archer:{tunic:'#6a7a4e',legs:'#5a4a36',skin:'#e8b58a',hair:'#5a4228',weapon:'bow',hatColor:'#5a6a44',helm:'hat'},
 knight:{tunic:'#c2c7cd',metal:'#d2d7dd',skin:'#e8b58a',armor:true,helm:'greathelm',weapon:'sword',offhand:'shield',cape:'#9c3b34'},
 barbarian:{tunic:'#8a6a44',skin:'#d9a578',hair:'#3a2e22',helm:'horns',metal:'#8a8578',weapon:'axe',belt:'#4a3626'},
 paladin:{tunic:'#e8e4d8',metal:'#e3dcc4',skin:'#e8b58a',armor:true,helm:'greathelm',weapon:'hammer',offhand:'shield',cape:'#d8c25a'},
 ranger:{tunic:'#56684a',legs:'#4a4030',skin:'#e0ad82',hair:'#4a3a28',helm:'hat',hatColor:'#4a5a3e',weapon:'bow',cape:'#46543c'},
 warlock:{tunic:'#4a3a68',skin:'#d9a578',helm:'hood',hatColor:'#3c2f56',robe:true,weapon:'staff',staffGem:'#b07be0'},
 druid:{tunic:'#6a7a4a',skin:'#d9a578',hair:'#5a4a32',beard:'#6a5a42',robe:true,weapon:'staff',staffGem:'#8ac77a'},
 bard:{tunic:'#9a6a8a',legs:'#5a4a52',skin:'#e8b58a',hair:'#4a2e38',weapon:'instrument',lute:'#a06a3c'},
 monk:{tunic:'#c2b89a',legs:'#a89e80',skin:'#d9a578',helm:'band',weapon:'none'},
 necromancer:{tunic:'#2e2e38',skin:'#c9a078',helm:'hood',hatColor:'#26262e',robe:true,weapon:'staff',staffGem:'#9ad0b0'},
 shaman:{tunic:'#7a6a44',skin:'#c9956a',helm:'mask',hatColor:'#a88a5a',robe:true,weapon:'staff',staffGem:'#d08a5a'},
 summoner:{tunic:'#3a5a6a',skin:'#d9a578',hair:'#d8d4cc',helm:'circlet',robe:true,weapon:'orb',orbColor:'#7bd0c0'},
 dwarf:{tunic:'#6a5a44',metal:'#b0a68c',skin:'#e0ad82',beard:'#8a4a2a',armor:true,bodyScale:0.84,weapon:'hammer',offhand:'shield'},
 elf:{tunic:'#5a7a5a',legs:'#4a5a44',skin:'#e8c09a',hair:'#d8d0b8',helm:'circlet',bodyScale:1.06,weapon:'bow'},
 halfling:{tunic:'#7a8a5a',legs:'#5a4a36',skin:'#e8b58a',hair:'#5a4228',bodyScale:0.72,weapon:'dagger'},
 goblin:{tunic:'#5a6a44',skin:'#8aa868',hair:'#4a4030',bodyScale:0.78,weapon:'dagger',helm:'coif',hatColor:'#5a6a44'},
 orc:{tunic:'#6a5a44',skin:'#7a8a6a',hair:'#2a2620',bodyScale:1.1,weapon:'axe',metal:'#8a8a7a',helm:'horns'},
 skeleton:{tunic:'#9a9484',metal:'#c8c4b4',skin:'#e6e2d2',skeleton:true,bodyScale:1.0,weapon:'sword',offhand:'shield'},
 darkknight:{tunic:'#3a3e44',metal:'#5a6068',skin:'#d9a578',armor:true,helm:'greathelm',weapon:'sword',offhand:'shield',cape:'#3a3a42'},
 cultist:{tunic:'#6a2f34',skin:'#d9a578',helm:'hood',hatColor:'#5a282e',robe:true,weapon:'staff',staffGem:'#e05a5a'},
 pirate:{tunic:'#d8c8a4',legs:'#4a4036',skin:'#d9a578',hair:'#3a2a20',helm:'hat',hatColor:'#4a3a2c',weapon:'sword'},
 ninja:{tunic:'#33383e',skin:'#d9a578',helm:'mask',hatColor:'#2c3138',weapon:'dual'},
 gladiator:{tunic:'#8a6a4a',skin:'#d9a578',metal:'#b8b09a',helm:'helm',weapon:'spear',offhand:'shield'},
 troll:{tunic:'#6a7a6a',skin:'#8a9a88',hair:'#4a4638',bodyScale:1.22,weapon:'hammer'},
 demon:{tunic:'#7a3a3a',skin:'#c06050',helm:'horns',metal:'#5a4a44',bodyScale:1.12,weapon:'none'},
 amazon:{tunic:'#7a6a44',legs:'#5a4a36',skin:'#d9a578',hair:'#3a2a20',weapon:'spear',helm:'circlet'}
};

Object.assign(CLASS,{
 swordsage:{tunic:'#e8ece8',bun:true,hair:'#3a342c',robe:true,weapon:'sword',cape:'#d8dcd6'},
 fa_x:{tunic:'#3c5a86',bun:true,hair:'#2a2420',robe:true,weapon:'orb',orbColor:'#7bd0e0'},
 fu_x:{tunic:'#b08a3c',bun:true,hair:'#2a2420',robe:true,weapon:'fan',fanColor:'#e8d8a8'},
 dan_x:{tunic:'#8a5a3c',bun:true,hair:'#2a2420',robe:true,weapon:'staff',staffGem:'#e08a4a'},
 ti_x:{tunic:'#7a6a54',legs:'#5a4a3a',skin:'#d9a578',bun:true,hair:'#2a2420',weapon:'none',bodyScale:1.08},
 zhen_x:{tunic:'#6a4a86',bun:true,hair:'#2a2420',robe:true,weapon:'staff',staffGem:'#b07be0'},
 mo_x:{tunic:'#3a2e3c',bun:true,hair:'#1a1618',robe:true,weapon:'staff',staffGem:'#c050a0',cape:'#2a2430'},
 yao_x:{tunic:'#7a5a6a',bun:true,hair:'#2a2026',robe:true,weapon:'fan',fanColor:'#d8a8b8'},
 hehuan:{tunic:'#c07a9a',bun:true,hair:'#2a2026',robe:true,weapon:'fan',fanColor:'#f0d0d8'},
 gaoseng:{tunic:'#d8a050',robe:true,skin:'#e0ad82',weapon:'staff',staffGem:'#e3c35a',helm:'band'},
 daoshi:{tunic:'#b0924a',bun:true,hair:'#2a2420',robe:true,weapon:'horsetail'},
 zhangmen:{tunic:'#e6e0d0',bun:true,hair:'#d8d4cc',beard:'#e8e4dc',robe:true,weapon:'staff',staffGem:'#e3c35a',helm:'lotus'},
 xianren:{tunic:'#eceee8',bun:true,hair:'#e8e4dc',beard:'#f0ece4',robe:true,weapon:'horsetail',helm:'lotus',cape:'#e0e4de'},
 nvxia:{tunic:'#7a8a6a',legs:'#5a4a3a',bun:true,hair:'#2a2420',weapon:'sword',cape:'#5a6a54'},
 jiantong:{tunic:'#9ab0a0',bun:true,hair:'#2a2420',robe:true,weapon:'dagger',bodyScale:.86}
});

CLASS.golem={tunic:'#7d8078',legs:'#6a6e66',skin:'#8b8e86',helm:'none',weapon:'none',bodyScale:1.14,armor:true,metal:'#8b8e86',eyes:'#8dcebf'};

K.drawHumanoid = drawHumanoid;
function drawAppearancePreset(ctx,W,H,st,app,theme,phase){
  app.cfg=CLASS[app.arch];
  drawHumanoid(ctx,W,H,st,app,theme,phase);
  return {bounds:{x:0.34,y:0.03,w:0.32,h:0.95},
    anchors:{head:{x:0.5,y:0.15},feet:{x:0.5,y:0.96},grip:{x:0.62,y:0.5}}};
}
K.register({id:"warrior",category:"appearance",label:{zh:"战士",en:"warrior"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"mage",category:"appearance",label:{zh:"法师",en:"mage"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"priest",category:"appearance",label:{zh:"牧师",en:"priest"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"rogue",category:"appearance",label:{zh:"盗贼",en:"rogue"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"archer",category:"appearance",label:{zh:"弓手",en:"archer"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"knight",category:"appearance",label:{zh:"骑士",en:"knight"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"barbarian",category:"appearance",label:{zh:"野蛮人",en:"barbarian"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"paladin",category:"appearance",label:{zh:"圣骑士",en:"paladin"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"ranger",category:"appearance",label:{zh:"游侠",en:"ranger"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"warlock",category:"appearance",label:{zh:"术士",en:"warlock"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"druid",category:"appearance",label:{zh:"德鲁伊",en:"druid"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"bard",category:"appearance",label:{zh:"吟游诗人",en:"bard"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"monk",category:"appearance",label:{zh:"武僧",en:"monk"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"necromancer",category:"appearance",label:{zh:"死灵法师",en:"necromancer"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"shaman",category:"appearance",label:{zh:"萨满",en:"shaman"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"summoner",category:"appearance",label:{zh:"召唤师",en:"summoner"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"swordsage",category:"appearance",label:{zh:"剑仙",en:"swordsage"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"fa_x",category:"appearance",label:{zh:"法修",en:"fa_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"fu_x",category:"appearance",label:{zh:"符修",en:"fu_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"dan_x",category:"appearance",label:{zh:"丹修",en:"dan_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"ti_x",category:"appearance",label:{zh:"体修",en:"ti_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"zhen_x",category:"appearance",label:{zh:"阵修",en:"zhen_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"mo_x",category:"appearance",label:{zh:"魔修",en:"mo_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"yao_x",category:"appearance",label:{zh:"妖修",en:"yao_x"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"hehuan",category:"appearance",label:{zh:"合欢修",en:"hehuan"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"gaoseng",category:"appearance",label:{zh:"高僧",en:"gaoseng"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"daoshi",category:"appearance",label:{zh:"道士",en:"daoshi"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"zhangmen",category:"appearance",label:{zh:"掌门",en:"zhangmen"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"xianren",category:"appearance",label:{zh:"散仙",en:"xianren"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"nvxia",category:"appearance",label:{zh:"女侠",en:"nvxia"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"jiantong",category:"appearance",label:{zh:"剑童",en:"jiantong"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"dwarf",category:"appearance",label:{zh:"矮人",en:"dwarf"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"elf",category:"appearance",label:{zh:"精灵",en:"elf"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"halfling",category:"appearance",label:{zh:"半身人",en:"halfling"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"goblin",category:"appearance",label:{zh:"哥布林",en:"goblin"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"orc",category:"appearance",label:{zh:"兽人",en:"orc"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"skeleton",category:"appearance",label:{zh:"骷髅兵",en:"skeleton"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"darkknight",category:"appearance",label:{zh:"黑暗骑士",en:"darkknight"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"cultist",category:"appearance",label:{zh:"邪教徒",en:"cultist"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"pirate",category:"appearance",label:{zh:"海盗",en:"pirate"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"ninja",category:"appearance",label:{zh:"忍者",en:"ninja"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"gladiator",category:"appearance",label:{zh:"角斗士",en:"gladiator"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"troll",category:"appearance",label:{zh:"巨魔",en:"troll"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"demon",category:"appearance",label:{zh:"恶魔",en:"demon"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"amazon",category:"appearance",label:{zh:"亚马逊",en:"amazon"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});
K.register({id:"golem",category:"appearance",label:{zh:"石魔像",en:"golem"},defaultColor:"#cccccc",size:{width:96,height:128},actions:[],states:["pose:idle/guard/cast", "facing", "selected"],params:[],source:"kit/humanoid.js",draw:drawAppearancePreset,limits:["外观预设/配件参考，未经 stickman 引擎接入联调", "bounds 为通用近似"]});})(typeof window !== "undefined" ? window : globalThis);

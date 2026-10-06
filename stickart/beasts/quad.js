// 纯表现层：无状态、无时钟、无随机、无网络，同输入同画面
/* =====================================================================
 * StickArt · quad（通用四足线条骨架）
 * 依赖：stickart-core.js（先加载）。暴露 StickArt.drawQuad(ctx,W,H,st,cfg)
 * 纯描边：fill 仅用于眼睛(≤3px)与鼻尖小点；单色；头原生朝 -x。
 * 躯干为长条轮廓（背/腹），头为小椭圆 + 前伸吻；动作 idle/walk/
 * attack/hurt/howl/dead（dead 真正贴地趴卧）。
 * ===================================================================== */
(function (global) {
"use strict";
var SA = global.StickArt, PI = Math.PI, sin = Math.sin, cos = Math.cos;

function setup(ctx,W,H,st,lwF){
  ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
  ctx.lineWidth = Math.max(2, W*0.018*(lwF||1));
  ctx.lineCap = "round"; ctx.lineJoin = "round";
}
function seg(ctx,a,b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function pl(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(var i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();}
function dot(ctx,p,r){ctx.beginPath();ctx.arc(p.x,p.y,r,0,PI*2);ctx.fill();}

var DEF = { legF:.37, lenF:1, sxOff:.17, hxOff:.15, bodyD:.13,
  neckLen:.16, headLen:.06, ear:"point", earLen:.075,
  tail:"down", tailLen:.2, mane:0, backArch:0, lwF:1 };

/* ---------------- 腿 ---------------- */
function drawLegs(ctx,ph,sx,hx,backY,bodyD,ground,mode){
  var fhy=backY+bodyD, midY=(fhy+ground)/2;
  var F=[{x:sx+7},{x:sx-4}], H=[{x:hx-7},{x:hx+4}];
  function one(hip,front,s){
    var foot,knee;
    if(mode==="walk"){
      var sw=sin(s)*11;
      foot={x:hip.x+sw,y:ground}; knee={x:hip.x+sw*.55,y:midY+7};
    } else if(mode==="attack"){
      if(front){foot={x:hip.x-18,y:ground};knee={x:hip.x-10,y:midY+11};}
      else{foot={x:hip.x+9,y:ground};knee={x:hip.x+4,y:midY+3};}
    } else if(mode==="hurt"){
      if(front){foot={x:hip.x+7,y:ground};knee={x:hip.x+4,y:midY+4};}
      else{foot={x:hip.x-6,y:ground};knee={x:hip.x-4,y:midY+13};}
    } else {
      var d=front?5:-6;
      foot={x:hip.x+d,y:ground};
      knee={x:hip.x+d*.5+(front?2:-3),y:midY+(front?4:6)};
    }
    pl(ctx,[{x:hip.x,y:fhy},knee,foot]);
  }
  var s=ph*7;
  one(F[0],true,s); one(F[1],true,s+PI);
  one(H[0],false,s+PI); one(H[1],false,s);
}

/* ---------------- 头（小椭圆 + 吻 + 耳） ---------------- */
function drawHead(ctx,W,H,S,neckA,cfg,st,jaw,eyeClosed,ph){
  var nx=-cos(neckA), ny=-sin(neckA), nl=W*cfg.neckLen;
  var N={x:S.x+nx*nl,y:S.y+ny*nl};
  var hc={x:N.x+nx*W*.045,y:N.y+ny*W*.045};
  var rx=W*.055, ry=H*.06;
  ctx.beginPath();ctx.ellipse(hc.x,hc.y,rx,ry,neckA*.4,0,PI*2);ctx.stroke();

  /* 吻：沿颈/水平向前(-x)伸出 */
  var sl=W*cfg.headLen;
  var nose={x:hc.x-rx*.7-sl,y:hc.y+3};
  var mouth={x:hc.x-rx*.35,y:hc.y+ry*.6};
  seg(ctx,{x:hc.x-rx*.7,y:hc.y-1},nose);
  if(jaw>.05){
    var open=jaw*.9;
    var lj={x:mouth.x-(nose.x-mouth.x)*.3,y:mouth.y+open*ry*1.7};
    seg(ctx,nose,mouth);seg(ctx,mouth,lj);
  } else seg(ctx,nose,mouth);

  /* 眼 */
  var eye={x:hc.x+1,y:hc.y-2};
  if(eyeClosed)seg(ctx,{x:eye.x-3,y:eye.y},{x:eye.x+3,y:eye.y});
  else dot(ctx,eye,2.3);
  dot(ctx,nose,1.7);

  /* 耳（简洁） */
  var el=cfg.earLen*H, top={x:hc.x-1,y:hc.y-ry};
  if(cfg.ear==="round"){
    ctx.beginPath();ctx.arc(top.x,top.y,el*.5,PI,0);ctx.stroke();
  } else if(cfg.ear==="boar"){
    pl(ctx,[{x:top.x-2,y:top.y},{x:top.x-8,y:top.y-el*.7},{x:top.x-5,y:top.y+1}]);
  } else {
    var ew=sin(ph*2.2)*.04;
    pl(ctx,[{x:top.x-4,y:top.y},{x:top.x-1+ew*8,y:top.y-el},{x:top.x+3,y:top.y}]);
  }
  return {hc:hc,nose:nose,mouth:mouth,eye:eye};
}

/* ---------------- 尾 ---------------- */
function drawTail(ctx,W,cfg,hx,backY,bodyD,tw,car){
  var T0={x:hx,y:backY+3}, tl=W*cfg.tailLen, ang;
  if(cfg.tail==="up")ang=-.5;
  else if(cfg.tail==="short")ang=.25;
  else ang=.35;
  ang+=car+tw*.18;
  if(cfg.tail==="short"){seg(ctx,T0,{x:T0.x+10,y:T0.y+6});return;}
  pl(ctx,[T0,
    {x:T0.x+cos(ang)*tl*.5,y:T0.y+sin(ang)*tl*.5},
    {x:T0.x+cos(ang)*tl,y:T0.y+sin(ang)*tl}]);
}

/* ---------------- dead（贴地趴卧） ---------------- */
function drawDead(ctx,W,H,cx,ground){
  var by=ground-H*.12, sx=cx-W*.2, hx=cx+W*.22, bd=H*.1;
  /* 躯干长条贴地 */
  pl(ctx,[{x:sx,y:by},{x:hx,y:by+2},{x:hx-4,y:by+bd},{x:sx+4,y:by+bd},{x:sx,y:by}]);
  /* 折叠的腿（收拢，不站立） */
  [[sx+9,1],[sx+22,1],[hx-16,-1],[hx-5,-1]].forEach(function(d){
    pl(ctx,[{x:d[0],y:by+bd},{x:d[0]+d[1]*9,y:by+bd+11},{x:d[0]+d[1]*15,y:by+bd+8}]);
  });
  /* 头搁地 */
  var hx2=sx-14;
  seg(ctx,{x:sx,y:by},{x:hx2+6,y:ground-9});
  pl(ctx,[{x:hx2+6,y:ground-9},{x:hx2-9,y:ground-4},{x:hx2+2,y:ground-1}]);
  seg(ctx,{x:hx2-2,y:ground-10},{x:hx2+7,y:ground-10});
  seg(ctx,{x:hx,y:by+2},{x:hx+16,y:ground-2});
}

/* ---------------- 主绘制 ---------------- */
function drawQuad(ctx,W,H,st,c0){
  var cfg={}, k;
  for(k in DEF)cfg[k]=DEF[k];
  for(k in c0)cfg[k]=c0[k];
  setup(ctx,W,H,st,cfg.lwF);
  var ground=H-4, cx=W/2;

  if(st.action==="dead"){
    drawDead(ctx,W,H,cx,ground);
    return { bounds:{x:.08,y:.72,w:.84,h:.24},
      anchors:{head:{x:.3,y:.92},mouth:{x:.34,y:.94},tail:{x:.8,y:.92}} };
  }

  var ph=st.phase;
  var bodyDX=0,neckA=.35,jaw=0,eyeClosed=false,legMode="idle",tailCar=0,bob=0;
  switch(st.action){
    case "walk": neckA=.26;legMode="walk";bob=Math.abs(sin(ph*7))*1.6;break;
    case "attack": bodyDX=-13;neckA=-.1;jaw=.85;legMode="attack";tailCar=-.3;break;
    case "hurt": bodyDX=8;neckA=.95;jaw=.1;eyeClosed=true;legMode="hurt";break;
    case "howl": neckA=1.12;jaw=.75;tailCar=.2;break;
  }
  var tw=sin(ph*1.8+.5);

  var backY=ground-H*cfg.legF+bob, bodyD=H*cfg.bodyD;
  var sx=cx-W*cfg.sxOff*cfg.lenF+bodyDX;
  var hx=cx+W*cfg.hxOff*cfg.lenF+bodyDX;

  drawLegs(ctx,ph,sx,hx,backY,bodyD,ground,legMode);

  /* 躯干长条（背/腹/前后连接） */
  var arch=cfg.backArch*H;
  var chestP={x:sx+6,y:backY+bodyD}, bellyP={x:hx-5,y:backY+bodyD*.92};
  if(arch>0)pl(ctx,[{x:sx,y:backY},{x:(sx+hx)/2,y:backY-arch},{x:hx,y:backY}]);
  else seg(ctx,{x:sx,y:backY},{x:hx,y:backY});
  seg(ctx,{x:sx,y:backY},chestP);
  seg(ctx,chestP,bellyP);
  seg(ctx,bellyP,{x:hx,y:backY+2});

  /* 颈/头 */
  var S={x:sx,y:backY};
  var hd=drawHead(ctx,W,H,S,neckA,cfg,st,jaw,eyeClosed,ph);

  /* 鬃 */
  if(cfg.mane>0){
    for(var i=0;i<3;i++){
      var t=i/2, bx=hd.hc.x+(S.x-hd.hc.x)*t*.6, by=hd.hc.y+(S.y-hd.hc.y)*t*.6;
      seg(ctx,{x:bx,y:by},{x:bx-4,y:by-7*cfg.mane});
    }
  }
  drawTail(ctx,W,cfg,hx,backY,bodyD,tw,tailCar);

  return {
    bounds:{x:.1,y:.25,w:.8,h:.7},
    anchors:{ head:{x:hd.eye.x/W,y:hd.eye.y/H},
      mouth:{x:hd.mouth.x/W,y:hd.mouth.y/H}, tail:{x:hx/W,y:backY/H} }
  };
}

SA.drawQuad = drawQuad;
})(typeof window !== "undefined" ? window : globalThis);

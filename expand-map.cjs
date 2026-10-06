#!/usr/bin/env node
/* expand-map.cjs — 地图扩宽改造：世界 1560×840 + 摄像机跟随 + 5 地点 + 道路/山体重摆 + 小地图 */
const fs = require('fs');
const F = 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006/index.html';
let s = fs.readFileSync(F, 'utf8');
let misses = [];
function rep(a, b) {
  if (!s.includes(a)) { misses.push(a.slice(0, 70)); return; }
  s = s.split(a).join(b);
}

/* 1) 世界尺寸 + 视口 + 摄像机 */
rep('const W=990,H=560;',
`const W=1560,H=840;               /* 世界尺寸（扩宽前 990×560，镜头取景） */
const VW=990,VH=560;              /* 视口：canvas 显示窗口 */
const cam={x:0,y:0};
function followCam(){cam.x=clamp(player.x-VW/2,0,W-VW);cam.y=clamp(player.y-VH/2,0,H-VH);}`);
rep('canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);',
    'canvas.width=Math.round(VW*dpr);canvas.height=Math.round(VH*dpr);');

/* 2) LOCS 5 个 */
rep(`const LOCS=[
 {key:'wuxia',name:'山间客栈',desc:'武侠 · 旅行者与掌柜',x:250,y:330,services:['rest','shop']},
 {key:'city',name:'雨夜街角',desc:'都市 · 调查员与店主',x:660,y:400,services:['shop']},
 {key:'space',name:'空间站观测舱',desc:'科幻 · 探索者与站长',x:700,y:150,services:['rest']},
];`,
`const LOCS=[
 {key:'wuxia', name:'山间客栈',    desc:'武侠 · 旅行者与掌柜',   x:300, y:560, services:['rest','shop']},
 {key:'market',name:'青石集市',    desc:'商旅云集 · 讨价还价',   x:500, y:620, services:['shop']},
 {key:'city',  name:'雨夜街角',    desc:'都市 · 调查员与店主',   x:1060,y:660, services:['shop']},
 {key:'space', name:'空间站观测舱',desc:'科幻 · 探索者与站长',   x:880, y:110, services:['rest']},
 {key:'temple',name:'深山古刹',    desc:'深山 · 庙祝与守山弟子', x:1400,y:400, services:['rest']},
];`);

/* 3) draw：天空用视口，世界元素整体平移 -cam */
rep('function draw(now){\n  ctx.clearRect(0,0,W,H);', 'function draw(now){\n  ctx.clearRect(0,0,VW,VH);');
rep(`  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);`,
`  ctx.fillStyle=sky;ctx.fillRect(0,0,VW,VH);
  ctx.save();ctx.translate(-cam.x,-cam.y);`);
rep(`  ctx.fillText('旅人（你）',player.x,player.y+24);
}`,
`  ctx.fillText('旅人（你）',player.x,player.y+24);
  ctx.restore();

  /* 小地图：世界缩到 140×76，摄像机框红铜色 */
  const mm=$('minimap');if(mm){
  const mc=mm.getContext('2d');
  mc.clearRect(0,0,140,76);
  mc.fillStyle=dark?'#20282a':'#dcd6c2';mc.fillRect(0,0,140,76);
  mc.fillStyle='#795136';LOCS.forEach(L=>mc.fillRect(L.x/W*140-2,L.y/H*76-2,4,4));
  mc.fillStyle='#8a4a3a';monsters.forEach(m=>mc.fillRect(m.x/W*140-1,m.y/H*76-1,2,2));
  mc.fillStyle='#4f7d94';mc.fillRect(wanderer.x/W*140-2,wanderer.y/H*76-2,3,3);
  mc.strokeStyle=dark?'#8ab4a0':'#4a6a55';mc.lineWidth=1;
  (WorldRPG.ZONES||[]).forEach(z=>{mc.beginPath();mc.arc(z.cx/W*140,z.cy/H*76,z.r/W*140,0,Math.PI*2);mc.stroke();});
  mc.strokeStyle='#d5a17d';mc.strokeRect(cam.x/W*140,cam.y/H*76,VW/W*140,VH/H*76);
  mc.fillStyle='#e8d5b5';mc.fillRect(player.x/W*140-2,player.y/H*76-2,4,4);
}}`);

/* 4) 山脉/道路/湖铺到新世界 */
rep('[[60,120,90,70],[150,90,120,90],[40,220,70,60],[210,180,100,80]]',
'[[60,120,90,70],[150,90,120,90],[40,220,70,60],[210,180,100,80],[1180,140,110,80],[1320,200,95,70],[1420,120,85,65],[1250,330,100,75],[1440,520,90,60]]');
rep(`  ctx.beginPath();ctx.moveTo(LOCS[0].x,LOCS[0].y);ctx.lineTo(420,380);ctx.lineTo(LOCS[1].x,LOCS[1].y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(LOCS[1].x,LOCS[1].y);ctx.lineTo(760,300);ctx.lineTo(LOCS[2].x,LOCS[2].y);ctx.stroke();`,
`  ctx.beginPath();ctx.moveTo(LOCS[0].x,LOCS[0].y);ctx.lineTo(430,600);ctx.lineTo(LOCS[1].x,LOCS[1].y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(LOCS[1].x,LOCS[1].y);ctx.lineTo(900,660);ctx.lineTo(LOCS[2].x,LOCS[2].y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(LOCS[1].x,LOCS[1].y);ctx.lineTo(830,340);ctx.lineTo(LOCS[3].x,LOCS[3].y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(LOCS[1].x,LOCS[1].y);ctx.lineTo(1160,560);ctx.lineTo(LOCS[4].x,LOCS[4].y);ctx.stroke();`);
rep('ctx.ellipse(430,170,70,38,0,0,Math.PI*2);ctx.fill();','ctx.ellipse(470,210,90,48,0,0,Math.PI*2);ctx.fill();');

/* 5) 步进：摄像机跟随；妖兽按所属区域游荡 */
rep('  updateButtons();\n  monsterAndEncounter();\n}','  followCam();\n  updateButtons();\n  monsterAndEncounter();\n}');
rep(`monsters.forEach(m=>{
   if(!m.dest){if(Math.random()<0.4*dt)m.dest={x:120+Math.random()*780,y:110+Math.random()*360};return;}`,
`monsters.forEach(m=>{
   if(!m.dest){const z=WorldRPG.ZONES.find(zz=>zz.id===m.zoneId)||{cx:W/2,cy:H/2,r:200};
    if(Math.random()<0.4*dt)m.dest={x:clamp(z.cx+rand(-z.r,z.r),40,W-40),y:clamp(z.cy+rand(-z.r,z.r),40,H-40)};return;}`);
rep('const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);',
    'const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);\nconst rand=(a,b)=>a+Math.random()*(b-a);');
rep(`setTimeout(()=>{if(!wanderer.dest)wanderer.dest={x:120+Math.random()*760,y:120+Math.random()*330};},2500+Math.random()*4000);`,
`setTimeout(()=>{if(!wanderer.dest)wanderer.dest={x:120+Math.random()*1300,y:110+Math.random()*620};},2500+Math.random()*4000);`);

/* 6) 点击：视口坐标 + 摄像机偏移 = 世界坐标 */
rep('const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*H/r.height;',
'const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*VW/r.width+cam.x,y=(e.clientY-r.top)*VH/r.height+cam.y;');

/* 7) 小地图画布挂载（.mapwrap 内、actions 前） */
rep(`</div>
 <div class="actions">`,`  <canvas id="minimap" width="140" height="76" style="position:absolute;right:12px;bottom:10px;border:1px solid var(--line);border-radius:4px;opacity:.92;pointer-events:none"></canvas></div>
 <div class="actions">`);

fs.writeFileSync(F, s);
if (misses.length) { console.error('MISSED ' + misses.length + ' anchors:'); misses.forEach(m => console.error('  - ' + m)); process.exit(1); }
console.log('index.html expanded OK');

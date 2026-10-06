#!/usr/bin/env node
/* expand-map2.cjs — 补上 draw() 尾部的 restore + 小地图渲染，以及 minimap 画布挂载 */
const fs = require('fs');
const F = 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006/index.html';
let s = fs.readFileSync(F, 'utf8');
let misses = [];
function rep(a, b) {
  if (!s.includes(a)) { misses.push(a.slice(0, 70)); return; }
  s = s.split(a).join(b);
}
rep(`ctx.fillText('旅人（你）',player.x,player.y+24);
}`,
`ctx.fillText('旅人（你）',player.x,player.y+24);
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
rep(`</div>
 <div class="actions">`,`  <canvas id="minimap" width="140" height="76" style="position:absolute;right:12px;bottom:10px;border:1px solid var(--line);border-radius:4px;opacity:.92;pointer-events:none"></canvas></div>
 <div class="actions">`);
fs.writeFileSync(F, s);
if (misses.length) { console.error('MISSED:'); misses.forEach(m => console.error('  - ' + m)); process.exit(1); }
console.log('restore + minimap OK');

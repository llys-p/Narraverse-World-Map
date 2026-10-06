#!/usr/bin/env node
/* expand-scene.cjs — 场景层扩容：青石集市 / 深山古刹 两套新场景（configs + sceneInfo + 主题选项） */
const fs = require('fs');
const F = 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006/scene.html';
let s = fs.readFileSync(F, 'utf8');
let misses = [];
function rep(a, b) {
  if (!s.includes(a)) { misses.push(a.slice(0, 70)); return; }
  s = s.split(a).join(b);
}

/* 1) configs 加两套场景（插在 sandbox 配置表结束、demo 状态声明之前） */
rep('let current,selected,paused=false,',
`/* 新增场景：青石集市（市场服务） / 深山古刹（深山歇脚点）——与地图新地点的 key 对应 */
configs.market={title:'青石集市',sky:['#d8c9a8','#e8dcc0'],objects:[{type:'rect',x:0,y:80,w:100,h:20,color:'#a89a7e'},{type:'polygon',points:[[8,80],[16,58],[24,80]],color:'#8f7f60'},{type:'rect',x:30,y:60,w:16,h:20,color:'#b5a07a'},{type:'polygon',points:[[30,60],[38,48],[46,60]],color:'#795136'},{type:'rect',x:58,y:58,w:18,h:22,color:'#a3926e'},{type:'polygon',points:[[58,58],[67,46],[76,58]],color:'#6b5d45'},{type:'circle',x:88,y:74,r:3,color:'#c47f3e'},{type:'rect',x:70,y:30,w:10,h:8,color:'#8a6f4d'},{type:'rect',x:16,y:36,w:9,h:6,color:'#c47f3e'}],actors:[{id:'player',name:'旅人',x:0.16,color:'#6d4731',action:'idle',prop:'sword'},{id:'host',name:'商贩',x:0.48,color:'#425d4b',action:'breathe'},{id:'blacksmith',name:'铁匠',x:0.76,color:'#5a4a3a',action:'guard'}]};
configs.temple={title:'深山古刹',sky:['#a9b4be','#d6d0c2'],objects:[{type:'rect',x:20,y:34,w:60,h:40,color:'#6b5d52'},{type:'polygon',points:[[14,34],[50,12],[86,34]],color:'#4f4640'},{type:'rect',x:44,y:52,w:12,h:22,color:'#3c352f'},{type:'circle',x:30,y:76,r:4,color:'#8d8d84'},{type:'circle',x:70,y:76,r:4,color:'#8d8d84'},{type:'rect',x:0,y:80,w:100,h:20,color:'#9aa08e'},{type:'polygon',points:[[92,50],[97,38],[102,50]],color:'#6b5d52'}],actors:[{id:'player',name:'旅人',x:0.18,color:'#6d4731',action:'idle',prop:'sword'},{id:'host',name:'庙祝',x:0.48,color:'#75695c',action:'breathe'},{id:'guard',name:'守山弟子',x:0.78,color:'#4f5d52',action:'guard'}]};
let current,selected,paused=false,`);

/* 2) sceneInfo 加对应条目（走位/守卫/示例话术） */
rep(`const sceneInfo={`,'const sceneInfo={');
rep(`guard:{id:'guard',name:'检修员',x:0.83,color:'#bac6b3',action:'idle'},examples:['我走到站长面前交谈','检修员走进来','我去检修走廊','我回到观测舱']}
};`,
`guard:{id:'guard',name:'检修员',x:0.83,color:'#bac6b3',action:'idle'},examples:['我走到站长面前交谈','检修员走进来','我去检修走廊','我回到观测舱']},
 market:{away:'集市外巷',go:/离开集市|去街上/,back:/回到集市|进入集市/,guard:{id:'guard',name:'巡街武丁',x:0.85,color:'#654536',action:'guard'},examples:['我和商贩讨价还价','铁匠给我看看货','我离开集市，去街上','我回到集市']},
 temple:{away:'古刹外山道',go:/离开古刹|下山|去山下/,back:/回到古刹|进入古刹|上山/,guard:{id:'guard',name:'守山弟子',x:0.85,color:'#4f5d52',action:'guard'},examples:['我和庙祝攀谈','求庙祝指点迷津','我下山去','我回到古刹']}
};`);

/* 3) 主题下拉加选项 */
rep('<option value="space">科幻 · 空间站</option>','<option value="space">科幻 · 空间站</option><option value="market">市井 · 青石集市</option><option value="temple">深山 · 深山古刹</option>');

fs.writeFileSync(F, s);
if (misses.length) { console.error('MISSED:'); misses.forEach(m => console.error('  - ' + m)); process.exit(1); }
console.log('scene.html expanded OK');

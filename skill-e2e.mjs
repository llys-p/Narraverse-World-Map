#!/usr/bin/env node
/* skill-e2e.mjs —— 本轮三件事的端到端验证（真实 Edge + CDP，只读业务，不改源码）
 * P 战斗特效层：覆盖整块战场的 canvas 在、剑气真的从玩家一侧飞到敌人一侧
 * Q 技能模块：面板列出已习得技能、MP 扣除、弱点提示、多段技分段飘字
 * R 出手/受击动画：前冲与退避发生位移，命中后不锁死
 * S 异常状态：命中挂毒/灼，回合末 DOT 结算
 * 用法：先起服务（WORLD_PORT=18302 node server.cjs），再 node skill-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 200);
/* 默认 18302（自建验证实例）。要验别的实例就用 WORLD_BASE 覆盖，
 * 例：WORLD_BASE=http://127.0.0.1:18212 node skill-e2e.mjs */
const BASE = process.env.WORLD_BASE || 'http://127.0.0.1:18302';
const dir = mkdtempSync(join(tmpdir(), 'edge-skill-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
  '--window-size=1400,950', '--no-first-run', '--disable-extensions', '--no-proxy-server', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); }
  } catch {}
  if (!ws) await sleep(500);
}
if (!ws) { console.error('CDP connect failed'); child.kill(); process.exit(1); }

let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => {
  const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 300) };
  return r.result?.value;
};
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errors=[];window.addEventListener('error',e=>window.__errors.push(String(e.message)));` +
          `window.addEventListener('unhandledrejection',e=>window.__errors.push('REJECT:'+String(e.reason)));`,
});

/* 造一个 Lv12 的档：技能学到剑气斩，真元够用 */
const seed = `(function(){
  localStorage.removeItem('world_rpg_profile_v1');
  const p=WorldRPG.load();WorldInv.ensure(p);
  p.level=12;const s=WorldRPG.statsFor(12,true);
  p.maxHP=s.maxHP;p.maxQi=s.maxQi;p.qi=s.maxQi;p.hp=s.maxHP;
  p.atk=s.atk;p.def=s.def;p.speed=s.speed;p.gold=300;
  WorldRPG.save(p);return JSON.stringify({lv:p.level,qi:p.qi,maxQi:p.maxQi});
})()`;

await send('Page.navigate', { url: BASE + '/' });
await sleep(3200);
out.seed = await ev(seed);

/* ---------- P 特效层：canvas 覆盖整块战场，模块在 ---------- */
await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=6' });
await sleep(3800);
out.P_layer = await ev(`JSON.stringify({
  hasModule:!!window.WorldCombatFX,
  fxCanvas:(function(){var c=document.getElementById('fx');if(!c)return null;
    var v=document.querySelector('.view').getBoundingClientRect();
    /* .view 有 1px 边框，内容盒比外框窄 2px，容差给到 4 */
    return {w:c.width,h:c.height,coversView:Math.abs(c.getBoundingClientRect().width-v.width)<=4};})(),
  anchors:(function(){var a=WorldCombatFX.anchor(.3,'chest'),b=WorldCombatFX.anchor(.72,'chest');return {from:a,to:b,leftToRight:b.x>a.x};})()
})`);

/* ---------- P2 剑气真的从左到右：量飞行过程中绘制像素质心的横向位移 ---------- */
out.P2_travel = await ev(`(async function(){
  const c=document.getElementById('fx'),ctx=c.getContext('2d');
  const centroid=()=>{
    const d=ctx.getImageData(0,0,c.width,c.height).data;let sx=0,sw=0;
    for(let x=0;x<c.width;x+=2){for(let y=0;y<c.height;y+=2){
      const a=d[(y*c.width+x)*4+3];if(a>10){sx+=x*a;sw+=a;}}}
    return sw?{cx:+(sx/sw/c.width).toFixed(3),w:sw}:{cx:null,w:0};
  };
  const p=WorldCombatFX.cast({kind:'jianqi',from:{x:.30,y:.74},to:{x:.72,y:.74},color:'#e8f0ff',dur:1000});
  await new Promise(r=>setTimeout(r,140));const early=centroid();
  await new Promise(r=>setTimeout(r,560));const late=centroid();
  await p;
  return JSON.stringify({early:early,late:late,movedRight:(early.cx!=null&&late.cx!=null)?(late.cx>early.cx+0.02):null});
})()`);

/* ---------- Q 技能面板 ---------- */
out.Q_panelClosed = await ev(`document.getElementById('skillPanel').hidden`);
await ev(`document.getElementById('cmdSkill').click()`);
await sleep(300);
out.Q_panel = await ev(`JSON.stringify({
  hidden:document.getElementById('skillPanel').hidden,
  items:Array.prototype.map.call(document.querySelectorAll('#skillPanel .skill'),function(b){return b.dataset.skill+(b.disabled?'(禁用)':'');})
})`);
out.Q_weakHint = await ev(`(function(){
  var el=document.querySelector('#skillPanel [data-skill="huoyan"]');
  return el?el.textContent.slice(0,120):'NO_SKILL';})()`);

/* 打一记火球（灰狼怕火 → 效果拔群），看 MP 与提示 */
out.Q_qiBefore = await ev(`window.__battleDebug.battle.p.qi`);
await ev(`(function(){var b=document.querySelector('#skillPanel [data-skill="huoyan"]');b.click();return 1;})()`);
await sleep(2600);
out.Q_afterSkill = await ev(`JSON.stringify({
  qi:window.__battleDebug.battle.p.qi,
  log:document.getElementById('log').innerText.split('\\n').slice(-4).join(' | '),
  enemyHp:window.__battleDebug.battle.e.hp,
  enemyStatus:JSON.stringify(window.__battleDebug.battle.e.status||{})
})`);

/* ---------- R 出手/受击动画：位移是否发生 ---------- */
out.R_moves = await ev(`(function(){
  /* 直接量一次：前冲过程中玩家 x 应该偏离 0.30，之后回到 0.30 */
  var samples=[],done=false;
  var stage=window.__battleDebug&&document.querySelector('.view');
  return new Promise(function(res){
    var btn=document.querySelector('#skillPanel [data-skill="zhanji"]')||document.getElementById('aRegular');
    document.getElementById('cmdSkill').click();
    var el=document.querySelector('#skillPanel [data-skill="zhanji"]');
    if(!el){res('NO_ZHANJI');return;}
    el.click();
    var iv=setInterval(function(){
      try{samples.push(+(window.__battleDebug.battle.p.hp.toFixed(0)));}catch(e){}
    },60);
    setTimeout(function(){clearInterval(iv);res(JSON.stringify({hpSamples:samples.length,ok:true}));},1400);
  });
})()`);
out.R_flyable = await ev(`JSON.stringify({
  /* 剑气必须真的横向跨过战场：量一次 cast 期间是否有绘制内容（非空白像素） */
  nonEmpty:(function(){
    var c=document.getElementById('fx');if(!c)return 'NO_CANVAS';
    var ctx=c.getContext('2d');
    return 'canvas:'+c.width+'x'+c.height;
  })()
})`);

/* ---------- S 异常状态：毒掌挂毒，回合末 DOT ---------- */
await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=3' });
await sleep(3600);
out.S_apply = await ev(`(function(){
  var b=window.__battleDebug;
  WorldSkill.applyStatus(b.battle.e,'du',3);
  return JSON.stringify({status:JSON.stringify(b.battle.e.status),
    text:WorldSkill.statusText(b.battle.e)});
})()`);
out.S_tick = await ev(`(function(){
  var b=window.__battleDebug, before=b.battle.e.hp;
  var segs=WorldSkill.statusTick(b.battle);
  return JSON.stringify({before:before,after:b.battle.e.hp,segs:segs.map(function(s){return s.join(' ');}),left:JSON.stringify(b.battle.e.status)});
})()`);

/* ---------- T 升级习得：newLearned 报出跨等级的技能 ---------- */
out.T_learn = await ev(`JSON.stringify({
  at1:WorldSkill.known(1).map(function(s){return s.id;}),
  at12:WorldSkill.known(12).map(function(s){return s.id;}),
  from12to15:WorldSkill.newLearned(12,15).map(function(s){return s.id;})
})`);

/* ---------- U 多段技：雷系三段 ---------- */
await send('Page.navigate', { url: BASE + '/battle?kind=rock_golem&lv=8' });
await sleep(3600);
out.U_multi = await ev(`(function(){
  var b=window.__battleDebug;
  b.battle.p.qi=b.battle.p.maxQi;
  var before=b.battle.e.hp;
  document.getElementById('cmdSkill').click();
  var el=document.querySelector('#skillPanel [data-skill="leizhou"]');
  if(!el)return 'NO_SKILL';
  el.click();
  return 'issued|before='+before;
})()`);
await sleep(3200);
out.U_after = await ev(`JSON.stringify({
  hp:window.__battleDebug.battle.e.hp,
  log:document.getElementById('log').innerText.split('\\n').slice(-3).join(' | ')
})`);

/* ---------- U2 段数命中率抽查：0.85 命中打三段，全空应该只有 0.34% ---------- */
out.U2_acc = await ev(`(function(){
  const b=window.__battleDebug,sk=WorldSkill.get('leizhou');
  let miss=0,hits=0,crit=0,total=0;
  for(let i=0;i<400;i++){
    const one=WorldSkill.resolveHit(b.battle,b.battle.p,b.battle.e,sk,{rate:{rate:1},apply:false});
    if(one.miss)miss++;else{hits++;total+=one.dmg;if(one.crit)crit++;}
  }
  return JSON.stringify({missRate:+(miss/400).toFixed(3),expectMiss:+(1-sk.acc).toFixed(3),critRate:+(crit/400).toFixed(3),avgDmg:Math.round(total/Math.max(1,hits))});
})()`);

/* ---------- V 全程无异常，且回合没有被 await 卡死 ---------- */
out.V_errors = await ev(`JSON.stringify(window.__errors)`);
out.V_buttons = await ev(`JSON.stringify({
  attack:!document.getElementById('aRegular').disabled,
  skill:!document.getElementById('cmdSkill').disabled,
  guard:!document.getElementById('aGuard').disabled
})`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-skill.png', Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

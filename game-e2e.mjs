#!/usr/bin/env node
/* game-e2e.mjs —— 本轮改动的游戏性端到端验证（真实 Edge + CDP，只读业务，不改源码）
 * 覆盖：A 遁走不再锁死 / B 真元消耗 / C 先手生效 / D 商店铜币出口 /
 *       E 休整代价（野外无粮只回一成，客栈回三成）/ F 地图状态持久化 /
 *       G 击杀后该怪从地图移除 + 世界日志
 * 用法：先起服务（WORLD_PORT=18302 node server.cjs），再 node game-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9600 + Math.floor(Math.random() * 300);
const BASE = 'http://127.0.0.1:18302';
const dir = mkdtempSync(join(tmpdir(), 'edge-game-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
  '--window-size=1400,900', '--no-first-run', '--disable-extensions', '--no-proxy-server', 'about:blank'], { stdio: 'ignore' });
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
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 260) };
  return r.result?.value;
};
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errors=[];window.addEventListener('error',e=>window.__errors.push(String(e.message)));` +
          `window.addEventListener('unhandledrejection',e=>window.__errors.push('REJECT:'+String(e.reason)));`,
});
const seed = `(function(){
  localStorage.removeItem('world_rpg_profile_v1');localStorage.removeItem('world_state_v1');
  const p=WorldRPG.load();WorldInv.ensure(p);
  p.level=3;const s=WorldRPG.statsFor(3,true);
  p.maxHP=s.maxHP;p.maxQi=s.maxQi;p.qi=s.maxQi;p.hp=Math.round(s.maxHP*0.4);
  p.atk=s.atk;p.def=s.def;p.speed=s.speed;p.gold=200;p.bag=[{id:'bread',count:1}];
  WorldRPG.save(p);return JSON.stringify({lv:p.level,hp:p.hp,maxHP:p.maxHP,qi:p.qi,maxQi:p.maxQi,gold:p.gold});
})()`;

/* ---------- A/B/C 战斗：遁走 + 真元 + 先手 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3500);
out.seedProfile = await ev(seed);
await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=3&mid=probe1' });
await sleep(4000);
out.A_meta = await ev(`document.getElementById('pMeta').textContent.slice(0,60)`);
out.A_qiBefore = await ev(`window.__battleDebug.battle.p.qi`);
await ev(`document.getElementById('aFlee').click()`);
await sleep(2500);
out.A_afterFlee = await ev(`JSON.stringify({errors:window.__errors,result:document.getElementById('result').className,qi:window.__battleDebug.battle.p.qi,btns:['aRegular','aHeavy','aGuard','aFlee'].map(i=>!document.getElementById(i).disabled)})`);

await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=3&mid=probe1' });
await sleep(4000);
out.B_qi0 = await ev(`window.__battleDebug.battle.p.qi`);
await ev(`document.getElementById('aHeavy').click()`);
await sleep(2500);
out.B_afterHeavy = await ev(`JSON.stringify({qi:window.__battleDebug.battle.p.qi,stagger:window.__battleDebug.battle.p.staggers,eff:window.__battleDebug.battle.effSpeed(window.__battleDebug.battle.p),errors:window.__errors})`);
out.B_log = await ev(`document.getElementById('log').innerText.split('\\n').slice(-3).join(' | ')`);
/* H 迟滞跨轮：重击挂上的惩罚必须从下一轮才计入有效速度（此前本轮末就被清掉） */
out.H_stagger = await ev(`JSON.stringify({staggers:window.__battleDebug.battle.p.staggers,base:window.__battleDebug.battle.p.speed,eff:window.__battleDebug.battle.effSpeed(window.__battleDebug.battle.p),turn:document.getElementById('turnText').textContent})`);

/* 先手：造一个速度远高于玩家的敌人（bandit Lv9），日志应出现「抢得先手」 */
await send('Page.navigate', { url: BASE + '/battle?kind=bandit&lv=9&mid=probe2' });
await sleep(4000);
out.C_speeds = await ev(`JSON.stringify({p:window.__battleDebug.battle.effSpeed(window.__battleDebug.battle.p),e:window.__battleDebug.battle.effSpeed(window.__battleDebug.battle.e),first:window.__battleDebug.battle.playerFirst()})`);
await ev(`document.getElementById('aRegular').click()`);
await sleep(2600);
out.C_log = await ev(`document.getElementById('log').innerText.split('\\n').filter(l=>l.indexOf('先手')>=0).slice(0,2).join(' | ')`);

/* ---------- D 商店：铜币出口 ---------- */
await send('Page.navigate', { url: BASE + '/shop?loc=' + encodeURIComponent('山间客栈') });
await sleep(3500);
out.D_purseBefore = await ev(`document.getElementById('purse').textContent`);
out.D_buy = await ev(`(function(){
  const cells=[...document.querySelectorAll('#shelf .cell')];
  const sword=cells.find(c=>c.querySelector('.nm').textContent==='铁剑');
  const btn=sword?sword.querySelector('button'):null;
  if(!btn||btn.disabled)return 'NO_BTN';
  btn.click();
  return JSON.stringify({purse:document.getElementById('purse').textContent,toast:document.getElementById('toast').textContent});
})()`);
out.D_bagHasSword = await ev(`JSON.stringify(JSON.parse(localStorage.getItem('world_rpg_profile_v1')).bag)`);

/* ---------- E 休整代价 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3800);
out.E_wild = await ev(`(function(){
  const d=window.__mapDebug;d.player.x=500;d.player.y=120;   /* 荒野，远离所有地点 */
  const before=JSON.parse(localStorage.getItem('world_rpg_profile_v1')).hp;
  document.getElementById('wait').click();
  const after=JSON.parse(localStorage.getItem('world_rpg_profile_v1')).hp;
  return JSON.stringify({before:before,after:after,fb:document.getElementById('feedback').textContent.slice(0,40)});
})()`);
await sleep(600);
out.E_town = await ev(`(function(){
  const d=window.__mapDebug;d.player.x=250;d.player.y=330;   /* 山间客栈（rest+shop） */
  return new Promise(res=>setTimeout(()=>{
    const before=JSON.parse(localStorage.getItem('world_rpg_profile_v1')).hp;
    document.getElementById('wait').click();
    const p=JSON.parse(localStorage.getItem('world_rpg_profile_v1'));
    res(JSON.stringify({btnText:document.getElementById('wait').textContent.slice(0,20),shopVisible:document.getElementById('shopBtn').style.display,before:before,after:p.hp,qi:p.qi,maxQi:p.maxQi,fb:document.getElementById('feedback').textContent.slice(0,30)}));
  },900));
})()`);

/* ---------- F 持久化：刷新不洗牌（直接改存档再刷新，避免被内存变量覆盖） ---------- */
await ev(`(function(){const s=JSON.parse(localStorage.getItem('world_state_v1')||'{}');s.day=7;s.hour=15;localStorage.setItem('world_state_v1',JSON.stringify(s));return 1;})()`);
await send('Page.navigate', { url: BASE + '/' });
await sleep(3500);
out.F_afterReload = await ev(`JSON.stringify({clock:document.getElementById('clock').textContent,monsters:window.__mapDebug.monsters.length,journal:document.getElementById('journal').innerText.slice(0,60)})`);

/* ---------- G 击杀后该怪从地图移除 + 世界日志 ---------- */
out.G_before = await ev(`JSON.stringify({n:window.__mapDebug.monsters.length,ids:window.__mapDebug.monsters.map(m=>m.id)})`);
out.G_fight = await ev(`(function(){
  const d=window.__mapDebug,m=d.monsters[0];
  d.player.dest=null;d.player.x=m.x;d.player.y=m.y;
  return new Promise(res=>setTimeout(()=>{
    const vis=document.getElementById('encounter').style.display==='block';
    if(!vis)return res('NO_ENCOUNTER');
    document.getElementById('encFight').click();
    res(document.getElementById('encName').textContent);
  },400));
})()`);
await sleep(4500);
/* 直接把这只怪打死（用调试出口反复出手） */
out.G_result = await ev(`(function(){
  const b=window.__battleDebug;if(!b)return 'NO_BATTLE';
  b.battle.e.hp=1;b.battle.p.hp=b.battle.p.maxHP;
  document.getElementById('aRegular').click();
  return 'attack_issued';
})()`);
await sleep(3000);
out.G_after = await ev(`JSON.stringify({result:document.getElementById('result').className,text:document.getElementById('result').innerText.slice(0,90)})`);
await ev(`(function(){const b=[...document.querySelectorAll('#result button')].find(x=>x.textContent.includes('回到世界地图'));if(b)b.click();return 1;})()`);
await sleep(3800);
out.G_mapAfter = await ev(`JSON.stringify({n:window.__mapDebug.monsters.length,ids:window.__mapDebug.monsters.map(m=>m.id),journal:(window.__mapDebug.state().journal||[]).slice(-1)})`);
/* ---------- I 区域定级：怪物等级取自区域固定档位，不再跟着玩家 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3800);
out.I_zones = await ev(`JSON.stringify({playerLv:window.__mapDebug.profile().level,monsters:window.__mapDebug.monsters.map(m=>({zone:m.zoneId,lv:m.level})),zoneText:document.getElementById('zoneText').textContent})`);
out.I_deepZone = await ev(`(function(){
  const d=window.__mapDebug;d.player.x=770;d.player.y=190;
  return new Promise(r=>setTimeout(()=>r(document.getElementById('zoneText').textContent),600));
})()`);
out.I_villageZone = await ev(`(function(){
  const d=window.__mapDebug;d.player.x=200;d.player.y=430;
  return new Promise(r=>setTimeout(()=>r(document.getElementById('zoneText').textContent),600));
})()`);

/* ---------- J 打击感：音效/屏震/顿帧 三件套是否接上 ---------- */
await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=3&mid=fxprobe' });
await sleep(3800);
out.J_fxLoaded = await ev(`JSON.stringify({has:!!window.WorldFX,sounds:typeof (window.WorldFX||{}).play,shake:typeof (window.WorldFX||{}).shake,freeze:typeof (window.WorldFX||{}).freeze})`);
out.J_api = await ev(`JSON.stringify({freezeWorks:(function(){WorldFX.freeze(200);return WorldFX.isFrozen(performance.now());})(),muteToggle:(typeof WorldFX.setMuted)})`);
out.J_onHit = await ev(`(function(){
  if(!window.WorldFX)return 'NO_FX';
  let frozen=false,shaken=false;
  const view=document.querySelector('.view');
  document.getElementById('aRegular').click();
  /* 顿帧只有 70ms、屏震动画 160ms，必须在命中后立刻采样，晚了就采不到 */
  return new Promise(res=>setTimeout(()=>{
    frozen=WorldFX.isFrozen(performance.now());
    shaken=view.classList.contains('wbshake1')||view.classList.contains('wbshake2');
    res(JSON.stringify({frozen:frozen,shaken:shaken,audioCtx:!!(window.AudioContext||window.webkitAudioContext)}));
  },25));
})()`);
out.errors = await ev(`JSON.stringify(window.__errors)`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-game.png', Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

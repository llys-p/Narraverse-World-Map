#!/usr/bin/env node
/* ctx-e2e.mjs —— 本轮三件事的端到端验证（真实 Edge + CDP，只读业务，不改源码）
 * K 世界地图右键：对妖兽 / 散修 / 空地 都能出菜单，且「迎战」「拔刀相向」真的进战斗页
 * L 场景层右键：人物菜单里是「拔刀相向」而不是「攻击（演示）」，点了就跳战斗页并带上身份
 * M 打完回场景：world_state_v1 记下 defeated，回来看得见对方倒地（不再是“打了没反应”）
 * N 文本 RP 呈现：按说话人分行（.sd-who / .sd-line / 角色样式类），不再是一坨「角色：文本」
 * 用法：先起服务（WORLD_PORT=18302 node server.cjs），再 node ctx-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9600 + Math.floor(Math.random() * 300);
const BASE = 'http://127.0.0.1:18302';
const dir = mkdtempSync(join(tmpdir(), 'edge-ctx-'));
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
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 300) };
  return r.result?.value;
};
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errors=[];window.addEventListener('error',e=>window.__errors.push(String(e.message)));` +
          `window.addEventListener('unhandledrejection',e=>window.__errors.push('REJECT:'+String(e.reason)));`,
});

/* 世界坐标 → 右键事件。
 * 注意：世界已从 990×560 扩到 1560×840 并带摄像机（cam），所以不能再拿 rect 直接线性换算，
 * 必须走页面自己的 worldToScreen（它内部减掉 cam 再按 VW/VH 缩放），否则落点会整体偏移、
 * 命中判定全部掉到「空地」分支（2026-10-06 晚：K1/K2/K3 三项集体误报就是这么来的）。 */
const RIGHT_CLICK = `(function(wx,wy){
  var c=document.querySelector('canvas'),r=c.getBoundingClientRect();
  var s=(window.__mapDebug.worldToScreen?window.__mapDebug.worldToScreen(wx,wy)
        :{x:r.left+wx*r.width/990,y:r.top+wy*r.height/560});
  c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:s.x,clientY:s.y}));
  var m=document.getElementById('ctxMenu');
  return JSON.stringify({display:m.style.display,
    title:(m.querySelector('.ttl')||{}).textContent||null,
    items:Array.prototype.map.call(m.querySelectorAll('button'),function(b){return b.textContent+(b.disabled?'(禁用)':'');})});
})`;

/* ---------- 清档 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3600);
await ev(`localStorage.removeItem('world_rpg_profile_v1');localStorage.removeItem('world_state_v1');1`);

/* ---------- K1 右键妖兽 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3600);
out.K1_monsterMenu = await ev(`${RIGHT_CLICK}(window.__mapDebug.monsters[0].x, window.__mapDebug.monsters[0].y)`);
out.K1_fight = await ev(`(function(){
  var b=Array.prototype.slice.call(document.querySelectorAll('#ctxMenu button')).find(function(x){return x.textContent==='迎战';});
  if(!b)return 'NO_ITEM'; b.click(); return 'clicked';
})()`);
await sleep(4200);
out.K1_afterFight = await ev(`JSON.stringify({href:location.href,name:document.getElementById('eName').textContent,title:document.getElementById('battleTitle').textContent})`);

/* ---------- K2 右键散修 → 拔刀相向 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3600);
/* 散修会在地图上走动，可能正好和某只妖兽重叠；先把两人分开，测的才是「右键散修」这条路 */
out.K2_wandererMenu = await ev(`(function(){
  var w=window.__mapDebug.wanderer(),ms=window.__mapDebug.monsters;
  var spot=[{x:120,y:520},{x:880,y:520},{x:520,y:520}].find(function(p){
    return ms.every(function(m){return Math.hypot(m.x-p.x,m.y-p.y)>60;});
  })||{x:120,y:520};
  w.x=spot.x;w.y=spot.y;w.dest=null;
  ${RIGHT_CLICK}(w.x, w.y);
})()`);
out.K2_draw = await ev(`(function(){
  var b=Array.prototype.slice.call(document.querySelectorAll('#ctxMenu button')).find(function(x){return x.textContent==='拔刀相向';});
  if(!b)return 'NO_ITEM'; b.click(); return 'clicked';
})()`);
await sleep(4200);
out.K2_afterDraw = await ev(`JSON.stringify({href:location.href,
  name:(document.getElementById('eName')||{}).textContent||null,
  enemyArtHidden:(document.getElementById('enemyArt')||{}).style&&document.getElementById('enemyArt').style.display==='none'})`);

/* ---------- K3 右键地点 + 空地 ---------- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3600);
out.K3_locMenu = await ev(`(function(){
  var L=window.__mapDebug.LOCS[0];
  var c=document.querySelector('canvas'),r=c.getBoundingClientRect();
  var s=window.__mapDebug.worldToScreen(L.x,L.y);   /* 同上：必须减 cam */
  c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:s.x,clientY:s.y}));
  var m=document.getElementById('ctxMenu');
  return JSON.stringify({title:(m.querySelector('.ttl')||{}).textContent,items:Array.prototype.map.call(m.querySelectorAll('button'),function(b){return b.textContent;})});
})()`);
out.K3_groundMenu = await ev(`${RIGHT_CLICK}(60, 520)`);

/* ---------- L 场景层：右键人物 → 拔刀相向 → 战斗页 ---------- */
await send('Page.navigate', { url: BASE + '/scene?theme=wuxia' });
await sleep(4200);
out.L_menu = await ev(`(function(){
  var btn=document.querySelector('[data-actor="host"]');
  if(!btn)return 'NO_ACTOR_BTN';
  btn.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:600,clientY:400}));
  var m=document.getElementById('sd-context-menu');
  return JSON.stringify({hidden:m.hidden,title:(m.querySelector('strong')||{}).textContent,
    items:Array.prototype.map.call(m.querySelectorAll('button'),function(b){return b.textContent+(b.disabled?'(禁用)':'');})});
})()`);
out.L_draw = await ev(`(function(){
  var b=Array.prototype.slice.call(document.querySelectorAll('#sd-context-menu button')).find(function(x){return x.textContent==='拔刀相向';});
  if(!b)return 'NO_ITEM'; b.click(); return 'clicked';
})()`);
await sleep(4200);
out.L_afterDraw = await ev(`JSON.stringify({href:location.href,name:document.getElementById('eName').textContent,errors:window.__errors})`);

/* ---------- M 打赢回场景：对方要倒在地上 ---------- */
out.M_kill = await ev(`(function(){
  var b=window.__battleDebug; if(!b)return 'NO_BATTLE';
  b.battle.e.hp=1; b.battle.p.hp=b.battle.p.maxHP;
  document.getElementById('aRegular').click(); return 'attack_issued';
})()`);
await sleep(3200);
out.M_result = await ev(`document.getElementById('result').innerText.slice(0,80)`);
out.M_flags = await ev(`JSON.stringify({flags:JSON.parse(localStorage.getItem('world_state_v1')).locFlags,journal:(JSON.parse(localStorage.getItem('world_state_v1')).journal||[]).slice(-1)})`);
await send('Page.navigate', { url: BASE + '/scene?theme=wuxia' });
await sleep(4300);
out.M_back = await ev(`JSON.stringify({
  feedback:document.getElementById('sd-feedback').textContent.slice(0,60),
  hostAction:(window.__worldDebug.stage().actors().find(function(a){return a.id==='host';})||{}).action,
  selected:document.getElementById('sd-selected').textContent
})`);
out.M_menuAfterDown = await ev(`(function(){
  var btn=document.querySelector('[data-actor="host"]');
  btn.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:600,clientY:400}));
  var m=document.getElementById('sd-context-menu');
  return JSON.stringify(Array.prototype.map.call(m.querySelectorAll('button'),function(b){return b.textContent+(b.disabled?'(禁用)':'');}));
})()`);
out.M_inspect = await ev(`(function(){
  var b=Array.prototype.slice.call(document.querySelectorAll('#sd-context-menu button')).find(function(x){return x.textContent==='查看';});
  b.click();return document.getElementById('sd-feedback').textContent.slice(0,60);
})()`);

/* ---------- N 文本 RP 呈现：按说话人分行 ---------- */
await send('Page.navigate', { url: BASE + '/scene?theme=wuxia' });
await sleep(4300);
out.N_send = await ev(`(function(){
  document.getElementById('sd-chat-toggle').click();
  var t=document.getElementById('sd-dialogue-input');
  t.value='我走到掌柜面前问路';
  document.getElementById('sd-dialogue-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  return 'sent';
})()`);
await sleep(1200);
out.N_rows = await ev(`JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#sd-dialogue-log .sd-message'),function(m){
  return {cls:m.className, who:(m.querySelector('.sd-who')||{}).textContent, line:((m.querySelector('.sd-line')||{}).textContent||'').slice(0,28), mood:(m.querySelector('.sd-mood')||{}).textContent||null};
}))`);
out.N_sysRow = await ev(`JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#sd-dialogue-log .sd-message.is-sys'),function(m){return m.querySelector('.sd-line').textContent.slice(0,30);}))`);
out.N_noPrefix = await ev(`Array.prototype.every.call(document.querySelectorAll('#sd-dialogue-log .sd-line'),function(l){return l.textContent.indexOf('：')!==0;})`);

out.errors = await ev(`JSON.stringify(window.__errors)`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-ctx.png', Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

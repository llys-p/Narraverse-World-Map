#!/usr/bin/env node
/* inv-e2e.mjs — 背包/装备/个人面板验证 + 战斗属性聚合 + kit 图标渲染 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9990 + Math.floor(Math.random() * 100);
const profileDir = mkdtempSync(join(tmpdir(), 'edge-inv-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--window-size=1500,1050', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
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
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __exception: (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 200) }; return r.result?.value; };
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors=[];window.onerror=function(m){window.__errors.push(String(m));};` });

/* 1. 个人面板空背包 */
await send('Page.navigate', { url: 'http://127.0.0.1:18212/character' });
await sleep(3500);
out.emptyBag = await ev(`JSON.stringify({empty:document.getElementById('bagEmpty').style.display!=='none',kitLoaded:!!window.SandboxDrawingKit,cells:document.querySelectorAll('#bag .cell').length})`);
/* 2. 种入物品并刷新（load 一次、改完一次存回） */
await ev(`(function(){const p=WorldRPG.load();WorldInv.ensure(p);WorldInv.add(p,'sword');WorldInv.add(p,'potion',2);WorldInv.add(p,'yuandun');WorldRPG.save(p);})()`);
await send('Page.navigate', { url: 'http://127.0.0.1:18212/character' });
await sleep(3000);
out.bag = await ev(`JSON.stringify({cells:document.querySelectorAll('#bag .cell').length,names:[...document.querySelectorAll('#bag .nm')].map(n=>n.textContent)})`);
/* 3. 装备铁剑 → 属性聚合 + 持久 */
out.equip = await ev(`(function(){
  const cells=[...document.querySelectorAll('#bag .cell')];
  const swordCell=cells.find(c=>c.querySelector('.nm').textContent==='铁剑');
  [...swordCell.querySelectorAll('button')].find(b=>b.textContent==='装备').click();
  const p=JSON.parse(localStorage.getItem('world_rpg_profile_v1'));
  const t=WorldInv.totals(p);
  return new Promise(res=>setTimeout(()=>res(JSON.stringify({gearWeapon:p.gear.weapon,atkBase:t.atk-2,atkFinal:t.atk,statRows:document.getElementById('statTable').innerText.replace(/\\n/g,'|')})),200));
})()`);
/* 4. 穿装后战斗属性聚合验证（battle 页 pName/meta） */
await send('Page.navigate', { url: 'http://127.0.0.1:18212/battle?kind=wolf' });
await sleep(4000);
out.battleStats = await ev(`JSON.stringify({pMeta:document.getElementById('pMeta').textContent,title:document.getElementById('battleTitle').textContent})`);
/* 5. 使用疗伤药回血（扣血后使用） */
await send('Page.navigate', { url: 'http://127.0.0.1:18212/character' });
await sleep(3000);
out.usePotion = await ev(`(function(){
  const p=WorldRPG.load();p.hp=Math.max(1,p.hp-8);WorldRPG.save(p);
  return JSON.stringify({hpBefore:p.hp,max:p.maxHP,bag:JSON.parse(localStorage.getItem('world_rpg_profile_v1')).bag});
})()`);
await send('Page.navigate', { url: 'http://127.0.0.1:18212/character' });
await sleep(2500);
out.usePotionResult = await ev(`(function(){
  const cells=[...document.querySelectorAll('#bag .cell')];
  const pc=cells.find(c=>c.querySelector('.nm').textContent==='疗伤药');
  if(!pc)return {fail:'no potion cell'};
  const hpBefore=document.getElementById('cHpText').textContent;
  [...pc.querySelectorAll('button')].find(b=>b.textContent==='使用').click();
  const p=JSON.parse(localStorage.getItem('world_rpg_profile_v1'));
  return {hpBefore,hpAfter:p.hp,potionLeft:(p.bag.find(s=>s.id==='potion')||{}).count};
})()`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-character.png', Buffer.from(shot.data, 'base64'));
out.errors = await ev(`JSON.stringify(window.__errors)`);
console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

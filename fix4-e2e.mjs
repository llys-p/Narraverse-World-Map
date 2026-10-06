#!/usr/bin/env node
/* fix4-e2e.mjs — 右键菜单坐标修复验证（v3：分步同步调用，本地预编译表达式）
   A) 右键妖兽 → 菜单标题 = 该妖兽名
   B) 右键空地 → 菜单标题 = 区域/荒野名
   C) 点打量 → 气泡出现在点击处附近 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SRV_PORT = 18213;
const serverProc = spawn(process.execPath, ['server.cjs'], {
  cwd: 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006',
  env: Object.assign({}, process.env, { WORLD_PORT: String(SRV_PORT) }), stdio: 'ignore',
});
const BASE = 'http://127.0.0.1:' + SRV_PORT;
const PORT = 9910 + Math.floor(Math.random() * 60);
const pd = mkdtempSync(join(tmpdir(), 'edge-fix4-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${pd}`,
  '--window-size=1500,1050', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`,{signal:AbortSignal.timeout(1500)})).json();
    const page = list.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); }
  } catch {}
  if (!ws) await sleep(500);
}
if (!ws) { console.error('CDP connect failed'); serverProc.kill(); child.kill(); process.exit(1); }
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => {
  try { new Function(ex); } catch (e) { return { __localSyntax: e.message }; }
  const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __exception: (r.exceptionDetails.exception?.description || '').slice(0, 200) };
  return r.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors=[];window.onerror=function(m){window.__errors.push(String(m));};` });
console.log('[t] cdp connected, navigating');
await send('Page.navigate', { url: BASE + '/' });
await sleep(4500);
const out = {};
const WATCH=setTimeout(()=>{console.log('WATCHDOG: timeout — server alive?');try{console.log('lastOut:',JSON.stringify(out))}catch(e){};serverProc.kill();child.kill();process.exit(2);},75000);
console.log('[t] spawned server+edge');
const state = { lastClick: null }; /* 测试侧记录点击的屏幕坐标，供气泡位置断言 */

/* A) 右键妖兽 */
out.monMenu = await ev(`(function(){
  const d=window.__mapDebug,m=d.monsters[0];
  const s=d.worldToScreen(m.x,m.y);
  const c=document.getElementById('map');
  c.dispatchEvent(new MouseEvent('contextmenu',{clientX:s.x,clientY:s.y,bubbles:true,cancelable:true}));
  const menu=document.getElementById('ctxMenu');
  return new Promise(res=>setTimeout(()=>res(JSON.stringify({
    monster:m.name+' Lv'+m.level,
    menuVisible:menu.style.display==='block',
    menuTitle:(menu.querySelector('.ttl')||{}).textContent||'',
    firstItem:(menu.querySelector('button')||{}).textContent||''
  })),200));
})()`);

/* B) 右键空地（世界 200,120） */
out.groundMenu = await ev(`(function(){
  const d=window.__mapDebug;
  const s=d.worldToScreen(200,120);
  window.__lastClick=s;
  const c=document.getElementById('map');
  c.dispatchEvent(new MouseEvent('contextmenu',{clientX:s.x,clientY:s.y,bubbles:true,cancelable:true}));
  const menu=document.getElementById('ctxMenu');
  return new Promise(res=>setTimeout(()=>res(JSON.stringify({
    menuVisible:menu.style.display==='block',
    title:(menu.querySelector('.ttl')||{}).textContent||'',
    items:[...menu.querySelectorAll('button')].map(b=>b.textContent)
  })),200));
})()`);

/* C) 点该菜单里的「打量」→ 气泡出现在点击处附近 */
out.bubble = await ev(`(function(){
  const menu=document.getElementById('ctxMenu');
  const look=[...menu.querySelectorAll('button')].find(b=>b.textContent==='打量');
  if(!look)return JSON.stringify({fail:'no 打量 in menu'});
  look.click();
  return new Promise(res=>setTimeout(()=>{
    const bub=document.getElementById('mapBubble');
    const br=bub.getBoundingClientRect();
    const s=window.__lastClick||{x:0,y:0};
    res(JSON.stringify({visible:bub.style.display==='block',
      bubbleNearClick:Math.abs(br.left-s.x)<320&&Math.abs(br.top-s.y)<320,
      brx:Math.round(br.left),bry:Math.round(br.top),clickX:Math.round(s.x),clickY:Math.round(s.y)}));
  },150));
})()`);
out.errors = await ev(`JSON.stringify(window.__errors||[])`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-ctxmenu.png', Buffer.from(shot.data, 'base64'));
clearTimeout(WATCH);
console.log(JSON.stringify(out, null, 1));
serverProc.kill(); child.kill(); process.exit(0);

#!/usr/bin/env node
/* fix3-e2e.mjs — 三个修复的验证：
   A) 场景攻击 → 倒地不再被躯干顶掉（knockdown 持续）
   B) 战斗页怪物踩地+朝向玩家+飘字可见（截图） */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
/* 自带服务：避免跨工具调用的后台进程被回收 */
const SRV_PORT = 18213;
const serverProc = spawn(process.execPath, [join(process.argv[1], '..', 'server.cjs')], {
  cwd: 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006',
  env: Object.assign({}, process.env, { WORLD_PORT: String(SRV_PORT) }), stdio: 'ignore',
});
const BASE = 'http://127.0.0.1:' + SRV_PORT;
const PORT = 9860 + Math.floor(Math.random() * 100);
const profileDir = mkdtempSync(join(tmpdir(), 'edge-fix3-'));
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
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __exception: (r.exceptionDetails.exception?.description || '').slice(0, 200) }; return r.result?.value; };
const out = {};
await send('Page.enable');

/* A. 场景：攻击三次打到倒地，等 Laya 读数回来后 knockdown 仍应保持 */
await send('Page.navigate', { url: 'http://127.0.0.1:18213/scene?theme=wuxia' });
await sleep(5000);
out.sceneAttack = await ev(`(function(){
  const d=window.__worldDebug;
  const flowPeople=(function(){try{return JSON.parse(d.stage().length+0)||null}catch(e){return null}})();
  // 三连攻击把掌柜打到倒地（体力 3）
  d.execute({kind:'attack',id:'host'});
  return new Promise(res=>setTimeout(()=>{
    d.execute({kind:'attack',id:'host'});
    setTimeout(()=>{
      d.execute({kind:'attack',id:'host'});
      setTimeout(()=>{
        const a=d.stage().actors().find(x=>x.id==='host');
        res(JSON.stringify({actionAfter3s:a.action,hasCustom:!!a.customPose}));
      },3000);
    },400);
  },400));
})()`);
/* B. 战斗页：踩地/朝向/飘字 */
await send('Page.navigate', { url: 'http://127.0.0.1:18213/battle?kind=wolf' });
await sleep(3500);
await ev(`document.getElementById('aRegular').click()`);
await sleep(600); /* 剑气+飘字进行中 */
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-battle.png', Buffer.from(shot.data, 'base64'));
out.battle = await ev(`JSON.stringify({
  enemyCanvasCovers: (function(){const c=document.getElementById('enemyArt');return c.width===960&&c.height===300;})(),
  floats: document.querySelectorAll('.dmg').length,
  logTail: document.getElementById('log').innerText.split('\\n').slice(-2)
})`);
out.errors = await ev(`JSON.stringify(window.__errors||[])`);
console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

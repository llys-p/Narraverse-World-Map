#!/usr/bin/env node
/* win-path.mjs — 胜利路径数值验证：种子 Lv8 档案 → 直进战斗 → 胜利 → xp/gold/可能升级入库 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9970 + Math.floor(Math.random() * 100);
const profileDir = mkdtempSync(join(tmpdir(), 'edge-win-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--window-size=1500,1000', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
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
const ev = async ex => (await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:18212/' });
await sleep(3000);
const seeded = await ev(`WorldRPG.save({level:8,xp:0,gold:10,hp:54,maxHP:54,atk:4,def:3,speed:18,kills:0,losses:0,realms:'筑基期'});JSON.parse(localStorage.getItem('world_rpg_profile_v1')).level`);
await send('Page.navigate', { url: 'http://127.0.0.1:18212/battle?kind=wolf' });
await sleep(4000);
const title = await ev(`document.getElementById('battleTitle').textContent`);
for (let i = 0; i < 50; i++) {
  const done = await ev(`document.getElementById('result').className !== 'result'`);
  if (done) break;
  await ev(`!document.getElementById('aRegular').disabled && document.getElementById('aRegular').click()`);
  await sleep(700);
}
await sleep(2000);
const result = await ev(`JSON.stringify({cls:document.getElementById('result').className,text:document.getElementById('result').innerText.slice(0,160)})`);
const saved = await ev(`JSON.stringify(JSON.parse(localStorage.getItem('world_rpg_profile_v1')))`);
console.log(JSON.stringify({ seeded, title, result, saved }, null, 1));
child.kill(); process.exit(0);

#!/usr/bin/env node
/* battle-shot.mjs — 战斗页截图：node battle-shot.mjs [kind] [out.png] */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const KIND = process.argv[2] || 'wolf';
const LV = process.argv[4] || '';
const OUT = process.argv[3] || ('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-battle.png');
const PORT = 9930 + Math.floor(Math.random() * 100);
const profileDir = mkdtempSync(join(tmpdir(), 'edge-bshot-'));
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
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.description || a.value).join(' ').slice(0, 200));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => (await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true })).result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:18212/battle?kind=${KIND}&lv=${LV}` });
await sleep(3500);
await ev(`document.getElementById('aRegular').click()`);
await sleep(450); /* 剑气特效与飘字进行中 */
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
const title = await ev(`document.getElementById('battleTitle').textContent`);
console.log('saved:', title, '| console errors:', errs.length ? errs : 0);
child.kill(); process.exit(0);

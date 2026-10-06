#!/usr/bin/env node
/* wolf-diag.mjs — 查狼为什么没画出来 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9880 + Math.floor(Math.random() * 50);
const pd = mkdtempSync(join(tmpdir(), 'edge-wdiag-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${pd}`,
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
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true }); if (r.exceptionDetails) return { exc: (r.exceptionDetails.exception?.description || '').slice(0, 250) }; return r.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors=[];window.onerror=function(m){window.__errors.push(String(m));};` });
await send('Page.navigate', { url: 'http://127.0.0.1:18212/battle?kind=wolf&lv=2' });
await sleep(4000);
const diag = await ev(`JSON.stringify({
  wb: typeof window.WorldBeasts,
  errors: window.__errors,
  canvas: (function(){const c=document.getElementById('enemyArt');
    if(!c)return null;
    const ctx=c.getContext('2d');
    const d=ctx.getImageData(0,0,c.width,c.height).data;
    let painted=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)painted++;
    return {w:c.width,h:c.height,display:c.style.display,paintedPixels:painted,rect:JSON.stringify(c.getBoundingClientRect())};})(),
  actors: (window.__battleDebug?window.__battleDebug.battle.p.name+' vs '+window.__battleDebug.battle.e.name:'?')
})`);
console.log('wolf diag:', diag);
child.kill(); process.exit(0);

#!/usr/bin/env node
/* map-diag.mjs — 诊断大地图渲染：变换矩阵/画布尺寸/小地图元素/save-restore 平衡 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9890 + Math.floor(Math.random() * 50);
const pd = mkdtempSync(join(tmpdir(), 'edge-mdiag-'));
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
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__err=[];window.onerror=function(m){window.__err.push(String(m));};
  window.__saveN=0;window.__restoreN=0;
  const _origCtx=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(t){const c=_origCtx.call(this,t);
    if(t==='2d'&&!c.__patched){c.__patched=true;const _s=c.save.bind(c),_r=c.restore.bind(c);
      c.save=function(){__saveN++;return _s();};c.restore=function(){__restoreN++;return _r();};}
    return c;};` });
await send('Page.navigate', { url: 'http://127.0.0.1:18212/' });
await sleep(4500);
const diag = await ev(`JSON.stringify({
  err: window.__err,
  canvas: (function(){const c=document.getElementById('map');return {w:c.width,h:c.height,dispW:Math.round(c.getBoundingClientRect().width)};})(),
  mainTransform: (function(){const c=document.getElementById('map');const m=c.getContext('2d').getTransform();return [m.a,m.b,m.c,m.d,m.e,m.f].map(v=>+v.toFixed(2));})(),
  minimap: (function(){const m=document.getElementById('minimap');if(!m)return null;const x=m.getContext('2d');const t=x.getTransform();return {w:m.width,h:m.height,tf:[t.a,t.b,t.c,t.d,t.e,t.f].map(v=>+v.toFixed(2))};})(),
  saveRestore: {save:window.__saveN,restore:window.__restoreN},


  zones: WorldRPG.ZONES.map(z=>z.id+':'+z.cx+','+z.cy+',r'+z.r).join(' '),
  player: window.__mapDebug?JSON.stringify(window.__mapDebug.player):'no-debug',
})`);
console.log('map diag:', diag);
child.kill(); process.exit(0);

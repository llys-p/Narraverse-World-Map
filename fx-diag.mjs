#!/usr/bin/env node
/* fx-diag.mjs — 查 jianqi 特效组件注册与渲染状态 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9810 + Math.floor(Math.random() * 50);
const pd = mkdtempSync(join(tmpdir(), 'edge-fx-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${pd}`,
  '--window-size=1200,800', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
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
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true }); if (r.exceptionDetails) return { exc: (r.exceptionDetails.exception?.description || '').slice(0, 200) }; return r.result?.value; };
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:18212/battle?kind=wolf' });
await sleep(3500);
const diag = await ev(`JSON.stringify({
  kitLoaded: !!window.SandboxDrawingKit,
  regCount: window.SandboxDrawingKit ? Object.keys(SandboxDrawingKit._registry).length : 0,
  hasJianqi: window.SandboxDrawingKit ? SandboxDrawingKit.has('jianqi') : null,
  entry: (function(){ if(!window.SandboxDrawingKit) return null; const e=SandboxDrawingKit.get('jianqi'); return e?{hasDraw:typeof e.draw,actions:e.actions,category:e.category,label:e.label}:null; })(),
  drawResult: (function(){
    if(!window.SandboxDrawingKit) return null;
    try{
      const cv=document.createElement('canvas');cv.width=120;cv.height=120;
      const ctx=cv.getContext('2d');
      const r=SandboxDrawingKit.drawEntity(ctx,{id:'jianqi',kind:'effect',archetype:'jianqi'},{x:5,y:5,width:110,height:110,phase:0.3});
      return {supported:r.supported,bounds:r.bounds,diagnostics:r.diagnostics||null};
    }catch(e){return {threw:String(e)};}
  })()
})`);
console.log('fx diag:', diag);
child.kill(); process.exit(0);

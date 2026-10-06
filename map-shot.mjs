#!/usr/bin/env node
/* map-shot.mjs — 地图页截图（复用 world-e2e 的连接方案，带 3 次重试） */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const PORT = 9650 + Math.floor(Math.random() * 200);
    const profile = mkdtempSync(join(tmpdir(), 'edge-map-'));
    const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
      '--window-size=1500,1000', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
    let ws = null;
    for (let i = 0; i < 40 && !ws; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const page = list.find(t => t.type === 'page');
        if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); }
      } catch {}
      if (!ws) await new Promise(r => setTimeout(r, 500));
    }
    if (!ws) { child.kill(); continue; }
    let id = 0; const pend = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:18212/' });
    await new Promise(r => setTimeout(r, 9000));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-map.png', Buffer.from(shot.data, 'base64'));
    console.log('saved, attempt', attempt + 1);
    child.kill(); process.exit(0);
  } catch (e) { console.error('attempt failed:', e.message); }
}
process.exit(1);

#!/usr/bin/env node
/* 只读验证：定位 battle.html / character.html 的若干可疑缺陷（不修改业务源码） */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9800 + Math.floor(Math.random() * 300);
const BASE = 'http://127.0.0.1:18302';
const profileDir = mkdtempSync(join(tmpdir(), 'edge-verify-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
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
  if (r.exceptionDetails) return { __exception: (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 300) };
  return r.result?.value;
};
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errors=[];window.addEventListener('error',e=>window.__errors.push(String(e.message)));` +
          `window.addEventListener('unhandledrejection',e=>window.__errors.push('REJECT:'+String(e.reason)));`,
});

/* --- A. 遁走按钮（battle.html:167 用到未定义的 clamp） --- */
await send('Page.navigate', { url: BASE + '/battle?kind=wolf' });
await sleep(4000);
out.A_title = await ev(`document.getElementById('battleTitle').textContent`);
out.A_before = await ev(`JSON.stringify({errors:window.__errors,hp:document.getElementById('pHpText').textContent})`);
await ev(`document.getElementById('aFlee').click()`);
await sleep(3000);
out.A_afterFlee = await ev(`JSON.stringify({errors:window.__errors,result:document.getElementById('result').className,text:document.getElementById('result').innerText.slice(0,80),btnEnabled:!document.getElementById('aRegular').disabled})`);

/* --- B. 装备 hp 加成在战斗是否生效（面板 vs 战斗 maxHP） --- */
await ev(`(function(){const p=WorldRPG.load();WorldInv.ensure(p);p.level=6;p.maxHP=WorldRPG.statsFor(6,true).maxHP;p.hp=p.maxHP;p.gear.armor='gangkui';p.bag=[];WorldRPG.save(p);return 1;})()`);
await send('Page.navigate', { url: BASE + '/character' });
await sleep(3500);
out.B_panel = await ev(`document.getElementById('cHpText').textContent + ' | ' + document.getElementById('statTable').innerText.replace(/\\n/g,' ')`);
await send('Page.navigate', { url: BASE + '/battle?kind=golem' });
await sleep(4000);
out.B_battle = await ev(`document.getElementById('battleTitle').textContent + ' | ' + document.getElementById('pHpText').textContent`);

/* --- C. 地图怪物等级 vs 战斗实际等级（地图写死 Lv1/Lv2） --- */
await send('Page.navigate', { url: BASE + '/' });
await sleep(4000);
out.C_mapMonsters = await ev(`JSON.stringify(window.__mapDebug.monsters.map(m=>({name:m.name,lv:m.level})))`);
out.C_profileLevel = await ev(`window.__mapDebug.profile().level`);

/* --- D. 战斗先手：turnOrder 是否参与（日志宣称速度定先手） --- */
await send('Page.navigate', { url: BASE + '/battle?kind=bandit' });
await sleep(3500);
out.D_meta = await ev(`document.getElementById('pMeta').textContent + ' || ' + document.getElementById('eMeta').textContent`);
out.D_logFirst2 = await ev(`document.getElementById('log').innerText.split('\\n').slice(0,2).join(' / ')`);
out.D_errors = await ev(`JSON.stringify(window.__errors)`);

console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

#!/usr/bin/env node
/* world-e2e.mjs — 端到端：地图 → 旅行 → 进入场景 → 对话 → Laya 读数 → 躯干姿态变化 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9450 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'edge-world-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
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
let id = 0; const pend = new Map(); const shots = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') shots.push('console: ' + m.params.args.map(a => a.description || a.value).join(' ').slice(0, 300));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __exception: (r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails)).slice(0, 300) }; return r.result?.value; };
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors=[];window.onerror=function(m){window.__errors.push(String(m));};` });

/* 1. 地图页 */
await send('Page.navigate', { url: 'http://127.0.0.1:18212/' });
await sleep(4000);
out.map = await ev(`JSON.stringify({bridge:document.getElementById('bridgeText').textContent,loc:document.getElementById('locText').textContent,clock:document.getElementById('clock').textContent})`);
/* 2. 点客栈节点（按 canvas rect 换算真实坐标）→ 旅行 → 等进入按钮 */
const clickCanvas = async (px, py) => ev(`(function(){
  const c=document.getElementById('map'),r=c.getBoundingClientRect();
  const cx=r.left+(${px}/c.width)*r.width, cy=r.top+(${py}/c.height)*r.height;
  c.dispatchEvent(new MouseEvent('click',{clientX:cx,clientY:cy,bubbles:true,cancelable:true}));
  return JSON.stringify({cx:Math.round(cx),cy:Math.round(cy)});
})()`);
out.mapClick = await clickCanvas(250, 330);
let entered = false;
for (let i = 0; i < 24; i++) {
  await sleep(500);
  if (await ev(`document.getElementById('enter').style.display!=='none'`)) { entered = true; break; }
}
out.mapAfterTravel = await ev(`JSON.stringify({loc:document.getElementById('locText').textContent,clock:document.getElementById('clock').textContent,enterVisible:document.getElementById('enter').style.display!=='none',enterText:document.getElementById('enter').textContent,playerPos:window.__p||null})`);
out.mapAfterTravelEntered = entered;
out.bridge = await ev(`fetch('/healthz').then(r=>r.json()).then(j=>JSON.stringify(j))`);
/* 3. 进入场景 */
await ev(`document.getElementById('enter').click()`);
await sleep(6000);
out.scene = await ev(`JSON.stringify({url:location.pathname+location.search,title:document.getElementById('sd-title').textContent,ai:document.getElementById('web-use-ai').checked,actors:(window.__worldDebug&&window.__worldDebug.current().actors.map(a=>a.id+'/'+a.name).join(','))})`);
/* 4. 本地路径对话（关 AI，确定性）：点掌柜名字 → 走近 → 文字提交 → execute({kind:talk}) → layaDecide(英文直传) */
await ev(`[...document.querySelectorAll('#sd-names button')].find(b=>b.textContent==='掌柜').click()`);
await sleep(1600);
const poseBefore = await ev(`JSON.stringify((window.__worldDebug.stage().actors().find(a=>a.id==='host')||{}).customPose)`);
await ev(`document.getElementById('web-use-ai').checked=false;document.getElementById('sd-dialogue-input').value='掌柜，听说山道上最近不太平？';document.getElementById('sd-dialogue-form').dispatchEvent(new Event('submit',{cancelable:true}))`);
await sleep(6500); // decide ~0.4-2s + 补间
out.torsoAfterLocal = await ev(`JSON.stringify((a=>({hasCustom:!!(a&&a.customPose),lean:a&&a.customPose&&+a.customPose.lean.toFixed(3),bend:a&&a.customPose&&+a.customPose.bend.toFixed(3),head:a&&a.customPose&&+a.customPose.head.toFixed(3),action:a&&a.action}))(window.__worldDebug.stage().actors().find(a=>a.id==='host')))`);
out.poseBefore = poseBefore;
/* 5. AI 路径一次（真实 DeepSeek）：开 AI → 文字对话 → modelTurn → commit talk → layaDecide(中文→桥内翻译) */
await ev(`document.getElementById('web-use-ai').checked=true;document.getElementById('sd-dialogue-input').value='掌柜，来一碗热酒，再讲讲城里的消息。';document.getElementById('sd-dialogue-form').dispatchEvent(new Event('submit',{cancelable:true}))`);
await sleep(22000); // LLM 叙事 + 桥内翻译 + decide
out.torsoAfterAI = await ev(`JSON.stringify((a=>({hasCustom:!!(a&&a.customPose),lean:a&&a.customPose&&+a.customPose.lean.toFixed(3),hostilityInLaya:(window.__worldDebug.laya().get('host')||{}).signals&&window.__worldDebug.laya().get('host').signals.hostility}))(window.__worldDebug.stage().actors().find(a=>a.id==='host')))`);
out.errors = await ev(`JSON.stringify(window.__errors)`);
/* 截图 */
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-scene.png', Buffer.from(shot.data, 'base64'));
out.consoleErrs = shots.slice(0, 3);
console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

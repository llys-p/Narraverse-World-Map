#!/usr/bin/env node
/* rpg-e2e.mjs — 成长+战斗端到端：地图面板 → 遭遇妖兽 → 迎战 → 回合攻击至结束 → 结算入库 → 回图持久 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9950 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'edge-rpg-'));
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
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __exception: (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 200) }; return r.result?.value; };
const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors=[];window.onerror=function(m){window.__errors.push(String(m));};` });

/* 1. 地图：成长面板 */
await send('Page.navigate', { url: 'http://127.0.0.1:18212/' });
await sleep(5000);
out.panel = await ev(`JSON.stringify({level:document.getElementById('rpgLevel').textContent,realm:document.getElementById('rpgRealm').textContent,hp:document.getElementById('rpgHpText').textContent,xp:document.getElementById('rpgXp').textContent})`);
/* 2. 传送玩家到妖兽身上触发遭遇 */
out.encounter = await ev(`(function(){
  const d=window.__mapDebug,p=d.player,m=d.monsters[0];
  p.dest=null;p.x=m.x;p.y=m.y;
  return new Promise(res=>setTimeout(()=>res(JSON.stringify({visible:document.getElementById('encounter').style.display==='block',enc:document.getElementById('encName').textContent})),300));
})()`);
/* 3. 迎战 → 战斗页 */
await ev(`document.getElementById('encFight').click()`);
await sleep(5000);
out.battle = await ev(`JSON.stringify({url:location.pathname+location.search,title:document.getElementById('battleTitle').textContent,actors:DemoStickman.listActions().length+' actions loaded',pName:document.getElementById('pName').textContent})`);
/* 4. 回合攻击至战斗结束（最多 45 次尝试；敌方自动） */
let resultText = '';
for (let i = 0; i < 45; i++) {
  const done = await ev(`document.getElementById('result').className !== 'result'`);
  if (done) break;
  await ev(`!document.getElementById('aRegular').disabled && document.getElementById('aRegular').click()`);
  await sleep(750);
}
await sleep(2500);
resultText = await ev(`JSON.stringify({kind:document.getElementById('result').className,text:document.getElementById('result').innerText.slice(0,140),log:document.getElementById('log').innerText.split('\\n').slice(-3)})`);
out.result = resultText;
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-battle.png', Buffer.from(shot1.data, 'base64'));
/* 5. 存档断言 + 回图 */
out.saved = await ev(`JSON.stringify(JSON.parse(localStorage.getItem('world_rpg_profile_v1')||'{}').kills!=null?{kills:JSON.parse(localStorage.getItem('world_rpg_profile_v1')).kills,losses:JSON.parse(localStorage.getItem('world_rpg_profile_v1')).losses,xp:JSON.parse(localStorage.getItem('world_rpg_profile_v1')).xp,gold:JSON.parse(localStorage.getItem('world_rpg_profile_v1')).gold}:null)`);
await ev(`[...document.querySelectorAll('#result button')].find(b=>b.textContent.includes('回到世界地图')).click()`);
await sleep(4000);
out.mapAfter = await ev(`JSON.stringify({panel:document.getElementById('rpgLevel').textContent+' '+document.getElementById('rpgRealm').textContent+' '+document.getElementById('rpgHpText').textContent+' '+document.getElementById('rpgXp').textContent,gold:document.getElementById('rpgGold').textContent})`);
out.errors = await ev(`JSON.stringify(window.__errors)`);
console.log(JSON.stringify(out, null, 1));
child.kill(); process.exit(0);

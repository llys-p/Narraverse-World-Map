#!/usr/bin/env node
/* fallback-e2e.mjs —— 验证「world-skill.js / world-combat-fx.js 取不到时，战斗必须照常打得动」。
 *
 * 由来：2026-10-06 晚用户实机报
 *   战局没有找到技能：zhanji / 战局没有找到技能：fangyu / 战局出现异常…Cannot read properties of null (reading 'speedOf')
 * 根因是正在跑的服务进程用的还是登记名单之前的 server.cjs，两个新模块 404，
 * 而 battle.html 把可选依赖当硬依赖用，连普攻都被挡住。
 *
 * 本用例用 CDP 的 Fetch.failRequest 主动把这两个请求掐掉，复现「模块缺失」的真实环境。
 * 用法：先起服务（WORLD_PORT=18302 node server.cjs），再 node fallback-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9450 + Math.floor(Math.random() * 150);
const BASE = 'http://127.0.0.1:18302';
const dir = mkdtempSync(join(tmpdir(), 'edge-fallback-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
  '--window-size=1300,900', '--no-first-run', '--disable-extensions', '--no-proxy-server', 'about:blank'], { stdio: 'ignore' });
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
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  /* 把技能模块与特效模块的请求全部掐死——模拟老进程缺静态路由的现场 */
  if (m.method === 'Fetch.requestPaused') {
    const url = m.params.request.url;
    if (url.indexOf('world-skill.js') >= 0 || url.indexOf('world-combat-fx.js') >= 0) {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.failRequest',
        params: { requestId: m.params.requestId, errorReason: 'Failed' } }));
    } else {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.continueRequest', params: { requestId: m.params.requestId } }));
    }
  }
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => {
  const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || '').slice(0, 240) };
  return r.result?.value;
};

const out = {};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errors=[];window.addEventListener('error',e=>window.__errors.push(String(e.message)));` +
          `window.addEventListener('unhandledrejection',e=>window.__errors.push('REJECT:'+String(e.reason)));`,
});
await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

/* 造一个 Lv6 的档，然后进战斗 */
/* 不能靠固定 sleep：Fetch 逐个拦截请求会把页面拉慢，3.6 秒时 __battleDebug 可能还没挂上，
 * 此时点按钮等于点空气（早先就是这样误报过一次）。改成轮询等就绪。 */
async function waitReady(timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await ev(`!!(window.__battleDebug && !document.getElementById('aRegular').disabled && window.__battleDebug.battle.e.hp > 0)`);
    if (ok === true) return true;
    await sleep(300);
  }
  return false;
}

await send('Page.navigate', { url: BASE + '/' });
await sleep(3000);
await ev(`(function(){localStorage.removeItem('world_rpg_profile_v1');
  const p=WorldRPG.load();WorldInv.ensure(p);p.level=6;
  const s=WorldRPG.statsFor(6,true);p.maxHP=s.maxHP;p.maxQi=s.maxQi;p.qi=s.maxQi;p.hp=s.maxHP;
  p.atk=s.atk;p.def=s.def;p.speed=s.speed;WorldRPG.save(p);return 1;})()`);

await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=4' });
await sleep(2600);
out.A_ready = await waitReady();

/* A 两个模块确实缺席，且页面没有因此炸掉 */
out.A_modules = await ev(`JSON.stringify({hasSkill:!!window.WorldSkill,hasFXC:!!window.WorldCombatFX,
  hasDebug:!!window.__battleDebug,fallback:!!(window.__battleDebug&&window.__battleDebug.skills&&0)})`);
out.A_loaded = await ev(`JSON.stringify({
  turnedUsable:!document.getElementById('aRegular').disabled,
  errors:window.__errors})`);

async function waitIdle(timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await ev(`!!(window.__battleDebug && !document.getElementById('aRegular').disabled)`);
    if (ok === true) return true;
    await sleep(250);
  }
  return false;
}

/* B 普攻必须能打出伤害 */
await waitIdle();
out.B_before = await ev(`window.__battleDebug.battle.e.hp`);
await ev(`(function(){document.getElementById('aRegular').click();return 1;})()`);
await sleep(1500); await waitIdle();
out.B_attack = await ev(`(function(){var b=window.__battleDebug.battle;
  return JSON.stringify({enemyHp:b.e.hp,log:document.getElementById('log').innerText.split('\\n').slice(-3).join(' | ')});})()`);

/* C 防御要回气血与真元 */
await ev(`(function(){document.getElementById('aGuard').click();return 1;})()`);
await sleep(1500); await waitIdle();
out.C_guard = await ev(`(function(){var b=window.__battleDebug.battle;
  return JSON.stringify({qi:b.p.qi,gained:b.p.qi>=5,log:document.getElementById('log').innerText.split('\\n').slice(-2).join(' | ')});})()`);

/* D 力斩（消耗真元的那一档）也要能走通 */
out.D_heavy = await ev(`(function(){try{window.__battleDebug.playerAct('lizhan');return 'issued';}catch(e){return 'THROW:'+e.message;}})()`);
await sleep(1500); await waitIdle();
out.D_after = await ev(`(function(){var b=window.__battleDebug.battle;
  return JSON.stringify({qi:b.p.qi,enemyHp:b.e.hp,
    log:document.getElementById('log').innerText.split('\\n').slice(-3).join(' | ')});})()`);

/* E 技能面板要说实话：告诉玩家现在是降级模式 */
out.E_panel = await ev(`(function(){document.getElementById('cmdSkill').click();
  var n=document.getElementById('fallbackNote');var box=document.getElementById('skillPanel');
  return JSON.stringify({note:!!n,noteText:n?n.textContent.slice(0,40):null,
    items:Array.prototype.map.call(box.querySelectorAll('[data-skill]'),function(b){return b.dataset.skill;}),
    hidden:box.hidden});})()`);

/* F 整局下来不许出现「没有找到技能」与「出现异常」 */
out.F_clean = await ev(`(function(){var t=document.getElementById('log').innerText;
  return JSON.stringify({noSkill:t.indexOf('没有找到技能')>=0,hadError:t.indexOf('出现异常')>=0,
    jsErrors:window.__errors});})()`);

console.log(JSON.stringify(out, null, 1));
/* 留一张降级模式的实拍：截图比断言直观 */
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Narraverse2.0/artifacts/world-map-prototype-20261006/e2e-fallback.png', Buffer.from(shot.data, 'base64'));
child.kill();
process.exit(0);

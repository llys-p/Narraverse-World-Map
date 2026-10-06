#!/usr/bin/env node
/* fx-shot.mjs —— 抓「剑气从左边飞到右边」的连拍，纯取证，不改源码。
 * 用法：先起服务（WORLD_PORT=18302 node server.cjs），再 node fx-shot.mjs
 * 产出：fx-shot-1..6.png（同一轮出手的连续帧，帧上带时间戳）
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9410 + Math.floor(Math.random() * 180);
const BASE = 'http://127.0.0.1:18302';
const OUT = 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006/';
const dir = mkdtempSync(join(tmpdir(), 'edge-fxshot-'));
const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
  '--window-size=1200,830', '--no-first-run', '--disable-extensions', '--no-proxy-server', 'about:blank'], { stdio: 'ignore' });
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
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || '').slice(0, 240) };
  return r.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');

/* 造 Lv12：剑气斩已习得，真元满 */
await send('Page.navigate', { url: BASE + '/' });
await sleep(3200);
console.log('seed', await ev(`(function(){
  localStorage.removeItem('world_rpg_profile_v1');
  const p=WorldRPG.load();WorldInv.ensure(p);p.level=12;
  const s=WorldRPG.statsFor(12,true);
  p.maxHP=s.maxHP;p.maxQi=s.maxQi;p.qi=s.maxQi;p.hp=s.maxHP;
  p.atk=s.atk;p.def=s.def;p.speed=s.speed;WorldRPG.save(p);
  return JSON.stringify({lv:p.level,qi:p.qi});
})()`));

await send('Page.navigate', { url: BASE + '/battle?kind=wolf&lv=6&name=%E7%81%B0%E7%8B%BC' });
await sleep(3800);

/* 点开技能面板 → 点「剑气斩」，随后尽快连拍 */
console.log('cast', await ev(`(function(){
  document.getElementById('cmdSkill').click();
  var b=document.querySelector('#skillPanel .skill[data-skill="jianqizhan"]');
  if(!b)return 'NO_SKILL';
  b.click();return 'clicked';
})()`));

const t0 = Date.now();
for (let i = 1; i <= 6; i++) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const ms = Date.now() - t0;
  writeFileSync(OUT + `fx-shot-${i}.png`, Buffer.from(shot.data, 'base64'));
  /* 同时记下这一刻剑气所在：取特效层非透明像素的重心与右边界 */
  const probe = await ev(`(function(){
    var c=document.getElementById('fx');if(!c)return null;
    var x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    var n=0,sx=0,maxx=0;
    for(var i=0;i<x.length;i+=4){if(x[i+3]>12){var px=(i/4)%c.width;n++;sx+=px;if(px>maxx)maxx=px;}}
    return JSON.stringify({lit:n,cx:n?+(sx/n/c.width).toFixed(3):null,tip:n?+(maxx/c.width).toFixed(3):null});
  })()`);
  console.log(`frame ${i} @${ms}ms`, probe);
  await sleep(70);
}
child.kill();
process.exit(0);

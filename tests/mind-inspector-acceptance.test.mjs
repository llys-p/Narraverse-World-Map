import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startRuntimeServer } from '../runtime-server.mjs';

// =============================================================================
// The HTTP acceptance path requires the real core and service. Browser interaction
// remains pending a browser driver.
// =============================================================================
const [fixture, state, planner, runtime, knowledge] = await Promise.all([
  import('../runtime/fixtures/mind-village.mjs'),
  import('../runtime/core/mind-state.mjs'),
  import('../runtime/core/mind-planner.mjs'),
  import('../runtime/core/mind-runtime.mjs'),
  import('../runtime/knowledge/mind-knowledge.mjs'),
]);
const M1 = { fixture, state, planner, runtime, knowledge };
const browserSkip = '浏览器消费链：需真实浏览器驱动（独立临时服务上执行）';

async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-mind-inspector-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}
async function jsonBytes(dir) {
  return Promise.all((await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort().map(async (f) => [f, await fs.readFile(path.join(dir, f), 'utf8')]));
}
const get = async (url) => {
  const r = await fetch(url);
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
};
const post = async (url, d) => {
  const r = await fetch(url + '/api/runtime/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const time = (commandId, expectedRevision, ticks) => ({ version: 1, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks } });

test('K6 检查器两人/真 revision：tick0 世界事实与空决定，推进24/120后刷新对应 revision，区分当前判断与当时依据', async (t) => {
  const dir = await temporary(t);
  const s = await startRuntimeServer({ directory: dir, port: 0, profile: 'mind-village', writable: true, inspectMind: true });
  t.after(() => s.close());
  const url = s.url + '/api/runtime/minds';
  const m0 = await get(url);
  assert.equal(m0.status, 200);
  assert.deepEqual(m0.body.actors.map((a) => a.knowledge.actorId).sort(), ['actor-2', 'actor-3']);
  assert.equal(m0.body.revision, 0);
  assert.deepEqual(m0.body.worldFacts, { publicHerbs: 20, postedHerbPrice: 50 });
  assert.equal(m0.body.actors.every((a) => a.lastDecision === null && a.lastOutcome === null), true, 'tick0 尚未到决策时点');
  assert.equal((await post(s.url, time('adv24', 0, 24))).status, 200);
  const m24 = await get(url);
  assert.equal(m24.body.revision, 24);
  assert.equal(m24.body.actors.find((a) => a.knowledge.actorId === 'actor-2').knowledge.belief.value, 'unavailable');
  assert.equal(m24.body.actors.find((a) => a.knowledge.actorId === 'actor-3').knowledge.belief.value, 'available');
  assert.equal((await post(s.url, time('adv144', 24, 120))).status, 200);
  const m144 = await get(url);
  assert.equal(m144.body.revision, 144);
  const a2 = m144.body.actors.find((a) => a.knowledge.actorId === 'actor-2');
  assert.equal(a2.knowledge.belief.value, 'available', '当前判断已被日末事实纠正');
  assert.equal(a2.lastDecision.choice, 'NoAction');
  assert.equal(a2.lastDecision.reasonCode, 'SUPPLY_UNAVAILABLE', '当时依据仍展示 unavailable，不被新判断改写');
  const a3 = m144.body.actors.find((a) => a.knowledge.actorId === 'actor-3');
  assert.equal(a3.lastDecision.choice, 'BuyMedicine');
  assert.equal(a3.lastOutcome.status, 'succeeded');
});

test('K6 读取零写：重复 GET/HEAD 不改变 revision/输入/文件字节，HEAD 无正文', async (t) => {
  const dir = await temporary(t);
  const s = await startRuntimeServer({ directory: dir, port: 0, profile: 'mind-village', writable: true, inspectMind: true });
  t.after(() => s.close());
  const url = s.url + '/api/runtime/minds';
  await fetch(s.url + '/api/runtime/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(time('adv24', 0, 24)) });
  const before = await jsonBytes(dir);
  const first = (await get(url)).body;
  assert.equal((await get(url)).body.revision, first.revision);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '', 'HEAD 无正文');
  assert.deepEqual(await jsonBytes(dir), before, '不被 GET/HEAD 写入');
});

test('K6 权限/拒绝链：inspectMind false→404、旧 profile→404、POST→405、查询串→400', async (t) => {
  const root = await temporary(t);
  const off = await startRuntimeServer({ directory: path.join(root, 'off'), port: 0, profile: 'mind-village', writable: true, inspectMind: false });
  t.after(() => off.close());
  assert.equal((await get(off.url + '/api/runtime/minds')).status, 404);
  assert.equal((await get(off.url + '/api/runtime/capabilities')).body.mindAvailable, false);
  const legacy = await startRuntimeServer({ directory: path.join(root, 'legacy'), port: 0, profile: 'player-play-village', writable: true, inspectMind: true });
  t.after(() => legacy.close());
  assert.equal((await get(legacy.url + '/api/runtime/minds')).status, 404, '旧 profile 无 M 能力');
  const on = await startRuntimeServer({ directory: path.join(root, 'on'), port: 0, profile: 'mind-village', writable: true, inspectMind: true });
  t.after(() => on.close());
  assert.equal((await get(on.url + '/api/runtime/capabilities')).body.mindAvailable, true);
  assert.equal((await fetch(on.url + '/api/runtime/minds', { method: 'POST' })).status, 405, 'POST 非读方法');
  assert.equal((await fetch(on.url + '/api/runtime/minds?x=1')).status, 400, '查询串存在即 400');
});

test('K6 不可伪造：POST 命令无法伪造 statement/market-check/MindDecision', async (t) => {
  const dir = await temporary(t);
  const s = await startRuntimeServer({ directory: dir, port: 0, profile: 'mind-village', writable: true, inspectMind: true });
  t.after(() => s.close());
  for (const d of [
    { version: 2, commandId: 'forge-decision', expectedRevision: 0, type: 'MindDecision', payload: { choice: 'BuyMedicine' } },
    { version: 2, commandId: 'forge-stim', expectedRevision: 0, type: 'PlayerRest', payload: { stimulusId: 's01', available: true } },
    { version: 1, commandId: 'forge-time', expectedRevision: 0, type: 'AdvanceTime', payload: { ticks: 1, stimuli: [] } },
  ]) assert.equal((await post(s.url, d)).status, 400, '无 H 入口可伪造心智事实');
});

test('K6 断连/读失败：关闭服务读取失败，重开保留旧 revision 不丢读数', async (t) => {
  const dir = await temporary(t);
  let s = await startRuntimeServer({ directory: dir, port: 0, profile: 'mind-village', writable: true, inspectMind: true });
  let url = s.url + '/api/runtime/minds';
  await post(s.url, time('adv24', 0, 24));
  const before = (await get(url)).body.revision;
  await s.close();
  await assert.rejects(fetch(url), '关闭后读取必须失败（断连语义）');
  s = await startRuntimeServer({ directory: dir, port: 0, writable: true, inspectMind: true });
  url = s.url + '/api/runtime/minds';
  t.after(() => s.close());
  assert.equal((await get(url)).body.revision, before, '重开保留旧 revision');
});

test('K6 检查器静态页与边界：/runtime-mind.html 及 js/css 同受开关约束', async (t) => {
  const root = await temporary(t);
  const on = await startRuntimeServer({ directory: path.join(root, 'on'), port: 0, profile: 'mind-village', writable: true, inspectMind: true });
  t.after(() => on.close());
  for (const route of ['/runtime-mind.html', '/runtime-mind.mjs', '/runtime-mind.css']) {
    const r = await fetch(on.url + route);
    assert.equal(r.status, 200, route);
    assert.ok((await r.text()).length > 0);
  }
  const off = await startRuntimeServer({ directory: path.join(root, 'off'), port: 0, profile: 'mind-village', writable: true, inspectMind: false });
  t.after(() => off.close());
  assert.equal((await fetch(off.url + '/runtime-mind.html')).status, 404);
});

test('K6 浏览器消费链（真实浏览器：人物切换/刷新/双页签/断连显示，需浏览器驱动）', { skip: browserSkip }, async () => {
  // Run against an independent temporary service with a real browser driver.
  // 页面 /runtime-mind.html：两人选择器、手动刷新、单次读数绑定单一 revision、断连显示读失败不显示成功。
  assert.fail('需真实浏览器驱动，本路不单独启动浏览器或服务进程（阻断级：接口存在≠核心消费通过）');
});

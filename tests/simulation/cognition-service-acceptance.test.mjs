// M3-4B G1：service6 真实服务独立验收（B 路）。
// 期望全部来自 m3-closeout-contract-v1 §G1 与 M3-4A 共同合同 §2/§3 的字面条款，通过真实 HTTP、
// 真实 owner/磁盘字节与完整 journal 重演核对；不引用 A 路自测的断言，也不共用其目录。
// 只使用已核实的收据/信封字段，不猜测世界内部字段名。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { createCognitionVillage, defaultCognitionVillageConfig, cognitionSystems } from '../../runtime/fixtures/cognition-village.mjs';
import { COGNITION_RULES, runtimeProfile } from '../../runtime/service/http-contract.mjs';
import { transitionServiceCommand, validateServiceCommit } from '../../runtime/service/service-commit.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createM3CloseoutConfig } from '../../runtime/experiments/m3-closeout-scenario.mjs';

const SEVEN_PREFIXES = ['society-day-', 'mind-day-', 'mind-settle-', 'motivation-day-', 'experience-day-',
  'cognition-day-', 'cognition-eval-'];
const timeDto = (commandId, expectedRevision, ticks) =>
  ({ version: 1, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks } });
const sellDto = (commandId, expectedRevision, quantity) =>
  ({ version: 2, commandId, expectedRevision, type: 'PlayerSell', payload: { product: 'herbs', quantity } });
const readJson = async url => {
  const response = await fetch(url);
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
};
const postDto = async (url, dto) => {
  const response = await fetch(url + '/api/runtime/commands', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto) });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
};
async function temporary(t, prefix = 'world-m34b-g1-') {
  const base = path.join(os.tmpdir(), prefix);
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(base + path.sep);
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
// The owner lock is runtime bookkeeping, not a durable business file.
const fileBytes = async directory => {
  const names = (await fs.readdir(directory)).filter(name => name !== '.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(directory, name), 'utf8')])));
};
// The default cognition-village player owns no herbs, so a trade there is a legitimate authority
// rejection rather than a transport case; G1's DTO2 runs on the frozen recipe world.
async function recipeSeed(t, simulationId) {
  const root = await temporary(t);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  await saveCheckpoint(createCognitionVillage(42, simulationId, createM3CloseoutConfig('work-learning', true)).bundle,
    { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  return { directory: runtime, checkpoint: path.join(source, 'checkpoint-r0.json') };
}

test('G1 默认 profile 创建：三投影同源，只读 GET 不推进世界也不动磁盘', async t => {
  const directory = path.join(await temporary(t), 'world');
  const server = await startRuntimeServer({ directory, profile: 'cognition-village', port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  const capabilities = await readJson(server.url + '/api/runtime/capabilities');
  assert.equal(capabilities.body.apiVersion, 1);
  assert.equal(capabilities.body.writes, true);
  assert.deepEqual([capabilities.body.playerAvailable, capabilities.body.playerActionsAvailable,
    capabilities.body.mindAvailable], [true, true, true]);
  assert.equal(capabilities.body.commandDtoVersion, 1);
  const before = await fileBytes(directory);
  assert.ok(before['service-commit-r0.json'], 'creation publishes the initial commit');
  const snapshot = await readJson(server.url + '/api/runtime/snapshot');
  const player = await readJson(server.url + '/api/runtime/player');
  const minds = await readJson(server.url + '/api/runtime/minds');
  assert.deepEqual([snapshot.body.tick, snapshot.body.revision], [0, 0]);
  // Contract §G1: public/player/mind projections come from one submitted candidate.
  for (const projection of [snapshot.body, player.body, minds.body])
    assert.deepEqual([projection.simulationId, projection.tick, projection.revision],
      [snapshot.body.simulationId, snapshot.body.tick, snapshot.body.revision], 'three projections agree');
  assert.deepEqual(minds.body.actors.map(actor => actor.knowledge.actorId), ['actor-2', 'actor-3']);
  for (const route of ['/api/runtime/snapshot', '/api/runtime/player', '/api/runtime/minds'])
    for (let attempt = 0; attempt < 3; attempt++) await readJson(server.url + route);
  assert.deepEqual(await fileBytes(directory), before, 'repeated GETs may not rewrite durable bytes');
  assert.deepEqual((await readJson(server.url + '/api/runtime/snapshot')).body, snapshot.body,
    'reads must not advance the clock or consume inputs');
});

test('G1 门序与只读边界：关闭或无能力一律 404，能力具备后 405 先于 400，HEAD 同状态同头无正文', async t => {
  const root = await temporary(t);
  const closed = await startRuntimeServer({ directory: path.join(root, 'closed'), profile: 'cognition-village', port: 0 });
  t.after(() => closed.close());
  assert.equal((await readJson(closed.url + '/api/runtime/capabilities')).body.mindAvailable, false,
    'the inspector gate is off by default');
  for (const route of ['/api/runtime/minds', '/runtime-mind.html', '/runtime-mind.mjs', '/runtime-mind.css'])
    for (const method of ['GET', 'POST', 'HEAD', 'PUT', 'DELETE'])
      assert.equal((await fetch(closed.url + route, method === 'GET' ? undefined : { method })).status, 404,
        `${route} ${method} on a closed gate`);
  assert.equal((await readJson(closed.url + '/api/runtime/minds?page=1')).status, 404,
    'a query must not leak past a closed gate');
  const noCapability = await startRuntimeServer({ directory: path.join(root, 'incapable'),
    profile: 'personality-neutral', port: 0, inspectMind: true });
  t.after(() => noCapability.close());
  assert.equal((await readJson(noCapability.url + '/api/runtime/capabilities')).body.mindAvailable, false);
  for (const route of ['/api/runtime/minds', '/runtime-mind.html'])
    assert.equal((await fetch(noCapability.url + route)).status, 404, `${route} without the capability`);
  const capable = await startRuntimeServer({ directory: path.join(root, 'capable'), profile: 'cognition-village',
    port: 0, inspectMind: true });
  t.after(() => capable.close());
  // Capability exists, so the method gate wins over the query gate.
  const posted = await fetch(capable.url + '/api/runtime/minds', { method: 'POST', body: '{}' });
  assert.equal(posted.status, 405);
  assert.equal(posted.headers.get('allow'), 'GET, HEAD');
  assert.equal((await fetch(capable.url + '/api/runtime/minds?x=1', { method: 'POST' })).status, 405,
    'the method gate must still precede the query gate');
  const queried = await readJson(capable.url + '/api/runtime/minds?page=2');
  assert.deepEqual([queried.status, queried.body.apiVersion, queried.body.error.code], [400, 1, 'INVALID_INPUT']);
  const head = await fetch(capable.url + '/api/runtime/minds', { method: 'HEAD' });
  const get = await fetch(capable.url + '/api/runtime/minds');
  assert.equal(head.status, get.status);
  assert.equal(await head.text(), '', 'HEAD must not carry a body');
  assert.equal(head.headers.get('content-type'), get.headers.get('content-type'), 'HEAD header parity');
  // A read-only server never accepts commands, and no new psychology write route exists.
  assert.equal((await postDto(capable.url, timeDto('m34b-g1-readonly', 0, 6))).status, 405);
  assert.equal((await postDto(capable.url, sellDto('m34b-g1-readonly-sell', 0, 1))).status, 405);
  assert.equal((await fetch(capable.url + '/api/runtime/mind/write', { method: 'POST' })).status, 404);
});

test('G1 DTO1 与 DTO2 走 canonical transition，七内部前缀两版本都拒且不动世界', async t => {
  const seed = await recipeSeed(t, 'm34b-g1-recipes');
  const server = await startRuntimeServer({ ...seed, port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  const live = async () => (await readJson(server.url + '/api/runtime/snapshot')).body.revision;
  const steps = [[dto => timeDto('m34b-g1-advance-144', dto, 144), 144],
    [dto => sellDto('m34b-g1-sell-seven', dto, 7), 1],
    [dto => timeDto('m34b-g1-advance-288', dto, 143), 143]];
  for (const [build, ticks] of steps) {
    const revisionBefore = await live();
    const dto = build(revisionBefore);
    assert.equal(dto.expectedRevision, revisionBefore, 'each DTO reads the real prior revision');
    const response = await postDto(server.url, dto);
    assert.equal(response.status, 200, dto.commandId + ' refused: ' + JSON.stringify(response.body));
    assert.deepEqual([response.body.apiVersion, response.body.commandId, response.body.status],
      [1, dto.commandId, 'committed']);
    assert.deepEqual([response.body.fromRevision, response.body.toRevision], [revisionBefore, revisionBefore + ticks]);
    assert.equal(await live(), response.body.toRevision);
  }
  // DTO2 receipts keep the authority outcome; DTO1 receipts do not carry those fields.
  // A durable commit file is the cumulative journal from the anchor, not a single-command delta.
  const files = await fileBytes(seed.directory);
  const afterTrade = JSON.parse(files['service-commit-r145.json']);
  assert.equal(afterTrade.serviceFormatVersion, 6);
  assert.deepEqual(afterTrade.commands.map(entry => entry.dto.commandId),
    ['m34b-g1-advance-144', 'm34b-g1-sell-seven'], 'the journal accumulates every committed command from the anchor');
  const trade = afterTrade.commands[1];
  assert.equal(trade.dto.type, 'PlayerSell');
  assert.deepEqual(Object.keys(trade.receipt).sort(),
    ['apiVersion', 'commandId', 'fromRevision', 'outcome', 'receiptVersion', 'result', 'status', 'tick', 'toRevision', 'type']);
  const advance = JSON.parse(files['service-commit-r144.json']);
  assert.deepEqual(Object.keys(advance.commands[0].receipt).sort(),
    ['apiVersion', 'commandId', 'fromRevision', 'status', 'tick', 'toRevision']);
  const beforeRejections = files, revisionBefore = await live();
  for (const prefix of SEVEN_PREFIXES) {
    const dto1 = await postDto(server.url, timeDto(prefix + 'external', await live(), 6));
    assert.deepEqual([dto1.status, dto1.body.error.code], [400, 'INVALID_INPUT'], `${prefix} DTO1`);
    const dto2 = await postDto(server.url, sellDto(prefix + 'external', await live(), 1));
    assert.deepEqual([dto2.status, dto2.body.error.code], [400, 'INVALID_INPUT'], `${prefix} DTO2`);
  }
  assert.deepEqual(await fileBytes(seed.directory), beforeRejections, 'refused namespaces write no durable byte');
  assert.equal(await live(), revisionBefore, 'refused namespaces advance nothing');
});

test('G1 同 ID 原 DTO 幂等（含重启），异输入 409，过期 revision 409 带 currentRevision', async t => {
  const directory = path.join(await temporary(t), 'world');
  const server = await startRuntimeServer({ directory, profile: 'cognition-village', port: 0, writable: true });
  t.after(() => server.close());
  const dto = timeDto('m34b-g1-idempotent', 0, 144);
  const first = await postDto(server.url, dto);
  assert.equal(first.status, 200);
  assert.deepEqual((await postDto(server.url, dto)).body, first.body, 'an exact retry returns the durable receipt');
  const conflict = await postDto(server.url, timeDto('m34b-g1-idempotent', 0, 288));
  assert.deepEqual([conflict.status, conflict.body.error.code], [409, 'COMMAND_ID_CONFLICT'], 'same id, new payload');
  const stale = await postDto(server.url, timeDto('m34b-g1-stale', 0, 6));
  assert.deepEqual([stale.status, stale.body.error.code], [409, 'REVISION_CONFLICT']);
  assert.equal(stale.body.currentRevision, first.body.toRevision, 'the 409 reports the revision actually read');
  await server.close();
  const reopened = await startRuntimeServer({ directory, port: 0, writable: true });
  t.after(() => reopened.close());
  assert.equal((await readJson(reopened.url + '/api/runtime/snapshot')).body.revision, first.body.toRevision);
  assert.deepEqual((await postDto(reopened.url, dto)).body, first.body,
    'reopen keeps same-ID idempotency including the original expectedRevision');
  assert.equal((await postDto(reopened.url, timeDto('m34b-g1-idempotent', 0, 1))).body.error.code,
    'COMMAND_ID_CONFLICT', 'a same-ID different-payload retry stays refused after reopen');
});

test('G1 真实 io.link 故障：三投影与磁盘字节全保旧，修复后只发布一次', async t => {
  const directory = path.join(await temporary(t), 'world');
  let armFault = false, linkCalls = 0, faults = 0;
  const io = new Proxy(fs, { get(target, property) {
    if (property === 'link') return async (...args) => {
      linkCalls++;
      if (armFault) { armFault = false; faults++; throw Object.assign(new Error('injected link failure'), { code: 'EACCES' }); }
      return target.link(...args);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true }, io);
  t.after(() => owner.close());
  const readings = () => canonicalJson({ snapshot: owner.getSnapshot(), player: owner.getPlayer(),
    mind: owner.getMindInspector(), capabilities: [owner.playerAvailable, owner.playerActionsAvailable,
      owner.mindAvailable] });
  assert.ok(linkCalls >= 1, 'the non-fault path must really call fs.link, not a no-op');
  const before = readings(), diskBefore = await fileBytes(directory);
  const dto = timeDto('m34b-g1-fault', 0, 144);
  armFault = true;
  await assert.rejects(owner.submit(dto), error => error.code === 'SAVE_FAILED' && error.cause?.code === 'EACCES');
  assert.equal(faults, 1, 'the request must reach durable publication before failing');
  assert.equal(readings(), before, 'all three projections and capabilities stay old');
  assert.deepEqual(await fileBytes(directory), diskBefore, 'a failed publication preserves every file and byte');
  const receipt = await owner.submit(dto);
  assert.equal(receipt.status, 'committed');
  const diskAfter = await fileBytes(directory);
  assert.deepEqual(Object.keys(diskAfter).sort(), ['service-commit-r0.json', 'service-commit-r144.json'].sort());
  assert.equal(diskAfter['service-commit-r0.json'], diskBefore['service-commit-r0.json']);
  assert.equal(JSON.parse(diskAfter['service-commit-r144.json']).commands.length, 1, 'the retry publishes once');
  assert.deepEqual(await owner.submit(dto), receipt);
  const after = readings();
  await owner.close();
  const reopened = await createRuntimeOwner({ directory, writable: true });
  t.after(() => reopened.close());
  assert.equal(canonicalJson({ snapshot: reopened.getSnapshot(), player: reopened.getPlayer(),
    mind: reopened.getMindInspector(), capabilities: [reopened.playerAvailable, reopened.playerActionsAvailable,
      reopened.mindAvailable] }), after, 'reopen restores the same three projections');
  assert.deepEqual(await fileBytes(directory), diskAfter, 'reopen changes no durable byte');
});

test('G1 checkpoint 初始化与既有目录恢复：profile+checkpoint 同传被拒，身份不被重置', async t => {
  const root = await temporary(t);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const bundle = createCognitionVillage(42, 'm34b-g1-checkpoint').bundle;
  await saveCheckpoint(bundle, { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  const checkpointFile = path.join(source, 'checkpoint-r0.json');
  await assert.rejects(createRuntimeOwner({ directory: path.join(root, 'both'), checkpoint: checkpointFile,
    profile: 'cognition-village' }), error => error.code === 'INVALID_INPUT', 'profile and checkpoint cannot combine');
  const restored = await createRuntimeOwner({ directory: runtime, checkpoint: checkpointFile });
  t.after(() => restored.close());
  assert.equal(restored.getSnapshot().simulationId, 'm34b-g1-checkpoint');
  assert.equal(JSON.parse((await fileBytes(runtime))['service-commit-r0.json']).serviceFormatVersion, 6,
    'checkpoint init stays on the cognition format6 path');
  await restored.close();
  const directory = path.join(root, 'reopen');
  const first = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true });
  t.after(() => first.close());
  await first.submit(timeDto('m34b-g1-reopen', 0, 144));
  const identity = first.getSnapshot().simulationId;
  await first.close();
  // With no live owner, an existing directory still refuses a new profile or seed.
  for (const attempt of [{ directory, profile: 'personality-neutral' }, { directory, seed: 7 }])
    await assert.rejects(createRuntimeOwner(attempt), error => typeof error.code === 'string',
      'an existing directory may not have its profile or seed reset');
  const reopened = await createRuntimeOwner({ directory, writable: true });
  t.after(() => reopened.close());
  assert.deepEqual([reopened.getSnapshot().revision, reopened.getSnapshot().simulationId], [144, identity]);
  await assert.rejects(createRuntimeOwner({ directory, writable: true }),
    error => error.code === 'OWNER_BUSY' || /already has an owner/i.test(error.message), 'one owner per directory');
});

test('G1 service6 成员实质变化即使 canonical 已变也被完整 journal 重演拒绝', async t => {
  const directory = path.join(await temporary(t), 'world');
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true });
  t.after(() => owner.close());
  await owner.submit(timeDto('m34b-g1-journal-a', 0, 144));
  await owner.submit(timeDto('m34b-g1-journal-b', 144, 144));
  await owner.close();
  const files = await fileBytes(directory);
  // The durable file at the newest revision is already the full journal: anchor at r0 plus both
  // commands, so the honest record is read as-is instead of stitched together.
  const pristine = JSON.parse(files['service-commit-r288.json']);
  assert.equal(pristine.commands.length, 2, 'the full journal must carry two real commands to test ordering');
  assert.equal(pristine.anchor.snapshot.revision, 0, 'the full journal anchors at the created world');
  assert.doesNotThrow(() => validateServiceCommit(structuredClone(pristine)), 'the honest full journal validates');
  const tampered = {
    'commands swapped': record => record.commands = [record.commands[1], record.commands[0]],
    'second command dropped': record => record.commands = [record.commands[0]],
    'dto ticks changed': record => record.commands[0].dto.payload.ticks = 6,
    'dto expectedRevision changed': record => record.commands[1].dto.expectedRevision = 0,
    'receipt toRevision changed': record => record.commands[0].receipt.toRevision = 6,
    'receipt status changed': record => record.commands[0].receipt.status = 'no-action',
    'final bundle replaced by anchor': record => record.bundle = structuredClone(record.anchor),
    'anchor replaced by final bundle': record => record.anchor = structuredClone(record.bundle),
    'format claimed as five': record => record.serviceFormatVersion = 5
  };
  for (const [label, mutate] of Object.entries(tampered)) {
    const record = structuredClone(pristine);
    mutate(record);
    assert.notEqual(canonicalJson(record), canonicalJson(pristine), `${label}: the canonical text must really change`);
    assert.throws(() => validateServiceCommit(record), error => typeof error.code === 'string',
      `${label}: full replay must reject the edited journal`);
  }
  // The honest journal still replays command by command into the durable world.
  let replay = pristine.anchor;
  for (const entry of pristine.commands) {
    const next = transitionServiceCommand(replay, entry.dto);
    assert.deepEqual(next.receipt, entry.receipt);
    replay = next.bundle;
  }
  assert.deepEqual(replay, pristine.bundle, 'the durable world equals the replayed world');
});

test('G1 挂起 durable 发布期间读旧三投影，解除后同一候选一起可见', async t => {
  const directory = path.join(await temporary(t), 'world');
  // The suspended link must always be released, even if an assertion below throws, otherwise the
  // in-flight submission would hang the runner forever.
  let releaseGate, gateOpened = false, armed = false;
  const gate = new Promise(resolve => { releaseGate = resolve; });
  let enteredResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const io = new Proxy(fs, { get(target, property) {
    if (property === 'link') return async (...args) => {
      // Only the armed submission is suspended: the owner's own initial publish must go through,
      // otherwise the owner creation itself would never return.
      if (armed) {
        gateOpened = true;
        enteredResolve();
        await gate;
      }
      return target.link(...args);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true }, io);
  t.after(async () => { releaseGate(); await owner.close().catch(() => {}); });
  const projections = () => canonicalJson({ snapshot: owner.getSnapshot(), player: owner.getPlayer(),
    mind: owner.getMindInspector() });
  const committed = projections();
  armed = true;
  const submission = owner.submit(timeDto('m34b-g1-pending', 0, 144));
  await Promise.race([entered, new Promise(resolve => setTimeout(resolve, 20000))]);
  try {
    assert.equal(gateOpened, true, 'the publication must really reach the atomic link step');
    assert.equal(projections(), committed, 'a suspended publication must not expose a half-swapped candidate');
    assert.deepEqual([owner.getSnapshot().revision, owner.getPlayer().revision, owner.getMindInspector().revision],
      [0, 0, 0], 'all three reads stay on the old committed revision while publishing hangs');
    const during = (await fs.readdir(directory)).sort();
    assert.ok(!during.includes('service-commit-r144.json'),
      'the committed target name is not visible before the atomic link completes: ' + during.join(','));
    // A dot-prefixed staged file plus the owner lock are the expected mid-publication shape.
    assert.deepEqual(during, ['.runtime-owner.lock',
      during.find(name => name.endsWith('.tmp')), 'service-commit-r0.json'].filter(Boolean).sort(),
      'only the committed r0, the staged candidate and the owner lock may exist mid-publication: ' + during.join(','));
    assert.ok(during.some(name => /^\.service-commit-r144\.json\.\d+\.\d+\.tmp$/.test(name)),
      'the staged file must be the pending r144 candidate: ' + during.join(','));
  } finally {
    releaseGate();
  }
  const receipt = await submission;
  assert.equal(receipt.status, 'committed');
  const published = projections();
  assert.notEqual(published, committed, 'the candidate becomes visible once publication finishes');
  assert.deepEqual([owner.getSnapshot().revision, owner.getPlayer().revision, owner.getMindInspector().revision],
    [144, 144, 144], 'all three projections move to the same revision together');
  assert.ok((await fileBytes(directory))['service-commit-r144.json'], 'the durable commit exists after release');
});

test('G1 合法副本内 config/cognition cursor/决定模式/经验样本实变均被完整重演拒绝', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'world-m34b-g1-deep-'));
  let owner;
  t.after(async () => {
    try { await owner?.close(); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  const source = path.join(root, 'source'), directory = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(directory);
  await saveCheckpoint(createCognitionVillage(42, 'm34b-g1-deep', createM3CloseoutConfig('work-learning', true)).bundle,
    { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  owner = await createRuntimeOwner({ directory, checkpoint: path.join(source, 'checkpoint-r0.json'), writable: true });
  await owner.submit(timeDto('m34b-g1-deep-a', 0, 288));
  const pristine = JSON.parse((await fileBytes(directory))['service-commit-r288.json']);
  assert.doesNotThrow(() => validateServiceCommit(structuredClone(pristine)), 'the honest journal validates');
  const world = record => record.bundle.snapshot.world;
  const samples = world(pristine).experienceModel.actors[0].workExperienceState.samples;
  assert.ok(samples.length > 0, 'the frozen recipe must produce real work experience before mutations');
  assert.equal(samples[0].action, 'WorkForPay');
  assert.equal(samples[0].status, 'succeeded', 'the status forgery starts from a real successful work receipt');
  assert.equal(world(pristine).cognitionModel.actors[0].reviewState.lastEvaluation.decision.mode, 'review',
    'the mode forgery must start from an actual review');
  const pristineBytes = canonicalJson(pristine);
  const deep = {
    'experience config flipped': record => { world(record).experienceModel.config.useWorkExperience = false; },
    'experience config version forged': record => { world(record).experienceModel.config.version = 'experience-config-v9'; },
    'cognition cursor moved': record => { world(record).cognitionModel.cursor = world(record).cognitionModel.cursor + 3; },
    'cognition config fingerprint forged': record => { world(record).cognitionModel.configFingerprint = '{}'; },
    'decision mode flipped': record => {
      record.bundle.snapshot.world.cognitionModel.actors[0].reviewState.lastEvaluation.decision.mode = 'maintain';
    },
    'work samples cleared': record => {
      world(record).experienceModel.actors[0].workExperienceState.samples = [];
    },
    'work sample status forged': record => {
      const sample = world(record).experienceModel.actors[0].workExperienceState.samples[0];
      sample.status = 'rejected';
      sample.code = 'RULE_REJECTED';
    }
  };
  assert.equal(Object.keys(deep).length, 7, 'all seven required mutations are present');
  for (const [label, mutate] of Object.entries(deep)) {
    const record = structuredClone(pristine);
    mutate(record);
    assert.notEqual(canonicalJson(record), pristineBytes, `${label}: the mutation must change canonical bytes`);
    assert.throws(() => validateServiceCommit(record), error => typeof error.code === 'string',
      `${label}: the edited world must be refused by full replay`);
  }
  // The honest journal still replays to the durable world, so the refusals are not blanket failures.
  let replay = pristine.anchor;
  for (const entry of pristine.commands) replay = transitionServiceCommand(replay, entry.dto).bundle;
  assert.deepEqual(replay, pristine.bundle, 'the untouched world still equals the replayed world');
});

test('G1 旧格式2保持原行为，认知命名空间不向其扩张', async () => {
  const { createPlayerVillage } = await import('../../runtime/fixtures/player-village.mjs');
  const { PLAYER_RULES } = await import('../../runtime/core/player-state.mjs');
  const bundle = createPlayerVillage(42, 'g1-player-v2').bundle;
  const profile = runtimeProfile(bundle);
  assert.deepEqual([profile.serviceFormatVersion, profile.rulesVersion], [2, PLAYER_RULES]);
  // Format 2 keeps its own namespace rules: a cognition id is still an ordinary external id.
  assert.equal(transitionServiceCommand(bundle, timeDto('cognition-day-format2', 0, 6)).receipt.toRevision, 6);
  assert.doesNotThrow(() => transitionServiceCommand(bundle, timeDto('player-day-format2', 0, 6)));
});

test('G1 HEAD 与 GET 的 content-length 与缓存头一致', async t => {
  const directory = path.join(await temporary(t), 'world');
  const server = await startRuntimeServer({ directory, profile: 'cognition-village', port: 0, inspectMind: true });
  t.after(() => server.close());
  for (const route of ['/api/runtime/minds', '/api/runtime/snapshot', '/runtime-mind.html']) {
    const get = await fetch(server.url + route);
    const body = Buffer.from(await get.arrayBuffer());
    const head = await fetch(server.url + route, { method: 'HEAD' });
    assert.equal(head.status, get.status, route + ' status parity');
    assert.equal(head.headers.get('content-type'), get.headers.get('content-type'), route + ' content-type parity');
    assert.equal(head.headers.get('content-length'), String(body.length), route + ' content-length matches the GET body');
    assert.equal(head.headers.get('cache-control'), get.headers.get('cache-control'), route + ' cache-control parity');
    assert.equal(await head.text(), '', route + ' HEAD carries no body');
  }
});

test('G1 旧格式 1-5 行为不变，认知命名空间不反向扩张，经验 profile 不静默升为 format6', async () => {
  const { createMindVillage } = await import('../../runtime/fixtures/mind-village.mjs');
  const { createMotivationVillage } = await import('../../runtime/fixtures/motivation-village.mjs');
  const { createExperienceVillage } = await import('../../runtime/fixtures/experience-village.mjs');
  const { createPlayerPlayVillage } = await import('../../runtime/fixtures/player-play-village.mjs');
  const { createPersonalityNeutral } = await import('../../runtime/fixtures/personality-village.mjs');
  const formats = [[createPersonalityNeutral().bundle, 1], [createPlayerPlayVillage(42, 'g1-play').bundle, 3],
    [createMindVillage(42, 'g1-mind').bundle, 4], [createMotivationVillage(42, 'g1-motivation').bundle, 5],
    [createCognitionVillage(42, 'g1-cognition').bundle, 6]];
  for (const [bundle, expected] of formats)
    assert.equal(runtimeProfile(bundle).serviceFormatVersion, expected, 'fixture ' + bundle.snapshot.fixtureId);
  // Contract §G1: experience-village must never be passed off as a service6 world.
  assert.throws(() => runtimeProfile(createExperienceVillage(42, 'g1-experience').bundle),
    error => error.code === 'UNSUPPORTED_VERSION', 'the experience profile stays unregistered for service');
  // Old formats keep their own namespaces and still accept cognition ids (no global ban).
  assert.equal(transitionServiceCommand(createMotivationVillage(42, 'g1-legacy').bundle,
    timeDto('cognition-day-legacy', 0, 6)).receipt.toRevision, 6);
  assert.throws(() => transitionServiceCommand(createCognitionVillage(42, 'g1-new').bundle,
    timeDto('cognition-day-new', 0, 6)), error => error.code === 'INVALID_INPUT', 'format6 refuses its own prefix');
  // The frozen default cognition config still manages exactly the two identities.
  assert.deepEqual(defaultCognitionVillageConfig().mind.actorIds, ['actor-2', 'actor-3']);
});

/**
 * D3-5B 独立验收 —— 服务/持久化门（G6、G7-checkpoint、G8-service、旧 profile 隔离）
 * ============================================================================
 * 依据：tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md（v d3-playable-encounter-acceptance-v1）
 *       tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md（v d3-playable-encounter-v1）
 * 作者角色：B（独立验收），只写本文件；不读被测实现反抄 expected。
 *
 * 真实消费者（全部来自 D3-5A 冻结入口，未读实现源码）：
 *   服务：node runtime-server.mjs --profile encounter-survival-village \
 *           --data-dir <TEMP> --port 0 --writable true --inspect-mind true
 *   只读投影：GET/HEAD /api/runtime/encounter（D3-5A 明确冻结该路由与 404 语义）
 *   CLI：node simulation-runner.mjs --fixture encounter-survival-village --seed 42 --days 0 \
 *           --encounter-inputs <DTO3.json> --out <newdir>；产物 encounter-state.json /
 *           encounter-inputs.json（D3-5A 冻结文件名）
 *
 * 手算期望（合同文字，未运行实现）：
 *   G6  同 ID 同输入 -> 原 receipt 且不再提交；同 ID 异输入 -> COMMAND_ID_CONFLICT 优先 stale；
 *       stale 新 ID -> REVISION_CONFLICT 且不占 ID/预算；预算 = MAX_SERVICE_COMMANDS = 128，
 *       超限整体拒绝且不占 ID（本文件用 revision 增量观测被接受输入数，断言恰 128）。
 *       发布前故障：真实 io.link EACCES（NODE_OPTIONS=--require TEMP shim，进程外注入）
 *       -> 运行非零退出且旧磁盘文件逐字节不变。
 *   G7  checkpoint：合法 resume 必须成功；篡改 damage / reservation / rules-version 必须非零拒绝。
 *   G8  GET 为真实投影、HEAD 同 headers 无 body、只读查询不写历史；旧 profile 对该路由 404；
 *       两 tab 同 revision 只一条提交、另一条真实冲突（409/REVISION_CONFLICT）；同 ID 重试原 receipt；
 *       capabilities 新增 commandDtoVersion=3 / encounterAvailable=true 且旧字段含义保持。
 *
 * 证据（运行期由 root 记录，本文件只打印、不注入伪造值）：
 *   命令  node --test tests/simulation/encounter-service-acceptance.test.mjs
 *   期望  退出码 0；TAP 零 fail / 零 skip / 零 todo
 *   基准  D35B_A_SHA（模块加载时必须严格等于 git HEAD，tracked source clean）
 *   临时服务：端口 0（随机，运行期打印实际端口）；TEMP 独立 data-dir；不触碰 127.0.0.1:18324
 *   未验项（本文件不覆盖，见回执）：
 *     - 真实浏览器路径、CSP/静态资源白名单、UI 不得提交 health/damage/winner/狼数/elapsed（UI 门）
 *     - 两 tab 的浏览器侧呈现（本文件只在 HTTP 层验证同 revision 冲突语义）
 *     - 已发布后“丢失响应”的磁盘不可回滚性：本文件只验证同 ID 重试返回原 receipt 且恰好一次提交
 *     - checkpoint 恢复使用 summary.checkpointPath，并只校验正式 envelope 的 snapshot/eventLog
 * ============================================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'runtime-server.mjs');
const RUNNER_ENTRY = path.join(PROJECT_ROOT, 'simulation-runner.mjs');
const PROFILE = 'encounter-survival-village';
const A_SHA = process.env.D35B_A_SHA || '';
const BASE_SHA = A_SHA;
const MAX_SERVICE_COMMANDS = 128;
const ENCOUNTER_PATH = '/api/runtime/encounter';
const COMMIT_PATH = '/api/runtime/commands';
const CAPABILITY_PATH = '/api/runtime/capabilities';
const LEGACY_PROFILE = 'survival-village';
const SERVER_START_TIMEOUT_MS = 60_000;
const GATE_TIMEOUT_MS = 600_000;

function assertAcceptanceBase() {
  assert.ok(A_SHA, '[D3-5B required-gate] D35B_A_SHA 必须提供，禁止 pending 或 skip');
  let head;
  let trackedStatus;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    trackedStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
  } catch (error) {
    assert.fail(`[D3-5B required-gate] 无法核验源码 HEAD / tracked dirty：${error.message}`);
  }
  assert.equal(A_SHA, head, `D35B_A_SHA 必须严格等于当前源码 HEAD；env=${A_SHA} HEAD=${head}`);
  assert.equal(trackedStatus, '', `产品 tracked 文件必须 clean；git status --porcelain=${JSON.stringify(trackedStatus)}`);
  return head;
}

const VERIFIED_A_SHA = assertAcceptanceBase();
assert.equal(VERIFIED_A_SHA, A_SHA);

const tempDirs = [];
const children = new Set();

console.log(
  '[D3-5B evidence][service] ' +
    JSON.stringify({
      gate: 'G6,G7-checkpoint,G8-service',
      baseSha: BASE_SHA,
      aSha: A_SHA,
      profile: PROFILE,
      legacyProfile: LEGACY_PROFILE,
      command: 'node --test tests/simulation/encounter-service-acceptance.test.mjs',
      expectedExitCode: 0,
      expectedTap: { fail: 0, skip: 0, todo: 0 },
      node: process.version,
      projectRoot: PROJECT_ROOT,
      dataDirMode: 'TEMP-per-test',
      requestedPort: 0,
      forbiddenEndpoint: '127.0.0.1:18324',
      pid: process.pid,
    }),
);

// ---------------------------------------------------------------------------
// 基础设施
// ---------------------------------------------------------------------------
function tempDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `d35b-${tag}-`));
  tempDirs.push(dir);
  return dir;
}

function requireEntry(entry) {
  assert.ok(fs.existsSync(entry), `D3-5A 冻结入口缺失：${entry}（required gate 非零阻断）`);
}

function cleanupAll() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* 收尾忽略 */
    }
  }
  children.clear();
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 收尾忽略 */
    }
  }
}

function parsePort(text) {
  const m1 = /(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{2,5})/.exec(text);
  if (m1) return Number(m1[1]);
  const m2 = /port[^0-9]{0,8}(\d{2,5})/i.exec(text);
  if (m2) return Number(m2[1]);
  return null;
}

async function startServer({ profile, dataDir, extraArgs = [] }) {
  requireEntry(SERVER_ENTRY);
  const args = [
    SERVER_ENTRY,
    ...(profile ? ['--profile', profile] : []),
    '--data-dir',
    dataDir,
    '--port',
    '0',
    '--writable',
    'true',
    '--inspect-mind',
    'true',
    ...extraArgs,
  ];
  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  let out = '';
  let err = '';
  let exited = null;
  let sawStopped = false;
  child.stdout.on('data', (d) => {
    out += String(d);
    if (out.includes('"status":"stopped"')) sawStopped = true;
  });
  child.stderr.on('data', (d) => {
    err += String(d);
  });
  child.on('exit', (code, signal) => {
    exited = { code, signal };
  });

  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  let port = null;
  while (Date.now() < deadline) {
    port = parsePort(out) ?? parsePort(err);
    if (port) break;
    if (exited) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) {
    children.delete(child);
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    throw new Error(
      `[D3-5B required-gate] 服务未能启动或未打印随机端口（profile=${profile}, port=0, dataDir=${dataDir}）。` +
        `exit=${JSON.stringify(exited)}；stdout 尾=${JSON.stringify(out.slice(-600))}；stderr 尾=${JSON.stringify(err.slice(-600))}`,
    );
  }
  const base = `http://127.0.0.1:${port}`;
  // 就绪探测：GET 遭遇投影（新 profile）或 capabilities（旧 profile）
  const readyDeadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    for (const probe of [ENCOUNTER_PATH, CAPABILITY_PATH]) {
      try {
        const res = await fetch(base + probe, { method: 'GET' });
        if (res.status > 0) {
          ready = true;
          break;
        }
      } catch {
        /* 未就绪 */
      }
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!ready) {
    throw new Error(
      `[D3-5B required-gate] 服务已打印端口 ${port} 但 HTTP 未就绪（profile=${profile}）。stderr 尾=${JSON.stringify(err.slice(-600))}`,
    );
  }
  return {
    child,
    port,
    base,
    dataDir,
    stdout: () => out,
    stderr: () => err,
    async stop() {
      if (exited && !sawStopped) {
        throw new Error(`Runtime exited without stopped acknowledgement: ${JSON.stringify(exited)}; stdout=${out.slice(-600)}`);
      }
      if (!exited) {
        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.stdout.off('data', onData);
            child.off('exit', onExit);
            fn(value);
          };
          const check = () => {
            if (sawStopped && exited) finish(resolve);
          };
          const onData = () => check();
          const onExit = (code, signal) => {
            exited = { code, signal };
            if (sawStopped) finish(resolve);
            else finish(reject, new Error(`Runtime exited before stopped acknowledgement: ${JSON.stringify(exited)}; stdout=${out.slice(-600)}`));
          };
          const timer = setTimeout(() => finish(reject,
            new Error(`Timed out waiting 15s for stopped acknowledgement and process exit; stdout=${out.slice(-600)}; stderr=${err.slice(-600)}`)), 15_000);
          child.stdout.on('data', onData);
          child.once('exit', onExit);
          child.stdin.end('quit\n');
          check();
        });
      }
      assert.ok(sawStopped, `Runtime must acknowledge stopped before exit; stdout=${out.slice(-600)}`);
      assert.ok(exited, 'Runtime process must exit after stopped acknowledgement');
      assert.equal(exited.code, 0, `Runtime stop must exit cleanly: ${JSON.stringify(exited)}; stderr=${err.slice(-600)}`);
      const lockPath = path.join(dataDir, '.runtime-owner.lock');
      assert.equal(fs.existsSync(lockPath), false, `Runtime owner lock must be removed before reopen: ${lockPath}`);
      let portClosed = false;
      try {
        await fetch(`${base}${ENCOUNTER_PATH}`, { signal: AbortSignal.timeout(1_000) });
      } catch {
        portClosed = true;
      }
      assert.ok(portClosed, `Old runtime port ${port} must be closed before reopen`);
      children.delete(child);
    },
  };
}

async function getJson(url) {
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  let body = null;
  try {
    body = text.length ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, text, body };
}

async function postJson(base, endpoint, dto) {
  const res = await fetch(base + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text.length ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, text, body, receipt: unwrapReceipt(body) };
}

const RECEIPT3_KEYS = [
  'apiVersion', 'receiptVersion', 'commandId', 'status', 'fromRevision', 'toRevision', 'fromTick', 'tick',
  'durationTicks', 'type', 'outcome', 'result',
];
const ENCOUNTER_RESULT_KEYS = ['actorId', 'encounterId', 'action', 'before', 'after', 'reasonCode'];
const ENCOUNTER_VIEW_KEYS = [
  'tick', 'playerHealth', 'playerAlive', 'wolfHealth', 'totalLivingWolves', 'reservedWolves',
  'availableWolves', 'battleDeaths', 'status', 'resolution',
];
const exactKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

function validReceipt3(body) {
  if (!exactKeys(body, RECEIPT3_KEYS)) return null;
  const integerFields = ['fromRevision', 'toRevision', 'fromTick', 'tick', 'durationTicks'];
  if (!(body.apiVersion === 1 && body.receiptVersion === 3 && typeof body.commandId === 'string' &&
    body.commandId.length > 0 && body.status === 'committed' && typeof body.type === 'string' &&
    ['succeeded', 'rejected'].includes(body.outcome) && integerFields.every(key => Number.isSafeInteger(body[key]) && body[key] >= 0) &&
    body.durationTicks === body.tick - body.fromTick &&
    body.toRevision === body.fromRevision + (body.durationTicks === 0 ? 1 : body.durationTicks))) return null;
  if (body.type.startsWith('Encounter')) {
    if (!exactKeys(body.result, ENCOUNTER_RESULT_KEYS) || body.result.actorId !== 'actor-4' ||
      !['begin', 'attack', 'flee', 'cancel'].includes(body.result.action) ||
      !(body.result.encounterId === null || typeof body.result.encounterId === 'string') ||
      !(body.result.reasonCode === null || ['RULE_REJECTED', 'ENCOUNTER_BUSY', 'ENCOUNTER_UNAVAILABLE',
        'ENCOUNTER_ID_MISMATCH', 'ENCOUNTER_CLOSED', 'PLAYER_DEAD'].includes(body.result.reasonCode))) return null;
    for (const view of [body.result.before, body.result.after]) {
      if (!exactKeys(view, ENCOUNTER_VIEW_KEYS) || !Number.isSafeInteger(view.tick) ||
        !Number.isSafeInteger(view.playerHealth) || typeof view.playerAlive !== 'boolean' ||
        !(view.wolfHealth === null || Number.isSafeInteger(view.wolfHealth)) ||
        !['none', 'active', 'closed'].includes(view.status) ||
        ![null, 'win', 'lose', 'flee', 'cancel', 'player-died'].includes(view.resolution)) return null;
    }
  }
  return body;
}

function unwrapReceipt(body) {
  return validReceipt3(body);
}

function sha256File(p) {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out.sort();
}

function snapshotDir(root) {
  if (!fs.existsSync(root)) return {};
  const map = {};
  for (const p of walkFiles(root)) {
    map[path.relative(root, p)] = sha256File(p);
  }
  return map;
}

function writeInputs(dir, dtos) {
  const p = path.join(dir, 'dto3-inputs.json');
  fs.writeFileSync(p, JSON.stringify(dtos, null, 2), 'utf8');
  return p;
}

function runCli({ outDir, inputsFile, days = 0, resume = null, env = {}, seed = 42, nodeArgs = [] }) {
  requireEntry(RUNNER_ENTRY);
  let args;
  if (resume) {
    args = [...nodeArgs, RUNNER_ENTRY, '--resume', resume, '--days', '0'];
  } else {
    args = [...nodeArgs, RUNNER_ENTRY, '--fixture', PROFILE, '--seed', String(seed), '--days', String(days)];
  }
  if (inputsFile && !resume) args.push('--encounter-inputs', inputsFile);
  args.push('--out', outDir);
  const res = spawnSync(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return {
    status: res.status,
    signal: res.signal,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    args,
  };
}

function cliEvidence(label, res) {
  return `${label}: exit=${res.status} signal=${res.signal} args=${JSON.stringify(res.args)} stderr尾=${JSON.stringify(
    (res.stderr || '').slice(-400),
  )}`;
}

function dto(commandId, expectedRevision, type, payload) {
  return { version: 3, commandId, expectedRevision, type, payload };
}

// ===========================================================================
// G8(service) —— 新 profile HTTP 投影、只读语义、两 tab 冲突、同 ID 幂等
// ===========================================================================
test('G8 新 profile 服务：GET/HEAD /api/runtime/encounter 真实投影、只读、capabilities、两 tab 冲突、同 ID 幂等', { timeout: GATE_TIMEOUT_MS }, async () => {
  const dataDir = tempDir('svc-new');
  const server = await startServer({ profile: PROFILE, dataDir });
  try {
    const base = server.base;
    // --- GET 真实投影 ---
    const g1 = await getJson(base + ENCOUNTER_PATH);
    assert.equal(g1.status, 200, `GET ${ENCOUNTER_PATH} 必须 200`);
    const v = g1.body;
    assert.ok(v && typeof v === 'object', 'GET 必须返回 JSON 投影');
    assert.equal(v.apiVersion, 1);
    assert.equal(v.encounterViewVersion, 1);
    assert.equal(v.actorId, 'actor-4');
    assert.ok('simulationId' in v, 'projection.simulationId');
    assert.equal(typeof v.revision, 'number');
    assert.equal(typeof v.tick, 'number');
    assert.ok(v.self && typeof v.self === 'object', 'projection.self');
    for (const f of ['alive', 'health', 'location', 'deathTick']) {
      assert.ok(Object.hasOwn(v.self, f), `projection.self.${f} 缺失`);
    }
    assert.equal(v.self.alive, true);
    assert.equal(v.self.health, 1000);
    assert.equal(v.self.deathTick, null);
    assert.ok('encounter' in v, 'projection.encounter');
    assert.equal(v.encounter, null, '新世界尚无遭遇');
    assert.ok(v.population && typeof v.population === 'object', 'projection.population');
    for (const f of ['totalLivingWolves', 'availableWolves', 'reservedWolves', 'battleDeaths']) {
      assert.ok(Object.hasOwn(v.population, f), `projection.population.${f} 缺失`);
    }
    assert.equal(v.population.totalLivingWolves, 14, 'G8：初始 14 只真实活狼');
    assert.equal(v.population.reservedWolves, 0);
    assert.equal(v.population.battleDeaths, 0);
    assert.ok(v.actions && typeof v.actions === 'object', 'projection.actions');
    assert.equal(v.actions.beginTicks, 0);
    assert.equal(v.actions.attackTicks, 6);
    assert.equal(v.actions.fleeTicks, 6);
    assert.equal(v.actions.cancelTicks, 0);
    assert.equal(v.actions.canBegin, false, '村庄位置不能开始森林遭遇');
    assert.equal(v.actions.canAct, false);
    assert.equal(v.actions.canCancel, false);

    // --- HEAD 同 headers 无 body ---
    const h1 = await fetch(base + ENCOUNTER_PATH, { method: 'HEAD' });
    assert.ok(h1.status === 200 || h1.status === 204, `HEAD 状态 ${h1.status}`);
    const headText = await h1.text();
    assert.equal(headText, '', 'HEAD 必须无 body');
    assert.equal(h1.status, g1.status, 'HEAD 与 GET 必须返回相同状态');
    const skip = new Set(['date', 'connection', 'keep-alive', 'transfer-encoding']);
    for (const [k, val] of h1.headers.entries()) {
      if (skip.has(k.toLowerCase())) continue;
      assert.equal(g1.headers.get(k), val, `HEAD 必须复用 GET headers：${k}`);
    }
    for (const k of ['content-type', 'content-length', 'cache-control', 'x-content-type-options', 'content-security-policy']) {
      const g = g1.headers.get(k);
      if (g !== null) assert.equal(h1.headers.get(k), g, `HEAD 必须复用 GET 的 ${k}`);
    }

    // --- 只读查询不写历史/不改变状态 ---
    const g2 = await getJson(base + ENCOUNTER_PATH);
    assert.deepEqual(g2.body, v, '只读查询不得改变投影（含 revision）');
    const g3 = await getJson(base + ENCOUNTER_PATH);
    assert.deepEqual(g3.body, v, '重复只读查询不得写历史');

    // --- capabilities ---
    const caps = await getJson(base + CAPABILITY_PATH);
    assert.equal(caps.status, 200, `GET ${CAPABILITY_PATH} 必须 200`);
    assert.deepEqual(
      {
        apiVersion: caps.body.apiVersion,
        writes: caps.body.writes,
        playerAvailable: caps.body.playerAvailable,
        playerActionsAvailable: caps.body.playerActionsAvailable,
        mindAvailable: caps.body.mindAvailable,
        maxCommandBytes: caps.body.maxCommandBytes,
        maxAdvanceTicks: caps.body.maxAdvanceTicks,
      },
      {
        apiVersion: 1,
        writes: true,
        playerAvailable: true,
        playerActionsAvailable: true,
        mindAvailable: true,
        maxCommandBytes: 4096,
        maxAdvanceTicks: 144000,
      },
      'capabilities 的旧字段必须保持既有语义',
    );
    assert.equal(caps.body.commandDtoVersion, 3, 'format8 新增 commandDtoVersion=3');
    assert.equal(caps.body.encounterAvailable, true, 'format8 新增 encounterAvailable=true');
    const serviceCommits = walkFiles(server.dataDir)
      .filter((file) => /^service-commit-r\d+\.json$/.test(path.basename(file)))
      .sort((a, b) => Number(path.basename(a).match(/r(\d+)\.json$/)[1]) - Number(path.basename(b).match(/r(\d+)\.json$/)[1]));
    assert.ok(serviceCommits.length > 0, 'format8 必须由正式 service-commit 文件证明');
    const latestServiceCommit = JSON.parse(fs.readFileSync(serviceCommits.at(-1), 'utf8'));
    assert.equal(latestServiceCommit.serviceFormatVersion, 8, '正式 service-commit 必须记录 serviceFormatVersion=8');

    // --- 使用 D3-5A 冻结的提交路由 ---
    const commitPath = COMMIT_PATH;
    const afterProbe = await getJson(base + ENCOUNTER_PATH);
    assert.deepEqual(afterProbe.body, v, '固定只读投影不得留下状态变化');

    // 合法 DTO 在默认 village 必须以完整领域拒绝 receipt 记录，不能伪造可用 ACTIVE。
    const villageBeginDto = dto('d35b-svc-village-begin', afterProbe.body.revision, 'EncounterBegin', {});
    const villageBegin = await postJson(base, commitPath, villageBeginDto);
    assert.ok(villageBegin.receipt, 'village Begin 必须返回完整 receipt');
    assert.equal(villageBegin.receipt.outcome, 'rejected');
    assert.equal(villageBegin.receipt.result.reasonCode, 'RULE_REJECTED');
    assert.equal(villageBegin.receipt.durationTicks, 0);
    const afterVillageBegin = await getJson(base + ENCOUNTER_PATH);
    assert.equal(afterVillageBegin.body.self.location, 'village');
    assert.equal(afterVillageBegin.body.actions.canBegin, false);
    assert.equal(afterVillageBegin.body.encounter, null);

    // --- 进入 forest + Begin（真实世界命令） ---
    let rev = afterVillageBegin.body.revision;
    let tick = afterProbe.body.tick;
    if (afterProbe.body.self.location !== 'forest') {
      const tr = await postJson(base, commitPath, dto('d35b-svc-travel', rev, 'PlayerTravel', { destination: 'forest' }));
      assert.ok(tr.receipt, `PlayerTravel 必须有 receipt：status=${tr.status} body=${tr.text.slice(0, 300)}`);
      assert.equal(tr.receipt.outcome, 'succeeded', `Travel 失败：${JSON.stringify(tr.receipt.result)}`);
      assert.equal(tr.receipt.durationTicks, 12, 'D3-5B G3：Travel 到 forest 为 12 tick');
      rev = tr.receipt.toRevision;
      tick = tr.receipt.tick;
    }
    const afterTravel = await getJson(base + ENCOUNTER_PATH);
    assert.equal(afterTravel.status, 200);
    assert.equal(afterTravel.body.self.location, 'forest');
    assert.equal(afterTravel.body.actions.canBegin, true, '真实 Travel 到森林后才能开始遭遇');

    const beginDto = dto('d35b-svc-begin', rev, 'EncounterBegin', {});
    const b1 = await postJson(base, commitPath, beginDto);
    assert.ok(b1.receipt, `EncounterBegin 必须有 receipt：status=${b1.status} body=${b1.text.slice(0, 300)}`);
    assert.equal(b1.receipt.status, 'committed');
    assert.equal(b1.receipt.outcome, 'succeeded');
    assert.equal(b1.receipt.receiptVersion, 3);
    assert.equal(b1.receipt.durationTicks, 0, 'Begin 零 tick');
    assert.equal(b1.receipt.fromRevision, rev);
    assert.equal(b1.receipt.toRevision, rev + 1, 'G8：零耗时命令 revision+1');
    assert.equal(b1.receipt.tick, tick, 'Begin 不推进 tick');
    assert.equal(b1.receipt.result.encounterId, 'encounter-1');
    assert.equal(b1.receipt.result.after.reservedWolves, 1);

    // --- 同 ID 同输入 -> 原 receipt，且不再提交 ---
    const b2 = await postJson(base, commitPath, beginDto);
    assert.ok(b2.receipt, '同 ID 重试必须返回 receipt');
    assert.deepEqual(b2.receipt, b1.receipt, 'G6/G8：同 ID 同输入必须返回原 receipt');
    const projAfterRetry = await getJson(base + ENCOUNTER_PATH);
    assert.equal(projAfterRetry.body.revision, rev + 1, 'G6：同 ID 重试不得重复提交');
    assert.equal(projAfterRetry.body.encounter.attackCount, 0);

    // --- 同 ID 异输入 -> COMMAND_ID_CONFLICT（优先 stale） ---
    const conflict = await postJson(
      base,
      commitPath,
      dto(beginDto.commandId, 0, 'EncounterCancel', { encounterId: 'encounter-1' }),
    );
    const conflictCode = conflict.receipt && conflict.receipt.result && conflict.receipt.result.code;
    assert.ok(
      conflict.status === 409 || conflictCode === 'COMMAND_ID_CONFLICT',
      `G6：同 ID 异输入必须 COMMAND_ID_CONFLICT 优先于 stale，实际 status=${conflict.status} receipt=${JSON.stringify(
        conflict.receipt,
      ).slice(0, 300)}`,
    );
    const projAfterConflict = await getJson(base + ENCOUNTER_PATH);
    assert.equal(projAfterConflict.body.revision, rev + 1, 'G6：ID 冲突不得改变状态');

    // --- 新 ID stale -> REVISION_CONFLICT 且不占 ID/预算 ---
    const staleRev = projAfterConflict.body.revision;
    const stale = await postJson(
      base,
      commitPath,
      dto('d35b-svc-stale', Math.max(0, staleRev - 1), 'AdvanceTime', { ticks: 1 }),
    );
    const staleCode = stale.receipt && stale.receipt.result && stale.receipt.result.code;
    assert.ok(
      stale.status === 409 || staleCode === 'REVISION_CONFLICT',
      `G6：新 ID stale 必须 REVISION_CONFLICT，实际 status=${stale.status} receipt=${JSON.stringify(stale.receipt).slice(0, 300)}`,
    );
    const projAfterStale = await getJson(base + ENCOUNTER_PATH);
    assert.equal(projAfterStale.body.revision, staleRev, 'G6：stale 不得改变 revision');
    // stale 不占 ID：同 ID 换成正确 revision 后必须能被正常接受
    const revive = await postJson(base, commitPath, dto('d35b-svc-stale', staleRev, 'EncounterCancel', { encounterId: 'encounter-1' }));
    assert.ok(revive.receipt, 'stale 过的 ID 不得被占用');
    assert.equal(revive.receipt.outcome, 'succeeded', 'G6：stale 不占 ID，改正 revision 后应成功');
    assert.equal(revive.receipt.durationTicks, 0, 'cancel 零 tick');
    const projAfterCancel = await getJson(base + ENCOUNTER_PATH);
    assert.equal(projAfterCancel.body.revision, staleRev + 1);
    assert.equal(projAfterCancel.body.encounter.resolution, 'cancel');

    // --- 两 tab 同 revision：只有一条提交，另一条真实冲突 ---
    const rev2 = projAfterCancel.body.revision;
    const tabA = postJson(base, commitPath, dto('d35b-tab-a', rev2, 'EncounterBegin', {}));
    const tabB = postJson(base, commitPath, dto('d35b-tab-b', rev2, 'EncounterBegin', {}));
    const [ra, rb] = await Promise.all([tabA, tabB]);
    const committed = [ra, rb].filter((r) => r.receipt && r.receipt.outcome === 'succeeded');
    const conflicted = [ra, rb].filter((r) => r !== committed[0]);
    assert.equal(committed.length, 1, `G8：同 revision 两 tab 必须恰好一条提交，实际 ${committed.length}`);
    assert.equal(conflicted.length, 1, 'G8：另一条必须收到冲突');
    const loser = conflicted[0];
    const loserCode = loser.receipt && loser.receipt.result && loser.receipt.result.code;
    assert.ok(
      loser.status === 409 || loserCode === 'REVISION_CONFLICT' || loser.status === 400,
      `G8：失败方必须收到真实 409/current revision，实际 status=${loser.status} receipt=${JSON.stringify(
        loser.receipt,
      ).slice(0, 300)}`,
    );
    const projAfterTabs = await getJson(base + ENCOUNTER_PATH);
    assert.equal(projAfterTabs.body.revision, rev2 + 1, 'G8：两 tab 冲突只产生一条提交');
    assert.equal(projAfterTabs.body.encounter.encounterId, 'encounter-2', 'G8：closed 后可开始下一场，ID 递增');

    // --- 断连后同 ID 重试：恰好一个提交，返回原 receipt ---
    const rev3 = projAfterTabs.body.revision;
    const retryDto = dto('d35b-svc-retry', rev3, 'EncounterCancel', { encounterId: 'encounter-2' });
    await rawAbort(base, commitPath, retryDto);
    await new Promise((r) => setTimeout(r, 300));
    const projAfterAbort = await getJson(base + ENCOUNTER_PATH);
    const retried = await postJson(base, commitPath, retryDto);
    assert.ok(retried.receipt, 'G8：断连后同 ID 重试必须得到 receipt');
    assert.equal(retried.receipt.fromRevision, retryDto.expectedRevision,
      '同 ID 重试的 canonical DTO 必须保留原 expectedRevision');
    assert.equal(retried.receipt.outcome, 'succeeded');
    assert.equal(retried.receipt.durationTicks, 0);
    const projAfterRetry2 = await getJson(base + ENCOUNTER_PATH);
    const delta = projAfterRetry2.body.revision - projAfterAbort.body.revision;
    assert.equal(delta, 1, `G8：断连重试必须恰好一次提交（revision 增量 1），实际 ${delta}`);
    assert.equal(projAfterRetry2.body.encounter.resolution, 'cancel');
    assert.equal(projAfterRetry2.body.encounter.status, 'closed');

    console.log(
      '[D3-5B evidence][service] ' +
        JSON.stringify({
          gate: 'G8-service',
          pid: server.child.pid,
          port: server.port,
          url: base,
          profile: PROFILE,
          dataDir,
          commitPath,
          capabilityPath: CAPABILITY_PATH,
          beginDto,
          beginReceipt: b1.receipt,
          retryDto,
          retryReceipt: retried.receipt,
          projectionAfterRetry: projAfterRetry2.body,
          getStatus: g1.status,
          headStatus: h1.status,
        }),
    );
  } finally {
    await server.stop();
  }
});

async function rawAbort(base, endpoint, dtoBody) {
  const { createConnection } = await import('node:net');
  const url = new URL(base);
  const payload = JSON.stringify(dtoBody);
  return new Promise((resolve) => {
    const sock = createConnection({ host: url.hostname, port: Number(url.port) }, () => {
      sock.write(
        `POST ${endpoint} HTTP/1.1\r\nHost: ${url.host}\r\nContent-Type: application/json\r\n` +
          `Content-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`,
      );
      // 立即断开：模拟发布后响应丢失
      setTimeout(() => {
        sock.destroy();
        resolve();
      }, 5);
    });
    sock.on('error', () => resolve());
    sock.setTimeout(5000, () => {
      sock.destroy();
      resolve();
    });
  });
}

// ===========================================================================
// G8(service) —— 旧 profile 隔离：该路由 404，DTO3 不被旧格式接受
// ===========================================================================
test('G8 旧 profile 隔离：/api/runtime/encounter 返回 404，DTO3 不被旧格式接受', { timeout: GATE_TIMEOUT_MS }, async () => {
  const dataDir = tempDir(`svc-legacy-${LEGACY_PROFILE}`);
  const server = await startServer({ profile: LEGACY_PROFILE, dataDir });
  server.legacyProfile = LEGACY_PROFILE;
  try {
    const base = server.base;
    const res = await getJson(base + ENCOUNTER_PATH);
    assert.equal(res.status, 404, `D3-5A：旧 profile 对 ${ENCOUNTER_PATH} 必须 404，实际 ${res.status}`);
    const headRes = await fetch(base + ENCOUNTER_PATH, { method: 'HEAD' });
    assert.equal(headRes.status, 404, 'D3-5A：旧 profile HEAD 亦 404');

    // 旧格式下固定提交路由必须用冻结的 HTTP error envelope 拒绝 DTO3。
    const commitPath = COMMIT_PATH;
    const probe = await postJson(
      base,
      commitPath,
      dto(`d35b-legacy-probe-${Date.now()}`, 0, 'AdvanceTime', { ticks: 1 }),
    );
    assert.equal(probe.status, 400, `旧 profile 的 DTO3 必须明确拒绝，实际 ${probe.status}`);
    assert.equal(probe.body?.error?.code, 'UNSUPPORTED_VERSION',
      `旧 profile DTO3 必须返回 error.code=UNSUPPORTED_VERSION，实际 ${JSON.stringify(probe.body)}`);
    console.log(
      '[D3-5B evidence][service] ' +
        JSON.stringify({
          gate: 'G8-legacy-isolation',
          pid: server.child.pid,
          port: server.port,
          url: server.base,
          dataDir: server.dataDir,
          legacyProfile: server.legacyProfile,
          encounterPathStatus: res.status,
          commitPath,
        }),
    );
  } finally {
    await server.stop();
  }
});

// ===========================================================================
// G6 —— CLI 确定性、发布前故障注入保留旧态、预算
// ===========================================================================
test('G6 CLI 真实发布 + io.link(EACCES) 发布前故障：非零退出且旧磁盘文件逐字节不变', { timeout: GATE_TIMEOUT_MS }, () => {
  const workDir = tempDir('cli-g6');
  const outDir = path.join(workDir, 'out');
  const faultOutDir = path.join(workDir, 'out-faulted');
  const recoveryOutDir = path.join(workDir, 'out-recovered');
  const inputs = [
    // actor-4 默认不在 forest：必须先用真实 PlayerTravel（12 tick）到达，再 Begin
    dto('d35b-cli-travel', 0, 'PlayerTravel', { destination: 'forest' }),
    dto('d35b-cli-begin', 12, 'EncounterBegin', {}),
    dto('d35b-cli-attack', 13, 'EncounterAction', { encounterId: 'encounter-1', action: 'attack' }),
  ];
  const inputsFile = writeInputs(workDir, inputs);

  const run1 = runCli({ outDir, inputsFile });
  assert.equal(run1.status, 0, cliEvidence('G6 CLI 首次运行必须成功', run1));
  const files1 = walkFiles(outDir).map((p) => path.relative(outDir, p));
  assert.ok(
    files1.some((f) => f.endsWith('encounter-state.json')),
    `D3-5A：产物必须含 encounter-state.json，实际 ${JSON.stringify(files1)}`,
  );
  assert.ok(
    files1.some((f) => f.endsWith('encounter-inputs.json')),
    `D3-5A：产物必须含 encounter-inputs.json，实际 ${JSON.stringify(files1)}`,
  );
  const before = snapshotDir(outDir);
  const firstSummary = JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8'));
  assert.equal(typeof firstSummary.checkpointPath, 'string', 'G6: summary 必须提供权威 checkpointPath');
  const checkpoint = path.resolve(firstSummary.checkpointPath);
  assert.ok(fs.existsSync(checkpoint), `G6: summary.checkpointPath 必须存在：${checkpoint}`);

  // 故障注入：进程外真实 io.link EACCES（before-link durable publish 点）
  const shimPath = path.join(workDir, 'inject-eacces.cjs');
  const markerPath = path.join(workDir, 'link-injection-marker.jsonl');
  const shimSource = [
    "const fs = require('node:fs');",
    "const fsp = require('node:fs/promises');",
    'const marker = process.env.D35B_LINK_MARKER;',
    'const inject = (target, name) => {',
    '  if (typeof target[name] !== "function") return;',
    '  target[name] = function (...args) {',
    '    fs.appendFileSync(marker, JSON.stringify({ method: name, source: args[0], target: args[1], code: "EACCES", marker: "D3-5B-injected-link" }) + "\\n");',
    '    const err = new Error("D3-5B injected publish fault (EACCES)");',
    '    err.code = "EACCES";',
    '    const cb = args[args.length - 1];',
    '    if (typeof cb === "function") return cb(err);',
    '    return Promise.reject(err);',
    '  };',
    '};',
    'inject(fs, "link");',
    'inject(fs, "linkSync");',
    'inject(fsp, "link");',
    '',
  ].join('\n');
  fs.writeFileSync(shimPath, shimSource, 'utf8');
  const shimCheck = spawnSync(process.execPath, ['--check', shimPath], { encoding: 'utf8' });
  assert.equal(shimCheck.status, 0,
    `G6: 生成的 EACCES preload 必须通过 node --check；stderr=${shimCheck.stderr || ''}`);

  // 从正式 checkpoint 恢复到新目录，marker 证明正式 checkpoint 发布路径确实触发 io.link EACCES。
  assert.notEqual(path.resolve(faultOutDir), path.resolve(recoveryOutDir), '故障输出与恢复输出必须是两个新目录');
  const run2 = runCli({ outDir: faultOutDir, resume: checkpoint, nodeArgs: ['--require', shimPath], env: { D35B_LINK_MARKER: markerPath } });
  assert.notEqual(run2.status, 0, cliEvidence('G6 发布前故障必须非零退出', run2));
  assert.ok(fs.existsSync(markerPath), `${cliEvidence('G6 io.link 注入未产生 marker', run2)}; expected marker=${markerPath}`);
  const injectedLinks = fs.readFileSync(markerPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(injectedLinks.length > 0, 'G6: 必须实际调用被注入的 io.link');
  assert.ok(injectedLinks.every((entry) => entry.marker === 'D3-5B-injected-link' && entry.code === 'EACCES'),
    `G6: marker 必须明确证明 EACCES 注入，实际 ${JSON.stringify(injectedLinks)}`);
  assert.ok(injectedLinks.some((entry) => typeof entry.target === 'string' && path.resolve(entry.target).startsWith(path.resolve(faultOutDir) + path.sep) &&
    /(?:^|\\|\/)\.?checkpoint-r\d+\.json(?:\.|$)/.test(entry.target)),
    `G6: io.link 目标必须是故障 out 内的正式 checkpoint 发布临时/最终路径，实际 ${JSON.stringify(injectedLinks)}`);
  const after = snapshotDir(outDir);
  assert.deepEqual(after, before, 'G6：发布前故障必须保留旧 bundle/正式文件逐字节不变');
  const faultedFiles = fs.existsSync(faultOutDir) ? walkFiles(faultOutDir).map((p) => path.relative(faultOutDir, p)) : [];
  assert.equal(faultedFiles.some((f) => f.endsWith('encounter-state.json')), false,
    `G6：发布前故障不得留下 encounter-state.json，实际 ${JSON.stringify(faultedFiles)}`);

  // 清除注入后用另一个全新目录续跑；比较完整状态、事件和业务产物。
  const run3 = runCli({ outDir: recoveryOutDir, resume: checkpoint });
  assert.equal(run3.status, 0, cliEvidence('G6 checkpoint 故障后恢复必须成功', run3));
  const reopenedSummary = JSON.parse(fs.readFileSync(path.join(recoveryOutDir, 'summary.json'), 'utf8'));
  const reopenedCheckpointPath = path.resolve(reopenedSummary.checkpointPath);
  const originalCheckpoint = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
  const reopenedCheckpoint = JSON.parse(fs.readFileSync(reopenedCheckpointPath, 'utf8'));
  assert.deepEqual(reopenedCheckpoint.snapshot, originalCheckpoint.snapshot, 'G6: 恢复 snapshot 必须逐字段一致');
  assert.deepEqual(reopenedCheckpoint.eventLog, originalCheckpoint.eventLog, 'G6: 恢复 eventLog 必须逐字段一致');
  assert.equal(firstSummary.startTick, 0, 'G6: 连续新建 runner 的 startTick 必须是 0');
  const expectedResumeStartTick = originalCheckpoint.snapshot.tick;
  assert.equal(reopenedSummary.startTick, expectedResumeStartTick, 'G6: resume startTick 必须来自已对等 checkpoint');
  const businessFiles = (snapshot) => Object.fromEntries(Object.entries(snapshot).filter(([name]) => name !== 'summary.json'));
  assert.deepEqual(businessFiles(snapshotDir(recoveryOutDir)), businessFiles(before),
    'G6: 所有非 summary 业务产物必须逐字节一致');
  const stableSummary = (summary) => {
    const copy = { ...summary };
    delete copy.elapsedMs;
    delete copy.memoryUsage;
    delete copy.checkpointPath;
    return copy;
  };
  const expectedStableSummary = { ...stableSummary(firstSummary), startTick: expectedResumeStartTick };
  assert.deepEqual(stableSummary(reopenedSummary), expectedStableSummary,
    'G6: summary 除三项非确定字段外须相等，startTick 按恢复 checkpoint 起点显式变化');

  console.log(
    '[D3-5B evidence][service] ' +
      JSON.stringify({
        gate: 'G6-cli-publish-fault',
        pid: null,
        port: null,
        dataDir: outDir,
        faultDataDir: faultOutDir,
        firstExit: run1.status,
        faultExit: run2.status,
        recoveredExit: run3.status,
        files: files1,
        hashes: before,
      }),
  );
});

// ===========================================================================
// G6 —— 预算：MAX_SERVICE_COMMANDS = 128，超限整体拒绝且不占 ID
// ===========================================================================
test('G6 输入预算 MAX_SERVICE_COMMANDS=128：128 条领域拒绝 receipt，129..140 LIMIT 且重开幂等', { timeout: GATE_TIMEOUT_MS }, async () => {
  const dataDir = tempDir('svc-budget');
  let server = await startServer({ profile: PROFILE, dataDir });
  try {
    const base = server.base;
    const initial = (await getJson(base + ENCOUNTER_PATH)).body;
    assert.equal(initial.self.location, 'village', '预算样本必须从默认 player village 开始');
    assert.equal(initial.actions.canBegin, false, '村庄中不能开始遭遇');
    const startRev = initial.revision;
    const firstDto = dto('d35b-budget-0', startRev, 'EncounterBegin', {});
    const first = await postJson(base, COMMIT_PATH, firstDto);
    assert.ok(first.receipt, `默认 village Begin 必须保留完整领域拒绝 receipt：${first.status} ${first.text}`);
    assert.equal(first.receipt.outcome, 'rejected');
    assert.equal(first.receipt.result.reasonCode, 'RULE_REJECTED');
    assert.equal(first.receipt.toRevision, startRev + 1);
    const firstReceipt = first.receipt;

    let revision = first.receipt.toRevision;
    const receipts = [first.receipt];
    for (let i = 1; i < MAX_SERVICE_COMMANDS; i += 1) {
      const res = await postJson(base, COMMIT_PATH, dto(`d35b-budget-${i}`, revision, 'EncounterBegin', {}));
      assert.ok(res.receipt, `第 ${i + 1} 个合法领域拒绝必须保留完整 receipt：${res.status} ${res.text}`);
      assert.equal(res.receipt.outcome, 'rejected');
      assert.equal(res.receipt.result.reasonCode, 'RULE_REJECTED');
      assert.equal(res.receipt.fromRevision, revision);
      assert.equal(res.receipt.toRevision, revision + 1);
      revision = res.receipt.toRevision;
      receipts.push(res.receipt);
    }
    assert.equal(receipts.length, MAX_SERVICE_COMMANDS);
    assert.equal(revision - startRev, MAX_SERVICE_COMMANDS);

    const beforeLimitProjection = {};
    for (const route of ['/api/runtime/snapshot', '/api/runtime/player', '/api/runtime/minds', ENCOUNTER_PATH]) {
      const res = await getJson(base + route);
      assert.equal(res.status, 200, `G6: budget boundary projection ${route}`);
      beforeLimitProjection[route] = res.body;
    }
    const serviceCommitSnapshot = () => Object.fromEntries(walkFiles(dataDir)
      .filter((file) => /^service-commit-r\d+\.json$/.test(path.basename(file)))
      .map((file) => [path.relative(dataDir, file), sha256File(file)]));
    const beforeLimitCommits = serviceCommitSnapshot();
    const beforeLimitDisk = snapshotDir(dataDir);
    assert.equal(Object.keys(beforeLimitDisk).filter((name) => /^service-commit-r\d+\.json$/.test(path.basename(name))).length,
      MAX_SERVICE_COMMANDS + 1, 'G6: revision 0 加 128 个 accepted input 必须有 129 个正式 service commits');
    const latestCommitPath = path.join(dataDir, `service-commit-r${revision}.json`);
    const latestCommit = JSON.parse(fs.readFileSync(latestCommitPath, 'utf8'));
    assert.equal(latestCommit.serviceFormatVersion, 8);
    assert.equal(latestCommit.bundle.snapshot.tick, 0, '拒绝 Begin 不推进 tick');
    assert.equal(latestCommit.bundle.snapshot.revision, startRev + MAX_SERVICE_COMMANDS);
    assert.equal(latestCommit.bundle.snapshot.world.encounterModel.inputHistory.length, MAX_SERVICE_COMMANDS);
    assert.equal(latestCommit.bundle.snapshot.world.encounterModel.encounter, null, '村庄拒绝不创建 ACTIVE 遭遇');

    for (let i = MAX_SERVICE_COMMANDS; i < MAX_SERVICE_COMMANDS + 12; i += 1) {
      const dtoAfterLimit = dto(`d35b-budget-${i}`, revision, 'EncounterBegin', {});
      const res = await postJson(base, COMMIT_PATH, dtoAfterLimit);
      assert.ok(res.status >= 400, `G6: 第 ${i + 1} 个输入必须 LIMIT_EXCEEDED，实际 ${res.status} ${res.text}`);
      assert.equal(res.body?.error?.code ?? res.body?.code, 'LIMIT_EXCEEDED', `G6: 第 ${i + 1} 个输入错误码`);
    }
    const afterLimitProjection = {};
    for (const route of Object.keys(beforeLimitProjection)) afterLimitProjection[route] = (await getJson(base + route)).body;
    assert.deepEqual(afterLimitProjection, beforeLimitProjection, 'G6: 超限后四个投影必须原样不变');
    assert.deepEqual(snapshotDir(dataDir), beforeLimitDisk, 'G6: 超限 12 次不能改变正式磁盘文件字节');

    await server.stop();
    server = await startServer({ profile: undefined, dataDir });
    const reopenedRetry = await postJson(server.base, COMMIT_PATH, firstDto);
    assert.equal(reopenedRetry.status, 200);
    assert.deepEqual(reopenedRetry.receipt, firstReceipt, 'G6: close/reopen 后原 DTO 必须仍返回原始完整 receipt');
    assert.deepEqual(serviceCommitSnapshot(), beforeLimitCommits, 'G6: 原 DTO 幂等重试不增加或改写正式 service-commit 文件');
    const finalProjection = (await getJson(server.base + ENCOUNTER_PATH)).body;
    assert.equal(finalProjection.revision, startRev + MAX_SERVICE_COMMANDS);
    assert.equal(finalProjection.tick, 0);
    assert.equal(finalProjection.encounter, null);
    assert.equal(finalProjection.population.reservedWolves, 0);

    console.log('[D3-5B evidence][service] ' + JSON.stringify({
      gate: 'G6-budget', pid: server.child.pid, port: server.port, dataDir, acceptedReceipts: receipts.length,
      overLimitAttempts: 12, tick: finalProjection.tick, revision: finalProjection.revision,
      inputHistoryLength: latestCommit.bundle.snapshot.world.encounterModel.inputHistory.length,
      serviceCommitFiles: MAX_SERVICE_COMMANDS + 1,
    }));
  } finally {
    await server.stop();
  }
});

test('G6 format-8 owner queue 满时 prior DTO 仍幂等，new DTO 受限且 ID conflict 优先', { timeout: GATE_TIMEOUT_MS }, async (t) => {
  const directory = path.join(tempDir('owner-full-queue'), 'world');
  fs.mkdirSync(directory, { recursive: true });
  let holdNextLink = false;
  let linkHeld = false;
  let releaseHeldLink;
  let signalLinkHeld;
  const heldLink = new Promise((resolve) => { signalLinkHeld = resolve; });
  const io = new Proxy(fs.promises, {
    get(target, property) {
      if (property === 'link') return async (...args) => {
        if (holdNextLink && !linkHeld) {
          holdNextLink = false;
          linkHeld = true;
          signalLinkHeld();
          await new Promise((resolve) => { releaseHeldLink = resolve; });
        }
        return Reflect.get(target, property, target)(...args);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const owner = await createRuntimeOwner({ directory, profile: PROFILE, seed: 42, writable: true }, io);
  const officialBytes = () => {
    const names = fs.readdirSync(directory).filter((name) => /^(?:checkpoint|service-commit)-r(?:0|[1-9][0-9]*)\.json$/.test(name)).sort();
    return Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(directory, name))]));
  };
  const views = () => ({
    snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(), encounter: owner.getEncounter(),
  });
  const originalDto = dto('d35b-queue-original', 0, 'EncounterBegin', {});
  const originalReceipt = await owner.submit(originalDto);
  assert.equal(originalReceipt.status, 'committed');
  assert.equal(originalReceipt.outcome, 'rejected', '原始回执必须是 village domain rejection');
  const beforeViews = views();
  const beforeDisk = officialBytes();
  holdNextLink = true;
  const queued = [];
  let settled = [];
  let finalRevision = null;
  try {
    for (let index = 0; index < 16; index += 1) {
      queued.push(owner.submit(dto(`d35b-queue-${index}`, index + 1, 'EncounterBegin', {})));
    }
    await heldLink;
    assert.equal(linkHeld, true, '真实 service owner 的发布 link 被暂停，16 项均处于 pending');
    assert.deepEqual(await owner.submit(originalDto), originalReceipt,
      'queue 满时，同 ID 同 canonical DTO 仍应先查到既有 receipt');
    await assert.rejects(owner.submit(dto('d35b-queue-17', 17, 'EncounterBegin', {})),
      (error) => error.code === 'LIMIT_EXCEEDED', '新的第 17 项仍须被 queue 上限拒绝');
    await assert.rejects(owner.submit(dto('d35b-queue-original', 999, 'EncounterAction', {
      encounterId: 'encounter-1', action: 'attack',
    })), (error) => error.code === 'COMMAND_ID_CONFLICT',
    '同一已提交 ID 改 DTO 时，ID conflict 必须优先于 stale 与 queue 满');
    assert.deepEqual(views(), beforeViews, 'prior retry 与两类拒绝不得改变四个 owner projection');
    assert.deepEqual(officialBytes(), beforeDisk, 'prior retry 与两类拒绝不得发布新正式文件');
  } finally {
    releaseHeldLink?.();
    settled = await Promise.allSettled(queued);
    finalRevision = owner.getSnapshot().revision;
    await owner.close();
  }
  assert.equal(settled.length, 16);
  assert.ok(settled.every((result) => result.status === 'fulfilled'),
    `释放 I/O 后所有已排队 DTO 必须完成：${JSON.stringify(settled.map((result) => result.status))}`);
  assert.equal(finalRevision, 17, '成功队列落盘后 revision 必须为 17');
  const committedFiles = Object.keys(officialBytes());
  assert.equal(committedFiles.filter((name) => name.startsWith('service-commit-r')).length, 18,
    'r0 加首个 prior receipt 与 16 个 queued DTO 共 18 个 service commit');
  const latest = JSON.parse(fs.readFileSync(path.join(directory, 'service-commit-r17.json'), 'utf8'));
  assert.equal(latest.commands.length, 17);
  assert.equal(latest.bundle.snapshot.world.encounterModel.inputHistory.length, 17);
});

// ===========================================================================
// G7(checkpoint) —— save/reopen 一致与篡改拒绝
// ===========================================================================
test('G7 checkpoint 固定路径重开完整 snapshot/eventLog、业务文件字节一致且篡改被完整 replay 拒绝', { timeout: GATE_TIMEOUT_MS }, () => {
  const workDir = tempDir('cli-g7');
  const outDir = path.join(workDir, 'out');
  const inputs = [
    dto('d35b-g7-travel', 0, 'PlayerTravel', { destination: 'forest' }),
    dto('d35b-g7-begin', 12, 'EncounterBegin', {}),
    dto('d35b-g7-attack', 13, 'EncounterAction', { encounterId: 'encounter-1', action: 'attack' }),
  ];
  const inputsFile = writeInputs(workDir, inputs);
  const run1 = runCli({ outDir, inputsFile });
  assert.equal(run1.status, 0, cliEvidence('G7 首次运行', run1));
  const firstSummary = JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8'));
  assert.equal(firstSummary.startTick, 0, 'G7: 连续新建 runner 的 startTick 必须是 0');
  assert.equal(typeof firstSummary.checkpointPath, 'string', 'G7: summary.checkpointPath 是唯一权威 checkpoint 路径');
  const checkpoint = path.resolve(firstSummary.checkpointPath);
  assert.ok(fs.existsSync(checkpoint), `G7: summary.checkpointPath 必须存在：${checkpoint}`);
  assert.ok(checkpoint.startsWith(path.resolve(outDir) + path.sep), 'G7: checkpoint 必须位于本次新 out 目录');
  const firstEnvelope = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
  assert.equal(firstEnvelope.formatVersion, 1);
  assert.deepEqual(Object.keys(firstEnvelope).sort(), ['eventLog', 'formatVersion', 'snapshot']);
  assert.equal(firstEnvelope.snapshot.world.encounterModel.encounter.status, 'active');
  assert.equal(firstEnvelope.snapshot.world.encounterModel.encounter.wolfHealth, 150);

  // 恢复只传权威 checkpoint 与 --days 0；runCli 对 --resume 不附加 fixture/seed/旧 inputs。
  const reopenDir = path.join(workDir, 'reopen');
  const run2 = runCli({ outDir: reopenDir, resume: checkpoint });
  assert.equal(run2.status, 0, cliEvidence('G7 合法 resume 必须成功', run2));
  assert.deepEqual(run2.args.slice(1), ['--resume', checkpoint, '--days', '0', '--out', reopenDir]);
  const reopenSummary = JSON.parse(fs.readFileSync(path.join(reopenDir, 'summary.json'), 'utf8'));
  const reopenCheckpoint = path.resolve(reopenSummary.checkpointPath);
  const reopenedEnvelope = JSON.parse(fs.readFileSync(reopenCheckpoint, 'utf8'));
  assert.deepEqual(reopenedEnvelope.snapshot, firstEnvelope.snapshot, 'G7: 恢复 snapshot 必须完整逐字段相等');
  assert.deepEqual(reopenedEnvelope.eventLog, firstEnvelope.eventLog, 'G7: 恢复 eventLog 必须完整逐字段相等');
  const expectedResumeStartTick = firstEnvelope.snapshot.tick;
  assert.equal(reopenSummary.startTick, expectedResumeStartTick, 'G7: resume startTick 必须来自已对等 checkpoint');
  const businessFiles = (root) => Object.fromEntries(Object.entries(snapshotDir(root)).filter(([name]) => name !== 'summary.json'));
  assert.deepEqual(businessFiles(reopenDir), businessFiles(outDir), 'G7: 所有非 summary 业务文件必须逐字节一致');
  const stableSummary = (summary) => {
    const copy = { ...summary };
    delete copy.elapsedMs;
    delete copy.memoryUsage;
    delete copy.checkpointPath;
    return copy;
  };
  const expectedStableSummary = { ...stableSummary(firstSummary), startTick: expectedResumeStartTick };
  assert.deepEqual(stableSummary(reopenSummary), expectedStableSummary,
    'G7: summary 除三项非确定字段外须 deepEqual，startTick 按恢复 checkpoint 起点显式变化');

  const modelOf = (envelope) => envelope.snapshot.world.encounterModel;
  const ecologyOf = (envelope) => envelope.snapshot.world.ecologyModel;
  const cases = [
    ['wolf-150-to-0-full-replay', (envelope) => { modelOf(envelope).encounter.wolfHealth = 0; }],
    ['reservation', (envelope) => { ecologyOf(envelope).reservedWolves = 0; }],
    ['rules-version', (envelope) => { modelOf(envelope).version = 'encounter-runtime-v0-unknown'; }],
  ];
  const tamperResults = {};
  for (const [label, mutate] of cases) {
    const changed = JSON.parse(JSON.stringify(firstEnvelope));
    mutate(changed);
    assert.notEqual(JSON.stringify(changed), JSON.stringify(firstEnvelope), `${label}: 变体必须有真实内容变化`);
    const tamperPath = path.join(workDir, `tampered-${label}.json`);
    fs.writeFileSync(tamperPath, JSON.stringify(changed), 'utf8');
    const tamperOut = path.join(workDir, `tampered-out-${label}`);
    const result = runCli({ outDir: tamperOut, resume: tamperPath });
    tamperResults[label] = { exit: result.status, stderrTail: (result.stderr || '').slice(-200) };
    assert.notEqual(result.status, 0, `G7: ${label} 必须被 checkpoint 完整 replay 拒绝。${cliEvidence(label, result)}`);
  }
  console.log('[D3-5B evidence][service] ' + JSON.stringify({
    gate: 'G7-checkpoint', pid: null, port: null, dataDir: outDir, checkpoint, reopenExit: run2.status, tamperResults,
  }));
});

test.after(() => {
  cleanupAll();
});

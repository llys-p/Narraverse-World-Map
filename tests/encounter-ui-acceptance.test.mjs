/**
 * D3-5B 独立验收 —— UI 真实消费者门（G8-ui）
 * ============================================================================
 * 依据：tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md（v d3-playable-encounter-acceptance-v1）
 *       tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md（v d3-playable-encounter-v1）
 * 作者角色：B（独立验收），只写本文件；不读被测实现反抄 expected。
 *
 * 真实消费者（全部来自 D3-5A 冻结入口）：
 *   静态页：/runtime-encounter.html + 独立 runtime-encounter.mjs / runtime-encounter.css
 *   地图页：runtime-map.html / runtime-map.mjs（在 forest 提供“进入森林场景”）
 *   服务：  node runtime-server.mjs --profile encounter-survival-village --data-dir <TEMP> --port 0
 *
 * 独立期望（合同文字，未运行实现）：
 *   G8  /runtime-encounter.html 只用于新 profile（旧 profile 404）；
 *       静态资源经 allowlist 外部加载，CSP 不含 inline；
 *       UI 无 WorldRPG/Inv/State 本地权威状态、无 model/bridge 请求、不把浏览器本地存档当权威；
 *       退出地图只导航、不隐式 cancel；
 *       active 中禁用世界命令且原因可见；
 *       刷新/重开继续 active pending，同 ID 重试只产生一条提交；
 *       UI 不得提交 health / damage / winner / 狼数 / elapsed ticks（只提交 DTO3 的
 *       commandId/expectedRevision/type/payload，payload 仅 encounterId/action/destination/ticks）；
 *       只读查询与结果投影必须与 service receipt 对齐（读 self.health / encounter.wolfHealth /
 *       encounter.elapsedTicks / population.*）。
 *
 * 证据（运行期由 root 记录，本文件只打印、不注入伪造值）：
 *   命令  node --test tests/encounter-ui-acceptance.test.mjs
 *   期望  退出码 0；TAP 零 fail / 零 skip / 零 todo
 *   基准  D35B_A_SHA（模块加载时必须严格等于 git HEAD，tracked source clean）
 *   临时服务：端口 0（随机，运行期打印实际端口）；TEMP 独立 data-dir；不触碰 127.0.0.1:18324
 *   未验项（本文件不覆盖，见回执）：
 *     - 两 tab 的浏览器侧视觉呈现细节（真实 409 冲突语义同时由 service 门在 HTTP 层验证，
 *       本文件用真实浏览器两页并发提交复核同 revision 只有一条提交）
 * ============================================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'runtime-server.mjs');
const PROFILE = 'encounter-survival-village';
const A_SHA = process.env.D35B_A_SHA || '';
const BASE_SHA = A_SHA;
const LEGACY_PROFILE = 'player-play-village';

const ENCOUNTER_HTML = 'runtime-encounter.html';
const ENCOUNTER_JS = 'runtime-encounter.mjs';
const ENCOUNTER_CSS = 'runtime-encounter.css';
const MAP_HTML = 'runtime-map.html';
const MAP_JS = 'runtime-map.mjs';
const ENCOUNTER_PATH = '/api/runtime/encounter';
const CAPABILITY_PATH = '/api/runtime/capabilities';
const COMMIT_PATH = '/api/runtime/commands';

const SERVER_START_TIMEOUT_MS = 60_000;
const GATE_TIMEOUT_MS = 600_000;
const BROWSER_EXECUTABLE = process.env.D35B_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PLAYWRIGHT_MODULE =
  process.env.D35B_PLAYWRIGHT_MODULE ||
  'C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';

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

// required gate：浏览器 driver 不可用必须硬失败（禁止 skip / 降级为静态证据）
function requireBrowserDriver() {
  assert.ok(
    fs.existsSync(BROWSER_EXECUTABLE),
    `[D3-5B required-gate] 真实浏览器可执行文件缺失：${BROWSER_EXECUTABLE}（G8 要求真实浏览器，禁止 skip）`,
  );
  let chromium = null;
  try {
    ({ chromium } = createRequire(import.meta.url)(PLAYWRIGHT_MODULE));
  } catch (e) {
    throw new Error(
      `[D3-5B required-gate] 浏览器 driver 加载失败：${PLAYWRIGHT_MODULE}（${e && e.message}）。` +
        'G8 要求真实浏览器路径，不得 skip 或退化为静态证据。',
    );
  }
  assert.equal(
    typeof chromium?.launch,
    'function',
    `[D3-5B required-gate] 本地 Playwright driver 必须可用（${PLAYWRIGHT_MODULE}）`,
  );
  return chromium;
}

const tempDirs = [];
const children = new Set();

console.log(
  '[D3-5B evidence][ui] ' +
    JSON.stringify({
      gate: 'G8-ui',
      baseSha: BASE_SHA,
      aSha: A_SHA,
      profile: PROFILE,
      command: 'node --test tests/encounter-ui-acceptance.test.mjs',
      expectedExitCode: 0,
      expectedTap: { fail: 0, skip: 0, todo: 0 },
      node: process.version,
      projectRoot: PROJECT_ROOT,
      dataDirMode: 'TEMP-per-test',
      requestedPort: 0,
      forbiddenEndpoint: '127.0.0.1:18324',
      browserEvidence: 'real Edge/Chromium via Playwright (required-gate, no skip)',
      pid: process.pid,
    }),
);

// ---------------------------------------------------------------------------
// 基础设施
// ---------------------------------------------------------------------------
function tempDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `d35b-ui-${tag}-`));
  tempDirs.push(dir);
  return dir;
}

function readSource(name) {
  const p = path.join(PROJECT_ROOT, name);
  assert.ok(fs.existsSync(p), `[D3-5B required-gate] 冻结的 UI 文件缺失：${p}（required gate 非零阻断）`);
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(src.length > 0, `${name} 不得为空`);
  return { path: p, src };
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

async function assertPortClosed(port) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', resolve);
    });
  } finally {
    if (probe.listening) await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  }
}

async function startServer({ profile, dataDir }) {
  assert.ok(fs.existsSync(SERVER_ENTRY), `[D3-5B required-gate] 服务入口缺失：${SERVER_ENTRY}`);
  const args = [SERVER_ENTRY];
  if (typeof profile === 'string' && profile.length > 0) args.push('--profile', profile);
  args.push('--data-dir', dataDir, '--port', '0', '--writable', 'true', '--inspect-mind', 'true');
  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  let out = '';
  let err = '';
  let exited = null;
  let stopPromise = null;
  let stoppedStatus = null;
  let resolveStoppedStatus;
  const stoppedStatusPromise = new Promise((resolve) => { resolveStoppedStatus = resolve; });
  child.stdout.on('data', (d) => {
    out += String(d);
    for (const line of out.split(/\r?\n/)) {
      try {
        const message = JSON.parse(line);
        if (message.status === 'stopped') {
          stoppedStatus = message;
          resolveStoppedStatus(message);
          break;
        }
      } catch { /* stdout may contain a partial JSON line */ }
    }
  });
  child.stderr.on('data', (d) => {
    err += String(d);
  });
  let resolveExit;
  const exitPromise = new Promise((resolve) => { resolveExit = resolve; });
  child.on('exit', (code, signal) => {
    exited = { code, signal };
    children.delete(child);
    resolveExit(exited);
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
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    throw new Error(
      `[D3-5B required-gate] 服务未启动或未打印随机端口（profile=${profile}）。exit=${JSON.stringify(exited)}；` +
        `stdout 尾=${JSON.stringify(out.slice(-600))}；stderr 尾=${JSON.stringify(err.slice(-600))}`,
    );
  }
  const base = `http://127.0.0.1:${port}`;
  const readyDeadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    try {
      const res = await fetch(`${base}/${ENCOUNTER_HTML}`, { method: 'GET' });
      if (res.status > 0) {
        ready = true;
        break;
      }
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!ready) {
    throw new Error(
      `[D3-5B required-gate] 服务已打印端口 ${port} 但 HTTP 未就绪。stderr 尾=${JSON.stringify(err.slice(-600))}`,
    );
  }
  return {
    child,
    port,
    base,
    dataDir,
    stdout: () => out,
    stderr: () => err,
    stop() {
      if (!stopPromise) {
        stopPromise = (async () => {
          let timer;
          try {
            child.stdin.write('quit\n');
            child.stdin.end();
            const exitedCleanly = Promise.all([stoppedStatusPromise, exitPromise]).then(([status, result]) => {
              assert.equal(status.status, 'stopped', 'runtime CLI 必须确认原生停机');
              assert.deepEqual(result, { code: 0, signal: null }, 'runtime CLI 必须以 exit 0 关闭');
              return result;
            });
            return await Promise.race([
              exitedCleanly,
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('[D3-5B required-gate] runtime server did not report stopped and exit within 15s')), 15_000);
              }),
            ]);
          } catch (error) {
            if (!exited) {
              try { child.kill(); } catch { /* failure cleanup only */ }
            }
            throw error;
          } finally { clearTimeout(timer); }
        })();
      }
      return stopPromise;
    },
  };
}

async function fetchRaw(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
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

function receipt3(body) {
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

// ---------------------------------------------------------------------------
// 静态源检查工具
// ---------------------------------------------------------------------------
/** 找出源码里所有构造请求体的区域（JSON.stringify 附近的窗口） */
function requestBodyWindows(src, windowSize = 700) {
  const windows = [];
  const re = /JSON\.stringify\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = Math.max(0, m.index - windowSize);
    const end = Math.min(src.length, m.index + windowSize);
    windows.push({ index: m.index, text: src.slice(start, end) });
  }
  return windows;
}

function lineOfIndex(src, index) {
  return src.slice(0, index).split('\n').length;
}

const FORBIDDEN_SUBMIT_FIELDS = ['health', 'damage', 'winner', 'wolfHealth', 'wolfCount', 'elapsedTicks', 'elapsed'];

// ===========================================================================
// G8(ui) 1 —— 静态资源、CSP、allowlist、外部加载
// ===========================================================================
test('G8-ui 静态资源：/runtime-encounter.html 新 profile 200、外部 CSS/JS、CSP 禁 inline', { timeout: GATE_TIMEOUT_MS }, async () => {
  const dataDir = tempDir('ui-static');
  const server = await startServer({ profile: PROFILE, dataDir });
  try {
    const base = server.base;
    const page = await fetchRaw(`${base}/${ENCOUNTER_HTML}`);
    assert.equal(page.status, 200, `GET /${ENCOUNTER_HTML} 必须 200，实际 ${page.status}`);
    assert.match(page.text, /<html[\s>]/i, '必须返回 HTML 文档');
    assert.ok(page.text.trim().length > 0, '页面不得为空');

    // 外部 CSS/JS 加载（allowlist 内的独立资源）
    assert.match(
      page.text,
      new RegExp(`<script[^>]+src=["'][^"']*${ENCOUNTER_JS.replace('.', '\\.')}`),
      `页面必须通过外部 <script src> 加载 ${ENCOUNTER_JS}`,
    );
    assert.match(
      page.text,
      new RegExp(`<link[^>]+href=["'][^"']*${ENCOUNTER_CSS.replace('.', '\\.')}`),
      `页面必须通过外部 <link> 加载 ${ENCOUNTER_CSS}`,
    );

    // CSP 不含 inline：页面内不得有内联脚本体 / 内联样式 / 内联事件处理器
    const inlineScripts = [...page.text.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter(
      (m) => m[1].trim().length > 0,
    );
    assert.equal(
      inlineScripts.length,
      0,
      `CSP 禁 inline：页面不得含内联 <script> 代码体，实际 ${inlineScripts.length} 处`,
    );
    assert.equal(
      /<style[\s>]/i.test(page.text),
      false,
      'CSP 禁 inline：页面不得含内联 <style> 块',
    );
    assert.equal(
      /\sstyle=["']/i.test(page.text),
      false,
      'CSP 禁 inline：页面不得含 style="..." 内联样式',
    );
    const onHandlers = [...page.text.matchAll(/\son[a-z]+\s*=\s*["']/gi)].map((m) => m[0]);
    assert.equal(onHandlers.length, 0, `CSP 禁 inline：页面不得含内联事件处理器，实际 ${JSON.stringify(onHandlers)}`);

    // CSP 响应头：必须存在且不含 unsafe-inline / unsafe-eval
    const csp =
      page.headers.get('content-security-policy') || page.headers.get('content-security-policy-report-only') || '';
    assert.ok(csp.length > 0, 'G8：新页面必须带 CSP 响应头');
    assert.equal(/unsafe-inline/i.test(csp), false, `CSP 不得含 unsafe-inline：${csp}`);
    assert.equal(/unsafe-eval/i.test(csp), false, `CSP 不得含 unsafe-eval：${csp}`);

    // 独立资源可经 allowlist 提供
    for (const asset of [ENCOUNTER_JS, ENCOUNTER_CSS]) {
      const res = await fetchRaw(`${base}/${asset}`);
      assert.equal(res.status, 200, `G8：allowlist 资源 /${asset} 必须 200，实际 ${res.status}`);
      assert.ok(res.text.length > 0, `/${asset} 不得为空`);
    }
    const jsType = (await fetchRaw(`${base}/${ENCOUNTER_JS}`)).headers.get('content-type') || '';
    assert.match(jsType, /javascript|ecmascript/i, `/${ENCOUNTER_JS} content-type 必须是 JS，实际 ${jsType}`);

    // 旧私档不得经 allowlist 提供（非白名单探测路径必须 404）
    for (const probe of ['worldrpg.mjs', 'runtime-inv.mjs', 'runtime-state.mjs', 'inv.mjs', 'state.mjs', 'runtime-worldrpg.html']) {
      const res = await fetchRaw(`${base}/${probe}`);
      assert.equal(res.status, 404, `G8：非白名单旧私档 /${probe} 必须 404，实际 ${res.status}`);
    }

    // 只读消费面与 service 投影对齐
    const proj = await fetchRaw(`${base}${ENCOUNTER_PATH}`);
    assert.equal(proj.status, 200, 'G8：UI 依赖的 /api/runtime/encounter 必须 200');
    const v = JSON.parse(proj.text);
    assert.equal(v.actorId, 'actor-4');
    assert.equal(typeof v.revision, 'number');
    assert.equal(typeof v.tick, 'number');
    assert.ok(v.self && 'health' in v.self && 'alive' in v.self, 'projection.self 必须含 health/alive');
    assert.ok(v.population && 'totalLivingWolves' in v.population, 'projection.population 必须含狼账');
    assert.ok(v.actions && typeof v.actions === 'object', 'projection.actions 必须存在');

    console.log(
      '[D3-5B evidence][ui] ' +
        JSON.stringify({
          gate: 'G8-ui-static',
          pid: server.child.pid,
          port: server.port,
          url: base,
          profile: PROFILE,
          dataDir,
          pageStatus: page.status,
          csp,
          jsType,
        }),
    );
  } finally {
    await server.stop();
  }
});

test('G8-ui 静态资源：旧 profile 对 /runtime-encounter.html 返回 404', { timeout: GATE_TIMEOUT_MS }, async () => {
  const dataDir = tempDir(`ui-legacy-${LEGACY_PROFILE}`);
  const server = await startServer({ profile: LEGACY_PROFILE, dataDir });
  server.legacyProfile = LEGACY_PROFILE;
  try {
    const res = await fetchRaw(`${server.base}/${ENCOUNTER_HTML}`);
    assert.equal(
      res.status,
      404,
      `D3-5A：/${ENCOUNTER_HTML} 只用于新 profile，旧 profile 必须 404，实际 ${res.status}`,
    );
    const js = await fetchRaw(`${server.base}/${ENCOUNTER_JS}`);
    assert.equal(js.status, 404, `D3-5A：旧 profile 不得提供 /${ENCOUNTER_JS}，实际 ${js.status}`);
    console.log(
      '[D3-5B evidence][ui] ' +
        JSON.stringify({
          gate: 'G8-ui-legacy-isolation',
          pid: server.child.pid,
          port: server.port,
          url: server.base,
          dataDir: server.dataDir,
          legacyProfile: server.legacyProfile,
          pageStatus: res.status,
          jsStatus: js.status,
        }),
    );
  } finally {
    await server.stop();
  }
});

// ===========================================================================
// G8(ui) 2 —— 源级消费者约束（不提交权威字段、无旧私档/模型桥、退出只导航）
// ===========================================================================
test('G8-ui 源级约束：新页面无旧私档/模型桥依赖，UI 不提交 health/damage/winner/狼数/elapsed', { timeout: GATE_TIMEOUT_MS }, () => {
  const page = readSource(ENCOUNTER_HTML);
  const js = readSource(ENCOUNTER_JS);
  const css = readSource(ENCOUNTER_CSS);
  const mapJs = readSource(MAP_JS);
  const mapPage = readSource(MAP_HTML);

  for (const { path: p, src } of [page, js, css]) {
    for (const forbidden of ['WorldRPG', 'worldrpg', 'runtime-inv', 'runtime-state']) {
      assert.equal(
        src.includes(forbidden),
        false,
        `G8：UI 不得依赖旧私档 ${forbidden}（命中 ${path.relative(PROJECT_ROOT, p)}）`,
      );
    }
  }
  // model / bridge 请求不得出现在新页面
  for (const forbidden of ['/api/model', '/api/bridge', 'model-runtime', 'bridge-runtime', 'laya', 'cuda']) {
    assert.equal(
      js.src.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `G8：新页面不得调用 model/bridge（命中 ${forbidden}）`,
    );
  }
  // 不得把浏览器本地存档当权威
  for (const store of ['localStorage', 'indexedDB', 'document.cookie']) {
    assert.equal(
      js.src.includes(store),
      false,
      `G8：UI 不得把浏览器本地存档当权威（命中 ${store}）`,
    );
  }

  // 请求体不得提交 health/damage/winner/狼数/elapsed
  const windows = requestBodyWindows(js.src);
  assert.ok(windows.length > 0, 'G8：新页面必须真实构造并提交 DTO3 请求体');
  for (const w of windows) {
    for (const field of FORBIDDEN_SUBMIT_FIELDS) {
      const re = new RegExp(`(^|[{,\\s"'])${field}\\s*:`, 'm');
      assert.equal(
        re.test(w.text),
        false,
        `G8：UI 不得提交 ${field}（第 ${lineOfIndex(js.src, w.index)} 行附近的请求体构造）`,
      );
    }
  }

  // 提交的 DTO3 形状：version/commandId/expectedRevision/type/payload
  for (const key of ['commandId', 'expectedRevision', 'version', 'payload']) {
    assert.ok(js.src.includes(key), `G8：UI 必须构造完整 DTO3 字段 ${key}`);
  }
  // payload 只允许合同冻结的键
  for (const allowed of ['encounterId', 'action']) {
    assert.ok(js.src.includes(allowed), `G8：UI 必须只发合同 payload 键 ${allowed}`);
  }

  // 只读投影消费：显示值必须来自 service 投影字段
  for (const readField of ['wolfHealth', 'elapsedTicks']) {
    assert.ok(
      new RegExp(`\\.${readField}\\b`).test(js.src),
      `G8：UI 必须从 service 投影读取 ${readField}（而不是本地推算）`,
    );
  }
  assert.ok(/\.self\.(health|alive)\b|self\?\.\s*(health|alive)/.test(js.src), 'G8：UI 必须读取投影 self.health/alive');

  // 无本地战斗数学（不得在 UI 里写 150/80/300 的伤害或 HP 常量做裁决）
  const combatMath = [...js.src.matchAll(/(?:wolfHealth|playerHealth|health)\s*[-+*/]=?\s*\d+/g)].map((m) => m[0]);
  assert.equal(
    combatMath.length,
    0,
    `G8：UI 不得在本地做战斗/生命数学裁决，实际 ${JSON.stringify(combatMath)}`,
  );

  // 冲突/断连处理：真实 409 / REVISION_CONFLICT 分支必须存在
  assert.ok(
    /409|REVISION_CONFLICT/.test(js.src),
    'G8：UI 必须处理真实 revision 冲突（409 / REVISION_CONFLICT）',
  );
  // active pending 续跑：同 ID 重试机制必须存在
  assert.ok(
    /pending|retry|重试/i.test(js.src),
    'G8：UI 必须保留 active pending 并在刷新/重开后同 ID 重试',
  );
  // 遭遇页负责呈现世界操作暂停；地图页负责实际禁用世界按钮并显示原因。
  assert.match(js.src, /nodes\[['"]world-action-block['"]\]\.hidden\s*=\s*!active/,
    'G8：遭遇页必须在 ACTIVE 时显示世界操作暂停说明');
  const mapControls = mapJs.src.match(/function controls\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.ok(mapControls, 'G8：地图页必须集中刷新世界操作控件状态');
  assert.match(mapControls, /lastEncounter\?\.encounter\?\.status\s*===\s*['"]active['"]/,
    'G8：地图控件必须依据权威遭遇投影判断 ACTIVE');
  assert.match(mapControls, /advance\.disabled\s*=[^;]*encounterActive/,
    'G8：ACTIVE 时地图必须禁用推进时间');
  assert.match(mapControls, /for\(const id of actionControls\)byId\(id\)\.disabled\s*=[^;]*encounterActive/,
    'G8：ACTIVE 时地图必须禁用旅行、休整与交易控件');
  assert.match(mapControls, /byId\(['"]encounter-block-note['"]\)\.hidden\s*=\s*!encounterActive/,
    'G8：地图必须在 ACTIVE 时显示世界操作暂停原因');
  assert.match(mapControls, /if\(encounterActive\)byId\(['"]encounter-block-note['"]\)\.textContent=[^;]*旅行、休整、交易和世界时间操作已暂停/,
    'G8：地图暂停说明必须指出受限的世界操作');

  // 入口锚点属于 HTML；map JS 通过稳定 DOM ID 按当前 forest 状态显隐它。
  assert.match(mapPage.src, /<a\b(?=[^>]*\bid=["']forest-scene-link["'])(?=[^>]*\bhref=["']\/runtime-encounter\.html["'])[^>]*>/i,
    'G8：runtime-map.html 必须声明 #forest-scene-link 指向 /runtime-encounter.html');
  assert.match(mapJs.src, /byId\(["']forest-scene-link["']\)/,
    'G8：runtime-map.mjs 必须通过 #forest-scene-link DOM ID 控制入口');
  assert.match(mapJs.src, /inForest\s*=\s*player\?\.self\?\.identity\?\.location\s*===\s*["']forest["']/,
    'G8：森林入口必须依据权威玩家地点判断可见性');
  assert.match(mapJs.src, /sceneLink\.hidden\s*=\s*!inForest/,
    'G8：map JS 必须在不位于森林时隐藏森林入口');

  // 返回地图只使用 HTML 导航锚点；不加 inline handler，也无 scene-exit 专属 cancel 处理。
  const exitAnchor = page.src.match(/<a\b(?=[^>]*\bid=["']scene-exit["'])(?=[^>]*\bhref=["']\/runtime-map\.html["'])[^>]*>/i);
  assert.ok(exitAnchor, 'G8：场景返回必须是指向 /runtime-map.html 的 #scene-exit 锚点');
  assert.equal(/\bon[a-z]+\s*=/.test(exitAnchor[0]), false, 'G8：返回锚点不得含 inline 操作处理器');
  assert.equal(/(?:scene-exit|#scene-exit)[\s\S]{0,300}EncounterCancel/.test(js.src), false,
    'G8：场景返回处理不得发送 EncounterCancel');
  // runtime-map 必须在 forest 提供入口
  assert.ok(
    /forest/.test(mapJs.src),
    'G8：runtime-map 必须在 forest 地点提供进入森林场景的入口',
  );
  // 地图页面同样不得依赖旧私档
  for (const forbidden of ['WorldRPG', 'runtime-inv', 'runtime-state']) {
    assert.equal(
      mapJs.src.includes(forbidden),
      false,
      `G8：runtime-map 不得依赖旧私档 ${forbidden}`,
    );
  }

  console.log(
    '[D3-5B evidence][ui] ' +
      JSON.stringify({
        gate: 'G8-ui-source-constraints',
        pid: null,
        port: null,
        dataDir: null,
        files: [ENCOUNTER_HTML, ENCOUNTER_JS, ENCOUNTER_CSS, MAP_JS].map((f) => ({
          file: f,
          bytes: fs.statSync(path.join(PROJECT_ROOT, f)).size,
        })),
        requestBodyWindows: windows.length,
      }),
  );
});

// ===========================================================================
// G8(ui) 3 —— UI 提交面与 service receipt 对齐（真实 HTTP 消费）
// ===========================================================================
test('G8-ui 提交面：UI 的 DTO3 形状经真实服务往返，投影与 receipt 对齐且只读查询不写历史', { timeout: GATE_TIMEOUT_MS }, async () => {
  const dataDir = tempDir('ui-roundtrip');
  const server = await startServer({ profile: PROFILE, dataDir });
  try {
    const base = server.base;
    const js = readSource(ENCOUNTER_JS);

    assert.ok(js.src.includes(COMMIT_PATH), `G8：UI 必须使用冻结的提交路由 ${COMMIT_PATH}`);
    const capabilities = await fetchRaw(`${base}${CAPABILITY_PATH}`);
    assert.equal(capabilities.status, 200, `GET ${CAPABILITY_PATH} 必须 200`);
    const capabilityView = JSON.parse(capabilities.text);
    assert.equal(capabilityView.commandDtoVersion, 3, 'G8：固定 capabilities 必须声明 DTO3');
    assert.equal(capabilityView.encounterAvailable, true, 'G8：固定 capabilities 必须启用遭遇投影');

    // 只读查询不写历史
    const p1 = await fetchRaw(`${base}${ENCOUNTER_PATH}`);
    const p2 = await fetchRaw(`${base}${ENCOUNTER_PATH}`);
    assert.equal(p1.status, 200);
    assert.equal(p1.text, p2.text, 'G8：连续只读查询必须返回同一投影（不写历史、不推进 revision）');
    const v1 = JSON.parse(p1.text);
    assert.equal(typeof v1.revision, 'number');

    // 真实往返：Begin -> 攻击，投影必须与 receipt 对齐
    const commitEp = COMMIT_PATH;
    const commands = [];
    const receipts = [];
    const post = async (body) => {
      commands.push(body);
      const res = await fetch(`${base}${commitEp}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text.length ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json };
    };
    const receiptOf = receipt3;

    const rev0 = v1.revision;
    if (v1.self.location !== 'forest') {
      const tr = await post({
        version: 3,
        commandId: 'd35b-ui-travel',
        expectedRevision: rev0,
        type: 'PlayerTravel',
        payload: { destination: 'forest' },
      });
      const rec = receiptOf(tr.json);
      assert.ok(rec, `UI 往返：PlayerTravel 必须有 receipt，status=${tr.status} body=${JSON.stringify(tr.json).slice(0, 300)}`);
      assert.equal(rec.outcome, 'succeeded');
      receipts.push(rec);
    }
    const vMid = JSON.parse((await fetchRaw(`${base}${ENCOUNTER_PATH}`)).text);
    const begin = await post({
      version: 3,
      commandId: 'd35b-ui-begin',
      expectedRevision: vMid.revision,
      type: 'EncounterBegin',
      payload: {},
    });
    const beginRec = receiptOf(begin.json);
    assert.ok(beginRec, `UI 往返：EncounterBegin 必须有 receipt，status=${begin.status}`);
    assert.equal(beginRec.outcome, 'succeeded');
    assert.equal(beginRec.durationTicks, 0);
    receipts.push(beginRec);

    const vAfterBegin = JSON.parse((await fetchRaw(`${base}${ENCOUNTER_PATH}`)).text);
    assert.equal(
      vAfterBegin.revision,
      beginRec.toRevision,
      'G8：投影 revision 必须等于 receipt.toRevision（UI 读到的就是 service 结论）',
    );
    assert.equal(vAfterBegin.tick, beginRec.tick, 'G8：投影 tick 必须等于 receipt.tick');
    assert.equal(
      vAfterBegin.encounter.wolfHealth,
      beginRec.result.after.wolfHealth,
      'G8：投影 wolfHealth 必须等于 receipt.result.after.wolfHealth（UI 不得本地推算）',
    );
    assert.equal(vAfterBegin.population.reservedWolves, beginRec.result.after.reservedWolves, 'G8：population.reservedWolves 与 receipt 对齐；完整 encounter 投影不应复制预留字段');

    const attack = await post({
      version: 3,
      commandId: 'd35b-ui-attack',
      expectedRevision: vAfterBegin.revision,
      type: 'EncounterAction',
      payload: { encounterId: vAfterBegin.encounter.encounterId, action: 'attack' },
    });
    const attackRec = receiptOf(attack.json);
    assert.ok(attackRec, `UI 往返：EncounterAction 必须有 receipt，status=${attack.status}`);
    assert.equal(attackRec.outcome, 'succeeded');
    assert.equal(attackRec.durationTicks, 6, 'UI 往返：攻击 6 tick');
    receipts.push(attackRec);
    const vAfterAttack = JSON.parse((await fetchRaw(`${base}${ENCOUNTER_PATH}`)).text);
    assert.equal(vAfterAttack.self.health, attackRec.result.after.playerHealth, 'G8：self.health 与 receipt 对齐');
    assert.equal(
      vAfterAttack.encounter.wolfHealth,
      attackRec.result.after.wolfHealth,
      'G8：wolfHealth 与 receipt 对齐',
    );
    assert.equal(
      vAfterAttack.encounter.elapsedTicks,
      attackRec.result.after.tick - attackRec.result.before.tick + vAfterBegin.encounter.elapsedTicks,
      'G8：elapsedTicks 由 service 结论导出（UI 只读）',
    );
    assert.equal(
      vAfterAttack.population.totalLivingWolves,
      attackRec.result.after.totalLivingWolves,
      'G8：狼账与 receipt 对齐',
    );
    assert.equal(vAfterAttack.population.battleDeaths, attackRec.result.after.battleDeaths);

    console.log(
      '[D3-5B evidence][ui] ' +
        JSON.stringify({
          gate: 'G8-ui-roundtrip',
          pid: server.child.pid,
          port: server.port,
          url: base,
          profile: PROFILE,
          dataDir,
          endpoints: [CAPABILITY_PATH, ENCOUNTER_PATH, COMMIT_PATH],
          commitEndpoint: commitEp,
          commands,
          receipts,
          projectionBeforeCommands: v1,
          projectionAfterAttack: vAfterAttack,
          beginToRevision: beginRec.toRevision,
          attackToRevision: attackRec.toRevision,
          projectedRevision: vAfterAttack.revision,
        }),
    );
  } finally {
    await server.stop();
  }
});

// ===========================================================================
// G8(ui) 4 —— 真实浏览器：地图 -> 森林场景 -> 遭遇 -> 回传（required gate，无 skip）
// ===========================================================================
const ACTION_WORD = /进入森林|森林场景|进入遭遇|遭遇|攻击|逃跑|取消|开始|森林|前往|旅行/;

function attachBrowserEvidence(page, bucket, phase) {
  page.on('pageerror', (e) => bucket.pageErrors.push({ phase, text: String(e && e.message ? e.message : e) }));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      bucket.consoleMessages.push({ phase, type: m.type(), text: m.text(), url: m.location().url });
  });
  page.on('request', (r) => {
    const evidence = { phase, method: r.method(), url: r.url(), postData: r.postData() };
    bucket.requests.push(evidence);
    if (!['GET', 'HEAD'].includes(r.method())) {
      bucket.writes.push(evidence);
    }
  });
  page.on('response', (r) => bucket.responses.push({
    phase, status: r.status(), url: r.url(), method: r.request().method(), postData: r.request().postData(),
  }));
  page.on('requestfailed', (r) => bucket.requestFailures.push({
    phase, method: r.method(), url: r.url(), postData: r.postData(), error: r.failure()?.errorText ?? '',
  }));
}

function injectedBrowserConsoleEvent(message, bucket) {
  if (message.type !== 'error') return false;
  return bucket.injectedEvents.some((event) => {
    if (event.phase !== message.phase || event.url !== message.url || event.count !== 1) return false;
    if (event.kind === 'http-409') {
      const commandRequests = bucket.requests.filter((request) =>
        request.phase === event.phase && request.method === 'POST' && request.url === event.url);
      const commandDtos = commandRequests.map((request) => {
        try { return JSON.parse(request.postData); } catch { return null; }
      });
      const expectedIds = [...event.commandIds].sort();
      const actualIds = commandDtos.map((dto) => dto?.commandId).sort();
      const commandResponses = bucket.responses.filter((response) =>
        response.phase === event.phase && response.method === 'POST' && response.url === event.url);
      const loserRequest = commandRequests.find((request) => {
        try { return JSON.parse(request.postData).commandId === event.commandId; } catch { return false; }
      });
      const loserResponseCount = commandResponses.filter((response) =>
        response.status === 409 && response.postData === loserRequest?.postData).length;
      const successfulResponseCount = commandResponses.filter((response) => response.status === 200).length;
      return event.commandIds.length === 2 && new Set(event.commandIds).size === 2 &&
        commandRequests.length === event.expectedWriteCount &&
        JSON.stringify(actualIds) === JSON.stringify(expectedIds) &&
        commandDtos.every((dto) => dto?.expectedRevision === event.expectedRevision &&
          dto.type === 'EncounterBegin' && dto.payload && Object.keys(dto.payload).length === 0) &&
        commandResponses.length === event.responseCount && loserResponseCount === event.count &&
        successfulResponseCount === 1 && event.errorCode === 'REVISION_CONFLICT' &&
        event.currentRevision === event.expectedRevision + 1 && /409 \(Conflict\)/.test(message.text);
    }
    const commandRequests = bucket.requests.filter((request) => {
      if (request.method !== 'POST' || request.url !== event.url) return false;
      try { return JSON.parse(request.postData).commandId === event.commandId; } catch { return false; }
    });
    const expectedRequestCount = event.kind === 'committed-response-abort' ? event.count + event.retryCount : event.count;
    if (commandRequests.length !== expectedRequestCount ||
      commandRequests.some((request) => request.postData !== commandRequests[0]?.postData)) return false;
    if (event.kind === 'committed-response-abort') {
      const failures = bucket.requestFailures.filter((failure) => failure.error === 'net::ERR_FAILED' &&
        failure.url === event.url && failure.method === 'POST' && failure.postData === commandRequests[0].postData);
      const retries = bucket.responses.filter((response) => response.status === 200 && response.url === event.url &&
        response.method === 'POST' && response.postData === commandRequests[0].postData);
      const originalDto = JSON.parse(commandRequests[0].postData);
      return event.committedStatus === 200 && event.retryCommandId === event.commandId && event.retryCount === 1 &&
        originalDto.commandId === event.commandId && originalDto.expectedRevision === event.expectedRevision &&
        event.requestCount === commandRequests.length && event.failureCount === failures.length &&
        event.responseCount === retries.length && failures.length === event.count && retries.length === event.retryCount &&
        /net::ERR_FAILED/.test(message.text);
    }
    return false;
  });
}

function unexpectedBrowserRequestFailures(bucket) {
  return bucket.requestFailures.filter((failure) => !bucket.injectedEvents.some((event) =>
    event.kind === 'committed-response-abort' && event.phase === failure.phase && event.url === failure.url &&
    event.commandId === (() => { try { return JSON.parse(failure.postData).commandId; } catch { return null; } })() &&
    event.committedStatus === 200 && event.retryCommandId === event.commandId && event.retryCount === 1 &&
    failure.method === 'POST' && failure.error === 'net::ERR_FAILED' && event.count === 1 &&
    bucket.requests.filter((request) => request.method === 'POST' && request.url === event.url &&
      (() => { try { return JSON.parse(request.postData).commandId === event.commandId; } catch { return false; } })()).length === 2 &&
    bucket.responses.filter((response) => response.status === 200 && response.url === event.url &&
      response.method === 'POST' && response.postData === failure.postData).length === 1));
}

const ALLOWED_DTO3_KEYS = ['version', 'commandId', 'expectedRevision', 'type', 'payload'];
// D3-5A 冻结的 DTO3 payload 键（按命令分派，见合同命令集）
const ALLOWED_PAYLOAD_KEYS = ['ticks', 'destination', 'product', 'quantity', 'encounterId', 'action'];

/** 校验 UI 真实提交的请求体：必须是 DTO3，且不得携带任何权威结果字段 */
function assertLegalDto3Write(write, label) {
  assert.ok(
    write.postData,
    `G8：UI 写请求必须携带 JSON 请求体（${label} ${write.method} ${write.url}）`,
  );
  let body = null;
  try {
    body = JSON.parse(write.postData);
  } catch (e) {
    assert.fail(`G8：UI 写请求体必须是合法 JSON（${label}）：${write.postData.slice(0, 200)}`);
  }
  assert.deepEqual(
    Object.keys(body).sort(),
    [...ALLOWED_DTO3_KEYS].sort(),
    `G8：UI 只能提交 DTO3 的 ${ALLOWED_DTO3_KEYS.join('/')}，实际 ${JSON.stringify(Object.keys(body))}`,
  );
  assert.equal(body.version, 3, 'G8：UI 提交必须是 DTO3（version 3）');
  assert.equal(typeof body.commandId, 'string');
  assert.ok(body.commandId.length > 0, 'G8：UI 必须携带真实 commandId');
  assert.equal(typeof body.expectedRevision, 'number');
  assert.equal(typeof body.type, 'string');
  assert.ok(body.payload && typeof body.payload === 'object', 'G8：DTO3 payload 必须是对象');
  for (const key of Object.keys(body.payload)) {
    assert.ok(
      ALLOWED_PAYLOAD_KEYS.includes(key),
      `G8：UI 不得提交合同未冻结的 payload 键 ${key}（允许 ${ALLOWED_PAYLOAD_KEYS.join('/')}）`,
    );
  }
  for (const forbidden of FORBIDDEN_SUBMIT_FIELDS) {
    assert.equal(
      Object.hasOwn(body, forbidden) || Object.hasOwn(body.payload, forbidden),
      false,
      `G8：UI 不得提交权威结果字段 ${forbidden}`,
    );
  }
}

async function enabledControlLabels(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], input[type="submit"], a[href]')];
    return nodes.map((el) => {
      const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
      return {
        tag: el.tagName,
        id: el.id || null,
        label: String(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 60),
        href: el.getAttribute('href') || null,
        disabled,
      };
    });
  });
}

/** 在页面里点击一个匹配的可用控件；点击前把同表单的输入填成合同允许的合法值 */
async function clickMatching(page, predicate, clickedKeys, options = {}) {
  const allowAnchors = options.allowAnchors !== false;
  return page.evaluate(
    ({ predSource, seen, allowAnchors }) => {
      const pred = new RegExp(predSource);
      const seenSet = new Set(seen);
      const nodes = [...document.querySelectorAll('button, [role="button"], input[type="submit"], a[href]')].filter(
        (el) => allowAnchors || el.tagName !== 'A',
      );
      const fillForm = (el) => {
        const form = el.form || el.closest('form');
        if (!form) return;
        for (const field of form.querySelectorAll('input, select, textarea')) {
          if (field === el || field.disabled) continue;
          const name = `${field.name || ''} ${field.id || ''} ${field.getAttribute('aria-label') || ''}`.toLowerCase();
          let value = '1';
          if (/forest|森林|destination|destination|地点|目的地/.test(name)) value = 'forest';
          if (field.tagName === 'SELECT') {
            const opt = [...field.options].find((o) => /forest|森林/i.test(o.value + o.textContent)) || field.options[0];
            if (opt) value = opt.value;
          }
          if (/ticks|tick|时长|时间/.test(name)) value = '1';
          if (field.type === 'number' && !/ticks|tick|时长|时间/.test(name)) value = '1';
          if (field.type === 'checkbox' || field.type === 'radio') continue;
          if (!value) continue;
          field.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      for (const el of nodes) {
        const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
        if (disabled) continue;
        const label = String(el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        if (!label || !pred.test(label)) continue;
        if (seenSet.has(label)) continue;
        fillForm(el);
        el.click();
        return { tag: el.tagName, id: el.id || null, label: label.slice(0, 60), href: el.getAttribute('href') || null };
      }
      return null;
    },
    { predSource: predicate.source, seen: [...clickedKeys], allowAnchors },
  );
}

test('G8-ui 真实浏览器：地图旅行到森林、Begin 丢响应重试、退出/刷新/同目录重开后继续 attack', { timeout: GATE_TIMEOUT_MS }, async () => {
  const chromium = requireBrowserDriver();
  const dataDir = tempDir('ui-browser');
  let server = await startServer({ profile: PROFILE, dataDir });
  const browser = await chromium.launch({ executablePath: BROWSER_EXECUTABLE, headless: true });
  const bucket = { requests: [], writes: [], responses: [], pageErrors: [], consoleMessages: [], requestFailures: [], injectedEvents: [] };
  let evidenceLogged = false;
  let page = null;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    attachBrowserEvidence(page, bucket, 'map-travel-begin-reopen-attack');
    await page.goto(`${server.base}/${MAP_HTML}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const mapHtml = readSource(MAP_HTML).src;
    assert.match(mapHtml, /<a\b[^>]*href=["']\/runtime-encounter\.html["'][^>]*>/,
      'runtime-map.html 必须保留真实森林场景 href');
    assert.deepEqual(bucket.writes, [], '地图首屏读取必须只读');
    const beforeTravel = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(beforeTravel.self.location, 'village');
    assert.equal(beforeTravel.actions.canBegin, false, '默认 village 不允许 Begin');
    assert.equal(beforeTravel.population.reservedWolves, 0);

    // 只点地图的真实旅行表单：显式选择 forest，再点旅行按钮并等权威投影变更。
    await page.locator('#travel-destination').selectOption('forest');
    const travelResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      try {
        const dto = request.postDataJSON();
        return response.url() === new URL(COMMIT_PATH, server.base).href && request.method() === 'POST' &&
          dto.type === 'PlayerTravel' && dto.payload?.destination === 'forest';
      } catch { return false; }
    }, { timeout: 15_000 });
    await page.locator('#travel-submit').click();
    const travelResponse = await travelResponsePromise;
    assert.equal(travelResponse.status(), 200, '地图旅行必须收到真实服务响应');
    const travelReceipt = receipt3(JSON.parse(await travelResponse.text()));
    assert.ok(travelReceipt, '地图旅行必须返回 DTO3 receipt');
    assert.equal(travelReceipt.type, 'PlayerTravel');
    assert.equal(travelReceipt.outcome, 'succeeded');
    assert.equal(travelReceipt.fromTick, 0);
    assert.equal(travelReceipt.tick, 12);
    assert.equal(travelReceipt.toRevision, travelReceipt.fromRevision + 12);
    await page.waitForFunction((revision) => {
      const player = document.querySelector('#player-panel');
      const sceneLink = document.querySelector('#forest-scene-link');
      return document.documentElement.dataset.revision === String(revision) &&
        player?.dataset.revision === String(revision) && sceneLink?.hidden === false;
    }, travelReceipt.toRevision, { timeout: 15_000 });
    const afterTravel = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(afterTravel.self.location, 'forest');
    assert.equal(afterTravel.actions.canBegin, true);
    assert.equal(afterTravel.revision, travelReceipt.toRevision);
    assert.equal(afterTravel.tick, travelReceipt.tick);
    assert.equal(afterTravel.population.reservedWolves, 0);
    assert.ok(bucket.writes.some((write) => {
      try { const sent = JSON.parse(write.postData); return sent.type === 'PlayerTravel' && sent.payload.destination === 'forest'; }
      catch { return false; }
    }), '地图必须真实提交 PlayerTravel(destination=forest)');
    for (const write of bucket.writes) assertLegalDto3Write(write, '地图旅行');

    // 通过 href 导航进入场景，不直接 goto 遭遇页兜底。
    const sceneLink = page.locator('#forest-scene-link');
    await sceneLink.waitFor({ state: 'visible' });
    assert.equal(await sceneLink.getAttribute('href'), `/${ENCOUNTER_HTML}`);
    await sceneLink.click();
    await page.waitForURL(`**/${ENCOUNTER_HTML}`);
    await page.waitForTimeout(250);
    const writesAtSceneLoad = bucket.writes.length;
    const projectionAtScene = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(projectionAtScene.population.reservedWolves, 0, '预留数来自 population projection');
    assert.equal(projectionAtScene.encounter, null);
    assert.equal(bucket.writes.length, writesAtSceneLoad, '场景加载只读');
    const sceneText = await page.locator('body').innerText();
    assert.ok(sceneText.includes(String(projectionAtScene.self.health)));
    assert.ok(sceneText.includes(String(projectionAtScene.population.totalLivingWolves)));

    // Begin 在服务端真实提交后丢弃浏览器响应；UI 重试必须发送原 DTO（含原 expectedRevision）。
    let armed = true;
    let lost = null;
    const commitUrl = new URL(COMMIT_PATH, server.base).href;
    await page.route('**/api/runtime/commands', async (route) => {
      const request = route.request();
      let body = null;
      try { body = request.postDataJSON(); } catch { /* malformed requests continue to the service */ }
      if (armed && body?.type === 'EncounterBegin') {
        armed = false;
        const actual = await route.fetch();
        lost = { phase: 'begin-response-lost', url: request.url(), commandId: body.commandId,
          expectedRevision: body.expectedRevision, committedStatus: actual.status() };
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await page.locator('#encounter-begin').click();
    await page.locator('#encounter-retry').waitFor({ state: 'visible', timeout: 15_000 });
    const committedAfterLoss = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(lost?.committedStatus, 200, '注入前必须由真实服务成功 commit');
    assert.equal(committedAfterLoss.encounter?.status, 'active', '丢响应后真实遭遇已 ACTIVE');
    assert.equal(committedAfterLoss.revision, lost.expectedRevision + 1);
    assert.equal(committedAfterLoss.population.reservedWolves, 1);
    const pendingBeforeReload = await page.evaluate(() => JSON.parse(sessionStorage.getItem('narraverse.encounter.pending.v1') ?? 'null'));
    assert.equal(pendingBeforeReload?.commandId, lost.commandId, '原 Begin DTO 必须在刷新前保留');
    assert.equal(pendingBeforeReload?.expectedRevision, lost.expectedRevision);
    const retryResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      try {
        return response.url() === lost.url && response.status() === 200 && request.method() === 'POST' &&
          request.postDataJSON().commandId === lost.commandId;
      } catch { return false; }
    }, { timeout: 15_000 });
    await page.reload({ waitUntil: 'load' });
    const retryResponse = await retryResponsePromise;
    assert.equal(retryResponse.status(), 200, '刷新后同一 commandId 重试必须收到原 receipt');
    await page.waitForFunction(() => sessionStorage.getItem('narraverse.encounter.pending.v1') === null,
      undefined, { timeout: 15_000 });
    const retries = bucket.writes.filter((write) => {
      try { return JSON.parse(write.postData).commandId === lost.commandId; } catch { return false; }
    });
    assert.equal(retries.length, 2, '丢响应后的原 commandId 必须恰好请求两次');
    assert.equal(retries[0].postData, retries[1].postData, '重试必须保留原 canonical DTO 与 expectedRevision');
    const originalDto = JSON.parse(retries[0].postData);
    assert.equal(originalDto.expectedRevision, lost.expectedRevision);
    bucket.injectedEvents.push({ kind: 'committed-response-abort', phase: 'map-travel-begin-reopen-attack',
      url: lost.url, commandId: lost.commandId, expectedRevision: lost.expectedRevision, count: 1,
      committedStatus: lost.committedStatus, retryCommandId: originalDto.commandId, retryCount: 1,
      requestCount: 2, failureCount: 1, responseCount: 1 });

    // 离开场景只导航；返回后遭遇仍 ACTIVE。刷新也只重新读取同一持久状态。
    await page.locator('#scene-exit').click();
    await page.waitForURL(`**/${MAP_HTML}`);
    let active = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(active.encounter?.status, 'active', '退出导航不得隐式 cancel');
    assert.equal(active.population.reservedWolves, 1);
    await page.waitForFunction((revision) => {
      const player = document.querySelector('#player-panel');
      const sceneLink = document.querySelector('#forest-scene-link');
      return document.documentElement.dataset.revision === String(revision) &&
        player?.dataset.revision === String(revision) && sceneLink?.hidden === false;
    }, active.revision, { timeout: 15_000 });
    const worldButtons = ['advance', 'travel-submit', 'rest-submit', 'buy-submit', 'sell-submit'];
    const disabledWorldButtons = await page.evaluate((ids) => Object.fromEntries(ids.map((id) =>
      [id, document.getElementById(id)?.disabled === true])), worldButtons);
    assert.deepEqual(disabledWorldButtons, Object.fromEntries(worldButtons.map((id) => [id, true])),
      '地图 ACTIVE 时必须禁用推进时间、旅行、休整、买入和卖出');
    const blockNote = page.locator('#encounter-block-note');
    assert.equal(await blockNote.isVisible(), true, '地图 ACTIVE 时必须显示暂停原因');
    assert.match(await blockNote.innerText(), /旅行、休整、交易和世界时间操作已暂停/);
    await page.locator('#forest-scene-link').click();
    await page.waitForURL(`**/${ENCOUNTER_HTML}`);
    await page.reload({ waitUntil: 'load' });
    active = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(active.encounter?.status, 'active', '刷新必须恢复同一 ACTIVE encounter');
    assert.equal(active.encounter?.encounterId, committedAfterLoss.encounter.encounterId);
    assert.equal(active.population.reservedWolves, 1);

    // 关闭并重开同一 dataDir；新页面必须读取同一 ACTIVE 遭遇，然后由 UI 发起 attack。
    await page.close();
    page = null;
    const oldPort = server.port;
    const oldExit = await server.stop();
    assert.ok(oldExit.code !== null || oldExit.signal !== null, '旧 runtime server 必须真实退出');
    await assertPortClosed(oldPort);
    server = await startServer({ profile: undefined, dataDir });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    attachBrowserEvidence(page, bucket, 'same-dir-reopen-attack');
    await page.goto(`${server.base}/${ENCOUNTER_HTML}`, { waitUntil: 'load' });
    await page.waitForFunction((encounterId) => document.body.innerText.includes(encounterId),
      committedAfterLoss.encounter.encounterId, { timeout: 15_000 });
    const reopened = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(reopened.encounter?.status, 'active');
    assert.equal(reopened.encounter?.encounterId, committedAfterLoss.encounter.encounterId);
    assert.equal(reopened.population.reservedWolves, 1);
    const attackResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      try {
        const dto = request.postDataJSON();
        return response.url() === new URL(COMMIT_PATH, server.base).href && request.method() === 'POST' &&
          dto.type === 'EncounterAction' && dto.payload?.action === 'attack';
      } catch { return false; }
    }, { timeout: 15_000 });
    await page.locator('#encounter-attack').click();
    const attackResponse = await attackResponsePromise;
    assert.equal(attackResponse.status(), 200, '重开后的 attack 必须收到真实服务响应');
    const attackReceipt = receipt3(JSON.parse(await attackResponse.text()));
    assert.ok(attackReceipt, 'attack 必须返回 DTO3 receipt');
    assert.equal(attackReceipt.type, 'EncounterAction');
    assert.equal(attackReceipt.result.action, 'attack');
    assert.equal(attackReceipt.outcome, 'succeeded');
    await page.waitForFunction((revision) =>
      document.querySelector('#scene-revision')?.textContent === String(revision),
    attackReceipt.toRevision, { timeout: 15_000 });
    const afterAttack = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.ok(afterAttack.encounter.attackCount >= 1, '同目录重开后 UI 必须真实 attack');
    assert.equal(afterAttack.revision, attackReceipt.toRevision);
    assert.equal(afterAttack.revision, reopened.revision + 6);

    for (const write of bucket.writes) assertLegalDto3Write(write, '真实地图/遭遇 UI');
    const sentTypes = bucket.writes.map((write) => { try { return JSON.parse(write.postData).type; } catch { return null; } });
    assert.ok(sentTypes.includes('EncounterBegin'));
    assert.ok(sentTypes.includes('EncounterAction'));
    assert.ok(sentTypes.includes('PlayerTravel'));
    assert.deepEqual(bucket.pageErrors, [], `原始 pageerror 必须为零：${JSON.stringify(bucket.pageErrors)}`);
    const rawConsole = bucket.consoleMessages;
    const categorizedConsole = rawConsole.filter((message) => injectedBrowserConsoleEvent(message, bucket));
    assert.deepEqual(rawConsole, categorizedConsole, `console error/warning 只允许精确匹配本测试注入事件：${JSON.stringify(rawConsole)}`);
    assert.equal(bucket.requestFailures.length, 1, `唯一 requestfailed 必须是明确注入的 commit response abort：${JSON.stringify(bucket.requestFailures)}`);
    assert.equal(bucket.requestFailures[0].phase, 'map-travel-begin-reopen-attack');
    assert.equal(bucket.requestFailures[0].url, lost.url);
    assert.equal(bucket.requestFailures[0].method, 'POST');
    assert.equal(bucket.requestFailures[0].postData, retries[0].postData);
    assert.equal(bucket.requestFailures[0].error, 'net::ERR_FAILED');
    assert.deepEqual(unexpectedBrowserRequestFailures(bucket), []);

    console.log('[D3-5B evidence][ui] ' + JSON.stringify({ gate: 'G8-ui-browser', pid: server.child.pid,
      port: server.port, url: server.base, profile: PROFILE, dataDir, browser: BROWSER_EXECUTABLE,
      href: `/${ENCOUNTER_HTML}`, travel: afterTravel, lostCommit: lost, originalRetryDto: originalDto,
      reopened, afterAttack, requests: bucket.requests, writes: bucket.writes, responses: bucket.responses,
      consoleMessages: bucket.consoleMessages, pageErrors: bucket.pageErrors, requestFailures: bucket.requestFailures,
      injectedEvents: bucket.injectedEvents }));
    evidenceLogged = true;
  } finally {
    if (!evidenceLogged) console.log('[D3-5B evidence][ui][failure-raw] ' + JSON.stringify({
      gate: 'G8-ui-browser', pid: server.child.pid, port: server.port, url: server.base, dataDir,
      requests: bucket.requests, writes: bucket.writes, responses: bucket.responses, pageErrors: bucket.pageErrors,
      consoleMessages: bucket.consoleMessages, requestFailures: bucket.requestFailures, injectedEvents: bucket.injectedEvents,
    }));
    if (page) await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.stop();
  }
});

test('G8-ui 真实浏览器两 tab：同 revision 并发提交只有一条落盘，另一条收到真实 409/current revision', { timeout: GATE_TIMEOUT_MS }, async () => {
  const chromium = requireBrowserDriver();
  const dataDir = tempDir('ui-browser-tabs');
  const server = await startServer({ profile: PROFILE, dataDir });
  const browser = await chromium.launch({ executablePath: BROWSER_EXECUTABLE, headless: true });
  const browserEvidence = { requests: [], writes: [], responses: [], pageErrors: [], consoleMessages: [], requestFailures: [], injectedEvents: [] };
  let evidenceLogged = false;
  let pageA = null;
  let pageB = null;
  try {
    // 先通过唯一受控 service setup 将世界置于 forest，再让两页读取同一权威 revision。
    const beforeTravel = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(beforeTravel.self.location, 'village');
    const travelResponse = await fetch(`${server.base}${COMMIT_PATH}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 3, commandId: 'd35b-tabs-travel', expectedRevision: beforeTravel.revision,
        type: 'PlayerTravel', payload: { destination: 'forest' } }),
    });
    assert.equal(travelResponse.status, 200, 'G8：两 tab 前置旅行必须成功');
    const travelReceipt = receipt3(JSON.parse(await travelResponse.text()));
    assert.ok(travelReceipt, 'G8：前置旅行必须返回完整 DTO3 receipt');
    assert.equal(travelReceipt.outcome, 'succeeded');
    pageA = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    pageB = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    attachBrowserEvidence(pageA, browserEvidence, 'two-tab-revision-conflict');
    attachBrowserEvidence(pageB, browserEvidence, 'two-tab-revision-conflict');
    await pageA.goto(`${server.base}/${ENCOUNTER_HTML}`, { waitUntil: 'load' });
    await pageB.goto(`${server.base}/${ENCOUNTER_HTML}`, { waitUntil: 'load' });
    await pageA.waitForTimeout(700);
    await pageB.waitForTimeout(700);

    // 两 tab 读到同一 revision（同一森林世界快照）
    const revA = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text).revision;
    const revB = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text).revision;
    assert.equal(revA, revB, 'G8：两 tab 必须读到同一 revision');
    const rev0 = revA;
    const commitEp = COMMIT_PATH;

    // 两个真实 tab 并发提交同一 revision 的 EncounterBegin
    const submit = (page, commandId) =>
      page.evaluate(
        async ({ ep, dto }) => {
          const res = await fetch(ep, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(dto),
          });
          const text = await res.text();
          let json = null;
          try {
            json = text.length ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          return { status: res.status, json };
        },
        {
          ep: commitEp,
          dto: {
            version: 3,
            commandId,
            expectedRevision: rev0,
            type: 'EncounterBegin',
            payload: {},
          },
        },
      );

    const [ra, rb] = await Promise.all([submit(pageA, 'd35b-tab-a'), submit(pageB, 'd35b-tab-b')]);
    const statuses = [ra.status, rb.status].sort((x, y) => x - y);
    assert.deepEqual(
      statuses,
      [200, 409],
      `G8：两 tab 同 revision 并发必须恰一条提交、另一条 409，实际 ${JSON.stringify([ra, rb])}`,
    );
    const loser = ra.status === 409 ? ra : rb;
    assert.equal(loser.json?.error?.code, 'REVISION_CONFLICT', 'G8：败者必须是真实 REVISION_CONFLICT');
    assert.equal(
      typeof loser.json?.currentRevision,
      'number',
      `G8：409 必须带 currentRevision，实际 ${JSON.stringify(loser.json)}`,
    );

    assert.equal(loser.json.currentRevision, rev0 + 1, 'G8：409 currentRevision 必须是胜者提交后的修订');

    const after = JSON.parse((await fetchRaw(`${server.base}${ENCOUNTER_PATH}`)).text);
    assert.equal(after.revision, rev0 + 1, 'G8：两 tab 冲突只产生一条提交（revision 只 +1）');
    assert.ok(after.encounter, 'G8：胜者的遭遇必须真实落盘');
    assert.equal(after.encounter.encounterId, 'encounter-1', 'G8：只生成一场遭遇，不重复开局');
    const tabCommandIds = ['d35b-tab-a', 'd35b-tab-b'];
    const loserCommandId = ra.status === 409 ? 'd35b-tab-a' : 'd35b-tab-b';
    const commitUrl = new URL(COMMIT_PATH, server.base).href;
    const tabWrites = browserEvidence.writes.filter((write) =>
      write.phase === 'two-tab-revision-conflict' && write.method === 'POST' && write.url === commitUrl);
    assert.equal(tabWrites.length, 2, 'G8：两 tab 必须各写一次且仅一次');
    assert.deepEqual(tabWrites.map((write) => JSON.parse(write.postData).commandId).sort(), tabCommandIds);
    const tabResponses = browserEvidence.responses.filter((response) =>
      response.phase === 'two-tab-revision-conflict' && response.method === 'POST' && response.url === commitUrl);
    assert.deepEqual(tabResponses.map((response) => response.status).sort((a, b) => a - b), [200, 409],
      'G8：两 tab 必须恰有一个 200 和一个 409 浏览器响应');
    browserEvidence.injectedEvents.push({ kind: 'http-409', phase: 'two-tab-revision-conflict', url: commitUrl,
      commandId: loserCommandId, commandIds: tabCommandIds, expectedRevision: rev0,
      currentRevision: loser.json.currentRevision, errorCode: loser.json.error.code,
      count: 1, expectedWriteCount: 2, responseCount: 2 });
    assert.deepEqual(browserEvidence.pageErrors, [], `G8：两 tab 不得有脚本错误 ${JSON.stringify(browserEvidence.pageErrors)}`);
    assert.deepEqual(
      browserEvidence.consoleMessages.filter((message) => !injectedBrowserConsoleEvent(message, browserEvidence)),
      [],
      `G8：两 tab 不得有非注入的 console error/warning；全部原始项 ${JSON.stringify(browserEvidence.consoleMessages)}`,
    );
    assert.deepEqual(unexpectedBrowserRequestFailures(browserEvidence), [],
      `G8：两 tab 不得有非注入的失败请求；全部原始项 ${JSON.stringify(browserEvidence.requestFailures)}`);

    console.log(
      '[D3-5B evidence][ui] ' +
        JSON.stringify({
          gate: 'G8-ui-two-tabs',
          pid: server.child.pid,
          port: server.port,
          url: server.base,
          profile: PROFILE,
          dataDir,
          commitEndpoint: commitEp,
          statuses: [ra.status, rb.status],
          currentRevision: loser.json?.currentRevision ?? null,
          revisionAfter: after.revision,
          writes: browserEvidence.writes,
          responses: browserEvidence.responses,
          consoleMessages: browserEvidence.consoleMessages,
          requestFailures: browserEvidence.requestFailures,
          injectedEvents: browserEvidence.injectedEvents,
        }),
    );
    evidenceLogged = true;
  } finally {
    if (!evidenceLogged) console.log('[D3-5B evidence][ui][failure-raw] ' + JSON.stringify({
      gate: 'G8-ui-two-tabs', pid: server.child.pid, port: server.port, url: server.base, dataDir,
      requests: browserEvidence.requests, writes: browserEvidence.writes, responses: browserEvidence.responses,
      pageErrors: browserEvidence.pageErrors, consoleMessages: browserEvidence.consoleMessages,
      requestFailures: browserEvidence.requestFailures, injectedEvents: browserEvidence.injectedEvents,
    }));
    if (pageA) await pageA.close().catch(() => {});
    if (pageB) await pageB.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.stop();
  }
});

test.after(() => {
  cleanupAll();
});

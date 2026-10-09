// M3-4B G0：required 证据先行门禁的独立子进程反例。
// 每条都必须以明确的验收错误码和非零退出结束，且不得出现 skip/todo 冒充 PASS；原 oracle 与
// 原源码只读，所有负例都用本路临时副本。合同：m3-closeout-contract-v1 §G0。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, 'experience-runner-acceptance.test.mjs');
const ORACLE = process.env.M34_ORACLE_FILE?.trim() ? path.resolve(process.env.M34_ORACLE_FILE) :
  'D:/Narraverse-World-Map-m2-acceptance/artifacts/world-runtime-m2-acceptance-repair-20261008/legacy-oracle-87aa9b6-v2.json';
const FINGERPRINT_PATTERN = '^E7 oracle 指纹门';
const GATE_PATTERN = '^E5 新 profile';
// The three A-lane modules the acceptance file treats as required evidence.
const REQUIRED_MODULES = ['runtime/core/experience-state.mjs', 'runtime/core/work-experience-adapter.mjs',
  'runtime/fixtures/experience-village.mjs'];
const pristine = readFileSync(ORACLE);

function run(args, cwd, env) {
  return new Promise(resolve => {
    // Strip the inherited test context, otherwise a nested `node --test` treats itself as
    // already running and exits 0 without executing the target file.
    const childEnv = { ...process.env, ...env };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, { cwd, env: childEnv });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('close', code => resolve({ code, output }));
  });
}
const oracleArgs = pattern => ['--test', '--test-name-pattern', pattern, TARGET];

async function workspace(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'world-m34b-required-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function writeOracle(dir, name, contents) {
  const file = path.join(dir, name);
  await fs.writeFile(file, contents);
  return file;
}
function readDocument() { return JSON.parse(pristine.toString('utf8')); }
// A failing required gate must name its code, exit non-zero and never hide behind skip/todo.
async function assertBlocked(t, result, code, why) {
  assert.notEqual(result.code, 0, why + ' 必须非零退出，实际 exit=' + result.code + '\n' + result.output);
  assert.ok(result.output.includes(code), why + ' 应报 ' + code + '，实际输出：\n' + result.output);
  assert.match(result.output, /skipped 0/, why + ' 不得用 skip 冒充通过');
  assert.match(result.output, /todo 0/, why + ' 不得用 todo 推迟必需证据');
}

test('G0 合法 oracle 副本可经 M34_ORACLE_FILE 定位并通过指纹门（只定位实体，不改语义）', async t => {
  const dir = await workspace(t);
  const file = await writeOracle(dir, 'faithful-copy.json', pristine);
  const result = await run(oracleArgs(FINGERPRINT_PATTERN), HERE, { M34_ORACLE_FILE: file });
  assert.equal(result.code, 0, 'a byte-identical entity must stay usable:\n' + result.output);
  assert.match(result.output, /pass 1/);
  assert.match(result.output, /skipped 0/);
});

test('G0 oracle 实体缺失是 REQUIRED_EVIDENCE_MISSING，不是合法跳过', async t => {
  const dir = await workspace(t);
  const result = await run(oracleArgs(FINGERPRINT_PATTERN), HERE, { M34_ORACLE_FILE: path.join(dir, 'absent.json') });
  await assertBlocked(t, result, 'REQUIRED_EVIDENCE_MISSING', '缺失的 required oracle');
});

test('G0 RAW 损坏是 EVIDENCE_INTEGRITY_FAILED，不得被解释为缺文件', async t => {
  const dir = await workspace(t);
  const file = await writeOracle(dir, 'broken.json', '{"schemaVersion": 2, "baselineSHA": "87aa9b6');
  const result = await run(oracleArgs(FINGERPRINT_PATTERN), HERE, { M34_ORACLE_FILE: file });
  await assertBlocked(t, result, 'EVIDENCE_INTEGRITY_FAILED', '截断的 oracle RAW');
});

test('G0 目录冒充文件或不可读按 I/O 失败处理，而非合法缺失', async t => {
  const dir = await workspace(t);
  const folder = path.join(dir, 'not-a-file.json');
  await fs.mkdir(folder);
  const result = await run(oracleArgs(FINGERPRINT_PATTERN), HERE, { M34_ORACLE_FILE: folder });
  assert.notEqual(result.code, 0, 'a directory cannot satisfy required evidence');
  assert.ok(!result.output.includes('REQUIRED_EVIDENCE_MISSING'),
    'an EISDIR failure must not be laundered into a legitimate absence:\n' + result.output);
  assert.match(result.output, /EVIDENCE_INTEGRITY_FAILED/);
  assert.match(result.output, /skipped 0/);
});

test('G0 可解析但 schema 或 baseline 未知是 UNSUPPORTED_EVIDENCE_VERSION', async t => {
  const dir = await workspace(t);
  for (const [name, mutate] of [
    ['schema-v3', doc => { doc.schemaVersion = 3; }],
    ['baseline-foreign', doc => { doc.baselineSHA = 'feb2856000000000000000000000000000000000'; }]]) {
    const document = readDocument();
    mutate(document);
    const result = await run(oracleArgs(FINGERPRINT_PATTERN), HERE,
      { M34_ORACLE_FILE: await writeOracle(dir, name + '.json', JSON.stringify(document)) });
    await assertBlocked(t, result, 'UNSUPPORTED_EVIDENCE_VERSION', '未知 ' + name + ' 的 oracle');
  }
});

test('G0 payload 与 payloadHash 不一致是 EVIDENCE_INTEGRITY_FAILED', async t => {
  const dir = await workspace(t);
  const document = readDocument();
  assert.match(String(document.payloadHash), /^[0-9a-f]{64}$/, 'fixture must carry a payloadHash');
  // Content is untouched, so only the hash pairing can be off: exactly the drift the gate must catch.
  document.payloadHash = document.payloadHash[0] === '0' ? '1' + document.payloadHash.slice(1) : '0' + document.payloadHash.slice(1);
  const result = await run(oracleArgs(FINGERPRINT_PATTERN), HERE,
    { M34_ORACLE_FILE: await writeOracle(dir, 'payload-drift.json', JSON.stringify(document)) });
  await assertBlocked(t, result, 'EVIDENCE_INTEGRITY_FAILED', 'payloadHash 与 canonical payload 不一致的 oracle');
});

test('G0 单独 oracle 消费者也拒绝 RAW 改动，不能绕过指纹门', async t => {
  const dir = await workspace(t);
  const document = readDocument();
  document.controllerReviewUnrelatedExtra = 'RAW identity must still be authoritative';
  const result = await run(oracleArgs('^E7 oracle default288Hash'), HERE,
    { M34_ORACLE_FILE: await writeOracle(dir, 'raw-extra-field.json', JSON.stringify(document)) });
  await assertBlocked(t, result, 'EVIDENCE_INTEGRITY_FAILED', 'payload 不变而 RAW 非权威的 oracle');
});

test('G0 单独 oracle 消费者拒绝自洽但非权威的 payload', async t => {
  const dir = await workspace(t);
  const document = readDocument();
  document.provenance.controllerReviewUnrelatedExtra = 'self-consistency cannot replace authority';
  document.payloadHash = createHash('sha256').update(canonicalJson({
    scenarioSpecs: document.scenarioSpecs, provenance: document.provenance, results: document.results
  }), 'utf8').digest('hex');
  const result = await run(oracleArgs('^E7 oracle default288Hash'), HERE,
    { M34_ORACLE_FILE: await writeOracle(dir, 'self-consistent-payload.json', JSON.stringify(document)) });
  await assertBlocked(t, result, 'EVIDENCE_INTEGRITY_FAILED', '自洽但非权威的 oracle payload');
});

test('G0 缺必需依赖整链 fail closed：非零、点名缺失实体、绝不 skip', async t => {
  const dir = await workspace(t);
  // A read-only mirror of the code tree with the required A modules absent; originals stay untouched.
  await fs.cp(path.resolve(HERE, '..', '..', 'runtime'), path.join(dir, 'runtime'), { recursive: true });
  await fs.cp(path.resolve(HERE, '..', '..', 'simulation-runner.mjs'), path.join(dir, 'simulation-runner.mjs'));
  await fs.mkdir(path.join(dir, 'tests', 'simulation'), { recursive: true });
  await fs.cp(TARGET, path.join(dir, 'tests', 'simulation', 'experience-runner-acceptance.test.mjs'));
  for (const relative of REQUIRED_MODULES) await fs.rm(path.join(dir, relative));
  const mirror = path.join(dir, 'tests', 'simulation', 'experience-runner-acceptance.test.mjs');
  const result = await run(['--test', '--test-name-pattern', GATE_PATTERN, mirror], dir, {});
  assert.notEqual(result.code, 0, 'a missing required dependency cannot pass silently:\n' + result.output);
  assert.match(result.output, /skipped 0/, 'the A-dependency gate may no longer skip');
  assert.match(result.output, /todo 0/, 'the A-dependency gate may not be deferred as todo');
  // In this baseline the three A modules are also statically imported by production code
  // (runtime/core/motivation-state.mjs and others), so their absence surfaces as a transitive
  // loader failure. G0 treats a transitive miss as a hard fail as well, but it must name the
  // entity that is missing rather than report a green or skipped run.
  assert.match(result.output, /ERR_MODULE_NOT_FOUND|REQUIRED_EVIDENCE_MISSING/,
    'the failure must be an explicit missing-evidence/loader failure:\n' + result.output);
  assert.ok(REQUIRED_MODULES.some(relative => result.output.includes(path.basename(relative))),
    'the run must name which required entity is absent:\n' + result.output);
  for (const relative of REQUIRED_MODULES)
    assert.ok(readFileSync(path.resolve(HERE, '..', '..', relative)).length > 0,
      'the mirror run must not touch original sources');
});

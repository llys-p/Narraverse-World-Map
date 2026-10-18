// Bounded synthetic cold-open attribution for D4E12. It preserves the complete
// on-disk audit and reports its cost separately from projection construction.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const baseline = '63b3ddf3483b5486e3d9dc2c19fc2f0b1c4e4bef';
const mode = process.argv[2];
const out = path.resolve(process.argv[3]);
const directory = path.join(out, 'world');
assert(['baseline', 'candidate'].includes(mode));
await fs.mkdir(out, { recursive: false });

const sourceFiles = ['runtime/service/runtime-owner.mjs', 'runtime/service/service-commit.mjs'];
const sources = [];
const targets = new Map(sourceFiles.map(file => [new URL(`../${file}`, import.meta.url).href, file]));
function instrumentAudit(source) {
  const replacements = [
    ['function auditServiceCommit(envelope){', "function auditServiceCommit(envelope){const coldAuditMarks=globalThis.__coldOpenAuditMarks;const coldAuditMark=name=>coldAuditMarks?.push({name,at:performance.now()});coldAuditMark('start');"],
    ['const anchor=[9,10,11].includes(envelope.serviceFormatVersion)?createAuditedBundle(envelope.anchor,{rulesVersion:profile.rulesVersion,systems:profile.systems}):envelope.anchor;', "coldAuditMark('before-anchor-audit');const anchor=[9,10,11].includes(envelope.serviceFormatVersion)?createAuditedBundle(envelope.anchor,{rulesVersion:profile.rulesVersion,systems:profile.systems}):envelope.anchor;coldAuditMark('after-anchor-audit');"],
    ['const seen=new Set();let replay=anchor,revision=anchor.snapshot.revision;', "coldAuditMark('before-projection-and-journal');const seen=new Set();let replay=anchor,revision=anchor.snapshot.revision;"],
    ['requireCondition(isDeepStrictEqual(replay,envelope.bundle),\'Service world does not match command replay\');', "coldAuditMark('after-journal-replay');requireCondition(isDeepStrictEqual(replay,envelope.bundle),'Service world does not match command replay');coldAuditMark('after-final-compare');"],
  ];
  for (const [from, to] of replacements) {
    assert(source.includes(from), `audit instrumentation target missing: ${from.slice(0, 32)}`);
    source = source.replace(from, to);
  }
  const finalAudit = 'const final=[9,10,11].includes(envelope.serviceFormatVersion)?createAuditedBundle(envelope.bundle,{rulesVersion:finalProfile.rulesVersion,systems:finalProfile.systems}):envelope.bundle;';
  if (source.includes(finalAudit)) source = source.replace(finalAudit, "coldAuditMark('before-final-audit');const final=[9,10,11].includes(envelope.serviceFormatVersion)?createAuditedBundle(envelope.bundle,{rulesVersion:finalProfile.rulesVersion,systems:finalProfile.systems}):envelope.bundle;coldAuditMark('after-final-audit');");
  else source = source.replace("coldAuditMark('after-anchor-audit');", "coldAuditMark('after-anchor-audit');coldAuditMark('final-audit-elided');");
  const returnStatement = source.includes('return {anchor,final};') ? 'return {anchor,final};' : 'return {anchor,final:replay};';
  assert(source.includes(returnStatement), 'audit instrumentation return target missing');
  source = source.replace(returnStatement, `coldAuditMark('end');${returnStatement}`);
  return source;
}
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  const file = targets.get(url);
  if (!file) return result;
  const source = mode === 'baseline'
    ? execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' })
    : typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  sources.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
  return { ...result, source: file === 'runtime/service/service-commit.mjs' ? instrumentAudit(source) : source };
} });

const { startRuntimeServer } = await import('../runtime-server.mjs');
const { loadRuntimeServiceCommit, transitionAuditedServiceCommand } = await import('../runtime/service/service-commit.mjs');
const { createSimulationSession } = await import('../runtime/core/command-engine.mjs');
const { deriveCampaignBundle } = await import('../runtime/core/world-state.mjs');
const { executeAuditedCampaignIntent } = await import('../runtime/core/scene-campaign-runtime.mjs');
const { validateSceneCommandDto } = await import('../runtime/service/http-contract.mjs');
const { runtimeProfile, projectPublicSnapshot, projectPlayerSnapshot, projectEncounterSnapshot, projectSceneSnapshot, projectMapSnapshot } = await import('../runtime/service/http-contract.mjs');
const { canonicalJson } = await import('../runtime/core/data-contract.mjs');
const { validateCampaignReceipt } = await import('../runtime-campaign-contract.mjs');

const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
const report = { mode, baseline, sources, node: process.version, phases: [], receipts: [] };
let server;

async function phase(name, action) {
  await fs.writeFile(path.join(out, 'phase.json'), JSON.stringify({ phase: name, startedAt: Date.now() }));
  const start = performance.now();
  const cpu = process.cpuUsage();
  try { return await action(); }
  finally {
    const used = process.cpuUsage(cpu);
    report.phases.push({ name, wallMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000 });
    await fs.writeFile(path.join(out, 'phase.json'), '{"phase":null}');
  }
}

async function json(route, body) {
  const response = await fetch(server.url + route, {
    headers: { Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}

function five(group) {
  return Object.fromEntries(['snapshot', 'map', 'player', 'encounter', 'scene'].map(key => [key, group[key]]));
}

function replayFromAuditedAnchor(commit, transition) {
  let replay = commit.anchor;
  const receipts = [];
  for (const entry of commit.commands) {
    const next = transition(replay, entry.dto);
    assert.deepEqual(next.receipt, entry.receipt);
    replay = next.bundle;
    receipts.push(next.receipt);
  }
  assert(isDeepStrictEqual(replay, commit.bundle), 'replay must reconstruct the audited final bundle');
  return receipts;
}

function replayWithValidatedCampaignDto(commit) {
  let replay = commit.anchor;
  const receipts = [];
  for (const entry of commit.commands) {
    const dto = validateSceneCommandDto(entry.dto, 5);
    const next = executeAuditedCampaignIntent(replay, dto);
    assert.deepEqual(next.receipt, entry.receipt);
    replay = next.bundle;
    receipts.push(next.receipt);
  }
  assert(isDeepStrictEqual(replay, commit.bundle), 'validated campaign replay must reconstruct the audited final bundle');
  return receipts;
}

try {
  await phase('first-open', async () => {
    server = await startRuntimeServer({ directory, seed: 42, profile: 'campaign-village', writable: true, continuousMarch: true, runtimeWorker: false, port: 0 });
  });
  for (let index = 0; index < 8; index++) await phase(`action-${index}`, async () => {
    const dto = { version: 5, commandId: `cold-open-fixed-${index}`, expectedRevision: index * 2, type: 'AdvanceTime', payload: { ticks: 2 } };
    const receipt = await json('/api/runtime/commands', dto);
    assert(validateCampaignReceipt(receipt, dto, index * 2));
    report.receipts.push(receipt);
  });
  const expected = five(await json('/api/runtime/demo-state'));
  report.fiveProjectionSha256 = digest(expected);
  report.receiptsSha256 = digest(report.receipts);
  await phase('close', async () => { await server.close(); server = null; });

  let commit;
  globalThis.__coldOpenAuditMarks = [];
  await phase('journal-full-audit', async () => {
    commit = await loadRuntimeServiceCommit(path.join(directory, 'service-commit-r16.json'));
  });
  report.journalFullAuditMarks = globalThis.__coldOpenAuditMarks;
  let publicReplay, derivedReplay, validatedReplay;
  await phase('journal-public-transition', () => {
    publicReplay = replayFromAuditedAnchor(commit, transitionAuditedServiceCommand);
  });
  await phase('journal-private-derivation', () => {
    derivedReplay = replayFromAuditedAnchor(commit, deriveCampaignBundle);
  });
  await phase('journal-validated-campaign', () => {
    validatedReplay = replayWithValidatedCampaignDto(commit);
  });
  assert.deepEqual(derivedReplay, publicReplay);
  assert.deepEqual(validatedReplay, publicReplay);
  await phase('projection-build', () => {
    const { systems } = runtimeProfile(commit.bundle);
    createSimulationSession(commit.bundle, systems);
    const remaining = 128 - commit.bundle.snapshot.world.encounterModel.inputHistory.length;
    return [projectPublicSnapshot(commit.bundle), projectPlayerSnapshot(commit.bundle), projectEncounterSnapshot(commit.bundle), projectSceneSnapshot(commit.bundle), projectMapSnapshot(commit.bundle, remaining)];
  });
  globalThis.__coldOpenAuditMarks = [];
  await phase('cold-reopen', async () => {
    server = await startRuntimeServer({ directory, writable: true, continuousMarch: true, runtimeWorker: false, port: 0 });
  });
  report.coldReopenAuditMarks = globalThis.__coldOpenAuditMarks;
  assert.deepEqual(five(await json('/api/runtime/demo-state')), expected);
  await phase('reclose', async () => { await server.close(); server = null; });
  const files = {};
  for (const name of (await fs.readdir(directory)).filter(name => /^service-commit-r\d+\.json$/.test(name)).sort()) {
    files[name] = createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex');
  }
  assert.equal(Object.keys(files).length, 9);
  report.files = files;
  report.filesSha256 = digest(files);
  report.verdict = 'PASS';
} catch (error) {
  report.verdict = 'FAIL';
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  console.error(error.stack);
} finally {
  if (server) await server.close();
  report.remainingLocks = (await fs.readdir(directory).catch(() => [])).filter(name => name.endsWith('.lock'));
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode, verdict: report.verdict, phases: report.phases, filesSha256: report.filesSha256, fiveProjectionSha256: report.fiveProjectionSha256, receiptsSha256: report.receiptsSha256, remainingLocks: report.remainingLocks }));
}

#!/usr/bin/env node
// D4P2 long-history performance measurement harness.
// Contract: d4-long-history-performance-v1
//
// Node builtins only. The parent process supervises a separate child process and enforces the
// hard time budget with a real watchdog (the child does synchronous CPU-heavy validation that
// would block any same-thread timer). The child performs exactly ONE business run:
//   open the copied post-war archive -> submit the single PlayerTravel DTO -> close -> reopen.
//
// Subcommands:
//   prepare  verify the frozen baseline + original archive fingerprints, build a fresh run dir
//   run      spawn the child under the parent watchdog and classify the outcome
//   child    the single business run (internal; invoked by `run`)
//   verify   post-run protection checks (originals, lock, produced commit)
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(SCRIPT_DIR, '..');

// Read-only reference archive (outside this execution tree). Never copied into the run directory.
const REFERENCE_RUNTIME_DATA = process.env.D4P2_REFERENCE_RUNTIME_DATA ||
  'D:\\Narraverse-World-Map\\hds-d4-cp1a-review\\artifacts\\world-runtime-d4-cp3-controller\\CP3-FULL-19796-1791960566578\\runtime-data';
const RUN_ROOT = path.join(SOURCE, 'artifacts', 'd4-long-history-20261015');
const DEFAULT_RUN_ID = 'run-20261015-01';

// Frozen SHA256 of the eight original archive files (task book section 2).
const ORIGINAL_SHA = {
  'service-commit-r0.json': '85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b',
  'service-commit-r1.json': '01055647588a97c2cf52586c945de35dafbedce553e6cba039fa362fab1ec682',
  'service-commit-r145.json': '867ce2730c7fb01cc96f5451e4c690ab836ebe2b64b002da0fd62f9df3267e1e',
  'service-commit-r157.json': '7670a2007b4e4aaf679eec5d83ac37b20037cea90abb4862bd895a0d4000792b',
  'service-commit-r158.json': '86c08be81faed693d9b33d58ca953c6c7abf8e033de6ae87d688ae50822dc73e',
  'service-commit-r164.json': '812fb209293b49beaa55f8d1d32da2c4d345dfa6cb6d53683b2ee4c35dcd786c',
  'service-commit-r170.json': '3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd',
  'service-commit-r182.json': 'd2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c'
};
const COPY_FILES = ['service-commit-r0.json', 'service-commit-r1.json', 'service-commit-r145.json',
  'service-commit-r157.json', 'service-commit-r158.json', 'service-commit-r164.json', 'service-commit-r170.json'];
const REFERENCE_ONLY_FILE = 'service-commit-r182.json';
const PRODUCED_FILE = 'service-commit-r182.json';
const LOCK_NAME = '.runtime-owner.lock';

// The single fixed input: field-for-field the last dto of the reference r182.
const TRAVEL_DTO = {
  commandId: '0d851472-c18d-4060-95a2-476d903130a7',
  expectedRevision: 170,
  payload: { destination: 'village' },
  type: 'PlayerTravel',
  version: 3
};
const EXPECTED_START = { revision: 170, tick: 168, commands: 6 };
const EXPECTED_END = { revision: 182, tick: 180, commands: 7 };

const STAGE_LIMIT_MS = 120000;
const TOTAL_LIMIT_MS = 420000;
const EXIT_CONFIRM_MS = 5000;
const POLL_MS = 100;

const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const nowIso = () => new Date().toISOString();
const ms = n => Math.round(n * 1000) / 1000;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    else out._.push(argv[i]);
  }
  return out;
}

const runDirOf = runId => path.join(RUN_ROOT, runId);
const runtimeDataOf = runId => path.join(runDirOf(runId), 'runtime-data');
const writeJson = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');

async function hashFile(file) { return sha256(await fs.readFile(file)); }

async function requireOriginalArchive() {
  const rows = [];
  for (const name of Object.keys(ORIGINAL_SHA)) {
    const file = path.join(REFERENCE_RUNTIME_DATA, name);
    let got = null, bytes = null, error = null;
    try { const buf = await fs.readFile(file); got = sha256(buf); bytes = buf.length; }
    catch (e) { error = e.code || String(e.message); }
    rows.push({ file: name, bytes, sha256: got, expectedSha256: ORIGINAL_SHA[name], match: got === ORIGINAL_SHA[name], error });
  }
  const bad = rows.filter(r => !r.match);
  if (bad.length) {
    const e = new Error(`SETUP_BLOCKED: original archive fingerprint mismatch for ${bad.map(b => b.file).join(', ')}`);
    e.rows = rows;
    throw e;
  }
  return rows;
}

function machineInfo() {
  const cpus = os.cpus();
  return {
    platform: process.platform, arch: process.arch, node: process.version,
    cpu: cpus.length ? cpus[0].model.trim() : 'unknown', logicalCpus: cpus.length,
    memoryGB: os.totalmem() / 1024 ** 3, hostname: os.hostname()
  };
}

// ---------------------------------------------------------------- prepare

async function cmdPrepare(args) {
  const runId = args['run-id'] || DEFAULT_RUN_ID;
  const runDir = runDirOf(runId), runtimeData = runtimeDataOf(runId);

  const sourceFingerprint = {};
  for (const rel of ['runtime/service/runtime-owner.mjs', 'runtime/service/service-commit.mjs',
    'runtime/service/http-contract.mjs', 'runtime/core/data-contract.mjs', 'runtime/core/world-state.mjs']) {
    sourceFingerprint[rel] = await hashFile(path.join(SOURCE, rel));
  }

  let archive;
  try { archive = await requireOriginalArchive(); }
  catch (error) {
    await fs.mkdir(runDir, { recursive: true });
    await writeJson(path.join(runDir, 'prepare-failure.json'), {
      at: nowIso(), verdict: 'SETUP_BLOCKED', message: error.message, rows: error.rows || []
    });
    console.error(error.message);
    process.exit(3);
  }

  if (fsSync.existsSync(runDir)) {
    const existing = await fs.readdir(runDir);
    if (existing.length) throw new Error(`Run directory already exists and is not empty: ${runDir}`);
  }
  await fs.mkdir(runtimeData, { recursive: true });

  const copies = [];
  for (const name of COPY_FILES) {
    const from = path.join(REFERENCE_RUNTIME_DATA, name), to = path.join(runtimeData, name);
    const buf = await fs.readFile(from);
    await fs.writeFile(to, buf);
    const back = await fs.readFile(to);
    copies.push({
      file: name, bytes: buf.length, sourceSha256: sha256(buf), copySha256: sha256(back),
      byteIdentical: buf.equals(back), expectedSha256: ORIGINAL_SHA[name]
    });
  }
  if (copies.some(c => !c.byteIdentical || c.copySha256 !== c.expectedSha256)) {
    throw new Error('Copied runtime files are not byte-identical to the original archive');
  }
  if (fsSync.existsSync(path.join(runtimeData, PRODUCED_FILE))) throw new Error('r182 must not be copied into the run directory');
  if (fsSync.existsSync(path.join(runtimeData, LOCK_NAME))) throw new Error('Lock file must not be copied into the run directory');

  const manifest = {
    at: nowIso(), contract: 'd4-long-history-performance-v1', runId,
    sourceTree: SOURCE,
    referenceRuntimeData: REFERENCE_RUNTIME_DATA,
    runRuntimeData: runtimeData,
    referenceOnlyNotCopied: REFERENCE_ONLY_FILE,
    git: {
      head: args['git-head'] || 'unknown', branch: args['git-branch'] || 'unknown',
      statusShort: args['git-status'] || 'unknown'
    },
    script: { file: path.relative(SOURCE, fileURLToPath(import.meta.url)), sha256: await hashFile(fileURLToPath(import.meta.url)) },
    sourceFingerprint, machine: machineInfo(),
    archive, copies, fixedDto: TRAVEL_DTO, expectedStart: EXPECTED_START, expectedEnd: EXPECTED_END,
    limits: { stageMs: STAGE_LIMIT_MS, totalMs: TOTAL_LIMIT_MS, concurrency: 1, samples: 1 }
  };
  await writeJson(path.join(runDir, 'manifest.json'), manifest);
  console.log(JSON.stringify({
    verdict: 'PREPARED', runId, runtimeData, files: copies.length,
    archiveVerified: archive.length, scriptSha256: manifest.script.sha256,
    sourceFingerprint, machine: manifest.machine
  }, null, 2));
}

// ---------------------------------------------------------------- child (one business run)

async function cmdChild(args) {
  const runId = args['run-id'] || DEFAULT_RUN_ID;
  const runDir = runDirOf(runId), runtimeData = runtimeDataOf(runId);
  const eventsPath = path.join(runDir, 'child-events.ndjson');
  const resultPath = path.join(runDir, 'child-result.json');

  const emit = obj => fsSync.appendFileSync(eventsPath, JSON.stringify({ at: nowIso(), ...obj }) + '\n');
  const timings = [], checks = [];
  const stage = (name, budgetMs, fn) => async () => {
    emit({ event: 'stage-begin', stage: name, budgetMs });
    const t = performance.now();
    try {
      const value = await fn();
      const elapsed = performance.now() - t;
      emit({ event: 'stage-end', stage: name, ms: ms(elapsed) });
      timings.push({ stage: name, ms: ms(elapsed), status: 'completed' });
      return value;
    } catch (error) {
      const elapsed = performance.now() - t;
      emit({ event: 'stage-error', stage: name, ms: ms(elapsed), code: error.code || null, message: String(error.message).slice(0, 400) });
      timings.push({ stage: name, ms: ms(elapsed), status: 'error', code: error.code || null, message: String(error.message).slice(0, 400) });
      throw error;
    }
  };
  const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); if (!ok) throw new Error(`Check failed: ${name} :: ${JSON.stringify(detail)}`); };
  let owner = null;

  emit({ event: 'child-start', pid: process.pid, node: process.version, runtimeData, at: nowIso() });

  const { createRuntimeOwner } = await import(pathToFileURL(path.join(SOURCE, 'runtime/service/runtime-owner.mjs')).href);
  const { canonicalJson } = await import(pathToFileURL(path.join(SOURCE, 'runtime/core/data-contract.mjs')).href);

  const readTimings = [];
  const timeRead = (name, fn) => { const t = performance.now(); const v = fn(); readTimings.push({ name, ms: ms(performance.now() - t) }); return v; };
  const timedViews = () => ({
    snapshot: timeRead('getSnapshot', () => owner.getSnapshot()),
    player: timeRead('getPlayer', () => owner.getPlayer()),
    mind: timeRead('getMindInspector', () => owner.getMindInspector()),
    encounter: timeRead('getEncounter', () => owner.getEncounter()),
    scene: timeRead('getScene', () => owner.getScene())
  });

  const lockPath = path.join(runtimeData, LOCK_NAME);
  const result = { at: nowIso(), runId, contract: 'd4-long-history-performance-v1', timings, readTimings, checks, verdict: null };

  try {
    // Step 2: first open of the copied archive (full validation + journal replay + projections).
    owner = await stage('first-open', STAGE_LIMIT_MS, () => createRuntimeOwner({ directory: runtimeData, writable: true }))();
    const start = timedViews();
    result.startState = { revision: start.snapshot.revision, tick: start.snapshot.tick, commands: start.snapshot.commands.length };
    check('start revision', result.startState.revision === EXPECTED_START.revision, result.startState);
    check('start tick', result.startState.tick === EXPECTED_START.tick, result.startState);
    check('start commands', result.startState.commands === EXPECTED_START.commands, result.startState);
    check('no r182 before submit', !fsSync.existsSync(path.join(runtimeData, PRODUCED_FILE)), null);
    result.startSignature = sha256(canonicalJson(start));

    // Step 3: the single real action - submit the frozen PlayerTravel dto.
    const receipt = await stage('submit-travel', STAGE_LIMIT_MS, () => owner.submit(JSON.parse(JSON.stringify(TRAVEL_DTO))))();
    result.receipt = receipt;
    check('receipt committed', receipt && receipt.status === 'committed', receipt);
    check('receipt toRevision', receipt.toRevision === EXPECTED_END.revision, receipt);

    const producedPath = path.join(runtimeData, PRODUCED_FILE);
    const producedBuf = await fs.readFile(producedPath);
    const referenceBuf = await fs.readFile(path.join(REFERENCE_RUNTIME_DATA, REFERENCE_ONLY_FILE));
    const producedCanonical = canonicalJson(JSON.parse(producedBuf.toString('utf8')));
    const referenceCanonical = canonicalJson(JSON.parse(referenceBuf.toString('utf8')));
    result.produced = {
      file: PRODUCED_FILE, bytes: producedBuf.length, sha256: sha256(producedBuf),
      canonicalSha256: sha256(producedCanonical),
      referenceBytes: referenceBuf.length, referenceSha256: sha256(referenceBuf),
      referenceCanonicalSha256: sha256(referenceCanonical),
      canonicalEqual: producedCanonical === referenceCanonical,
      byteIdenticalToReference: producedBuf.equals(referenceBuf)
    };
    check('produced r182 canonical equals reference r182', result.produced.canonicalEqual, {
      produced: result.produced.canonicalSha256, reference: result.produced.referenceCanonicalSha256
    });
    const producedState = JSON.parse(producedBuf.toString('utf8'));
    result.endState = {
      revision: producedState.bundle.snapshot.revision, tick: producedState.bundle.snapshot.tick,
      commands: producedState.commands.length
    };
    check('end revision', result.endState.revision === EXPECTED_END.revision, result.endState);
    check('end tick', result.endState.tick === EXPECTED_END.tick, result.endState);
    check('end commands', result.endState.commands === EXPECTED_END.commands, result.endState);
    const originalsAfterSubmit = [];
    for (const name of COPY_FILES) originalsAfterSubmit.push({ file: name, sha256: await hashFile(path.join(runtimeData, name)) });
    check('seven originals unchanged after submit', originalsAfterSubmit.every(o => o.sha256 === ORIGINAL_SHA[o.file]), originalsAfterSubmit);

    // Step 4a: capture projections, normal close, lock release.
    const before = await stage('close', null, async () => { const v = timedViews(); await owner.close(); return v; })();
    result.closeState = { lockReleased: !fsSync.existsSync(lockPath) };
    check('lock released after close', result.closeState.lockReleased, result.closeState);
    const beforeSignature = sha256(canonicalJson(before));

    // Step 4b: reopen the same directory with the same source and time it.
    owner = await stage('reopen', STAGE_LIMIT_MS, () => createRuntimeOwner({ directory: runtimeData, writable: true }))();
    const after = timedViews();
    result.reopenComparison = {
      beforeSignature, afterSignature: sha256(canonicalJson(after)), equal: beforeSignature === sha256(canonicalJson(after)),
      producedUnchanged: sha256(await fs.readFile(producedPath)) === result.produced.sha256
    };
    check('five projections equal across reopen', result.reopenComparison.equal, result.reopenComparison);
    check('r182 bytes unchanged across reopen', result.reopenComparison.producedUnchanged, result.reopenComparison);

    await owner.close();
    result.finalCloseState = { lockReleased: !fsSync.existsSync(lockPath) };
    check('lock released after final close', result.finalCloseState.lockReleased, result.finalCloseState);

    result.verdict = 'COMPLETED_CONSISTENT';
    result.processExit = 'normal';
  } catch (error) {
    result.verdict = 'FUNCTIONAL_MISMATCH';
    result.failure = { code: error.code || null, message: String(error.message).slice(0, 800), stack: String(error.stack || '').split('\n').slice(0, 6).join('\n') };
    result.processExit = 'error';
    if (owner) { try { await owner.close(); result.failure.lockAfterErrorClose = !fsSync.existsSync(lockPath); } catch (e) { result.failure.closeError = String(e.message).slice(0, 300); } }
    emit({ event: 'child-error', ...result.failure });
  } finally {
    result.lockPresentAtEnd = fsSync.existsSync(lockPath);
    result.checks = checks;
    await writeJson(resultPath, result);
    emit({ event: 'child-end', verdict: result.verdict, timings: result.timings, readTimings: result.readTimings, lockPresentAtEnd: result.lockPresentAtEnd });
  }
  process.exitCode = result.verdict === 'COMPLETED_CONSISTENT' ? 0 : 1;
}

// ---------------------------------------------------------------- parent watchdog

async function cmdRun(args) {
  const runId = args['run-id'] || DEFAULT_RUN_ID;
  const runDir = runDirOf(runId), runtimeData = runtimeDataOf(runId);
  if (!fsSync.existsSync(path.join(runDir, 'manifest.json'))) throw new Error(`Not prepared: ${runDir}`);
  for (const stale of ['child-events.ndjson', 'child-result.json', 'parent-result.json']) {
    const f = path.join(runDir, stale);
    if (fsSync.existsSync(f)) throw new Error(`Refusing to overwrite existing run output: ${f}`);
  }
  const eventsPath = path.join(runDir, 'child-events.ndjson');
  await fs.writeFile(eventsPath, '');
  const stdioPath = path.join(runDir, 'child-stdio.log');
  const stdioFd = fsSync.openSync(stdioPath, 'a');

  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [scriptPath, 'child', '--run-id', runId], {
    cwd: SOURCE, stdio: ['ignore', stdioFd, stdioFd], windowsHide: true
  });

  const started = performance.now();
  const observed = { stages: [], lastEventAt: null };
  let killed = null, lastLineCount = 0;
  const seen = new Set();

  const readEvents = async () => {
    let text = '';
    try { text = await fs.readFile(eventsPath, 'utf8'); } catch { return; }
    const lines = text.split('\n').filter(Boolean);
    for (let i = lastLineCount; i < lines.length; i++) {
      let ev; try { ev = JSON.parse(lines[i]); } catch { continue; }
      observed.lastEventAt = ms(performance.now() - started);
      if (ev.event === 'stage-begin' && !seen.has(ev.stage)) {
        seen.add(ev.stage);
        observed.stages.push({ stage: ev.stage, budgetMs: ev.budgetMs ?? null, beginAtMs: observed.lastEventAt, endAtMs: null, ms: null, status: 'running' });
      }
      const current = observed.stages[observed.stages.length - 1];
      if (current && (ev.event === 'stage-end' || ev.event === 'stage-error') && ev.stage === current.stage) {
        current.endAtMs = observed.lastEventAt; current.ms = ev.ms ?? null;
        current.status = ev.event === 'stage-end' ? 'completed' : 'error';
        if (ev.event === 'stage-error') current.error = { code: ev.code, message: ev.message };
      }
    }
    lastLineCount = lines.length;
  };

  const finished = new Promise(resolve => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
    child.on('error', error => resolve({ code: null, signal: null, spawnError: String(error.message) }));
  });

  const ticker = setInterval(async () => {
    if (killed || child.exitCode !== null) return;
    await readEvents();
    const elapsed = performance.now() - started;
    const current = observed.stages.find(s => s.status === 'running');
    if (elapsed > TOTAL_LIMIT_MS) {
      killed = { reason: 'TOTAL_LIMIT', limitMs: TOTAL_LIMIT_MS, observedMs: ms(elapsed), stage: current ? current.stage : null };
      try { child.kill('SIGKILL'); } catch {}
      return;
    }
    if (current && current.budgetMs && elapsed - current.beginAtMs > current.budgetMs) {
      killed = { reason: 'STAGE_LIMIT', stage: current.stage, limitMs: current.budgetMs, observedMs: ms(elapsed - current.beginAtMs) };
      try { child.kill('SIGKILL'); } catch {}
    }
  }, POLL_MS);

  let exit = await finished;
  if (killed) {
    const confirm = await Promise.race([finished, new Promise(r => setTimeout(() => r(null), EXIT_CONFIRM_MS))]);
    if (confirm) exit = confirm;
    else { try { child.kill('SIGKILL'); } catch {} exit = await finished; }
  }
  clearInterval(ticker);
  await readEvents();
  try { fsSync.closeSync(stdioFd); } catch {}
  const totalMs = ms(performance.now() - started);

  for (const s of observed.stages) if (s.status === 'running' && !s.endAtMs) {
    s.status = 'no-completion-message';
    s.observedMs = ms(totalMs - s.beginAtMs);
  }

  let childResult = null;
  try { childResult = JSON.parse(await fs.readFile(path.join(runDir, 'child-result.json'), 'utf8')); } catch {}

  let verdict;
  if (killed) verdict = 'TIMEOUT';
  else if (childResult && childResult.verdict === 'COMPLETED_CONSISTENT') verdict = 'COMPLETED_CONSISTENT';
  else if (childResult) verdict = 'FUNCTIONAL_MISMATCH';
  else verdict = 'TIMEOUT';

  const parentResult = {
    at: nowIso(), runId, contract: 'd4-long-history-performance-v1', verdict,
    command: `node scripts/measure-d4-long-history.mjs run --run-id ${runId}`,
    childPid: child.pid, childExit: exit, totalMs, observed,
    limits: { stageMs: STAGE_LIMIT_MS, totalMs: TOTAL_LIMIT_MS, exitConfirmMs: EXIT_CONFIRM_MS },
    killed, lockPresentAtEnd: fsSync.existsSync(path.join(runtimeData, LOCK_NAME)),
    childResultPresent: childResult !== null, machine: machineInfo()
  };
  await writeJson(path.join(runDir, 'parent-result.json'), parentResult);
  console.log(JSON.stringify({
    verdict, runId, totalMs, childExit: exit, killed,
    stages: observed.stages.map(s => ({ stage: s.stage, status: s.status, ms: s.ms ?? null, observedMs: s.observedMs ?? null })),
    readTimings: childResult ? childResult.readTimings : null,
    lockPresentAtEnd: parentResult.lockPresentAtEnd
  }, null, 2));
}

// ---------------------------------------------------------------- verify

async function cmdVerify(args) {
  const runId = args['run-id'] || DEFAULT_RUN_ID;
  const runDir = runDirOf(runId), runtimeData = runtimeDataOf(runId);
  const archive = await requireOriginalArchive();
  const runtimeFiles = (await fs.readdir(runtimeData)).sort();
  const producedPath = path.join(runtimeData, PRODUCED_FILE);
  const produced = fsSync.existsSync(producedPath)
    ? { sha256: await hashFile(producedPath), bytes: (await fs.stat(producedPath)).size } : null;
  const out = {
    at: nowIso(), runId, verdict: 'PROTECTION_OK',
    originalArchiveUnchanged: archive.every(r => r.match), archive,
    lockPresent: fsSync.existsSync(path.join(runtimeData, LOCK_NAME)),
    runtimeFiles, produced,
    runDirFiles: (await fs.readdir(runDir)).sort(),
    expectedProducedSha256: ORIGINAL_SHA[REFERENCE_ONLY_FILE]
  };
  if (!out.originalArchiveUnchanged || out.lockPresent || runtimeFiles.length !== 8) out.verdict = 'PROTECTION_ISSUE';
  await writeJson(path.join(runDir, 'protection.json'), out);
  console.log(JSON.stringify({
    verdict: out.verdict, originalArchiveUnchanged: out.originalArchiveUnchanged,
    lockPresent: out.lockPresent, runtimeFiles, produced, runDirFiles: out.runDirFiles
  }, null, 2));
}

// ---------------------------------------------------------------- entry

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
try {
  if (command === 'prepare') await cmdPrepare(args);
  else if (command === 'child') await cmdChild(args);
  else if (command === 'run') await cmdRun(args);
  else if (command === 'verify') await cmdVerify(args);
  else { console.error('usage: measure-d4-long-history.mjs <prepare|run|child|verify> [--run-id <id>]'); process.exitCode = 2; }
} catch (error) {
  console.error(`FATAL: ${error.message}`);
  process.exitCode = 1;
}

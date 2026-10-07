import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClockSmoke, CLOCK_SMOKE_RULES } from './runtime/fixtures/clock-smoke.mjs';
import { advanceOneTick } from './runtime/core/command-engine.mjs';
import { canonicalJson, fields, integer, record, fault, requireCondition } from './runtime/core/data-contract.mjs';
import { saveCheckpoint, loadCheckpoint } from './runtime/persistence/checkpoint-store.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const hash = (value) => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

export function parseArguments(argv) {
  requireCondition(Array.isArray(argv) && argv.every((value) => typeof value === 'string'), 'Expected argument strings');
  const flags = new Map(); const allowed = new Set(['--fixture', '--resume', '--days', '--seed', '--out']);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    requireCondition(allowed.has(flag) && !flags.has(flag) && value && !value.startsWith('--'), 'Unknown/duplicate/missing argument');
    flags.set(flag, value);
  }
  const decimal = (value) => {
    requireCondition(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value), 'Expected decimal integer');
    const result = Number(value); integer(result); return result;
  };
  const days = decimal(flags.get('--days')); requireCondition(days >= 1, 'Days must be positive');
  requireCondition(days <= 1000, 'Advance budget exceeded', 'LIMIT_EXCEEDED');
  const fixture = flags.get('--fixture'), resume = flags.get('--resume'), out = flags.get('--out');
  requireCondition(typeof out === 'string' && out.length > 0, 'New output directory required');
  requireCondition(Boolean(fixture) !== Boolean(resume), 'Select exactly one of fixture or resume');
  requireCondition(!resume || !flags.has('--seed'), 'Resume cannot supply seed');
  const seed = resume ? undefined : decimal(flags.get('--seed') ?? '42');
  if (!resume) requireCondition(seed <= 0xffffffff, 'Seed must be uint32');
  return { fixture, resume, days, ticks: days * 144, seed, out };
}

async function codeIdentity() {
  let codeSha = null, codeDirty = null, codeMetadataStatus = 'unavailable';
  try {
    const opts = { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
    codeSha = execFileSync('git', ['rev-parse', 'HEAD'], opts).trim();
    codeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], opts).trim().length > 0;
    codeMetadataStatus = 'available';
  } catch { codeSha = null; codeDirty = null; }
  const files = { 'simulation-runner.mjs': createHash('sha256').update(await fs.readFile(path.join(root, 'simulation-runner.mjs'))).digest('hex') };
  for (const directory of ['runtime/core', 'runtime/persistence', 'runtime/fixtures']) {
    for (const name of (await fs.readdir(path.join(root, directory))).filter((name) => name.endsWith('.mjs')).sort()) {
      files[directory + '/' + name] = createHash('sha256').update(await fs.readFile(path.join(root, directory, name))).digest('hex');
    }
  }
  return { codeSha, codeDirty, codeMetadataStatus, sourceHash: hash(files) };
}

function completeInputs(snapshot) {
  return [...snapshot.pendingCommands, ...Object.entries(snapshot.commandReceipts).map(([commandId, receipt]) =>
    ({ commandId, inputSeq: receipt.inputSeq, ...receipt.input }))].sort((a, b) => a.inputSeq - b.inputSeq);
}
async function writeEvents(file, events) {
  const columns = ['eventSeq', 'tick', 'type', 'schemaVersion', 'sourceSystem', 'commandId', 'causationEventSeqs', 'entityIds', 'payload'];
  const cell = (value) => '"' + (value === null ? '' : typeof value === 'object' ? canonicalJson(value) : String(value)).replaceAll('"', '""') + '"';
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(columns.join(',') + '\n');
    for (const event of events) await handle.writeFile(columns.map((key) => cell(event[key])).join(',') + '\n');
  } finally { await handle.close(); }
}

export async function runSimulation(options, hooks = {}) {
  fields(options, ['fixture', 'resume', 'days', 'ticks', 'seed', 'out']);
  record(hooks); requireCondition(Object.keys(hooks).every((key) => key === 'transformSystems'), 'Unknown test hook');
  requireCondition(hooks.transformSystems === undefined || typeof hooks.transformSystems === 'function', 'Invalid system hook');
  integer(options.days, 1);
  requireCondition(options.days <= 1000 && options.ticks === options.days * 144, 'Invalid advance budget', 'LIMIT_EXCEEDED');
  requireCondition(typeof options.out === 'string' && options.out.length > 0, 'New output directory required');
  requireCondition(Boolean(options.fixture) !== Boolean(options.resume), 'Select fixture or resume');
  if (options.resume) requireCondition(options.seed === undefined, 'Resume cannot supply seed');
  else { integer(options.seed); requireCondition(options.seed <= 0xffffffff, 'Seed must be uint32'); }
  const started = performance.now(), identity = await codeIdentity();
  let { bundle, systems } = createClockSmoke(options.seed ?? 42, `clock-smoke-seed-${options.seed ?? 42}`);
  if (options.resume) {
    bundle = await loadCheckpoint(options.resume, { rulesVersion: CLOCK_SMOKE_RULES, systems });
    requireCondition(bundle.snapshot.fixtureId === 'clock-smoke' && bundle.snapshot.fixtureVersion === '1', 'Unknown fixture version', 'UNSUPPORTED_VERSION');
  } else requireCondition(options.fixture === 'clock-smoke', 'Unknown fixture');
  if (hooks.transformSystems) systems = hooks.transformSystems(systems);
  const startTick = bundle.snapshot.tick, directory = path.resolve(options.out);
  try {
    await fs.mkdir(path.dirname(directory), { recursive: true });
    await fs.mkdir(directory); // Exclusive creation: even an existing empty directory is refused.
  } catch (cause) { throw Object.assign(fault('SAVE_FAILED', 'Output directory must be new'), { cause }); }
  let failure;
  for (let i = 0; i < options.ticks; i++) {
    try { bundle = advanceOneTick(bundle, systems); }
    catch (cause) { failure = cause; break; }
  }
  let checkpointPath;
  try {
    checkpointPath = await saveCheckpoint(bundle, { directory, rulesVersion: CLOCK_SMOKE_RULES, systems });
    await fs.writeFile(path.join(directory, 'inputs.json'), JSON.stringify(completeInputs(bundle.snapshot), null, 2), { flag: 'wx' });
    await writeEvents(path.join(directory, 'events.csv'), bundle.eventLog);
    const summary = { status: failure ? 'failed' : 'succeeded', ...identity, nodeVersion: process.version,
      fixtureId: bundle.snapshot.fixtureId, fixtureVersion: bundle.snapshot.fixtureVersion,
      rulesVersion: bundle.snapshot.rulesVersion, simulationId: bundle.snapshot.simulationId,
      seed: bundle.snapshot.rng.seed, startTick, tick: bundle.snapshot.tick, revision: bundle.snapshot.revision,
      eventCount: bundle.eventLog.length, stateHash: hash(bundle.snapshot), eventHash: hash(bundle.eventLog),
      systemOverride: Boolean(hooks.transformSystems), failedTick: failure?.failedTick ?? null,
      error: failure ? { code: failure.code ?? 'SIMULATION_FAILED', message: failure.cause?.message ?? failure.message } : null,
      elapsedMs: performance.now() - started, memoryUsage: process.memoryUsage(), checkpointPath };
    await fs.writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
    if (failure) throw Object.assign(fault(failure.code ?? 'SIMULATION_FAILED', 'Simulation stopped at failed tick'),
      { cause: failure, failedTick: failure.failedTick, summary });
    return summary;
  } catch (cause) {
    if (cause.summary) throw cause;
    throw Object.assign(fault('SAVE_FAILED', 'Simulation artifacts were not fully saved'), { cause, lastCommittedTick: bundle.snapshot.tick, checkpointPath });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runSimulation(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify({ status: summary.status, tick: summary.tick, checkpointPath: summary.checkpointPath,
      stateHash: summary.stateHash, eventHash: summary.eventHash }));
  } catch (error) {
    console.error(`ERROR ${error.code ?? 'SIMULATION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}

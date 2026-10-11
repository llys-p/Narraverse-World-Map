// M4B v2 independent persistence supplement. Production imports are relative to this checkout.
// Contract fe939fb; UI candidate 2c689a7 descends from A 520e838 and baseline 6676281.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig, survivalSystems } from '../../runtime/fixtures/survival-village.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { loadServiceCommit, validateServiceCommit, transitionServiceCommand } from '../../runtime/service/service-commit.mjs';
import { loadMotivationBackend, loadCognitionBackend, loadSurvivalBackend, runtimeProfile } from '../../runtime/service/http-contract.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPlayerPlayVillage } from '../../runtime/fixtures/player-play-village.mjs';
import { createMindVillage } from '../../runtime/fixtures/mind-village.mjs';
import { createMotivationVillage } from '../../runtime/fixtures/motivation-village.mjs';
import { createCognitionVillage } from '../../runtime/fixtures/cognition-village.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASE = 'D:/Narraverse-World-Map-m3-closeout-controller';
const ORIGINAL_A = 'D:/Narraverse-World-Map-m4-controller';
const PIN = { target: '2c689a71d2d8b69511bcf4f879ba77e06bc11530', a: '520e838b162edae7419fcb69a4edb32c79bdb65e',
  baseline: '667628166546a3f342873105b93a8684063504c1', contract: 'fe939fb30a7800ecb2910dd68e74117f24ae1344' };
const ARTIFACT = path.join(ROOT, 'artifacts/m4-persistence-review-20261011');
const RUN = path.join(ARTIFACT, `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const time = (id, revision = 0, ticks = 1) => ({ version: 1, commandId: id, expectedRevision: revision, type: 'AdvanceTime', payload: { ticks } });
const rest = (id, revision = 0) => ({ version: 2, commandId: id, expectedRevision: revision, type: 'PlayerRest', payload: {} });
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function evidence(name, value) { await fs.mkdir(RUN, { recursive: true }); await fs.writeFile(path.join(RUN, `${name}.json`), JSON.stringify(value, null, 2)); }
async function workspace(name) { const dir = path.join(RUN, name); await fs.mkdir(dir, { recursive: true }); return dir; }
async function diskBytes(directory) {
  const names = (await fs.readdir(directory)).filter(n => n !== '.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async n => [n, (await fs.readFile(path.join(directory, n))).toString('base64')])));
}
const projections = owner => ({ public: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector() });
async function seedOwner(name, recipe = 'affordable', io = fs) {
  const root = await workspace(name), staging = path.join(root, 'checkpoint'), directory = path.join(root, 'world');
  await fs.mkdir(staging); await fs.mkdir(directory);
  const { bundle, systems } = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig(recipe));
  const checkpoint = await saveCheckpoint(bundle, { directory: staging, rulesVersion: 'm-survival-v1', systems });
  return { directory, owner: await createRuntimeOwner({ directory, checkpoint, writable: true }, io) };
}
const git = (tree, args) => execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim();
async function hashes(root, normalizeLf = false) {
  const out = {};
  async function walk(dir) { for (const item of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, item.name);
    if (item.isDirectory()) await walk(rel); else if (item.isFile()) out[rel] = sha(normalizeLf ? (await fs.readFile(path.join(root, rel), 'utf8')).replaceAll('\r\n', '\n') : await fs.readFile(path.join(root, rel)));
  } }
  await walk('runtime'); out['simulation-runner.mjs'] = sha(normalizeLf ? (await fs.readFile(path.join(root, 'simulation-runner.mjs'), 'utf8')).replaceAll('\r\n', '\n') : await fs.readFile(path.join(root, 'simulation-runner.mjs')));
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

test('source pin: current runtime lineage and original A production bytes are exact', async () => {
  const actualHead = git(ROOT, ['rev-parse', 'HEAD']);
  git(ROOT, ['merge-base', '--is-ancestor', PIN.target, actualHead]);
  assert.equal(git(BASE, ['rev-parse', 'HEAD']), PIN.baseline);
  assert.equal(git(ORIGINAL_A, ['rev-parse', 'HEAD']), PIN.a);
  assert.equal(git(ROOT, ['merge-base', PIN.target, PIN.a]), PIN.a);
  const current = await hashes(ROOT), original = await hashes(ORIGINAL_A), baseline = await hashes(BASE);
  const authorizedFixes = ['runtime/core/motivation-runtime.mjs', 'runtime/core/survival-state.mjs', 'runtime/knowledge/survival-knowledge.mjs'];
  const committedChanges = git(ROOT, ['diff', '--name-only', PIN.a, 'HEAD', '--', 'runtime', 'simulation-runner.mjs']);
  assert.ok(committedChanges.split(/\r?\n/).filter(Boolean).every(f => authorizedFixes.includes(f)), 'no unapproved committed backend changes');
  const normalizedCurrent = await hashes(ROOT, true), normalizedA = await hashes(ORIGINAL_A, true);
  const normalizedDifferences = Object.keys(normalizedCurrent).filter(f => normalizedCurrent[f] !== normalizedA[f]);
  assert.deepEqual(normalizedDifferences, authorizedFixes, 'only root-authorized Knowledge binding and expiry fixes change backend');
  assert.deepEqual(Object.fromEntries(Object.entries(normalizedCurrent).filter(([f]) => !authorizedFixes.includes(f))),
    Object.fromEntries(Object.entries(normalizedA).filter(([f]) => !authorizedFixes.includes(f))));
  const affected = Object.keys(current).filter(file => current[file] !== baseline[file]);
  await evidence('sources', { pins: PIN, actualHead, committedChanges, node: process.version, runtimeHash: sha(canonicalJson(current)), current, original, baseline, affected, normalizedDifferences, normalizedCurrent, normalizedA, rootAuthorizedFixes: authorizedFixes, rawAByteDifferences: Object.keys(current).filter(f => current[f] !== original[f]),
    testHash: sha(await fs.readFile(fileURLToPath(import.meta.url))) });
});

test('S5/S7 reopen preserves both DTOs: repeat never pays, buys, learns, or consumes again', async () => {
  const seeded = await seedOwner('reopen-idempotency', 'earn-then-buy'); let owner = seeded.owner;
  const commands = [time('review-work', 0, 144), time('review-buy', 144, 144), rest('review-player-rest', 288)];
  try {
    const receipts = [];
    for (const dto of commands) receipts.push(await owner.submit(dto));
    const before = projections(owner), bytes = await diskBytes(seeded.directory);
    const commit = await readJson(path.join(seeded.directory, `service-commit-r${before.public.revision}.json`));
    assert.equal(commit.serviceFormatVersion, 7); assert.equal(commit.commands.length, 3);
    const actor = commit.bundle.snapshot.world.societyModel.agents.find(a => a.state.actorId === 'actor-2').state;
    assert.equal(actor.ledger.wages, 20); assert.equal(actor.ledger.workDays, 1); assert.equal(actor.ledger.foodBought, 1);
    assert.equal(actor.ledger.foodUsed, 1); assert.equal(actor.wallet, 10); assert.equal(actor.inventory.food, 0);
    assert.equal(before.mind.actors.find(a => a.knowledge.actorId === 'actor-2').workExperience.view.sampleCount, 1);
    await owner.close(); owner = await createRuntimeOwner({ directory: seeded.directory, writable: true });
    assert.deepEqual(projections(owner), before);
    for (let i = 0; i < commands.length; i++) assert.deepEqual(await owner.submit(commands[i]), receipts[i]);
    assert.deepEqual(projections(owner), before); assert.deepEqual(await diskBytes(seeded.directory), bytes);
    await assert.rejects(owner.submit({ ...commands[0], payload: { ticks: 143 } }), e => e.code === 'COMMAND_ID_CONFLICT');
    await assert.rejects(owner.submit(time('review-stale', 0)), e => e.code === 'REVISION_CONFLICT');
    assert.deepEqual(projections(owner), before); assert.deepEqual(await diskBytes(seeded.directory), bytes);
    await evidence('reopen', { receipts, finalRevision: before.public.revision, commands: commit.commands.length,
      projectionHash: sha(canonicalJson(before)), diskHashes: Object.fromEntries(Object.entries(bytes).map(([n, b]) => [n, sha(Buffer.from(b, 'base64'))])) });
  } finally { await owner.close(); }
});

test('S6 journal mutation is substantive and full audit rejects altered command or receipt', async () => {
  const { owner, directory } = await seedOwner('journal-tamper');
  try {
    await owner.submit(time('journal-real-advance', 0, 1));
    const cleanFile = path.join(directory, 'service-commit-r1.json'), clean = await loadServiceCommit(cleanFile);
    assert.equal(clean.commands.length, 1); assert.equal(clean.commands[0].dto.payload.ticks, 1);
    const cleanCanonical = canonicalJson(clean), edits = [];
    for (const [label, mutate] of [
      ['command-ticks', v => { v.commands[0].dto.payload.ticks = 2; }],
      ['receipt-tick', v => { v.commands[0].receipt.tick = 2; }],
    ]) {
      const changed = structuredClone(clean); mutate(changed);
      assert.notEqual(canonicalJson(changed), cleanCanonical, 'must change canonical journal bytes before testing rejection');
      const file = path.join(await workspace('tampered-inputs'), `${label}.json`); await fs.writeFile(file, canonicalJson(changed));
      await assert.rejects(loadServiceCommit(file), e => e.code === 'INVALID_SERVICE_COMMIT');
      edits.push({ label, cleanHash: sha(cleanCanonical), changedHash: sha(canonicalJson(changed)) });
    }
    assert.deepEqual(await loadServiceCommit(cleanFile), clean); await evidence('journal', edits);
  } finally { await owner.close(); }
});

for (const failurePoint of ['write', 'link']) test(`S7 ${failurePoint} failure preserves full three projections and durable bytes; retry/reopen agree`, async () => {
  let fail = false, injected = 0;
  const io = { ...fs,
    async open(file, flags, ...args) {
      const handle = await fs.open(file, flags, ...args);
      if (failurePoint !== 'write' || !fail || !String(file).endsWith('.tmp')) return handle;
      return new Proxy(handle, { get(target, key) {
        if (key === 'writeFile') return async () => { fail = false; injected++; throw Object.assign(new Error('M4_REVIEW_WRITE_EIO'), { code: 'EIO' }); };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
    async link(...args) { if (failurePoint === 'link' && fail) { fail = false; injected++; throw Object.assign(new Error('M4_REVIEW_LINK_EIO'), { code: 'EIO' }); } return fs.link(...args); },
  };
  const seeded = await seedOwner(`fault-${failurePoint}`, 'affordable', io); let owner = seeded.owner;
  try {
    const old = projections(owner), bytes = await diskBytes(seeded.directory), dto = time(`retry-${failurePoint}`, 0, 144);
    fail = true; await assert.rejects(owner.submit(dto), e => e.code === 'SAVE_FAILED' && e.cause?.code === 'EIO');
    assert.equal(injected, 1); assert.deepEqual(projections(owner), old); assert.deepEqual(await diskBytes(seeded.directory), bytes);
    assert.deepEqual(await fs.readdir(seeded.directory).then(a => a.sort()), ['.runtime-owner.lock', 'service-commit-r0.json']);
    await owner.close(); owner = await createRuntimeOwner({ directory: seeded.directory, writable: true });
    assert.deepEqual(projections(owner), old); assert.deepEqual(await diskBytes(seeded.directory), bytes);
    const receipt = await owner.submit(dto), after = projections(owner), committed = await diskBytes(seeded.directory);
    assert.equal(receipt.toRevision, 144);
    for (const p of Object.values(after)) assert.equal(p.revision, 144);
    const envelope = await loadServiceCommit(path.join(seeded.directory, 'service-commit-r144.json'));
    assert.equal(envelope.commands.length, 1); assert.deepEqual(envelope.commands[0].dto, dto);
    const state = envelope.bundle.snapshot.world.societyModel.agents.find(a => a.state.actorId === 'actor-2').state;
    assert.equal(state.wallet, 20); assert.equal(state.inventory.food, 0); assert.equal(state.ledger.foodBought, 1); assert.equal(state.ledger.foodUsed, 1);
    await owner.close(); owner = await createRuntimeOwner({ directory: seeded.directory, writable: true });
    assert.deepEqual(projections(owner), after); assert.deepEqual(await owner.submit(dto), receipt);
    assert.deepEqual(projections(owner), after); assert.deepEqual(await diskBytes(seeded.directory), committed);
    await evidence(`fault-${failurePoint}`, { injected, receipt, beforeProjectionHash: sha(canonicalJson(old)), afterProjectionHash: sha(canonicalJson(after)),
      beforeDiskHashes: Object.fromEntries(Object.entries(bytes).map(([n, b]) => [n, sha(Buffer.from(b, 'base64'))])),
      afterDiskHashes: Object.fromEntries(Object.entries(committed).map(([n, b]) => [n, sha(Buffer.from(b, 'base64'))])) });
  } finally { await owner.close(); }
});

// Independent version table from the frozen M1/M2/M3 contracts and M4A §3.1.
const SEVEN = ['society-day-', 'mind-day-', 'mind-settle-', 'motivation-day-', 'experience-day-', 'cognition-day-', 'cognition-eval-'];
const RESERVED = { 1: [], 2: [], 3: [], 4: ['mind-day-', 'society-day-'], 5: ['mind-day-', 'society-day-', 'motivation-day-'], 6: SEVEN, 7: [...SEVEN, 'survival-day-'] };
test('S7 formats1-7 retain exact old prefix boundaries and validate format/profile isolation', async () => {
  await loadMotivationBackend(); await loadCognitionBackend(); await loadSurvivalBackend();
  const fixtures = [createPersonalityNeutral, createPlayerVillage, createPlayerPlayVillage, createMindVillage, createMotivationVillage, createCognitionVillage, createSurvivalVillage];
  const outcomes = [];
  for (let index = 0; index < fixtures.length; index++) {
    const format = index + 1, { bundle } = fixtures[index]();
    assert.equal(runtimeProfile(bundle).serviceFormatVersion, format);
    assert.doesNotThrow(() => validateServiceCommit({ serviceFormatVersion: format, anchor: bundle, commands: [], bundle }));
    assert.throws(() => validateServiceCommit({ serviceFormatVersion: format === 7 ? 6 : 7, anchor: bundle, commands: [], bundle }), e => e.code === 'UNSUPPORTED_VERSION');
    for (const prefix of [...SEVEN, 'survival-day-']) for (const version of [1, 2]) {
      const dto = version === 1 ? time(`${prefix}probe`) : rest(`${prefix}probe`);
      const rejected = RESERVED[format].includes(prefix) || (version === 2 && prefix === 'society-day-');
      if (rejected) assert.throws(() => transitionServiceCommand(bundle, dto), e => e.code === 'INVALID_INPUT', `format${format} DTO${version} ${prefix}`);
      else if (version === 2 && format < 3) assert.throws(() => transitionServiceCommand(bundle, dto), e => e.code === 'COMMAND_UNSUPPORTED');
      else assert.equal(transitionServiceCommand(bundle, dto).receipt.commandId, dto.commandId, `format${format} DTO${version} ${prefix} stays permitted`);
      outcomes.push({ format, version, prefix, expected: rejected ? 'INVALID_INPUT' : version === 2 && format < 3 ? 'COMMAND_UNSUPPORTED' : 'committed' });
    }
  }
  await evidence('formats-prefixes', { assertions: outcomes.length, outcomes });
});

test('S7 actual survival loader distinguishes exact missing target from internal failures', async t => {
  const cases = [
    { name: 'exact-target-missing', pending: true },
    { name: 'transitive-missing', mutate: s => `import './m4-review-missing.mjs';\n${s}`, code: 'ERR_MODULE_NOT_FOUND' },
    { name: 'syntax-error', mutate: s => `${s}\nconst m4_invalid = ;`, errorName: 'SyntaxError' },
    { name: 'initialization-throw', mutate: s => `${s}\nthrow new Error('M4_REVIEW_INIT_SENTINEL');`, message: 'M4_REVIEW_INIT_SENTINEL' },
    { name: 'missing-required-export', mutate: s => s.replace('export function projectSurvivalInspector', 'function projectSurvivalInspector'), code: 'UNSUPPORTED_VERSION' },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
    const runtime = path.join(await workspace(`loader-${scenario.name}`), 'runtime');
    await fs.cp(path.join(ROOT, 'runtime'), runtime, { recursive: true, force: false, errorOnExist: true });
    const file = path.join(runtime, 'knowledge/survival-knowledge.mjs'), original = await fs.readFile(file, 'utf8');
    assert.equal(sha(original), sha(await fs.readFile(path.join(ROOT, 'runtime/knowledge/survival-knowledge.mjs'))));
    if (scenario.pending) await fs.unlink(file); else { const changed = scenario.mutate(original); assert.notEqual(changed, original); await fs.writeFile(file, changed); }
    const loader = await import(pathToFileURL(path.join(runtime, 'service/http-contract.mjs')).href);
    if (scenario.pending) {
      const result = await loader.loadSurvivalBackend(); assert.equal(result.dependencyPending, true); assert.equal(result.failure, null);
      assert.equal(result.missingSpecifier, '../knowledge/survival-knowledge.mjs'); assert.equal(loader.survivalBackendState().available, false);
      assert.throws(() => loader.requireSurvivalBackend(), e => e.code === 'UNSUPPORTED_VERSION');
    } else {
      let failure; try { await loader.loadSurvivalBackend(); } catch (e) { failure = e; }
      assert.ok(failure); if (scenario.code) assert.equal(failure.code, scenario.code);
      if (scenario.errorName) assert.equal(failure.name, scenario.errorName); if (scenario.message) assert.equal(failure.message, scenario.message);
      assert.equal(loader.survivalBackendState().dependencyPending, false); assert.equal(loader.survivalBackendState().available, false);
      assert.throws(() => loader.requireSurvivalBackend(), e => e === failure);
      await assert.rejects(loader.loadSurvivalBackend(), e => e === failure);
      await evidence(`loader-${scenario.name}`, { name: failure.name, code: failure.code ?? null, message: failure.message });
    }
  });
});

// Compare every exported business file byte-for-byte, plus EVERY hash-valued summary field.
// Runtime metadata is intentionally not business: timings, memory, code identity and paths differ.
for (const fixture of ['motivation-village', 'experience-village', 'cognition-village']) test(`S6 legacy ${fixture} seed42 288ticks matches full baseline artifacts and summary business hashes`, async () => {
  const root = await workspace(`legacy-${fixture}`), baseOut = path.join(root, 'baseline'), targetOut = path.join(root, 'candidate');
  const commands = [];
  for (const [tree, out] of [[BASE, baseOut], [ROOT, targetOut]]) {
    const args = [path.join(tree, 'simulation-runner.mjs'), '--fixture', fixture, '--days', '2', '--seed', '42', '--out', out];
    const started = Date.now(), stdout = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 120000 });
    commands.push({ executable: process.execPath, args, exit: 0, elapsedMs: Date.now() - started, stdout });
  }
  const files = (await fs.readdir(baseOut)).sort(); assert.deepEqual((await fs.readdir(targetOut)).sort(), files);
  const fileHashes = {};
  for (const file of files.filter(f => f !== 'summary.json')) {
    const base = await fs.readFile(path.join(baseOut, file)), candidate = await fs.readFile(path.join(targetOut, file));
    assert.ok(base.equals(candidate), `${fixture} complete byte parity: ${file}`); fileHashes[file] = sha(base);
  }
  const baseSummary = await readJson(path.join(baseOut, 'summary.json')), currentSummary = await readJson(path.join(targetOut, 'summary.json'));
  const hashKeys = Object.keys(baseSummary).filter(k => /Hash$/.test(k) && k !== 'sourceHash').sort();
  assert.deepEqual(Object.keys(currentSummary).filter(k => /Hash$/.test(k) && k !== 'sourceHash').sort(), hashKeys);
  for (const key of hashKeys) assert.equal(currentSummary[key], baseSummary[key], `${fixture} summary ${key}`);
  for (const key of ['status', 'fixtureId', 'fixtureVersion', 'rulesVersion', 'simulationId', 'seed', 'startTick', 'tick', 'revision', 'eventCount', 'failedTick', 'error']) assert.deepEqual(currentSummary[key], baseSummary[key], `${fixture} summary ${key}`);
  assert.equal(baseSummary.status, 'succeeded'); assert.equal(baseSummary.tick, 288); assert.equal(baseSummary.seed, 42);
  await evidence(`legacy-${fixture}`, { commands, fixture, ticks: 288, seed: 42, files: fileHashes, businessSummaryHashes: Object.fromEntries(hashKeys.map(k => [k, baseSummary[k]])), fullArtifactCount: files.length - 1 });
});




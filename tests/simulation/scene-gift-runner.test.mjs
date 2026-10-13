import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { SCENE_PROFILE, SCENE_RULES, executeSceneIntent } from '../../runtime/core/scene-runtime.mjs';
import { createSceneVillage, sceneSystems } from '../../runtime/fixtures/scene-survival-village.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const BASELINE_SHA = '12f45f65ab63621cbfdbfb3464ae26678acf2b26';
const LEGACY_ENCOUNTER_FILE_HASHES = new Map([
  ['actions.csv', '41a46fae6774cb6ba4858ec9961bc683ef31a1d7f95d58c903c0dba29d09ad08'],
  ['actor-config.json', '648b2cddbd17404822ccb93cc5874171e30e1b0fdb14307b6bbd5417f60fd05a'],
  ['actors.csv', '0f3a73839885c0b87ba403b9547d47d4ccc928816aaf5480abc85d8e1eb5a8bb'],
  ['checkpoint-r0.json', 'caa32a6ca5210f4016da38f8ca3d14c0ac94b8a7d52d07b935e1957b7bf95218'],
  ['cognition-config.json', 'a5c8e0bda326a39fcab7944f456908cc42523898ee8eb3802cd8a5a5d8f02e9a'],
  ['cognition-state.json', '62ca324d46d8a6c5c1cd49734c4fa0ed1ec1737554666de84fcafc3ab4afb9c7'],
  ['ecology-config.json', '178c9c8b78c39cde25b13c7968e5fa3a365c5e152e7cfb46af2ff01e1b5dd660'],
  ['ecology.csv', 'f1ff706d3d24402d995a5796695533898294bf84184b4ed32aa8f65616690962'],
  ['economy.csv', 'c1995d1ab71a3e92773fb84ac7c15982377f64ba487b8faa5aeea5d7c3abce44'],
  ['encounter-inputs.json', '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'],
  ['encounter-state.json', 'b22e4b62af1a77fc3600ceff8818e7af3b9656ad2254603230940bc8c787f312'],
  ['events.csv', '5caa70c56a93434dffa1b56284cdb2389cc4cd822bd20d1c176ceed3c5392779'],
  ['experience-config.json', '003c6cb768c0abb25173490be2b8256711df7819afd21fbe1f7f3abde00e52f4'],
  ['inputs.json', '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'],
  ['market-config.json', '55c4ff6dfc654bb846cab6e0f72c50f5e180f16d6d5a363d1c6cfe8d155176e4'],
  ['market.csv', 'd186d8cb0663755e3fbe509e2857051f2d818be17f92ee983d3aa81cca1565e2'],
  ['memories.csv', '930729083706da98f3b5f0bd68c5c04b9c3b5c1a6e7217373b4d04cf0770ed0d'],
  ['memory-config.json', '4dc9d26b9662170e084e1a0a1c3e02751189632b11b35e01918fdf622bb4aafd'],
  ['mind-config.json', '8e357229d2a5b899e6949d11b5c72a574c4fd2f51d84dbd6d86a72d84385f3b3'],
  ['mind-inspector.json', '7fd6115e2df1ecc5fb33d24019296112f414b860659ad6112a3c466bd634146d'],
  ['motivation-config.json', '9c77a6284682b5d7803afed5a3cd78eb50f90b6a655d13912a89a2b5dae83dd5'],
  ['population.csv', '92a7a4a88728934133ef0784b8fdda472c8b71346b8a15b7afc7bf6177689728'],
  ['relationships.csv', '4017bdcee7608bacd4d2922ca5f372cbf9b71b18200ed35c689ef45140e2dbe7'],
  ['resource-config.json', '3f7625cdc7095b77f53e40f6426d1202f2c20607f1593afcbdea37a4d00f700a'],
  ['society-config.json', '8cc3496a9bea9d4f6c830bac1a2afb24b8d47995e22705bf0bf2ef4904a8d196'],
  ['society.csv', '71d62f35df0b0a83017878b6a032037acb96ca77d75ff89430e674a337cd0e47'],
  ['trade.csv', '11f039c67f5192d4fe47f61b8b2558237b25e4f2df1b01c76a0f3c0febfd6d28'],
  ['work-experience.json', '3dd526d921100858c815f9f301e30eaf534cf9fd28fe00b7227ab9972340e001'],
]);
const SUMMARY_RUNTIME_FIELDS = new Set([
  'codeSha', 'codeDirty', 'codeMetadataStatus', 'sourceHash', 'nodeVersion', 'startTick',
  'executionStats', 'elapsedMs', 'memoryUsage', 'checkpointPath',
]);
const legacyExportNames = (revision) => [...LEGACY_ENCOUNTER_FILE_HASHES.keys()]
  .map((name) => name === 'checkpoint-r0.json' ? `checkpoint-r${revision}.json` : name);

async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'scene-gift-runner-test-');
  const directory = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(directory.startsWith(prefix));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function evidenceTest(name, run) {
  test(name, async (t) => {
    console.log(`[CP2b runner] BEGIN ${name}`);
    try {
      await run(t);
      console.log(`[CP2b runner] END ${name} status=passed`);
    } catch (error) {
      console.log(`[CP2b runner] END ${name} status=failed`);
      throw error;
    }
  });
}

function cli(args, label) {
  console.log(`[CP2b runner] CLI BEGIN ${label}`);
  const result = spawnSync(process.execPath, ['simulation-runner.mjs', ...args], {
    cwd: root, encoding: 'utf8', timeout: 600000,
  });
  console.log(`[CP2b runner] CLI END ${label} exit=${result.status} error=${result.error?.code ?? 'none'}`);
  return result;
}

function giftDto(commandId = 'cp2b-runner-gift', expectedRevision = 0) {
  return { version: 3, commandId, expectedRevision, type: 'PlayerGiftFood', payload: { recipientId: 'actor-2' } };
}

function advanceDto(commandId, expectedRevision, ticks) {
  return { version: 3, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks } };
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value), 'utf8');
  return file;
}

async function assertRejectedBeforeOutput(result, out, code = undefined) {
  assert.equal(result.error, undefined, result.error?.stack);
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  if (code) assert.match(result.stderr, new RegExp(`ERROR ${code}:`), result.stderr);
  else assert.match(result.stderr, /^ERROR [A-Z_]+:/, result.stderr);
  await assert.rejects(fs.access(out), { code: 'ENOENT' });
}

function fileHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSummaryOnlyRuntimeDifferences(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    if (SUMMARY_RUNTIME_FIELDS.has(key)) continue;
    assert.deepEqual(after[key], before[key], `summary business field ${key} must remain identical`);
  }
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'resume must not drop/add summary fields');
  assert.equal(after.startTick, 1, 'only the documented resume startTick changes for this checkpoint');
  assert.equal(before.startTick, 0);
  assert.equal(after.sceneHash, before.sceneHash, 'sceneHash is a business field and is compared exactly');
}

evidenceTest('D4 scene fixture exports a canonical no-opportunity world at tick zero', async (t) => {
  const directory = await temporary(t), out = path.join(directory, 'scene-zero');
  const result = cli(['--fixture', SCENE_PROFILE, '--days', '0', '--seed', '42', '--out', out], 'scene-zero-days');
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.status, 0, `scene --days 0 must export; stdout=${result.stdout}; stderr=${result.stderr}`);

  const summary = JSON.parse(await fs.readFile(path.join(out, 'summary.json'), 'utf8'));
  const checkpoint = JSON.parse(await fs.readFile(summary.checkpointPath, 'utf8'));
  const sceneBytes = await fs.readFile(path.join(out, 'scene-view.json'), 'utf8');
  const sceneView = JSON.parse(sceneBytes);
  const world = checkpoint.snapshot.world;
  const hunter = world.actorModel.actors.find((actor) => actor.actorId === 'actor-2');
  const hunterEstate = world.societyModel.agents.find((agent) => agent.state.actorId === 'actor-2');

  assert.equal(summary.fixtureId, SCENE_PROFILE);
  assert.equal(summary.rulesVersion, SCENE_RULES);
  assert.equal(summary.tick, 0);
  assert.equal(checkpoint.snapshot.schemaVersion, 3);
  assert.equal(checkpoint.snapshot.tick, 0);
  assert.equal(world.playerModel.inventory.food, 20);
  assert.equal(hunter.occupation, 'hunter');
  assert.equal(hunter.hunger, 200);
  assert.equal(hunterEstate.state.inventory.food, 0);
  assert.equal(hunterEstate.state.wallet, 0);
  assert.equal(world.encounterModel.encounter, null, 'default recipe has no active encounter opportunity');
  assert.equal(sceneView.self.food, 20);
  assert.equal(sceneView.actors.find((actor) => actor.actorId === 'actor-2').gift.available, true);
  assert.equal(sceneBytes, canonicalJson(sceneView));
  assert.equal(summary.sceneHash, fileHash(Buffer.from(canonicalJson(sceneView), 'utf8')));
  await assert.rejects(fs.access(path.join(out, 'scene-state.json')), { code: 'ENOENT' });
});

evidenceTest('D4 scene default CLI day uses AdvanceTime and keeps the no-gift day-one anchors', async (t) => {
  const directory = await temporary(t), out = path.join(directory, 'scene-day-one');
  const result = cli(['--fixture', SCENE_PROFILE, '--days', '1', '--seed', '42', '--out', out], 'scene-default-one-day');
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.status, 0, `scene day-one CLI failed: ${result.stderr}`);
  if (process.env.CP2B_SAVE_DAY_ONE_ARTIFACTS === '1') {
    const evidence = path.join(root, 'artifacts/world-runtime-d4-cp2b-controller/scene-day-one');
    await assert.rejects(fs.access(evidence), { code: 'ENOENT' });
    await fs.mkdir(path.dirname(evidence), { recursive: true });
    await fs.cp(out, evidence, { recursive: true, errorOnExist: true });
  }

  const summary = JSON.parse(await fs.readFile(path.join(out, 'summary.json'), 'utf8'));
  const checkpoint = JSON.parse(await fs.readFile(summary.checkpointPath, 'utf8'));
  const world = checkpoint.snapshot.world;
  const hunter = world.actorModel.actors.find((actor) => actor.actorId === 'actor-2');
  const sceneBytes = await fs.readFile(path.join(out, 'scene-view.json'), 'utf8');
  const sceneView = JSON.parse(sceneBytes);

  assert.equal(summary.tick, 144);
  assert.equal(checkpoint.snapshot.tick, 144);
  assert.equal(world.playerModel.inventory.food, 19);
  assert.equal(hunter.hunger, 300);
  assert.equal(world.societyModel.agents.find((agent) => agent.state.actorId === 'actor-2').state.inventory.food, 0);
  assert.equal(world.resources.food, 464);
  assert.equal(world.playerModel.ledger.foodGiven, 0);
  assert.equal(world.encounterModel.inputHistory.length, 1, 'the single accepted input is AdvanceTime');
  assert.equal(world.encounterModel.inputHistory[0].dto.type, 'AdvanceTime');
  assert.equal(world.memoryModel.observer.actors.every((actor) =>
    actor.memories.every((memory) => memory.observable?.type !== 'food-gift')),
  true, 'the default no-opportunity day does not invent Gift memories');
  assert.equal(sceneView.tick, 144);
  assert.equal(sceneBytes, canonicalJson(sceneView));
  assert.equal(summary.sceneHash, fileHash(Buffer.from(canonicalJson(sceneView), 'utf8')));
  assert.deepEqual((await fs.readdir(out)).sort(),
    [...legacyExportNames(summary.revision), 'scene-view.json', 'summary.json'].sort(),
    'the default day still exports the complete legacy business/config set plus scene-view');
});

evidenceTest('D4 scene CLI imports a DTO3 Gift and exports both persistent memories and the public scene view', async (t) => {
  const directory = await temporary(t), inputs = await writeJson(path.join(directory, 'gift-inputs.json'), [giftDto()]);
  const out = path.join(directory, 'scene-gift');
  const result = cli(['--fixture', SCENE_PROFILE, '--days', '0', '--seed', '42', '--encounter-inputs', inputs, '--out', out],
    'scene-gift-zero-tick');
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.status, 0, `scene Gift CLI failed: ${result.stderr}`);

  const summary = JSON.parse(await fs.readFile(path.join(out, 'summary.json'), 'utf8'));
  const checkpoint = JSON.parse(await fs.readFile(summary.checkpointPath, 'utf8'));
  const world = checkpoint.snapshot.world;
  const sceneBytes = await fs.readFile(path.join(out, 'scene-view.json'), 'utf8');
  const sceneView = JSON.parse(sceneBytes);
  const donor = world.memoryModel.observer.actors.find((actor) => actor.actorId === 'actor-4');
  const receiver = world.memoryModel.observer.actors.find((actor) => actor.actorId === 'actor-2');
  const donorGifts = donor.memories.filter((memory) => memory.observable?.type === 'food-gift');
  const receiverGifts = receiver.memories.filter((memory) => memory.observable?.type === 'food-gift');

  assert.equal(summary.tick, 0);
  assert.equal(summary.revision, 1);
  assert.equal(checkpoint.snapshot.schemaVersion, 3);
  assert.equal(world.playerModel.inventory.food, 19);
  assert.equal(world.playerModel.ledger.foodGiven, 1);
  assert.equal(world.societyModel.agents.find((agent) => agent.state.actorId === 'actor-2').state.inventory.food, 1);
  assert.equal(donorGifts.length, 1);
  assert.equal(receiverGifts.length, 1);
  assert.equal(donorGifts[0].occurrenceTick, 0);
  assert.equal(receiverGifts[0].occurrenceTick, 0);
  assert.equal(donorGifts[0].observable.direction, 'given');
  assert.equal(receiverGifts[0].observable.direction, 'received');
  assert.equal(donorGifts[0].observable.commandId, giftDto().commandId);
  assert.equal(receiverGifts[0].observable.commandId, giftDto().commandId);
  assert.equal(sceneBytes, canonicalJson(sceneView));
  assert.equal(summary.sceneHash, fileHash(Buffer.from(canonicalJson(sceneView), 'utf8')));
  assert.equal(sceneView.revision, 1);
  assert.equal(sceneView.self.food, 19);
  assert.equal(sceneView.actors.find((actor) => actor.actorId === 'actor-2').receivedGifts.length, 1);

  const names = (await fs.readdir(out)).sort();
  assert.deepEqual(names, [...legacyExportNames(summary.revision), 'scene-view.json', 'summary.json'].sort(),
    'scene adds exactly scene-view.json to the legacy encounter export collection');
  await assert.rejects(fs.access(path.join(out, 'scene-state.json')), { code: 'ENOENT' });
});

evidenceTest('D4 Gift plus one tick resumes at zero days with byte-identical business exports', async (t) => {
  const directory = await temporary(t);
  const inputs = await writeJson(path.join(directory, 'gift-advance-inputs.json'), [
    giftDto('cp2b-gift-then-one-tick', 0), advanceDto('cp2b-one-tick', 1, 1),
  ]);
  const first = path.join(directory, 'scene-before-resume'), resumed = path.join(directory, 'scene-after-resume');
  const initialResult = cli(['--fixture', SCENE_PROFILE, '--days', '0', '--seed', '42', '--encounter-inputs', inputs, '--out', first],
    'scene-gift-plus-one-tick');
  assert.equal(initialResult.error, undefined, initialResult.error?.stack);
  assert.equal(initialResult.status, 0, `Gift + AdvanceTime(1) CLI failed: ${initialResult.stderr}`);
  const initialSummary = JSON.parse(await fs.readFile(path.join(first, 'summary.json'), 'utf8'));
  assert.equal(initialSummary.tick, 1);
  assert.equal(initialSummary.revision, 2);

  const resumeResult = cli(['--resume', initialSummary.checkpointPath, '--days', '0', '--out', resumed], 'scene-resume-zero-days');
  assert.equal(resumeResult.error, undefined, resumeResult.error?.stack);
  assert.equal(resumeResult.status, 0, `scene checkpoint resume failed: ${resumeResult.stderr}`);
  const resumedSummary = JSON.parse(await fs.readFile(path.join(resumed, 'summary.json'), 'utf8'));
  const initialCheckpoint = JSON.parse(await fs.readFile(initialSummary.checkpointPath, 'utf8'));
  const resumedCheckpoint = JSON.parse(await fs.readFile(resumedSummary.checkpointPath, 'utf8'));
  assert.deepEqual(resumedCheckpoint.snapshot, initialCheckpoint.snapshot);
  assert.deepEqual(resumedCheckpoint.eventLog, initialCheckpoint.eventLog);
  assertSummaryOnlyRuntimeDifferences(initialSummary, resumedSummary);
  assert.equal(resumedSummary.stateHash, initialSummary.stateHash);
  assert.equal(resumedSummary.eventHash, initialSummary.eventHash);
  assert.equal(resumedSummary.sceneHash, initialSummary.sceneHash);

  const beforeNames = (await fs.readdir(first)).filter((name) => name !== 'summary.json').sort();
  const resumedNames = (await fs.readdir(resumed)).filter((name) => name !== 'summary.json').sort();
  assert.deepEqual(resumedNames, beforeNames);
  for (const name of beforeNames) {
    const before = await fs.readFile(path.join(first, name));
    const after = await fs.readFile(path.join(resumed, name));
    assert.deepEqual(after, before, `business artifact ${name} must remain byte-identical`);
  }
});

evidenceTest('D4 accepts a normal non-day-boundary Gift checkpoint and rejects scene resume overrides and tampering', async (t) => {
  const directory = await temporary(t), checkpointDirectory = path.join(directory, 'checkpoint-source');
  const { bundle: initial, systems } = createSceneVillage(42, 'cp2b-preexisting-checkpoint');
  let bundle = executeSceneIntent(initial, giftDto('cp2b-saved-gift', 0)).bundle;
  bundle = executeSceneIntent(bundle, advanceDto('cp2b-saved-tick', 1, 1)).bundle;
  const checkpointPath = await saveCheckpoint(bundle, { directory: checkpointDirectory, rulesVersion: SCENE_RULES, systems });
  assert.equal(bundle.snapshot.tick, 1);
  assert.equal(bundle.snapshot.tick % 144, 1, 'checkpoint is deliberately off the daily boundary');

  const validOut = path.join(directory, 'valid-resume');
  const valid = cli(['--resume', checkpointPath, '--days', '0', '--out', validOut], 'scene-preexisting-checkpoint-resume');
  assert.equal(valid.error, undefined, valid.error?.stack);
  assert.equal(valid.status, 0, `valid pre-existing scene checkpoint was not restored: ${valid.stderr}`);
  const validSummary = JSON.parse(await fs.readFile(path.join(validOut, 'summary.json'), 'utf8'));
  const validSceneBytes = await fs.readFile(path.join(validOut, 'scene-view.json'), 'utf8');
  const validScene = JSON.parse(validSceneBytes);
  assert.equal(validSummary.tick, 1);
  assert.equal(validSceneBytes, canonicalJson(validScene));
  assert.equal(validSummary.sceneHash, fileHash(Buffer.from(canonicalJson(validScene), 'utf8')));
  assert.equal(validScene.actors.find((actor) => actor.actorId === 'actor-2').receivedGifts.length, 1);

  const validGiftFile = await writeJson(path.join(directory, 'resume-gift.json'), [giftDto('cp2b-resume-added-input', 2)]);
  const badRuns = [
    { label: 'resume-mixed-fixture', args: ['--resume', checkpointPath, '--fixture', SCENE_PROFILE, '--days', '0'], code: 'INVALID_INPUT' },
    { label: 'resume-mixed-seed', args: ['--resume', checkpointPath, '--days', '0', '--seed', '42'], code: 'INVALID_INPUT' },
    { label: 'scene-resume-positive-days', args: ['--resume', checkpointPath, '--days', '1'], code: 'INVALID_INPUT' },
    { label: 'scene-resume-extra-inputs', args: ['--resume', checkpointPath, '--days', '0', '--encounter-inputs', validGiftFile], code: 'INVALID_INPUT' },
  ];
  for (const entry of badRuns) {
    const out = path.join(directory, entry.label);
    const result = cli([...entry.args, '--out', out], entry.label);
    await assertRejectedBeforeOutput(result, out, entry.code);
  }

  const unknownRules = structuredClone(JSON.parse(await fs.readFile(checkpointPath, 'utf8')));
  unknownRules.snapshot.rulesVersion = 'd-future-unknown-v99';
  const unknownRulesPath = await writeJson(path.join(directory, 'unknown-rules.json'), unknownRules);
  const unknownOut = path.join(directory, 'unknown-rules-out');
  await assertRejectedBeforeOutput(cli(['--resume', unknownRulesPath, '--days', '0', '--out', unknownOut], 'scene-unknown-rules'),
    unknownOut);

  const corruptMemory = structuredClone(JSON.parse(await fs.readFile(checkpointPath, 'utf8')));
  const donorMemory = corruptMemory.snapshot.world.memoryModel.observer.actors
    .find((actor) => actor.actorId === 'actor-4').memories.find((memory) => memory.observable?.type === 'food-gift');
  assert.ok(donorMemory, 'normal checkpoint contains the donor Gift memory before tampering');
  donorMemory.observable.direction = 'received';
  const corruptPath = await writeJson(path.join(directory, 'tampered-memory.json'), corruptMemory);
  const corruptOut = path.join(directory, 'tampered-memory-out');
  await assertRejectedBeforeOutput(cli(['--resume', corruptPath, '--days', '0', '--out', corruptOut], 'scene-tampered-memory'),
    corruptOut, 'INVALID_CHECKPOINT');
});

evidenceTest('D4 Gift remains rejected by the legacy encounter parser and strict input budgets fail before output creation', async (t) => {
  const directory = await temporary(t);
  const cases = [];
  const addCase = async (label, contents, code) => {
    const input = path.join(directory, `${label}.json`);
    await fs.writeFile(input, contents, 'utf8');
    cases.push({ label, input, code });
  };
  await addCase('legacy-gift', JSON.stringify([giftDto('cp2b-legacy-gift', 0)]), 'INVALID_INPUT');
  await addCase('illegal-dto', JSON.stringify([{
    version: 3, commandId: 'cp2b-illegal-dto', expectedRevision: 0, type: 'UnrecognizedCommand', payload: {},
  }]), 'INVALID_INPUT');
  await addCase('duplicate-keys', '[{"version":3,"commandId":"first","commandId":"second","expectedRevision":0,"type":"AdvanceTime","payload":{"ticks":1}}]',
    'INVALID_INPUT');
  const overCount = Array.from({ length: 129 }, (_, index) => advanceDto(`cp2b-budget-${index}`, index, 1));
  await addCase('129-inputs', JSON.stringify(overCount), 'LIMIT_EXCEEDED');
  await addCase('input-byte-budget', ' '.repeat(524289), 'LIMIT_EXCEEDED');

  for (const entry of cases) {
    const out = path.join(directory, `${entry.label}-out`);
    const result = cli(['--fixture', 'encounter-survival-village', '--days', '0', '--seed', '42',
      '--encounter-inputs', entry.input, '--out', out], `legacy-${entry.label}`);
    await assertRejectedBeforeOutput(result, out, entry.code);
  }
});

evidenceTest('D4 CLI refuses an existing output directory without changing it', async (t) => {
  const directory = await temporary(t), out = path.join(directory, 'already-there');
  await fs.mkdir(out);
  await fs.writeFile(path.join(out, 'keep.txt'), 'existing bytes\n', 'utf8');
  const before = await fs.readFile(path.join(out, 'keep.txt'));
  const result = cli(['--fixture', SCENE_PROFILE, '--days', '0', '--seed', '42', '--out', out], 'scene-existing-output');
  assert.equal(result.error, undefined, result.error?.stack);
  assert.match(result.stderr, /ERROR SAVE_FAILED:/, result.stderr);
  assert.deepEqual(await fs.readFile(path.join(out, 'keep.txt')), before);
  assert.deepEqual((await fs.readdir(out)).sort(), ['keep.txt']);
});

evidenceTest('legacy encounter zero-day CLI business files match the frozen 12f45f6 baseline', async (t) => {
  assert.equal(BASELINE_SHA, '12f45f65ab63621cbfdbfb3464ae26678acf2b26');
  const directory = await temporary(t), out = path.join(directory, 'legacy-encounter-zero');
  const result = cli(['--fixture', 'encounter-survival-village', '--days', '0', '--seed', '42', '--out', out],
    'legacy-encounter-zero-day-baseline');
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.status, 0, `legacy encounter zero-day CLI failed: ${result.stderr}`);
  const summary = JSON.parse(await fs.readFile(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.tick, 0);
  assert.equal(summary.stateHash, '2ca36515f58f30612716b67f3558b9d6f85e4bea3f07253e7ec4fc065767dca7');
  assert.equal(summary.eventHash, '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
  const names = (await fs.readdir(out)).filter((name) => name !== 'summary.json').sort();
  assert.deepEqual(names, [...LEGACY_ENCOUNTER_FILE_HASHES.keys()].sort(), 'legacy export file set remains frozen');
  for (const [name, expectedHash] of LEGACY_ENCOUNTER_FILE_HASHES) {
    const bytes = await fs.readFile(path.join(out, name));
    assert.equal(fileHash(bytes), expectedHash, `legacy business artifact ${name} matches the pre-production baseline`);
  }
});

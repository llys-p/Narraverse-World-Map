import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENE_RULES, executeSceneIntent} from '../../runtime/core/scene-runtime.mjs';
import {ENCOUNTER_RULES} from '../../runtime/core/encounter-runtime.mjs';
import {canonicalSystems} from '../../runtime/core/command-engine.mjs';
import {createAuditedBundle, validateBundle} from '../../runtime/core/world-state.mjs';
import {createSceneVillage, sceneSystems} from '../../runtime/fixtures/scene-survival-village.mjs';
import {transitionServiceCommand} from '../../runtime/service/service-commit.mjs';

const options = {rulesVersion: SCENE_RULES, systems: sceneSystems()};
const gift = (bundle, commandId = 'audit-gift') => executeSceneIntent(bundle, {version: 3, commandId,
  expectedRevision: bundle.snapshot.revision, type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}}).bundle;
function deepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) deepFrozen(child, seen);
}

test('audited scene bundle is deeply immutable while public intent results stay detached and mutable', () => {
  const source = createSceneVillage(42).bundle, candidate = gift(source), immutable = createAuditedBundle(candidate, options);
  assert.deepEqual(immutable, candidate); deepFrozen(immutable); validateBundle(immutable, options);
  assert.strictEqual(createAuditedBundle(immutable, options), immutable);
  const systems = canonicalSystems(SCENE_RULES);
  assert.equal(Object.isFrozen(systems), false);
  assert.notStrictEqual(canonicalSystems(SCENE_RULES), systems);
  for(const key of Object.keys(systems)) assert.strictEqual(canonicalSystems(SCENE_RULES)[key], systems[key]);
  const detached = executeSceneIntent(immutable, {version: 3, commandId: 'public-copy', expectedRevision: 1,
    type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}}).bundle;
  assert.equal(Object.isFrozen(detached), false);
  detached.snapshot.world.playerModel.inventory.food++;
  assert.equal(immutable.snapshot.world.playerModel.inventory.food, 19);
  const serviceCopy=transitionServiceCommand(immutable,{version:3,commandId:'public-service-copy',expectedRevision:1,
    type:'PlayerGiftFood',payload:{recipientId:'actor-2'}}).bundle;
  assert.equal(Object.isFrozen(serviceCopy),false);
  serviceCopy.snapshot.world.playerModel.inventory.food++;
  assert.equal(immutable.snapshot.world.playerModel.inventory.food,19);
  for (const corrupt of [
    value => { value.snapshot.world.playerModel.inventory.food--; },
    value => { value.snapshot.world.memoryModel.observer.actors.find(a => a.actorId === 'actor-2')
      .memories.find(m => m.observable.type === 'food-gift').observable.quantity++; },
  ]) {
    const forged = structuredClone(immutable); corrupt(forged);
    assert.throws(() => validateBundle(forged, options), {code: 'INVALID_INPUT'});
    assert.throws(() => createAuditedBundle(forged, options), {code: 'INVALID_INPUT'});
  }
});

test('scene audit certificates bind exact rules and systems and refuse accessor inputs without reading them', () => {
  const immutable = createAuditedBundle(gift(createSceneVillage(42).bundle), options);
  assert.throws(() => validateBundle(immutable, {rulesVersion: ENCOUNTER_RULES,
    systems: canonicalSystems(ENCOUNTER_RULES)}), {code: 'UNSUPPORTED_VERSION'});
  const missingSurvival = {...options.systems}; delete missingSurvival.survival;
  assert.throws(() => validateBundle(immutable, {rulesVersion: SCENE_RULES, systems: missingSurvival}), {code:'INVALID_INPUT'});
  const inheritedSurvival = {...missingSurvival, constructor: Object};
  assert.throws(() => validateBundle(immutable, {rulesVersion: SCENE_RULES, systems: inheritedSurvival}),
    {code: 'INVALID_INPUT'});
  let getterCalls = 0;
  const dto = {version: 3, expectedRevision: 1, type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}};
  Object.defineProperty(dto, 'commandId', {enumerable: true, get() { getterCalls++; return 'getter-dto'; }});
  assert.throws(() => executeSceneIntent(immutable, dto), {code: 'INVALID_INPUT'});
  const accessorWorld = structuredClone(immutable);
  Object.defineProperty(accessorWorld.snapshot.world.playerModel.inventory, 'food',
    {enumerable: true, configurable: true, get() { getterCalls++; return 19; }});
  assert.throws(() => validateBundle(accessorWorld, options), {code: 'INVALID_INPUT'});
  assert.equal(getterCalls, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignVillage } from '../../runtime/fixtures/campaign-village.mjs';
import { validateCampaignWorldState } from '../../runtime/core/scene-campaign-runtime.mjs';
import { performCampaignTick, canonicalSystems } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';

const valid = (world, tick = 0) => validateCampaignWorldState(world, { tick });

test('identical campaign structures return detached validation results and cannot poison the cache', () => {
  const { bundle } = createCampaignVillage(42);
  const world = bundle.snapshot.world;
  const first = valid(world);
  const second = valid(structuredClone(world));
  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  assert.notStrictEqual(second.errors, first.errors);

  first.errors.push('caller mutation');
  const third = valid(structuredClone(world));
  assert.deepEqual(third.errors, []);
  assert.notStrictEqual(third.errors, second.errors);
});

test('mutated actor, numeric config, map, tick, and forged trust data are revalidated', () => {
  const { bundle } = createCampaignVillage(42);
  const world = bundle.snapshot.world;
  valid(world);

  const originalHealth = world.actorModel.actors[0].health;
  world.actorModel.actors[0].health = -1;
  assert.throws(() => valid(world));
  world.actorModel.actors[0].health = originalHealth;
  assert.equal(valid(world).valid, true);

  const originalConfigHealth = world.actorModel.config.initialActors[0].health;
  world.actorModel.config.initialActors[0].health = 1001;
  assert.throws(() => valid(world));
  world.actorModel.config.initialActors[0].health = originalConfigHealth;
  assert.equal(valid(world).valid, true);

  world.mapModel.position.x = 20;
  assert.throws(() => valid(world));
  world.mapModel.position.x = 4;
  assert.equal(valid(world).valid, true);

  world.mapModel.contact = { actorId: 'actor-1', tick: 1 };
  assert.equal(valid(world, 1).valid, true);
  assert.throws(() => valid(world, 0), /Map contact is not at the player/);
  world.mapModel.contact = null;
  assert.equal(valid(world).valid, true);

  const forged = Object.freeze({ ...structuredClone(world), trusted: true });
  assert.throws(() => valid(forged));
});

test('descriptor inspection rejects accessors before and after a successful cached proof', () => {
  const { bundle } = createCampaignVillage(42);
  let getterCalls = 0;
  const withGetter = () => {
    const world = structuredClone(bundle.snapshot.world);
    Object.defineProperty(world.mapModel.position, 'x', {
      enumerable: true,
      get() { getterCalls++; return 4; },
    });
    return world;
  };

  assert.throws(() => valid(withGetter()));
  assert.equal(getterCalls, 0);
  valid(bundle.snapshot.world);
  assert.throws(() => valid(withGetter()));
  assert.equal(getterCalls, 0);
});

test('proof keys use detached data even when a Proxy supplies different property values', () => {
  const { bundle } = createCampaignVillage(42);
  const world = bundle.snapshot.world;
  valid(world);
  const altered = structuredClone(world.actorModel);
  altered.actors[0].health = -1;
  let reads = 0;
  const proxy = new Proxy(world, {
    get(target, key, receiver) {
      reads++;
      return key === 'actorModel' ? altered : Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => valid(proxy));
  assert(reads > 0, 'Proxy traps are possible; this is not a Proxy rejection promise');
  assert.equal(valid(world).valid, true);
});

test('a warmed structural proof cannot certify a forged historical fact', () => {
  const { bundle } = createCampaignVillage(42);
  const advanced = performCampaignTick(bundle);
  const options = { rulesVersion: advanced.snapshot.rulesVersion, systems: canonicalSystems(advanced.snapshot.rulesVersion) };
  validateBundle(advanced, options);
  const forged = structuredClone(advanced);
  valid(forged.snapshot.world, forged.snapshot.tick);
  const quote = forged.eventLog.find(event => event.type === 'SurvivalFoodQuoteAnnounced');
  assert(quote);
  quote.payload.price++;
  // The world and tick still match the successful structural proof exactly.
  assert.equal(valid(forged.snapshot.world, forged.snapshot.tick).valid, true);
  assert.throws(() => validateBundle(forged, options));
});

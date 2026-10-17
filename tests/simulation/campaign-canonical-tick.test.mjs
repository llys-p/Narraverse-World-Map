import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignSystems, createCampaignVillage } from '../../runtime/fixtures/campaign-village.mjs';
import { performCampaignTick, performTick } from '../../runtime/core/command-engine.mjs';

test('campaign canonical ticks match the legacy registered-system oracle for six ticks', () => {
  const { bundle: initial, systems } = createCampaignVillage(42);
  const untouched = structuredClone(initial);
  let legacy = structuredClone(initial);
  let canonical = structuredClone(initial);

  for (let tick = 1; tick <= 6; tick++) {
    const beforeLegacy = structuredClone(legacy);
    const beforeCanonical = structuredClone(canonical);
    const nextLegacy = performTick(legacy, systems, 'session');
    const nextCanonical = performCampaignTick(canonical);
    assert.deepEqual(legacy, beforeLegacy, `legacy input at tick ${tick}`);
    assert.deepEqual(canonical, beforeCanonical, `canonical input at tick ${tick}`);
    legacy = nextLegacy;
    canonical = nextCanonical;
    assert.deepEqual(canonical.snapshot, legacy.snapshot, `snapshot at tick ${tick}`);
    assert.deepEqual(canonical.eventLog, legacy.eventLog, `event log at tick ${tick}`);
    assert.deepEqual(canonical.snapshot.rng, legacy.snapshot.rng, `RNG at tick ${tick}`);
  }

  assert.deepEqual(initial, untouched, 'both tick paths leave the caller input unchanged');
});

test('one synthetic day-boundary primitive preserves settlement facts and RNG', () => {
  // This is a primitive input, not a fabricated saved history or a restore test.
  const { bundle, systems } = createCampaignVillage(42);
  bundle.snapshot.tick = 143;
  bundle.snapshot.revision = 143;
  bundle.snapshot.scheduledTasks.find(task => task.systemId === 'survival').nextDueTick = 289;
  const before = structuredClone(bundle);
  const legacy = performTick(bundle, systems, 'session');
  const canonical = performCampaignTick(bundle);
  assert.deepEqual(canonical, legacy);
  assert.deepEqual(bundle, before);
  assert.equal(canonical.snapshot.tick, 144);
  assert.notDeepEqual(canonical.snapshot.rng, before.snapshot.rng);
  assert(canonical.eventLog.some(event => event.type === 'SocietyDaySettled'));
});

test('session mode rejects a structurally valid but non-canonical custom transition', () => {
  const { bundle } = createCampaignVillage(42);
  const customSystems = {
    ...campaignSystems(),
    survival(ctx) {
      ctx.snapshot.world.mapModel.position.x = 5;
    },
  };

  for (const attemptedBypass of [true, Symbol('caller execution')]) {
    assert.throws(
      () => performTick(bundle, customSystems, 'session', attemptedBypass),
      (error) => {
        assert.match(error.cause?.message ?? '', /Session transition differs from registered rules/);
        return true;
      },
    );
  }
});

test('campaign tick rejects accessor, wrong-profile, and invalid-data inputs', () => {
  const { bundle } = createCampaignVillage(42);
  let getterCalls = 0;
  const withGetter = structuredClone(bundle);
  Object.defineProperty(withGetter.snapshot.world.mapModel.position, 'x', {
    enumerable: true,
    get() {
      getterCalls++;
      return 4;
    },
  });
  assert.throws(() => performCampaignTick(withGetter));
  assert.equal(getterCalls, 0, 'descriptor checks reject the getter without invoking it');

  const wrongProfile = structuredClone(bundle);
  wrongProfile.snapshot.fixtureId = 'other-profile';
  assert.throws(() => performCampaignTick(wrongProfile));

  const invalidData = structuredClone(bundle);
  invalidData.snapshot.world.mapModel.position.x = Number.NaN;
  assert.throws(() => performCampaignTick(invalidData));
});

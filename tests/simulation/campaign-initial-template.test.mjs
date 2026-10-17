import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { defaultCampaignVillageConfig } from '../../runtime/fixtures/campaign-village.mjs';
import { createMemoryWorld, validateMemoryWorld } from '../../runtime/core/memory-runtime.mjs';

const baseline = 'a42957b28bb7482fa8da5f2184abd22a428d4793';
const baseUrl = new URL('../../runtime/core/memory-runtime.mjs', import.meta.url);
const source = execFileSync('git', ['show', `${baseline}:runtime/core/memory-runtime.mjs`], { encoding: 'utf8' })
  .replace(/from\s+(['"])(\.[^'"]+)\1/g, (_match, _quote, specifier) => `from '${new URL(specifier, baseUrl).href}'`);
const oracle = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const campaignConfig = () => structuredClone(defaultCampaignVillageConfig().memory);
const assertValid = world => assert.doesNotThrow(() => validateMemoryWorld(world));

test('reused campaign templates produce equivalent worlds with fully independent mutable data', () => {
  const config = campaignConfig();
  const first = createMemoryWorld(config);
  const second = createMemoryWorld(structuredClone(config));
  assert.deepEqual(second, first);
  assert.notStrictEqual(first.resources, second.resources);
  assert.notStrictEqual(first.memoryModel.config, second.memoryModel.config);
  assert.notStrictEqual(first.actorModel.actors[0], second.actorModel.actors[0]);
  assert.notStrictEqual(first.actorModel.actors[0].needs, second.actorModel.actors[0].needs);
  assertValid(first); assertValid(second);

  first.resources.food = 0;
  first.memoryModel.config.discountEnabled = false;
  first.actorModel.actors[0].health = 0;
  const third = createMemoryWorld(config);
  assert.deepEqual(third, second);
  assertValid(third);
});

test('warm cache never accepts changed invalid configuration and restored content remains valid', () => {
  const config = campaignConfig();
  createMemoryWorld(config);
  const rejectAndRestore = (change, restore) => {
    change(); assert.throws(() => createMemoryWorld(config)); restore(); assertValid(createMemoryWorld(config));
  };
  rejectAndRestore(() => { config.society.saleMarkup = -1; }, () => { config.society.saleMarkup = 2; });
  rejectAndRestore(() => { config.version = 'memory-config-v7'; }, () => { config.version = 'memory-config-v8'; });
  rejectAndRestore(() => { config.discountEnabled = 'yes'; }, () => { config.discountEnabled = true; });
  rejectAndRestore(() => { config.personalities[0].healthWeightPermille = -1; }, () => { config.personalities[0].healthWeightPermille = 1000; });
  rejectAndRestore(() => { config.extraField = 1; }, () => { delete config.extraField; });
});

test('configuration accessors are rejected without execution before and after warming the cache', () => {
  let calls = 0;
  const accessorConfig = () => {
    const config = campaignConfig();
    Object.defineProperty(config, 'discountEnabled', { enumerable: true, get() { calls++; return true; } });
    return config;
  };
  assert.throws(() => createMemoryWorld(accessorConfig()));
  assert.equal(calls, 0);
  createMemoryWorld(campaignConfig());
  assert.throws(() => createMemoryWorld(accessorConfig()));
  assert.equal(calls, 0);
});

test('v6, v7, and a valid v8 variation match the frozen memory-runtime oracle', () => {
  for (const [version, societyVersion, actorVersion] of [
    ['memory-config-v6', 'society-config-v5', 'actor-config-v4'],
    ['memory-config-v7', 'society-config-v6', 'actor-config-v4'],
    ['memory-config-v8', 'society-config-v7', 'actor-config-v5'],
  ]) {
    const config = campaignConfig();
    config.version = version;
    config.society.version = societyVersion;
    config.society.actors.version = actorVersion;
    if (version === 'memory-config-v8') config.society.saleMarkup = 3;
    const current = createMemoryWorld(config);
    const expected = oracle.createMemoryWorld(config);
    assert.deepEqual(current, expected, `${version} constructor output`);
    assertValid(current);
    assert.doesNotThrow(() => oracle.validateMemoryWorld(expected));
  }
});

test('detached campaign configuration must still carry the selected v8 version', () => {
  const target = oracle.defaultMemoryConfig();
  target.version = 'memory-config-unknown';
  target.personalities = campaignConfig().personalities;
  let versionReads = 0;
  const drifting = new Proxy(target, {
    get(object, key, receiver) {
      if (key === 'version' && ++versionReads <= 2) return 'memory-config-v8';
      return Reflect.get(object, key, receiver);
    },
  });
  assert.throws(() => createMemoryWorld(drifting), { code: 'UNSUPPORTED_VERSION' });
  assert.equal(createMemoryWorld(campaignConfig()).memoryModel.config.version, 'memory-config-v8');
});

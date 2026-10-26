import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayableCampaignVillage, campaignSystems } from '../../runtime/fixtures/campaign-village.mjs';
import { createAuditedBundle, validateBundle } from '../../runtime/core/world-state.mjs';

const options = { rulesVersion: 'd-campaign-v1', systems: campaignSystems() };

test('repeated validation stays correct for raw and audited values', () => {
  const { bundle } = createPlayableCampaignVillage(42, 'config-boundary');
  const audited = createAuditedBundle(bundle, options);
  for (let i = 0; i < 8; i++) {
    validateBundle(bundle, options);
    validateBundle(audited, options);
  }
  assert.ok(Object.isFrozen(audited.snapshot.world));
});

test('a changed configuration is rejected after a valid configuration was checked', () => {
  const { bundle } = createPlayableCampaignVillage(42, 'config-mutation');
  validateBundle(bundle, options);
  const changed = structuredClone(bundle);
  changed.snapshot.world.societyModel.config.saleMarkup++;
  assert.throws(() => validateBundle(changed, options));
});

test('accessors and forged trust fields remain rejected before configuration validation', () => {
  const { bundle } = createPlayableCampaignVillage(42, 'config-hostile');
  let calls = 0;
  const hostile = structuredClone(bundle);
  Object.defineProperty(hostile.snapshot.world.societyModel.config, 'trap', {
    enumerable: true,
    get() { calls++; return 1; },
  });
  assert.throws(() => validateBundle(hostile, options));
  assert.equal(calls, 0);
  const forged = { ...structuredClone(bundle), audited: true };
  assert.throws(() => validateBundle(forged, options));
});

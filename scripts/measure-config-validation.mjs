import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createPlayableCampaignVillage, campaignSystems } from '../runtime/fixtures/campaign-village.mjs';
import { createAuditedBundle, validateBundle } from '../runtime/core/world-state.mjs';

const output = path.resolve(process.argv[2] ?? 'artifacts/config-next/validation.json');
const rounds = Number(process.argv[3] ?? 12);
if (!Number.isSafeInteger(rounds) || rounds < 2 || rounds > 100) throw new Error('rounds must be 2..100');
const options = { rulesVersion: 'd-campaign-v1', systems: campaignSystems() };
const seed = 42;
const raw = createPlayableCampaignVillage(seed, 'config-validation-measurement').bundle;
const audited = createAuditedBundle(raw, options);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const measure = (label, value) => {
  const start = performance.now();
  for (let i = 0; i < rounds; i++) validateBundle(value, options);
  return { label, rounds, elapsedMs: performance.now() - start };
};
const before = measure('raw-bundle-repeated-validation', raw);
const after = measure('audited-bundle-repeated-validation', audited);
const detached = structuredClone(audited);
const detachedResult = measure('detached-copy-repeated-validation', detached);
const report = {
  node: process.version,
  seed,
  rounds,
  bundleSha256: digest(audited),
  raw: before,
  audited: after,
  detached: detachedResult,
  semanticScope: 'Measurement only. No cache or production shortcut is enabled by this script.',
  externalModelCalls: 0,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));

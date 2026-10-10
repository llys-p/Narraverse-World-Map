// M4A A3 inspector slice: the survival knowledge projection and the developer inspector.
// Every assertion is checked against the served DTO and the source page/CSS text; nothing is
// re-evaluated here. The page is inspected as static text only — no browser is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, cloneData } from '../runtime/core/data-contract.mjs';
import { defaultSurvivalVillageConfig, createSurvivalVillage, survivalSystems }
  from '../runtime/fixtures/survival-village.mjs';
import { createSimulationSession } from '../runtime/core/command-engine.mjs';
import { buildSurvivalKnowledge, projectSurvivalInspector, SURVIVAL_INSPECTOR_API_VERSION,
  MAX_SURVIVAL_INSPECTOR_BYTES } from '../runtime/knowledge/survival-knowledge.mjs';
import { SURVIVAL_KNOWLEDGE_VERSION, SURVIVAL_INSPECTOR_VERSION, SURVIVAL_ACTOR_ID,
  SURVIVAL_FOOD_QUOTE_EVENT, SURVIVAL_WORK_OFFER_EVENT, MAX_SURVIVAL_KNOWLEDGE_BYTES }
  from '../runtime/core/survival-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const DAY = 144;

function run(recipe, ticks) {
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig(recipe));
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(ticks);
  return session.getBundle();
}
const actorOf = (inspector, id) => inspector.actors.find(a => a.knowledge.actorId === id);

// ---------------------------------------------------------------------------
// the projection identity
// ---------------------------------------------------------------------------

test('§3.1: the inspector reports the frozen survival identity', () => {
  const inspector = projectSurvivalInspector(run('affordable', 2 * DAY));
  assert.equal(inspector.apiVersion, SURVIVAL_INSPECTOR_API_VERSION);
  assert.equal(inspector.apiVersion, 1);
  assert.equal(inspector.mindVersion, SURVIVAL_INSPECTOR_VERSION);
  assert.equal(inspector.mindVersion, 'survival-inspector-v1');
  assert.equal(inspector.view, 'developer');
  assert.equal(inspector.simulationId, 'survival-village');
  assert.equal(inspector.actors.length, 2);
  assert.equal(MAX_SURVIVAL_INSPECTOR_BYTES, 131072);
});

test('§3.2: actor-2 carries the survival Knowledge, actor-3 keeps the cognition shape', () => {
  const bundle = run('earn-then-buy', 2 * DAY);
  const self = buildSurvivalKnowledge(bundle, 'actor-2');
  assert.equal(self.knowledgeVersion, SURVIVAL_KNOWLEDGE_VERSION);
  assert.ok(Object.hasOwn(self, 'foodQuote'));
  assert.ok(Object.hasOwn(self, 'workOffer'));

  const peer = buildSurvivalKnowledge(bundle, 'actor-3');
  assert.equal(peer.knowledgeVersion, 'cognition-knowledge-v1');
  assert.ok(!Object.hasOwn(peer, 'foodQuote'), 'actor-3 must not carry a food quote');
  assert.ok(!Object.hasOwn(peer, 'workOffer'), 'actor-3 must not carry a work offer');
  // The frozen cognition field set, exactly.
  assert.deepEqual(Object.keys(peer).sort(), ['actorId', 'belief', 'duty', 'experience', 'knowledgeVersion',
    'observations', 'phase', 'planState', 'profile', 'quote', 'revision', 'self', 'simulationId', 'tick',
    'useWorkExperience']);
});

test('§3.2: Knowledge never carries public cash, peer accounts or raw receipts', () => {
  const bundle = run('earn-then-buy', 2 * DAY);
  const self = buildSurvivalKnowledge(bundle, SURVIVAL_ACTOR_ID);
  const text = canonicalJson(self);
  for (const banned of ['communalGold', 'publicFood', 'publicCash', 'resources', 'marketModel', 'commandReceipts'])
    assert.ok(!Object.hasOwn(self, banned), `${banned} must not be projected`);
  assert.ok(!text.includes('communalGold'), 'no public cash anywhere in the projection');
  // The food quote carries a boolean, never the exact public stock.
  assert.equal(typeof self.foodQuote.available, 'boolean');
  assert.ok(!Object.hasOwn(self.foodQuote, 'stock'));
});

test('§3.2: the food quote names its real source and its real expiry', () => {
  // Before any day has settled, the only published source is the tick-1 announcement.
  const bundle = run('affordable', 100);
  const quote = bundle.eventLog.find(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT);
  const knowledge = buildSurvivalKnowledge(bundle, SURVIVAL_ACTOR_ID);
  assert.equal(knowledge.foodQuote.product, 'food');
  assert.equal(knowledge.foodQuote.price, 10, 'the real posted price');
  assert.equal(knowledge.foodQuote.available, true);
  assert.equal(knowledge.foodQuote.observedTick, quote.tick, 'observed when it was published');
  assert.equal(knowledge.foodQuote.expiresTick, quote.tick + 288, 'and valid for two whole days');
  assert.equal(knowledge.foodQuote.sourceEventSeq, quote.eventSeq, 'the source is the real published fact');

  // Later days take the most recent valid source: the existing public day-settlement
  // projection, with no new per-tick broadcast.
  const later = run('affordable', 2 * DAY);
  const settled = later.eventLog.filter(e => e.type === 'SocietyDaySettled').at(-1);
  const laterKnowledge = buildSurvivalKnowledge(later, SURVIVAL_ACTOR_ID);
  assert.equal(laterKnowledge.foodQuote.observedTick, settled.tick, 'the latest public settlement wins');
  assert.equal(laterKnowledge.foodQuote.sourceEventSeq, settled.eventSeq);
  assert.equal(laterKnowledge.foodQuote.expiresTick, settled.tick + 288);
  assert.equal(later.eventLog.filter(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT).length, 1,
    'the announcement is published exactly once');
});

test('§3.2: the work offer is only ever the actor\'s own pending request', () => {
  // Before the duty is fulfilled the offer is a live opportunity.
  const bundle = run('earn-then-buy', 100);
  const offer = bundle.eventLog.find(e => e.type === SURVIVAL_WORK_OFFER_EVENT);
  const knowledge = buildSurvivalKnowledge(bundle, SURVIVAL_ACTOR_ID);
  assert.equal(knowledge.workOffer.requestId, 's-food-01');
  assert.equal(knowledge.workOffer.wage, 20, 'the wage really configured in this world');
  assert.equal(knowledge.workOffer.observedTick, offer.tick, 'published on the delivery tick');
  assert.equal(knowledge.workOffer.expiresTick, 200);
  assert.equal(knowledge.workOffer.sourceEventSeq, offer.eventSeq);
  // Once the duty is fulfilled the offer is no longer a live opportunity.
  assert.equal(buildSurvivalKnowledge(run('earn-then-buy', DAY), SURVIVAL_ACTOR_ID).workOffer, null);
  assert.equal(buildSurvivalKnowledge(run('earn-then-buy', 2 * DAY), SURVIVAL_ACTOR_ID).workOffer, null);
  // And without any request at all there is never an offer.
  for (const recipe of ['affordable', 'no-opportunity', 'no-food'])
    assert.equal(buildSurvivalKnowledge(run(recipe, DAY), SURVIVAL_ACTOR_ID).workOffer, null,
      `${recipe}: no request means no opportunity`);
});

// ---------------------------------------------------------------------------
// honest reporting of outcomes, receipts and waiting
// ---------------------------------------------------------------------------

test('§6: the inspector reports the real receipt, the food delta and the price paid', () => {
  const inspector = projectSurvivalInspector(run('affordable', DAY));
  const a2 = actorOf(inspector, 'actor-2');
  assert.equal(a2.lastDecision.decisionId, 'survival-day-1-actor-2');
  assert.equal(a2.lastDecision.choice, 'BuyFood');
  assert.equal(a2.lastOutcome.status, 'succeeded');
  assert.equal(a2.lastOutcome.delta.food, 1, 'one ration really entered the private inventory');
  assert.equal(a2.lastOutcome.delta.wallet, -10);
  assert.equal(a2.lastOutcome.price, 10, 'the price really paid');
  assert.equal(a2.lastOutcome.publicFoodProduced, 0);
});

test('§6: a refused attempt is shown as a rejection with its own failure owner', () => {
  const inspector = projectSurvivalInspector(run('wage-refused', DAY));
  const a2 = actorOf(inspector, 'actor-2');
  assert.equal(a2.lastOutcome.status, 'rejected');
  assert.equal(a2.lastOutcome.code, 'RULE_REJECTED');
  assert.equal(a2.lastOutcome.failureOwner.goalId, null, 'the refusal belongs to the plan alone');
  assert.ok(a2.lastOutcome.failureOwner.planId >= 1);
  assert.deepEqual(a2.lastOutcome.delta, { wallet: 0, food: 0, herbs: 0, health: 0, fatigue: 0 });
});

test('§6: the counterfactual stays null and the frozen decision is never rewritten', () => {
  const bundle = run('affordable', 2 * DAY);
  const inspector = projectSurvivalInspector(bundle);
  for (const actor of inspector.actors) assert.equal(actor.counterfactual, null, 'no counterfactual is offered');
  const entry = bundle.snapshot.world.motivationModel.actors.find(a => a.actorId === 'actor-2');
  const projected = actorOf(inspector, 'actor-2');
  assert.equal(projected.lastDecision.decisionId, entry.lastDecision.decisionId);
  assert.equal(canonicalJson(projected.lastDecision), canonicalJson(entry.lastDecision), 'reported verbatim');
  // The decision-time frozen knowledge is still the one that produced this decision.
  assert.equal(projected.lastDecision.knowledgeFingerprint, entry.lastDecision.knowledgeFingerprint);
  const frozen = JSON.parse(projected.lastDecision.knowledgeFingerprint);
  assert.equal(frozen.actorId, 'actor-2');
  assert.equal(frozen.tick, projected.lastDecision.tick);
});

test('§6: world facts are separated from the actor\'s own account', () => {
  const inspector = projectSurvivalInspector(run('affordable', 2 * DAY));
  assert.equal(typeof inspector.worldFacts.publicFood, 'number');
  assert.equal(typeof inspector.worldFacts.publicHerbs, 'number');
  assert.equal(typeof inspector.worldFacts.postedFoodPrice, 'number');
  assert.equal(typeof inspector.worldFacts.postedHerbPrice, 'number');
  const a2 = actorOf(inspector, 'actor-2');
  // The actor's own view is private and distinct from the public stock.
  assert.equal(typeof a2.knowledge.self.inventory.food, 'number');
  assert.ok(!Object.hasOwn(a2.knowledge.self, 'publicFood'));
});

test('§6: cognition anchors are reported for both actors with their own prefixes', () => {
  const inspector = projectSurvivalInspector(run('earn-then-buy', 2 * DAY));
  const a2 = actorOf(inspector, 'actor-2');
  const a3 = actorOf(inspector, 'actor-3');
  assert.ok(a2.cognition.lastReviewDecisionId.startsWith('survival-day-'));
  assert.ok(a3.cognition.lastReviewDecisionId.startsWith('cognition-day-'));
  assert.equal(a2.cognition.importancePermille, 700);
  assert.equal(a3.cognition.importancePermille, 400);
  // The frozen kernel state is carried, not recomputed.
  assert.ok(a2.cognition.reviewState.lastEvaluation !== null);
  assert.equal(a2.cognition.reviewState.version, 'cognitive-review-state-v1');
});

test('§6: the work experience window is derived, not fabricated', () => {
  const inspector = projectSurvivalInspector(run('earn-then-buy', 2 * DAY));
  const a2 = actorOf(inspector, 'actor-2');
  assert.equal(a2.workExperience.view.version, 'work-experience-view-v1');
  assert.equal(a2.workExperience.view.topic, 'work-for-pay-execution');
  const samples = a2.workExperience.state.samples ?? [];
  assert.equal(samples.length, a2.workExperience.view.sampleCount);
  // The one real work attempt succeeded, so the window holds one success.
  assert.equal(a2.workExperience.view.sampleCount, 1);
  assert.equal(a2.workExperience.view.failureCount, 0);
  assert.equal(a2.workExperience.view.penaltyPermille, 0);
});

test('§6: two projections of one world agree but are detached clones', () => {
  const bundle = run('affordable', 2 * DAY);
  const first = projectSurvivalInspector(bundle);
  const second = projectSurvivalInspector(bundle);
  assert.deepEqual(first, second);
  assert.notEqual(first, second, 'the caller must receive a detached copy');
  first.actors[0].knowledge.self.wallet = -1;
  assert.notEqual(projectSurvivalInspector(bundle).actors[0].knowledge.self.wallet, -1,
    'mutating a projection must not reach the world');
});

test('§3.3: the inspector rejects a foreign rules version and an unknown actor', () => {
  const bundle = run('affordable', DAY);
  assert.throws(() => buildSurvivalKnowledge(bundle, 'actor-1'), /Survival actor unavailable/);
  assert.throws(() => buildSurvivalKnowledge(bundle, 'nobody'), /Survival actor unavailable/);
  const cognition = cloneData(bundle);
  cognition.snapshot.rulesVersion = 'm-cognition-v1';
  assert.throws(() => projectSurvivalInspector(cognition), /Unknown survival projection rules|Unknown/);
});

// ---------------------------------------------------------------------------
// the page itself: static inspection only, no browser is started
// ---------------------------------------------------------------------------

test('§6: the inspector page serves the survival fields and keeps the old layout', async () => {
  const html = await fs.readFile(path.join(root, 'runtime-mind.html'), 'utf8');
  const css = await fs.readFile(path.join(root, 'runtime-mind.css'), 'utf8');
  const script = await fs.readFile(path.join(root, 'runtime-mind.mjs'), 'utf8');

  // The new survival blocks exist and start hidden, alongside the untouched old ones.
  for (const id of ['survival-food', 'surv-self-food', 'surv-fact-food-price'])
    assert.ok(html.includes(`id="${id}"`), `page must contain ${id}`);
  for (const id of ['survival-food', 'cognition-review', 'm2-duty-plan'])
    assert.ok(new RegExp(`id="${id}"[^>]*hidden`).test(html), `${id} must start hidden`);

  // The actor's own food, the quote source/TTL, the offer, the live step and the wait reason.
  for (const id of ['surv-food-quote', 'surv-work-offer', 'surv-current-step', 'surv-wait-reason'])
    assert.ok(html.includes(`id="${id}"`), `page must show ${id}`);
  assert.ok(script.includes('survival-inspector-v1'), 'the reader must accept the survival inspector version');
  assert.ok(script.includes('surv-food-quote'), 'the script must render the survival fields');
  assert.ok(script.includes('survival-knowledge-v1'), 'the frozen knowledge parser accepts survival Knowledge');
  // User-supplied values are written as text, never as markup.
  assert.ok(script.includes('.textContent'), 'rendering must use textContent');
  assert.ok(!/innerHTML\s*=/.test(script), 'rendering must not assign innerHTML');
  // The stylesheet still exists and the page keeps its stylesheet link.
  assert.ok(css.length > 0);
  assert.ok(html.includes('/runtime-mind.css'));
});

test('§6: the page keeps already-shown data when a reading fails or arrives late', async () => {
  const script = await fs.readFile(path.join(root, 'runtime-mind.mjs'), 'utf8');
  // A lower revision must not overwrite what is already displayed.
  assert.ok(/inspector\.revision\s*<\s*last\.revision/.test(script), 'a late low revision must be ignored');
  assert.ok(/last\s*&&|last\?/.test(script), 'the previous reading must be kept on failure');
});

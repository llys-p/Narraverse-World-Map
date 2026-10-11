// M4A survival knowledge projection: the actor-local decision Knowledge plus the read-only
// developer inspector for the survival rules. Both entries preflight the complete bundle
// descriptor tree, fully re-validate the bundle under the survival systems and return detached
// JSON clones. No decision, signal, kernel or counterfactual is recomputed here: the inspector
// reports the saved decision/outcome verbatim, the frozen work-experience API derives the
// window view, and the counterfactual stays null.
import { validateBundle } from '../core/world-state.mjs';
import { projectActorEvent } from '../core/memory-observer.mjs';
import { deriveMindBelief } from '../core/mind-state.mjs';
import { cloneData, fields, record, identifier, canonicalJson, requireCondition } from '../core/data-contract.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { COGNITION_KNOWLEDGE_VERSION } from '../core/cognition-state.mjs';
import { SURVIVAL_RULES, SURVIVAL_KNOWLEDGE_VERSION, SURVIVAL_ACTOR_ID, SURVIVAL_PEER_ID,
  SURVIVAL_INSPECTOR_VERSION, SURVIVAL_FOOD_QUOTE_EVENT, SURVIVAL_WORK_OFFER_EVENT,
  MAX_SURVIVAL_KNOWLEDGE_BYTES, survivalFoodQuoteFrom, survivalWorkOfferFrom,
  validateSurvivalKnowledge } from '../core/survival-state.mjs';
import { deriveWorkExperience } from '../core/work-experience.mjs';
import { survivalSystems } from '../fixtures/survival-village.mjs';

export const SURVIVAL_INSPECTOR_API_VERSION = 1;
export const MAX_SURVIVAL_INSPECTOR_BYTES = 131072;
// Re-exported so the service loader can pin the frozen inspector version and budget.
export { SURVIVAL_INSPECTOR_VERSION };

function audit(bundle) {
  inspectDescriptorTree(bundle);
  fields(bundle, ['snapshot', 'eventLog']);
  record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion === SURVIVAL_RULES, 'Unknown survival projection rules', 'UNSUPPORTED_VERSION');
  validateBundle(bundle, { rulesVersion: SURVIVAL_RULES, systems: survivalSystems() });
}
function budget(value, max) {
  requireCondition(new TextEncoder().encode(canonicalJson(value)).length <= max, 'Survival projection exceeds budget', 'LIMIT_EXCEEDED');
  return value;
}

// The most recent food quote this actor can actually see: a village-visible announcement or the
// public market projection of an already published SocietyDaySettled. Both are public facts;
// neither reads the hidden current stock.
function ownFoodQuote(world, eventLog, actorId, tick) {
  const cursor = world.mindModel.cursor;
  let best = null;
  for (const event of eventLog) {
    if (event.eventSeq > cursor) continue;
    if (event.tick > tick) continue;
    if (event.type === SURVIVAL_FOOD_QUOTE_EVENT) {
      const candidate = { seq: event.eventSeq, tick: event.tick, quote: survivalFoodQuoteFrom(event.payload, event.tick, event.eventSeq) };
      if (best === null || candidate.tick > best.tick || (candidate.tick === best.tick && candidate.seq > best.seq)) best = candidate;
      continue;
    }
    if (event.type !== 'SocietyDaySettled' || event.tick > tick) continue;
    const actor = world.actorModel.actors.find(a => a.actorId === actorId);
    const visible = actor.alive || event.tick < actor.deathTick;
    if (!visible) continue;
    const projection = projectActorEvent(event, actorId).find(p => p.channel === 'public');
    if (!projection) continue;
    const market = projection.observable;
    const candidate = { seq: event.eventSeq, tick: event.tick,
      quote: survivalFoodQuoteFrom({ product: 'food', price: market.prices.food,
        available: market.food > 0 }, event.tick, event.eventSeq) };
    if (best === null || candidate.tick > best.tick || (candidate.tick === best.tick && candidate.seq > best.seq)) best = candidate;
  }
  return best === null ? null : best.quote;
}

// Only a real, still-pending Duty of this actor may become a visible work offer, and only when
// its own announcement named exactly that request on the same tick and expiry.
function ownWorkOffer(world, eventLog, actorId, tick, duty) {
  if (duty === null || duty.status !== 'pending' || tick >= duty.expiresTick) return null;
  const cursor = world.mindModel.cursor;
  let best = null;
  for (const event of eventLog) {
    if (event.eventSeq > cursor || event.tick > tick) continue;
    if (event.type !== SURVIVAL_WORK_OFFER_EVENT) continue;
    if (event.payload.actorId !== actorId || event.payload.requestId !== duty.requestId) continue;
    if (event.payload.expiresTick !== duty.expiresTick) continue;
    const delivered = eventLog.find(e => e.eventSeq === event.causationEventSeqs[0] &&
      e.type === 'MotivationRequestResolved' && e.payload.requestId === duty.requestId &&
      e.payload.listenerId === actorId && e.tick === event.tick);
    if (!delivered) continue;
    const candidate = { seq: event.eventSeq, tick: event.tick,
      offer: survivalWorkOfferFrom(event.payload, event.tick, event.eventSeq) };
    if (best === null || candidate.tick > best.tick || (candidate.tick === best.tick && candidate.seq > best.seq)) best = candidate;
  }
  return best === null ? null : best.offer;
}

function project(bundle, entry) {
  const s = bundle.snapshot, w = s.world;
  const actor = w.actorModel.actors.find(a => a.actorId === entry.actorId);
  const state = w.societyModel.agents.find(a => a.state.actorId === entry.actorId).state;
  const mind = w.mindModel.actors.find(a => a.actorId === entry.actorId);
  const last = bundle.eventLog.findLast(e => e.eventSeq <= w.mindModel.cursor && e.type === 'SocietyDaySettled' &&
    (actor.alive || e.tick < actor.deathTick));
  const publicValue = last ? projectActorEvent(last, entry.actorId).find(p => p.channel === 'public').observable : null;
  const profile = w.motivationModel.config.profiles.find(p => p.actorId === entry.actorId);
  const experience = w.experienceModel.actors.find(a => a.actorId === entry.actorId);
  const survival = entry.actorId === SURVIVAL_ACTOR_ID;
  const survivalViews = survival ? {
    foodQuote: ownFoodQuote(w, bundle.eventLog, entry.actorId, s.tick),
    workOffer: ownWorkOffer(w, bundle.eventLog, entry.actorId, s.tick, entry.lastDuty),
  } : {};
  const knowledge = budget({
    knowledgeVersion: survival ? SURVIVAL_KNOWLEDGE_VERSION : COGNITION_KNOWLEDGE_VERSION,
    phase: 'committed', simulationId: s.simulationId,
    actorId: entry.actorId, tick: s.tick, revision: s.revision,
    self: { name: actor.name, occupation: actor.occupation, location: actor.location, alive: actor.alive,
      health: actor.health, hunger: actor.hunger, fatigue: actor.fatigue,
      wallet: state.wallet, inventory: cloneData(state.inventory),
      currentGoal: actor.alive ? cloneData(state.currentGoal) : null, nextGoalId: state.nextGoalId,
      cooldownUntilDay: state.cooldownUntilDay },
    quote: { product: 'herbs', price: publicValue ? publicValue.prices.herbs : w.marketModel.config.products.herbs.basePrice,
      observedTick: last?.tick ?? 0, sourceEventSeq: last?.eventSeq ?? null },
    observations: cloneData(mind.observations), belief: deriveMindBelief(mind.observations, s.tick),
    profile: { dutyWeightPermille: profile.dutyWeightPermille, riskAversionPermille: profile.riskAversionPermille },
    duty: cloneData(entry.lastDuty),
    planState: { activePlan: cloneData(entry.activePlan), suspendedPlan: cloneData(entry.suspendedPlan),
      nextPlanId: entry.nextPlanId, lastReviewedDutyId: entry.lastReviewedDutyId },
    experience: deriveWorkExperience(experience.workExperienceState),
    useWorkExperience: w.experienceModel.config.useWorkExperience === true,
    ...survivalViews,
  }, MAX_SURVIVAL_KNOWLEDGE_BYTES);
  return knowledge;
}

export function buildSurvivalKnowledge(bundle, actorId) {
  identifier(actorId);
  audit(bundle);
  const entry = bundle.snapshot.world.motivationModel.actors.find(a => a.actorId === actorId);
  requireCondition(entry, 'Survival actor unavailable', 'MIND_UNAVAILABLE');
  return cloneData(project(bundle, entry));
}

export function projectSurvivalInspector(bundle) {
  audit(bundle);
  const s = bundle.snapshot, w = s.world;
  const actors = w.cognitionModel.actors.map(entry => {
    const motivation = w.motivationModel.actors.find(a => a.actorId === entry.actorId);
    const experience = w.experienceModel.actors.find(a => a.actorId === entry.actorId);
    const state = experience.workExperienceState;
    const profile = w.cognitionModel.config.profiles.find(p => p.actorId === entry.actorId);
    const knowledge = project(bundle, motivation);
    return { knowledge,
      lastDecision: cloneData(motivation.lastDecision), lastOutcome: cloneData(motivation.lastOutcome),
      counterfactual: null,
      workExperience: { state: cloneData(state), view: deriveWorkExperience(state) },
      cognition: { importancePermille: profile.importancePermille, reviewState: cloneData(entry.reviewState),
        signalBaseline: cloneData(entry.signalBaseline), lastReviewDecisionId: entry.lastReviewDecisionId,
        lastReviewEventSeq: entry.lastReviewEventSeq } };
  });
  return cloneData(budget({ apiVersion: SURVIVAL_INSPECTOR_API_VERSION, mindVersion: SURVIVAL_INSPECTOR_VERSION,
    view: 'developer', simulationId: s.simulationId, revision: s.revision, tick: s.tick,
    worldFacts: { publicFood: w.resources.food, publicHerbs: w.resources.herbs,
      postedFoodPrice: w.marketModel.prices.food, postedHerbPrice: w.marketModel.prices.herbs },
    actors }, MAX_SURVIVAL_INSPECTOR_BYTES));
}

export { validateSurvivalKnowledge, SURVIVAL_ACTOR_ID, SURVIVAL_PEER_ID };

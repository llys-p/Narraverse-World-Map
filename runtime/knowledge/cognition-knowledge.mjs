// M3-4A cognition knowledge projection: committed knowledge plus the read-only developer
// inspector for the cognition rules. Both entries preflight the complete bundle descriptor
// tree before any clone or canonical budget, fully re-validate the bundle under the cognition
// systems, and return detached JSON clones. No decision, signal, kernel or counterfactual is
// ever recomputed here: the inspector reports the saved motivation decision/outcome verbatim,
// the frozen work-experience API derives the window view, and counterfactual stays null.
import { validateBundle } from '../core/world-state.mjs';
import { projectActorEvent } from '../core/memory-observer.mjs';
import { deriveMindBelief } from '../core/mind-state.mjs';
import { cloneData, fields, record, identifier, canonicalJson, requireCondition } from '../core/data-contract.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { COGNITION_RULES, COGNITION_KNOWLEDGE_VERSION, MAX_COGNITION_KNOWLEDGE_BYTES } from '../core/cognition-state.mjs';
import { deriveWorkExperience } from '../core/work-experience.mjs';
import { cognitionSystems } from '../fixtures/cognition-village.mjs';

export const COGNITION_INSPECTOR_VERSION = 'cognition-inspector-v1';
export const MAX_COGNITION_INSPECTOR_BYTES = 131072;

function audit(bundle) {
  inspectDescriptorTree(bundle);
  fields(bundle, ['snapshot', 'eventLog']);
  record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion === COGNITION_RULES, 'Unknown cognition projection rules', 'UNSUPPORTED_VERSION');
  validateBundle(bundle, { rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
}
function budget(value, max) {
  requireCondition(new TextEncoder().encode(canonicalJson(value)).length <= max, 'Cognition projection exceeds budget', 'LIMIT_EXCEEDED');
  return value;
}

// Committed projection: motivation knowledge keys verbatim plus the frozen work-experience
// view and the strict useWorkExperience switch for this actor. Nothing else enters Knowledge:
// no public cash, other ledgers, raw work samples or cognition scheduling metadata.
function project(bundle, entry) {
  const s = bundle.snapshot, w = s.world;
  const actor = w.actorModel.actors.find(a => a.actorId === entry.actorId);
  const state = w.societyModel.agents.find(a => a.state.actorId === entry.actorId).state;
  const mind = w.mindModel.actors.find(a => a.actorId === entry.actorId);
  const last = bundle.eventLog.findLast(e => e.eventSeq <= w.mindModel.cursor && e.type === 'SocietyDaySettled' && (actor.alive || e.tick < actor.deathTick));
  const publicValue = last ? projectActorEvent(last, entry.actorId).find(p => p.channel === 'public').observable : null;
  const profile = w.motivationModel.config.profiles.find(p => p.actorId === entry.actorId);
  const experience = w.experienceModel.actors.find(a => a.actorId === entry.actorId);
  return budget({
    knowledgeVersion: COGNITION_KNOWLEDGE_VERSION, phase: 'committed', simulationId: s.simulationId,
    actorId: entry.actorId, tick: s.tick, revision: s.revision,
    self: { name: actor.name, occupation: actor.occupation, location: actor.location, alive: actor.alive,
      health: actor.health, hunger: actor.hunger, fatigue: actor.fatigue,
      wallet: state.wallet, inventory: cloneData(state.inventory),
      currentGoal: actor.alive ? cloneData(state.currentGoal) : null, nextGoalId: state.nextGoalId, cooldownUntilDay: state.cooldownUntilDay },
    quote: { product: 'herbs', price: publicValue ? publicValue.prices.herbs : w.marketModel.config.products.herbs.basePrice,
      observedTick: last?.tick ?? 0, sourceEventSeq: last?.eventSeq ?? null },
    observations: cloneData(mind.observations), belief: deriveMindBelief(mind.observations, s.tick),
    profile: { dutyWeightPermille: profile.dutyWeightPermille, riskAversionPermille: profile.riskAversionPermille },
    duty: cloneData(entry.lastDuty),
    planState: { activePlan: cloneData(entry.activePlan), suspendedPlan: cloneData(entry.suspendedPlan),
      nextPlanId: entry.nextPlanId, lastReviewedDutyId: entry.lastReviewedDutyId },
    experience: deriveWorkExperience(experience.workExperienceState),
    useWorkExperience: w.experienceModel.config.useWorkExperience === true,
  }, MAX_COGNITION_KNOWLEDGE_BYTES);
}

export function buildCognitionKnowledge(bundle, actorId) {
  identifier(actorId);
  audit(bundle);
  const entry = bundle.snapshot.world.motivationModel.actors.find(a => a.actorId === actorId);
  requireCondition(entry, 'Cognition actor unavailable', 'MIND_UNAVAILABLE');
  return cloneData(project(bundle, entry));
}

export function projectCognitionInspector(bundle) {
  audit(bundle);
  const s = bundle.snapshot, w = s.world;
  const actors = w.cognitionModel.actors.map(entry => {
    const motivation = w.motivationModel.actors.find(a => a.actorId === entry.actorId);
    const experience = w.experienceModel.actors.find(a => a.actorId === entry.actorId);
    const state = experience.workExperienceState;
    const profile = w.cognitionModel.config.profiles.find(p => p.actorId === entry.actorId);
    return { knowledge: project(bundle, motivation),
      lastDecision: cloneData(motivation.lastDecision), lastOutcome: cloneData(motivation.lastOutcome),
      counterfactual: null,
      workExperience: { state: cloneData(state), view: deriveWorkExperience(state) },
      cognition: { importancePermille: profile.importancePermille, reviewState: cloneData(entry.reviewState),
        signalBaseline: cloneData(entry.signalBaseline), lastReviewDecisionId: entry.lastReviewDecisionId,
        lastReviewEventSeq: entry.lastReviewEventSeq } };
  });
  return cloneData(budget({ apiVersion: 1, mindVersion: COGNITION_INSPECTOR_VERSION, view: 'developer',
    simulationId: s.simulationId, revision: s.revision, tick: s.tick,
    worldFacts: { publicFood: w.resources.food, publicHerbs: w.resources.herbs, postedHerbPrice: w.marketModel.prices.herbs },
    actors }, MAX_COGNITION_INSPECTOR_BYTES));
}

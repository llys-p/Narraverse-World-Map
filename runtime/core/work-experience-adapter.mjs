// Projects a trusted runtime/audit chain into the frozen kernel's nine fields.
// Static DTO correspondence is necessary, but does not prove authentic history.
import { fields, record, identifier, integer, denseArray, canonicalJson, commandInput,
  inputFingerprint, requireCondition } from './data-contract.mjs';
import { EXPERIENCE_RULES, EXPERIENCE_DECISION_VERSION, EXPERIENCE_KNOWLEDGE_VERSION,
  inspectDescriptorTree } from './experience-state.mjs';
import { validateExperienceMotivationDecision, validateMotivationOutcome,
  validateCognitionMotivationDecision } from './motivation-state.mjs';
import { validateSocietyActionResult } from './society.mjs';
import { COGNITION_RULES, COGNITION_DECISION_VERSION, COGNITION_KNOWLEDGE_VERSION } from './cognition-state.mjs';
import { SURVIVAL_RULES, SURVIVAL_DECISION_VERSION, SURVIVAL_KNOWLEDGE_VERSION, validateSurvivalOutcome,
  validateSurvivalDecision } from './survival-state.mjs';

const EVENT_FIELDS = ['eventSeq', 'tick', 'type', 'schemaVersion', 'sourceSystem',
  'commandId', 'causationEventSeqs', 'entityIds', 'payload'];

function eventIdentity(event, type, source, actorId) {
  fields(event, EVENT_FIELDS);
  integer(event.eventSeq, 1); integer(event.tick, 1);
  requireCondition(event.type === type && event.schemaVersion === 1 && event.sourceSystem === source,
    'Invalid ' + type + ' event identity');
  denseArray(event.entityIds);
  requireCondition(event.entityIds.length === 1 && event.entityIds[0] === actorId, 'Event actor identity mismatch');
  denseArray(event.causationEventSeqs, 140000);
}

const EXPERIENCE_CHAIN = Object.freeze({ rulesVersion: EXPERIENCE_RULES, decisionVersion: EXPERIENCE_DECISION_VERSION,
  knowledgeVersion: EXPERIENCE_KNOWLEDGE_VERSION, validateDecision: validateExperienceMotivationDecision });
const COGNITION_CHAIN = Object.freeze({ rulesVersion: COGNITION_RULES, decisionVersion: COGNITION_DECISION_VERSION,
  knowledgeVersion: COGNITION_KNOWLEDGE_VERSION, validateDecision: validateCognitionMotivationDecision });
// M4A: the same trusted nine-field projection under the survival rules. The frozen kernel
// projection is unchanged; only the rule/decision/knowledge versions and validators differ.
const SURVIVAL_CHAIN = Object.freeze({ rulesVersion: SURVIVAL_RULES, decisionVersion: SURVIVAL_DECISION_VERSION,
  knowledgeVersion: SURVIVAL_KNOWLEDGE_VERSION, validateDecision: validateSurvivalDecision });

export function projectOwnWorkOutcome(context, actorId, resolvedEventSeq) {
  return projectOwnWorkOutcomeFor(context, actorId, resolvedEventSeq, EXPERIENCE_CHAIN);
}

// M3-3A: the same trusted chain under the cognition rules. The frozen nine-field projection is
// unchanged; only the rule/decision/knowledge versions and the decision validator differ.
export function projectOwnCognitionWorkOutcome(context, actorId, resolvedEventSeq) {
  return projectOwnWorkOutcomeFor(context, actorId, resolvedEventSeq, COGNITION_CHAIN);
}

// M4A: the survival chain for actor-2, and the cognition chain for actor-3, in the same world.
export function projectOwnSurvivalWorkOutcome(context, actorId, resolvedEventSeq) {
  const survival = context.rulesVersion === SURVIVAL_RULES && actorId === 'actor-2';
  return projectOwnWorkOutcomeFor(context, actorId, resolvedEventSeq, survival ? SURVIVAL_CHAIN : COGNITION_CHAIN);
}

function projectOwnWorkOutcomeFor(context, actorId, resolvedEventSeq, spec) {
  inspectDescriptorTree(context);
  fields(context, ['simulationId', 'rulesVersion', 'eventLog', 'commandReceipts']);
  requireCondition(context.rulesVersion === spec.rulesVersion ||
    (context.rulesVersion === SURVIVAL_RULES && spec.rulesVersion === COGNITION_RULES && actorId === 'actor-3'),
    'Unknown work experience rules', 'UNSUPPORTED_VERSION');
  identifier(context.simulationId); integer(resolvedEventSeq, 1);
  requireCondition(['actor-1', 'actor-2', 'actor-3', 'actor-4'].includes(actorId), 'Unknown actor identity');
  denseArray(context.eventLog, 140000); record(context.commandReceipts);
  for (const event of context.eventLog) record(event);
  const uniqueEvent = seq => {
    const matches = context.eventLog.filter(event => event.eventSeq === seq);
    requireCondition(matches.length === 1, 'Missing or repeated event sequence');
    return matches[0];
  };
  const resolved = uniqueEvent(resolvedEventSeq), outcome = resolved.payload;
  // M4A: under the survival rules actor-2's outcome carries the extra private food delta, so it
  // is checked by the survival validator; every other actor keeps the frozen outcome shape.
  if (context.rulesVersion === SURVIVAL_RULES && outcome.actorId === 'actor-2') validateSurvivalOutcome(outcome);
  else validateMotivationOutcome(outcome);
  const owner = outcome.actorId;
  eventIdentity(resolved, 'MotivationDecisionResolved', 'motivation', owner);
  requireCondition(resolved.commandId === outcome.commandId, 'Resolved commandId differs from payload');
  requireCondition(resolved.causationEventSeqs.length === 1, 'Resolved must cite exactly one planned event');
  const planned = uniqueEvent(resolved.causationEventSeqs[0]), decision = planned.payload;
  eventIdentity(planned, 'MotivationDecisionPlanned', 'motivation', owner);
  record(decision);
  requireCondition(decision.version === spec.decisionVersion, 'Invalid experience decision version');
  spec.validateDecision(decision);
  requireCondition(planned.commandId === null && planned.eventSeq < resolved.eventSeq &&
    planned.tick === resolved.tick && decision.tick === resolved.tick &&
    decision.actorId === owner && decision.decisionId === outcome.decisionId &&
    canonicalJson(planned.causationEventSeqs) === canonicalJson(decision.evidenceRefs), 'Planned/resolved binding mismatch');
  requireCondition(context.eventLog.filter(e => e.type === 'MotivationDecisionPlanned' &&
    e.payload?.decisionId === decision.decisionId).length === 1, 'Repeated planned decision');
  requireCondition(context.eventLog.filter(e => e.type === 'MotivationDecisionResolved' &&
    (e.payload?.decisionId === decision.decisionId || (resolved.commandId !== null && e.commandId === resolved.commandId))).length === 1,
    'Repeated resolved decision/command');

  let knowledge;
  try { knowledge = JSON.parse(decision.knowledgeFingerprint); }
  catch { requireCondition(false, 'Invalid decision knowledge JSON'); }
  inspectDescriptorTree(knowledge); record(knowledge); record(knowledge.self);
  requireCondition(knowledge.knowledgeVersion === spec.knowledgeVersion && knowledge.simulationId === context.simulationId &&
    knowledge.actorId === owner && knowledge.tick === decision.tick && canonicalJson(knowledge) === decision.knowledgeFingerprint,
  'Decision knowledge identity mismatch');
  integer(knowledge.self.health); integer(knowledge.self.fatigue);
  requireCondition(knowledge.self.health <= 1000 && knowledge.self.fatigue <= 1000, 'Invalid decision physical needs');

  // Verify the whole chain before returning null for another actor or action.
  const commandId = decision.decisionId;
  const committedEvents = context.eventLog.filter(e => e.type === 'SocietyActionCommitted' && e.commandId === commandId);
  if (decision.choice === 'NoAction') {
    requireCondition(outcome.status === 'no-action' && resolved.commandId === null &&
      !Object.hasOwn(context.commandReceipts, commandId) && committedEvents.length === 0, 'NoAction carries command history');
    return null;
  }
  requireCondition(resolved.commandId === commandId && outcome.status !== 'no-action', 'Action lacks its decision command');
  requireCondition(Object.hasOwn(context.commandReceipts, commandId), 'Missing command receipt');
  const receipt = context.commandReceipts[commandId];
  fields(receipt, ['inputSeq', 'input', 'fingerprint', 'status', 'result', 'eventSeqs']);
  integer(receipt.inputSeq, 1);
  fields(receipt.input, ['type', 'payload', 'targetTick']);
  const input = commandInput({ commandId, ...receipt.input });
  requireCondition(input.type === 'SocietyAction' && input.targetTick === resolved.tick &&
    input.payload.actorId === owner && input.payload.action === decision.choice &&
    input.payload.goalId === (decision.goalId ?? 0) && input.payload.targetActorId === null &&
    receipt.fingerprint === inputFingerprint(input), 'Receipt input/decision mismatch');
  requireCondition(receipt.status === outcome.status, 'Receipt and resolved status mismatch');
  denseArray(receipt.eventSeqs);

  if (outcome.status === 'succeeded') {
    requireCondition(committedEvents.length === 1 && receipt.eventSeqs.length === 1, 'Succeeded command needs unique committed event');
    const committed = uniqueEvent(receipt.eventSeqs[0]);
    eventIdentity(committed, 'SocietyActionCommitted', 'command-engine', owner);
    requireCondition(committed === committedEvents[0] && committed.commandId === commandId &&
      committed.tick === resolved.tick && committed.eventSeq > planned.eventSeq && committed.eventSeq < resolved.eventSeq &&
      committed.causationEventSeqs.length === 0, 'Committed event/receipt binding mismatch');
    validateSocietyActionResult(receipt.result);
    const result = receipt.result;
    requireCondition(canonicalJson(result) === canonicalJson(committed.payload), 'Receipt result must match committed payload');
    requireCondition(result.actorId === owner && result.action === decision.choice && result.goalId === input.payload.goalId &&
      result.targetActorId === input.payload.targetActorId && result.day * 144 === resolved.tick, 'Committed payload/input mismatch');
    const delta = { wallet: result.after.wallet - result.before.wallet,
      herbs: result.after.inventory.herbs - result.before.inventory.herbs,
      health: decision.choice === 'UseMedicine' ? Math.min(100, 1000 - knowledge.self.health) : 0,
      fatigue: decision.choice === 'WorkForPay' ? Math.min(150, 1000 - knowledge.self.fatigue) : 0 };
    // M4A: actor-2's survival outcome also carries the private food delta, and records the real
    // price paid for both purchases.
    if (context.rulesVersion === SURVIVAL_RULES && outcome.actorId === 'actor-2') delta.food = result.after.inventory.food - result.before.inventory.food;
    requireCondition(outcome.code === null && outcome.failureOwner === null && canonicalJson(outcome.delta) === canonicalJson(delta) &&
      outcome.price === (['BuyMedicine', 'BuyFood'].includes(decision.choice) ? result.price : null) &&
      outcome.publicFoodProduced === (decision.choice === 'WorkForPay' ? result.foodProduced : 0), 'Resolved result semantics mismatch');
  } else {
    requireCondition(outcome.status === 'rejected' && outcome.code === 'RULE_REJECTED' &&
      receipt.eventSeqs.length === 0 && committedEvents.length === 0 &&
      canonicalJson(receipt.result) === canonicalJson({ code: 'RULE_REJECTED' }) &&
      canonicalJson(outcome.failureOwner) === canonicalJson({ planId: decision.planId, goalId: decision.goalId }),
    'Rejected receipt/outcome semantics mismatch');
  }
  if (owner !== actorId || decision.choice !== 'WorkForPay') return null;
  return { simulationId: context.simulationId, actorId, sourceEventSeq: resolved.eventSeq, occurrenceTick: resolved.tick,
    decisionId: decision.decisionId, commandId, action: 'WorkForPay', status: outcome.status, code: outcome.code };
}

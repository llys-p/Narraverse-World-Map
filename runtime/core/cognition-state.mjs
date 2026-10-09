// M3-3A cognition state: configuration and runtime model shapes for the importance x relevance
// review cadence. This module only owns structure, budgets and identity. The frozen M3-1B review
// kernel owns cadence semantics; cognition-signals owns signal derivation. No clock, RNG, world,
// event log or cross-actor access. Every public path preflights the complete descriptor tree
// before any clone or canonical byte budget so accessors are rejected without being executed.
import { fields, record, integer, identifier, denseArray, cloneData, canonicalJson, requireCondition } from './data-contract.mjs';
import { TICKS_PER_DAY } from './simulation-clock.mjs';
import { createCognitiveReviewState, validateCognitiveReviewState, COGNITIVE_REVIEW_STATE_VERSION } from './cognitive-review.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';

export const COGNITION_RULES = 'm-cognition-v1';
export const COGNITION_CONFIG_VERSION = 'cognition-config-v1';
export const COGNITION_RUNTIME_STATE_VERSION = 'cognition-runtime-state-v1';
export const COGNITION_MOTIVATION_STATE_VERSION = 'cognition-motivation-state-v1';
export const COGNITION_KNOWLEDGE_VERSION = 'cognition-knowledge-v1';
export const COGNITION_DECISION_VERSION = 'cognition-decision-v1';
export const MAX_COGNITION_MODEL_BYTES = 32768;
export const MAX_COGNITION_KNOWLEDGE_BYTES = 16384;
export const MAX_COGNITION_EVIDENCE_REFS = 71;

export const COGNITION_ACTOR_IDS = Object.freeze(['actor-2', 'actor-3']);

const CONFIG_FIELDS = Object.freeze(['version', 'profiles']);
const PROFILE_FIELDS = Object.freeze(['actorId', 'importancePermille']);
const MODEL_FIELDS = Object.freeze(['version', 'simulationId', 'config', 'configFingerprint', 'cursor', 'actors']);
const ACTOR_FIELDS = Object.freeze(['actorId', 'reviewState', 'signalBaseline', 'lastReviewDecisionId', 'lastReviewEventSeq']);
const BASELINE_FIELDS = Object.freeze(['keyEvidenceFingerprint']);
const MAX_IMPORTANCE_PERMILLE = 1000;
const DECISION_ID_PREFIX = 'cognition-day-';

function byteLength(value) {
  return new TextEncoder().encode(canonicalJson(value)).length;
}

export function validateCognitionSignalBaseline(baseline) {
  inspectDescriptorTree(baseline);
  if (baseline === null) return null;
  fields(baseline, BASELINE_FIELDS);
  const fingerprint = baseline.keyEvidenceFingerprint;
  requireCondition(typeof fingerprint === 'string', 'Invalid cognition signal baseline');
  let semantic;
  try { semantic = JSON.parse(fingerprint); }
  catch { requireCondition(false, 'Invalid cognition signal baseline JSON'); }
  fields(semantic, ['value', 'confidenceEnough', 'penaltyPermille']);
  requireCondition(['available', 'unavailable', 'unknown'].includes(semantic.value) &&
    typeof semantic.confidenceEnough === 'boolean' && [0, 100, 200, 300].includes(semantic.penaltyPermille),
    'Invalid cognition signal baseline semantics');
  requireCondition(fingerprint === canonicalJson(semantic), 'Cognition signal baseline must be canonical');
  return baseline;
}

export function validateCognitionConfig(config) {
  inspectDescriptorTree(config);
  record(config);
  fields(config, CONFIG_FIELDS);
  requireCondition(config.version === COGNITION_CONFIG_VERSION, 'Unknown cognition configuration', 'UNSUPPORTED_VERSION');
  denseArray(config.profiles, COGNITION_ACTOR_IDS.length);
  requireCondition(config.profiles.length === COGNITION_ACTOR_IDS.length &&
    config.profiles.every((profile, index) => profile.actorId === COGNITION_ACTOR_IDS[index]),
    'Cognition roster must be the two fixed identities in fixed order');
  for (const profile of config.profiles) {
    record(profile);
    fields(profile, PROFILE_FIELDS);
    identifier(profile.actorId);
    integer(profile.importancePermille);
    requireCondition(profile.importancePermille <= MAX_IMPORTANCE_PERMILLE, 'Cognition importance out of range', 'LIMIT_EXCEEDED');
  }
  return config;
}

export function createCognitionModel(simulationId, config) {
  inspectDescriptorTree({ simulationId, config });
  identifier(simulationId);
  validateCognitionConfig(config);
  const cleanConfig = cloneData(config);
  const actors = COGNITION_ACTOR_IDS.map((actorId) => ({
    actorId,
    reviewState: createCognitiveReviewState(simulationId, actorId),
    signalBaseline: null,
    lastReviewDecisionId: null,
    lastReviewEventSeq: null,
  }));
  const model = {
    version: COGNITION_RUNTIME_STATE_VERSION,
    simulationId,
    config: cleanConfig,
    configFingerprint: canonicalJson(cleanConfig),
    cursor: 0,
    actors,
  };
  requireCondition(byteLength(model) <= MAX_COGNITION_MODEL_BYTES, 'Cognition model exceeds byte budget', 'LIMIT_EXCEEDED');
  return model;
}

export function validateCognitionModel(model) {
  inspectDescriptorTree(model);
  requireCondition(byteLength(model) <= MAX_COGNITION_MODEL_BYTES, 'Cognition model exceeds byte budget', 'LIMIT_EXCEEDED');
  record(model);
  fields(model, MODEL_FIELDS);
  requireCondition(model.version === COGNITION_RUNTIME_STATE_VERSION, 'Unknown cognition model version', 'UNSUPPORTED_VERSION');
  identifier(model.simulationId);
  validateCognitionConfig(model.config);
  requireCondition(model.configFingerprint === canonicalJson(model.config), 'Cognition config fingerprint mismatch');
  integer(model.cursor, 0);
  denseArray(model.actors, COGNITION_ACTOR_IDS.length);
  requireCondition(model.actors.length === COGNITION_ACTOR_IDS.length &&
    model.actors.every((actor, index) => actor.actorId === COGNITION_ACTOR_IDS[index]), 'Cognition roster mismatch');
  for (const actor of model.actors) {
    record(actor);
    fields(actor, ACTOR_FIELDS);
    requireCondition(COGNITION_ACTOR_IDS.includes(actor.actorId), 'Unknown cognition actor identity');
    validateCognitiveReviewState(actor.reviewState);
    requireCondition(actor.reviewState.version === COGNITIVE_REVIEW_STATE_VERSION, 'Unknown cognitive review state version', 'UNSUPPORTED_VERSION');
    requireCondition(actor.reviewState.simulationId === model.simulationId && actor.reviewState.actorId === actor.actorId,
      'Cognition review kernel identity mismatch');
    validateCognitionSignalBaseline(actor.signalBaseline);
    // The two review anchors are a pair: both empty or both set, never half-populated.
    const anchored = actor.lastReviewDecisionId !== null;
    requireCondition(anchored === (actor.lastReviewEventSeq !== null), 'Cognition review anchors must be paired');
    const reviewTick = actor.reviewState.lastReviewTick;
    if (reviewTick === null) {
      requireCondition(!anchored, 'Cognition review anchor without a completed review');
    } else {
      requireCondition(anchored, 'Completed cognition review without its anchor');
      identifier(actor.lastReviewDecisionId);
      requireCondition(actor.lastReviewDecisionId === DECISION_ID_PREFIX + reviewTick / TICKS_PER_DAY + '-' + actor.actorId,
        'Cognition review anchor does not match the latest review tick');
      integer(actor.lastReviewEventSeq, 1);
    }
  }
  return model;
}

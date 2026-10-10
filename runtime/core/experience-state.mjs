// M3-2A experience state: runtime model and configuration shapes for work experience.
// Strict descriptor validation precedes any property access or canonical serialization.
import { fields, record, integer, identifier, denseArray, cloneData, canonicalJson, requireCondition, MAX_COLLECTION, MAX_EVENTS } from './data-contract.mjs';
import { createWorkExperienceState, validateWorkExperienceState } from './work-experience.mjs';
import { COGNITION_RULES } from './cognition-state.mjs';
// Kept as a literal: the survival state module imports this module, so a cycle would be created.
const SURVIVAL_RULES = 'm-survival-v1';

export const EXPERIENCE_RULES = 'm-experience-v1';
export const EXPERIENCE_CONFIG_VERSION = 'experience-config-v1';
export const EXPERIENCE_RUNTIME_STATE_VERSION = 'experience-runtime-state-v1';
export const EXPERIENCE_MOTIVATION_STATE_VERSION = 'experience-motivation-state-v1';
export const EXPERIENCE_KNOWLEDGE_VERSION = 'experience-knowledge-v1';
export const EXPERIENCE_DECISION_VERSION = 'experience-decision-v1';
export const MAX_EXPERIENCE_EVIDENCE_REFS = 69;
export const MAX_EXPERIENCE_KNOWLEDGE_BYTES = 16384;
export const MAX_EXPERIENCE_MODEL_BYTES = 32768;

const EXPERIENCE_ACTOR_IDS = Object.freeze(['actor-2', 'actor-3']);
const CONFIG_FIELDS = ['version', 'useWorkExperience'];
const MODEL_FIELDS = ['version', 'simulationId', 'config', 'configFingerprint', 'cursor', 'actors'];
const ACTOR_FIELDS = ['actorId', 'workExperienceState'];

function byteLength(value) {
  return new TextEncoder().encode(canonicalJson(value)).length;
}

export function inspectDescriptorTree(root) {
  const ancestors = new Set();
  const visit = (value, depth) => {
    requireCondition(depth <= 64, 'Data nesting budget exceeded', 'LIMIT_EXCEEDED');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      requireCondition(Number.isFinite(value), 'Non-finite number');
      return;
    }
    requireCondition(typeof value === 'object', 'Non-JSON data');
    requireCondition(!ancestors.has(value), 'Cyclic data');
    ancestors.add(value);
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array) {
      requireCondition(prototype === Array.prototype, 'Unsupported array prototype');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const length = descriptors.length?.value;
      requireCondition(Number.isSafeInteger(length) && length >= 0, 'Invalid array length');
      requireCondition(length <= MAX_EVENTS, 'Array budget exceeded', 'LIMIT_EXCEEDED');
      const keys = Reflect.ownKeys(descriptors);
      requireCondition(keys.length === length + 1, 'Sparse array or extra array properties');
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        requireCondition(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'),
          'Sparse array or accessor element');
        visit(descriptor.value, depth + 1);
      }
    } else {
      requireCondition(prototype === Object.prototype || prototype === null, 'Unsupported record prototype');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      requireCondition(keys.length <= MAX_COLLECTION, 'Record budget exceeded', 'LIMIT_EXCEEDED');
      for (const key of keys) {
        const descriptor = descriptors[key];
        requireCondition(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'),
          'Only enumerable data properties are supported');
        visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(value);
  };
  visit(root, 0);
}

// Read the rule discriminator without invoking accessors. Only the experience and
// cognition profiles opt into a complete JSON-tree preflight; callbacks stay outside it.
// Cognition narrows the same private dispatch; the data contract itself is unchanged.
export function preflightExperienceData(data, bundled = false) {
  record(data);
  const container = bundled ? Object.getOwnPropertyDescriptor(data, 'snapshot')?.value : data;
  record(container);
  const version = Object.getOwnPropertyDescriptor(container, 'rulesVersion')?.value;
  // The survival profile reuses the experience descriptor preflight; a cyclic import of the
  // survival constants is avoided by the literal above.
  const experience = version === EXPERIENCE_RULES || version === COGNITION_RULES || version === SURVIVAL_RULES;
  if (experience) inspectDescriptorTree(data);
  return experience;
}

export function validateExperienceConfig(config) {
  requireCondition(config !== null && typeof config === 'object', 'Expected experience configuration record');
  inspectDescriptorTree(config);
  record(config);
  fields(config, CONFIG_FIELDS);
  requireCondition(config.version === EXPERIENCE_CONFIG_VERSION, 'Unknown experience configuration', 'UNSUPPORTED_VERSION');
  requireCondition(typeof config.useWorkExperience === 'boolean', 'Invalid useWorkExperience flag');
  return config;
}

export function createExperienceModel(simulationId, config) {
  identifier(simulationId);
  validateExperienceConfig(config);
  const cleanConfig = cloneData(config);
  const actors = EXPERIENCE_ACTOR_IDS.map((actorId) => ({
    actorId,
    workExperienceState: createWorkExperienceState(simulationId, actorId),
  }));
  const model = {
    version: EXPERIENCE_RUNTIME_STATE_VERSION,
    simulationId,
    config: cleanConfig,
    configFingerprint: canonicalJson(cleanConfig),
    cursor: 0,
    actors,
  };
  requireCondition(byteLength(model) <= MAX_EXPERIENCE_MODEL_BYTES, 'Experience model exceeds byte budget', 'LIMIT_EXCEEDED');
  return model;
}

export function validateExperienceModel(model) {
  requireCondition(model !== null && typeof model === 'object', 'Expected experience model record');
  inspectDescriptorTree(model);
  requireCondition(byteLength(model) <= MAX_EXPERIENCE_MODEL_BYTES, 'Experience model exceeds byte budget', 'LIMIT_EXCEEDED');
  record(model);
  fields(model, MODEL_FIELDS);
  requireCondition(model.version === EXPERIENCE_RUNTIME_STATE_VERSION, 'Unknown experience model version', 'UNSUPPORTED_VERSION');
  identifier(model.simulationId);
  validateExperienceConfig(model.config);
  requireCondition(model.configFingerprint === canonicalJson(model.config), 'Experience config fingerprint mismatch');
  integer(model.cursor, 0);
  denseArray(model.actors, 2);
  requireCondition(model.actors.length === 2 &&
    model.actors[0].actorId === EXPERIENCE_ACTOR_IDS[0] &&
    model.actors[1].actorId === EXPERIENCE_ACTOR_IDS[1], 'Experience roster mismatch');
  for (const actor of model.actors) {
    record(actor);
    fields(actor, ACTOR_FIELDS);
    requireCondition(EXPERIENCE_ACTOR_IDS.includes(actor.actorId), 'Unknown experience actor identity');
    validateWorkExperienceState(actor.workExperienceState);
    requireCondition(actor.workExperienceState.simulationId === model.simulationId, 'Experience actor simulationId mismatch');
    requireCondition(actor.workExperienceState.actorId === actor.actorId, 'Experience actorId mismatch');
  }
  return model;
}

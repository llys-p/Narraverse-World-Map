// D3-1 single-encounter reservation kernel (contract d3-reservation-kernel-v1).
// A serializable counter ledger: one wolf is held back from the available pool, a survivor is
// returned, a death is deducted exactly once. This is a single-lifecycle sub-ledger DTO, not world
// state, and it proves nothing about real events. Long-range encounters, world facts and command
// correlation belong to later adapter contracts.
import { fields, identifier, integer, cloneData, fault, requireCondition } from './data-contract.mjs';

export const ENCOUNTER_RESERVATION_VERSION = 'encounter-reservation-v1';
export const MAX_ENCOUNTER_POPULATION = 100000;

const STATE_FIELDS = ['version', 'initialPopulation', 'available', 'reserved', 'battleDeaths', 'encounter'];
const ENCOUNTER_FIELDS = ['encounterId', 'status', 'resolution'];
const RESOLUTIONS = ['released', 'died'];

// The encounter slot is either empty or exactly three data fields. Every descriptor is checked
// before any value is read, so an accessor can never run.
function readEncounter(state) {
  const encounter = state.encounter;
  if (encounter === null) return null;
  fields(encounter, ENCOUNTER_FIELDS);
  identifier(encounter.encounterId);
  requireCondition(encounter.status === 'active' || encounter.status === 'closed', 'Unknown encounter status');
  requireCondition(encounter.resolution === null || RESOLUTIONS.includes(encounter.resolution), 'Unknown encounter resolution');
  return encounter;
}

// Strict shape and conservation check. Returns the original reference on success.
function validateState(state) {
  fields(state, STATE_FIELDS);
  requireCondition(state.version === ENCOUNTER_RESERVATION_VERSION, 'Unsupported ledger version');
  integer(state.initialPopulation, 0);
  requireCondition(state.initialPopulation <= MAX_ENCOUNTER_POPULATION, 'Population budget exceeded', 'LIMIT_EXCEEDED');
  integer(state.available, 0);
  requireCondition(state.available <= MAX_ENCOUNTER_POPULATION, 'Available budget exceeded', 'LIMIT_EXCEEDED');
  requireCondition(state.reserved === 0 || state.reserved === 1, 'Reserved is only ever 0 or 1');
  requireCondition(state.battleDeaths === 0 || state.battleDeaths === 1, 'Battle deaths are only ever 0 or 1');
  requireCondition(state.available + state.reserved + state.battleDeaths === state.initialPopulation,
    'Available, reserved and battle deaths must sum to the initial population');
  const encounter = readEncounter(state);
  if (encounter === null) {
    requireCondition(state.reserved === 0 && state.battleDeaths === 0 && state.available === state.initialPopulation,
      'The empty ledger holds nothing');
    return state;
  }
  if (encounter.status === 'active') {
    requireCondition(encounter.resolution === null, 'An open encounter carries no outcome');
    requireCondition(state.initialPopulation >= 1, 'An open encounter needs at least one wolf');
    requireCondition(state.reserved === 1 && state.battleDeaths === 0 && state.available === state.initialPopulation - 1,
      'An open encounter holds exactly one wolf and has not died');
    return state;
  }
  requireCondition(RESOLUTIONS.includes(encounter.resolution), 'A closed encounter needs an outcome');
  requireCondition(state.reserved === 0, 'A closed slot keeps nothing reserved');
  if (encounter.resolution === 'released') {
    requireCondition(state.battleDeaths === 0 && state.available === state.initialPopulation,
      'A survivor returns the held wolf');
  } else {
    requireCondition(state.initialPopulation >= 1, 'A death needs at least one initial wolf');
    requireCondition(state.battleDeaths === 1 && state.available === state.initialPopulation - 1,
      'A death is deducted exactly once');
  }
  return state;
}

// Detached deep copy of an already-validated ledger; the caller input is never touched.
function copyState(state) {
  return cloneData(state);
}

export function createEncounterReservation(initialPopulation) {
  integer(initialPopulation, 0);
  requireCondition(initialPopulation <= MAX_ENCOUNTER_POPULATION, 'Population budget exceeded', 'LIMIT_EXCEEDED');
  return {
    version: ENCOUNTER_RESERVATION_VERSION,
    initialPopulation,
    available: initialPopulation,
    reserved: 0,
    battleDeaths: 0,
    encounter: null,
  };
}

export function validateEncounterReservation(state) {
  return validateState(state);
}

export function reserveEncounter(state, encounterId) {
  validateState(state);
  identifier(encounterId);
  const encounter = state.encounter;
  if (encounter === null) {
    requireCondition(state.available >= 1, 'No wolf left to reserve', 'RULE_REJECTED');
    const next = copyState(state);
    next.available -= 1;
    next.reserved += 1;
    next.encounter = { encounterId, status: 'active', resolution: null };
    return next;
  }
  if (encounter.status === 'active') {
    requireCondition(encounter.encounterId === encounterId, 'An encounter already holds the slot', 'ENCOUNTER_BUSY');
    return copyState(state);
  }
  throw fault('ENCOUNTER_CLOSED', 'A closed encounter slot is never reused');
}

export function closeEncounterReservation(state, encounterId, resolution) {
  validateState(state);
  identifier(encounterId);
  requireCondition(RESOLUTIONS.includes(resolution), 'Unknown encounter resolution');
  const encounter = state.encounter;
  requireCondition(encounter !== null, 'No open encounter to close', 'ENCOUNTER_UNAVAILABLE');
  requireCondition(encounter.encounterId === encounterId, 'Encounter id does not match', 'ENCOUNTER_ID_MISMATCH');
  if (encounter.status === 'active') {
    const next = copyState(state);
    next.reserved -= 1;
    if (resolution === 'released') next.available += 1; else next.battleDeaths += 1;
    next.encounter = { encounterId, status: 'closed', resolution };
    return next;
  }
  requireCondition(encounter.resolution === resolution, 'The encounter outcome is already decided',
    'ENCOUNTER_RESULT_CONFLICT');
  return copyState(state);
}

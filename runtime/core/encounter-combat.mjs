// D3-4 minimal deterministic single-wolf combat kernel (contract d3-combat-kernel-v1).
// A pure synchronous candidate kernel over one frozen recipe: the wolf opens at 300, a player blow
// costs it 150, a surviving wolf answers for 80, attack costs 6 ticks, flee 6 ticks and cancel 0.
// The client names no damage, no outcome and no death: the kernel derives them. This module is a
// candidate DTO only - it performs no authoritative commit, never writes its input, owns no
// commandId cache, drives no world clock and proves nothing about a real fight. Session lifecycle,
// idempotence, persistence and UI belong to other contracts.
import { fields, record, identifier, integer, cloneData, canonicalJson,
  requireCondition } from './data-contract.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';

export const ENCOUNTER_COMBAT_VERSION = 'encounter-combat-v1';

// The frozen recipe. One constant per taskbook line; none of these is a balance decision.
const WOLF_HEALTH = 300;
const PLAYER_ATTACK = 150;
const WOLF_COUNTER = 80;
const ATTACK_TICKS = 6;
const FLEE_TICKS = 6;
const MIN_PLAYER_HEALTH = 1;
const MAX_PLAYER_HEALTH = 1000;
const MAX_ROUNDS = 2;
const MAX_STATE_BYTES = 4096;

const STATE_FIELDS = ['version', 'encounterId', 'initialPlayerHealth', 'playerHealth', 'wolfHealth',
  'rounds', 'elapsedTicks', 'status', 'resolution', 'wolfDied'];
const INTENT_FIELDS = ['encounterId', 'action'];
const ACTIONS = ['attack', 'flee', 'cancel'];
const RESOLUTIONS = ['win', 'lose', 'flee', 'cancel'];

function byteLength(value) {
  return new TextEncoder().encode(canonicalJson(value)).length;
}

// The exact reachable set. Every branch pins the whole tuple - rounds, status, resolution, both
// healths and the death flag - rather than checking types, so no invented state can slip through:
//   active/0  initial, wolf 300, 0 ticks           active/1  initial > 80, initial-80, wolf 150, 6 ticks
//   win/2     initial > 80, initial-80, wolf 0, died, 12 ticks
//   lose/1    initial <= 80, player 0, wolf 150, 6 ticks
//   flee|0    initial, wolf 300, 6 ticks           flee|1  initial > 80, initial-80, wolf 150, 12 ticks
//   cancel|0  initial, wolf 300, 0 ticks           cancel|1 initial > 80, initial-80, wolf 150, 6 ticks
// There is deliberately no active/round2: a second blow always settles the encounter one way or the
// other, and a win can never be reached at round 1.
function requireReachable(state) {
  const initial = state.initialPlayerHealth;
  const rounds = state.rounds;
  if (state.status === 'active') {
    requireCondition(state.resolution === null, 'An open encounter carries no outcome');
    requireCondition(rounds === 0 || rounds === 1, 'An open encounter is only ever at round 0 or 1');
    if (rounds === 0) {
      requireCondition(state.playerHealth === initial, 'Round 0 keeps the opening player health');
      requireCondition(state.wolfHealth === WOLF_HEALTH, 'Round 0 keeps the wolf at full health');
      return;
    }
    requireCondition(initial > WOLF_COUNTER, 'Round 1 needs a player who survived the counter');
    requireCondition(state.playerHealth === initial - WOLF_COUNTER, 'Round 1 carries exactly one counter');
    requireCondition(state.wolfHealth === WOLF_HEALTH - PLAYER_ATTACK, 'Round 1 leaves the wolf wounded once');
    return;
  }
  requireCondition(RESOLUTIONS.includes(state.resolution), 'A closed encounter needs a known outcome');
  if (state.resolution === 'win') {
    requireCondition(rounds === MAX_ROUNDS, 'A win is only reached on the second blow');
    requireCondition(initial > WOLF_COUNTER, 'A win needs a player who survived the counter');
    requireCondition(state.playerHealth === initial - WOLF_COUNTER, 'The killing blow is never answered');
    requireCondition(state.wolfHealth === 0, 'A win means a dead wolf');
    return;
  }
  if (state.resolution === 'lose') {
    requireCondition(rounds === 1, 'A loss is only reached on the first counter');
    requireCondition(initial <= WOLF_COUNTER, 'A loss needs a player the counter can kill');
    requireCondition(state.playerHealth === 0, 'A loss clamps the player to zero');
    requireCondition(state.wolfHealth === WOLF_HEALTH - PLAYER_ATTACK, 'The wolf survived the losing exchange');
    return;
  }
  // flee or cancel: an escape closes the slot without another blow and never restores health.
  requireCondition(rounds === 0 || rounds === 1, 'An escape is only possible before the second blow');
  if (rounds === 1) requireCondition(initial > WOLF_COUNTER, 'A round-1 escape needs a surviving player');
  requireCondition(state.playerHealth === initial - rounds * WOLF_COUNTER, 'An escape changes no health');
  requireCondition(state.wolfHealth === WOLF_HEALTH - rounds * PLAYER_ATTACK,
    'An escape leaves the wolf wounded exactly as far as the fight got');
}

// Strict shape and reachability check. The descriptor walk runs before any property is read, the
// canonical UTF-8 budget before the field shape, and the business rules last, so an oversized record
// is a budget fault even when it could never have been well formed. Returns the original reference.
function validateState(state) {
  inspectDescriptorTree(state);
  record(state);
  requireCondition(byteLength(state) <= MAX_STATE_BYTES, 'Combat state exceeds the byte budget',
    'LIMIT_EXCEEDED');
  fields(state, STATE_FIELDS);
  // A known-but-other version string is UNSUPPORTED_VERSION; a missing or non-string one is
  // INVALID_INPUT, so this guard keeps the default code for everything but the string case.
  requireCondition(typeof state.version === 'string', 'Missing combat version');
  requireCondition(state.version === ENCOUNTER_COMBAT_VERSION, 'Unsupported combat version',
    'UNSUPPORTED_VERSION');
  identifier(state.encounterId);
  integer(state.initialPlayerHealth, MIN_PLAYER_HEALTH);
  requireCondition(state.initialPlayerHealth <= MAX_PLAYER_HEALTH, 'Player health exceeds the trusted ceiling');
  integer(state.playerHealth, 0);
  integer(state.wolfHealth, 0);
  integer(state.rounds, 0);
  requireCondition(state.rounds <= MAX_ROUNDS, 'Round budget exceeded');
  integer(state.elapsedTicks, 0);
  requireCondition(state.status === 'active' || state.status === 'closed', 'Unknown combat status');
  requireCondition(state.resolution === null || RESOLUTIONS.includes(state.resolution),
    'Unknown combat resolution');
  requireCondition(typeof state.wolfDied === 'boolean', 'Invalid wolf death flag');
  // Two invariants hold across the whole reachable set: the local tick cost is rounds*6 plus the
  // flee premium, and the death flag is exactly "the wolf health reached zero" - it is never read
  // off the win label.
  const expectedTicks = state.rounds * ATTACK_TICKS + (state.resolution === 'flee' ? FLEE_TICKS : 0);
  requireCondition(state.elapsedTicks === expectedTicks, 'Elapsed ticks disagree with the round and outcome');
  requireCondition(state.wolfDied === (state.wolfHealth === 0), 'The death flag must track the wolf health');
  requireReachable(state);
  return state;
}

// The client names no wolf, no damage and no outcome: only the encounter and the action.
function readIntent(raw) {
  inspectDescriptorTree(raw);
  record(raw);
  requireCondition(byteLength(raw) <= MAX_STATE_BYTES, 'Combat intent exceeds the byte budget',
    'LIMIT_EXCEEDED');
  fields(raw, INTENT_FIELDS);
  identifier(raw.encounterId);
  requireCondition(ACTIONS.includes(raw.action), 'Unknown combat action');
  return { encounterId: raw.encounterId, action: raw.action };
}

// The closed result is the six decision fields, drawn from the already-validated candidate so it can
// never disagree with the state it is published beside.
function closedResult(state) {
  return { encounterId: state.encounterId, resolution: state.resolution,
    playerHealth: state.playerHealth, wolfHealth: state.wolfHealth, wolfDied: state.wolfDied,
    elapsedTicks: state.elapsedTicks };
}

export function createEncounterCombat(encounterId, initialPlayerHealth) {
  identifier(encounterId);
  // A trusted adapter value from a real person: a positive safe integer in 1..1000. Zero health (a
  // death) and anything outside the range are refused, as are fractions, NaN, infinities and
  // non-numbers; the kernel never proves where the number came from.
  integer(initialPlayerHealth, MIN_PLAYER_HEALTH);
  requireCondition(initialPlayerHealth <= MAX_PLAYER_HEALTH, 'Player health exceeds the trusted ceiling');
  const state = {
    version: ENCOUNTER_COMBAT_VERSION,
    encounterId,
    initialPlayerHealth,
    playerHealth: initialPlayerHealth,
    wolfHealth: WOLF_HEALTH,
    rounds: 0,
    elapsedTicks: 0,
    status: 'active',
    resolution: null,
    wolfDied: false,
  };
  validateState(state);
  return state;
}

export function validateEncounterCombat(state) {
  return validateState(state);
}

export function applyEncounterCombatAction(state, intent) {
  // The state is judged first, then the intent shape, then the encounter identity, and only then the
  // closed slot: a foreign id on a closed encounter is a mismatch, not a closed refusal.
  validateState(state);
  const request = readIntent(intent);
  requireCondition(request.encounterId === state.encounterId, 'Encounter id does not match',
    'ENCOUNTER_ID_MISMATCH');
  requireCondition(state.status === 'active', 'A closed encounter never reopens', 'ENCOUNTER_CLOSED');

  const next = cloneData(state);
  if (request.action === 'attack') {
    // The blow lands first: the wolf loses 150 and the round and its 6 ticks are spent. Only a wolf
    // that is still standing answers, so the killing blow is never met with a counter.
    next.rounds = state.rounds + 1;
    next.wolfHealth = state.wolfHealth - PLAYER_ATTACK;
    next.elapsedTicks = next.rounds * ATTACK_TICKS;
    if (next.wolfHealth === 0) {
      next.status = 'closed';
      next.resolution = 'win';
      next.wolfDied = true;
    } else {
      const wounded = state.playerHealth - WOLF_COUNTER;
      next.playerHealth = wounded > 0 ? wounded : 0;
      if (next.playerHealth === 0) {
        next.status = 'closed';
        next.resolution = 'lose';
      }
    }
  } else if (request.action === 'flee') {
    // A fixed successful escape: 6 ticks on top of the rounds already spent, no damage either way.
    next.elapsedTicks = state.rounds * ATTACK_TICKS + FLEE_TICKS;
    next.status = 'closed';
    next.resolution = 'flee';
  } else {
    // Cancelling costs nothing and changes nothing but the slot.
    next.elapsedTicks = state.rounds * ATTACK_TICKS;
    next.status = 'closed';
    next.resolution = 'cancel';
  }

  // A candidate is only published if it is itself a reachable state; a fault here leaves the caller
  // input untouched and throws instead of returning a fabricated refusal.
  validateState(next);
  return { state: next, result: next.status === 'closed' ? closedResult(next) : null };
}

// D3-3 bounded encounter command session (contract d3-encounter-session-v1).
// A synchronous, in-memory state machine over one isolated copy of a player-play world: it turns
// Begin/Cancel into legal, traceable commands with a bounded command journal. It never touches the
// source bundle, the old EventLog, checkpoints, HTTP or the UI, and it offers no restore/export/
// advance/profile/IO surface. Every value handed out is a detached deep copy.
import { fields, record, own, identifier, integer, cloneData, canonicalJson,
  requireCondition, MAX_COLLECTION } from './data-contract.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { validateBundle } from './world-state.mjs';
import { PLAY_RULES } from './player-state.mjs';
import { createEncounterWorld, validateEncounterWorld, beginPlayerWolfEncounter,
  cancelPlayerWolfEncounter } from './encounter-world.mjs';

export const ENCOUNTER_SESSION_VERSION = 'encounter-session-v1';
export const MAX_ENCOUNTER_COMMANDS = 100;

const MAX_REQUEST_BYTES = 4096;
const ENCOUNTER_ID = 'encounter-1';
const REQUEST_FIELDS = ['commandId', 'expectedEncounterRevision', 'type', 'payload'];
const BEGIN_TYPE = 'EncounterBegin';
const CANCEL_TYPE = 'EncounterCancel';
// Only these five refusals are domain outcomes that become a rejected receipt. Every other fault
// (INVALID_INPUT, UNSUPPORTED_VERSION, LIMIT_EXCEEDED, ENCOUNTER_RESULT_CONFLICT or anything
// unexpected) keeps propagating so the whole submission stays unchanged; there is deliberately no
// catch-all and no widening of this list.
const DOMAIN_CODES = new Set(['RULE_REJECTED', 'ENCOUNTER_BUSY', 'ENCOUNTER_CLOSED',
  'ENCOUNTER_UNAVAILABLE', 'ENCOUNTER_ID_MISMATCH']);

function byteLength(value) {
  return new TextEncoder().encode(canonicalJson(value)).length;
}

// The systems registry is a trusted function table, not JSON data: its own function values must not
// be pushed through a JSON descriptor walk. Only the registry record itself is inspected — prototype,
// own keys, descriptors — and accessors, symbol keys and hidden entries are refused before any read.
function inspectSystemsRegistry(systems) {
  requireCondition(systems !== null && typeof systems === 'object' && !Array.isArray(systems),
    'Expected a systems registry');
  const prototype = Object.getPrototypeOf(systems);
  requireCondition(prototype === Object.prototype || prototype === null, 'Unsupported registry prototype');
  const keys = Reflect.ownKeys(systems);
  requireCondition(keys.length <= MAX_COLLECTION, 'Registry budget exceeded', 'LIMIT_EXCEEDED');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(systems, key);
    requireCondition(typeof key === 'string' && descriptor.enumerable && own(descriptor, 'value'),
      'Only enumerable data properties are supported');
  }
}

// Descriptor preflight, then the canonical UTF-8 budget, then the strict four-field shape. The budget
// runs before the payload shape so an oversized request is a budget fault even when its payload could
// never have been well formed. Every read below is a plain data-property read.
function readRequest(raw) {
  inspectDescriptorTree(raw);
  record(raw);
  requireCondition(byteLength(raw) <= MAX_REQUEST_BYTES, 'Request budget exceeded', 'LIMIT_EXCEEDED');
  fields(raw, REQUEST_FIELDS);
  identifier(raw.commandId);
  integer(raw.expectedEncounterRevision, 0);
  requireCondition(raw.type === BEGIN_TYPE || raw.type === CANCEL_TYPE, 'Unknown encounter command type');
  const payload = raw.payload;
  if (raw.type === BEGIN_TYPE) {
    // The client names no encounter, no person, no wolf count and no frame: an empty payload only.
    fields(payload, []);
  } else {
    fields(payload, ['encounterId']);
    identifier(payload.encounterId);
  }
  return { commandId: raw.commandId, expectedEncounterRevision: raw.expectedEncounterRevision,
    type: raw.type, payload: cloneData(payload) };
}

// Run one kernel candidate, converting only an explicit domain refusal into a rejection result.
function attempt(run) {
  try {
    return { ok: true, frame: run() };
  } catch (error) {
    if (error !== null && typeof error === 'object' && DOMAIN_CODES.has(error.code)) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

// The session, not the kernel's same-id idempotence, owns the lifecycle decision: an active slot is
// ENCOUNTER_BUSY for any new command id and a closed slot is ENCOUNTER_CLOSED.
function attemptBegin(frame) {
  const encounter = frame.reservation.encounter;
  if (encounter !== null) {
    return { ok: false, code: encounter.status === 'active' ? 'ENCOUNTER_BUSY' : 'ENCOUNTER_CLOSED' };
  }
  return attempt(() => {
    const next = beginPlayerWolfEncounter(frame, ENCOUNTER_ID);
    validateEncounterWorld(next);
    return next;
  });
}

// A missing slot, a foreign id and a closed slot are decided here, in that order, so the id mismatch
// is judged before the closed state. Only a matching active slot reaches the releasing kernel.
function attemptCancel(frame, encounterId) {
  const encounter = frame.reservation.encounter;
  if (encounter === null) return { ok: false, code: 'ENCOUNTER_UNAVAILABLE' };
  if (encounter.encounterId !== encounterId) return { ok: false, code: 'ENCOUNTER_ID_MISMATCH' };
  if (encounter.status === 'closed') return { ok: false, code: 'ENCOUNTER_CLOSED' };
  return attempt(() => {
    const next = cancelPlayerWolfEncounter(frame, encounterId);
    validateEncounterWorld(next);
    return next;
  });
}

export function createEncounterSession(bundle, systems) {
  inspectDescriptorTree(bundle);
  inspectSystemsRegistry(systems);
  record(bundle);
  fields(bundle, ['snapshot', 'eventLog']);
  const snapshot = bundle.snapshot;
  record(snapshot);
  const rulesVersion = own(snapshot, 'rulesVersion') ? snapshot.rulesVersion : null;
  requireCondition(typeof rulesVersion === 'string', 'Missing rules version');
  validateBundle(bundle, { rulesVersion, systems });
  requireCondition(rulesVersion === PLAY_RULES, 'Unsupported rules version', 'UNSUPPORTED_VERSION');
  requireCondition(snapshot.pendingCommands.length === 0, 'Pending commands are outside this contract',
    'INVALID_INPUT');
  const simulationId = snapshot.simulationId;
  const sourceTick = snapshot.tick;
  const sourceRevision = snapshot.revision;
  requireCondition(typeof simulationId === 'string', 'Missing simulation id');
  integer(sourceTick);
  integer(sourceRevision);

  // The whole session is one closure cell. `current` holds the detached D3-2 frame built from the
  // creation snapshot together with the sequence, the journal and the id index, so a submission can
  // prepare a complete successor and publish it with a single assignment. Nothing is ever mutated in
  // place: a fault anywhere before that assignment leaves `current` exactly as it was.
  let current = {
    frame: createEncounterWorld(snapshot.world),
    encounterRevision: 0,
    journal: [],
    accepted: new Map(),
  };

  const submit = (raw) => {
    const request = readRequest(raw);
    const canonical = canonicalJson(request);
    const state = current;
    const seen = state.accepted.get(request.commandId);
    if (seen !== undefined) {
      // A complete canonical replay is answered from the original receipt, whatever the current
      // revision or budget says, and it changes nothing at all.
      requireCondition(seen.canonical === canonical, 'Command id is bound to another request',
        'COMMAND_ID_CONFLICT');
      return cloneData(seen.receipt);
    }
    requireCondition(request.expectedEncounterRevision === state.encounterRevision,
      'Encounter revision does not match', 'REVISION_CONFLICT');
    requireCondition(state.accepted.size < MAX_ENCOUNTER_COMMANDS, 'Command budget exceeded',
      'LIMIT_EXCEEDED');
    requireCondition(state.encounterRevision < Number.MAX_SAFE_INTEGER, 'Encounter revision overflow',
      'LIMIT_EXCEEDED');
    const frame = state.frame;
    const encounter = frame.reservation.encounter;
    const outcome = request.type === BEGIN_TYPE ? attemptBegin(frame)
      : attemptCancel(frame, request.payload.encounterId);
    const nextRevision = state.encounterRevision + 1;
    // A domain refusal keeps the very same frame reference, so the published frame is byte-for-byte
    // the old one; a success carries the detached frame the kernel already validated.
    let nextFrame, encounterId, status, code;
    if (outcome.ok) {
      nextFrame = outcome.frame;
      encounterId = request.type === BEGIN_TYPE ? ENCOUNTER_ID : request.payload.encounterId;
      status = 'succeeded';
      code = null;
    } else {
      nextFrame = frame;
      encounterId = request.type === BEGIN_TYPE ? (encounter === null ? null : encounter.encounterId)
        : request.payload.encounterId;
      status = 'rejected';
      code = outcome.code;
    }
    const receipt = { commandId: request.commandId, encounterId, type: request.type, status, code,
      encounterRevision: nextRevision, sourceTick };
    // Every copy the successor needs is built before anything is published: the journal entry, the
    // index record and the receipt handed back. Then one assignment moves frame, sequence, journal
    // and index together — there is no observable half-committed state and no throw after it.
    const journalEntry = { command: cloneData(request), receipt: cloneData(receipt) };
    const accepted = new Map(state.accepted);
    accepted.set(request.commandId, { canonical, receipt: cloneData(receipt) });
    const returned = cloneData(receipt);
    current = {
      frame: nextFrame,
      encounterRevision: nextRevision,
      journal: state.journal.concat([journalEntry]),
      accepted,
    };
    return returned;
  };

  return Object.freeze({
    getSnapshot() {
      const state = current;
      return { version: ENCOUNTER_SESSION_VERSION, simulationId, sourceTick, sourceRevision,
        encounterRevision: state.encounterRevision, frame: cloneData(state.frame) };
    },
    getJournal() {
      return current.journal.map((entry) => ({ command: cloneData(entry.command),
        receipt: cloneData(entry.receipt) }));
    },
    submit,
  });
}

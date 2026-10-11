// D3-2 player-wolf encounter candidate adapter (contract d3-encounter-world-v1).
// A four-field candidate shell binds an already-validated memory world to a D3-1 reservation ledger
// so a forest encounter can hold one wolf back and hand it back atomically. It is a candidate DTO,
// not a registered Runtime profile and not a checkpoint format: it performs no authoritative commit,
// never writes its input, and proves nothing about a real encounter having happened.
import { fields, record, own, integer, identifier, cloneData, requireCondition } from './data-contract.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { validateMemoryWorld } from './memory-runtime.mjs';
import { createEncounterReservation, validateEncounterReservation, reserveEncounter,
  closeEncounterReservation } from './encounter-reservation.mjs';

export const ENCOUNTER_WORLD_VERSION = 'encounter-world-v1';

const FRAME_FIELDS = ['version', 'anchorDay', 'world', 'reservation'];

// The supported profile is a memory-config-v4 / player-state-v2 world whose real player identity is
// actor-4. A known-but-other Memory/Player generation is UNSUPPORTED_VERSION; a missing or malformed
// discriminator is INVALID_INPUT. Every read below is a plain data-property read, never an accessor.
function requireSupportedProfile(world) {
  record(world);
  const memory = own(world, 'memoryModel') ? world.memoryModel : null;
  const config = memory !== null && own(memory, 'config') ? memory.config : null;
  const memoryVersion = config !== null && own(config, 'version') ? config.version : null;
  const player = own(world, 'playerModel') ? world.playerModel : null;
  const playerVersion = player !== null && own(player, 'version') ? player.version : null;
  const playerId = player !== null && own(player, 'actorId') ? player.actorId : null;
  requireCondition(typeof memoryVersion === 'string', 'Missing memory configuration version');
  requireCondition(memoryVersion === 'memory-config-v4', 'Unsupported memory configuration version',
    'UNSUPPORTED_VERSION');
  requireCondition(typeof playerVersion === 'string', 'Missing player model version');
  requireCondition(playerVersion === 'player-state-v2', 'Unsupported player state version', 'UNSUPPORTED_VERSION');
  requireCondition(playerId === 'actor-4', 'Unknown player identity');
}

// Strict shell check. The live wolf pool mirrors the ledger: world wolves is exactly the pool that
// the reservation calls available. The remaining old-world invariants are proven on a detached probe
// copy that only adds the held wolf back, so the frame's own available meaning is never rewritten.
function validateFrame(frame) {
  inspectDescriptorTree(frame);
  fields(frame, FRAME_FIELDS);
  // Only a known-but-other Memory/Player generation is UNSUPPORTED_VERSION; a malformed or unknown
  // shell version is an invalid input, so this guard keeps the default INVALID_INPUT code.
  requireCondition(frame.version === ENCOUNTER_WORLD_VERSION, 'Unsupported encounter world version');
  integer(frame.anchorDay);
  const world = frame.world;
  requireSupportedProfile(world);
  const reservation = frame.reservation;
  validateEncounterReservation(reservation);
  requireCondition(reservation.battleDeaths === 0, 'Battle deaths are outside this contract');
  requireCondition(own(world, 'ecologyModel') && world.ecologyModel !== null &&
    typeof world.ecologyModel === 'object', 'Missing ecology model');
  requireCondition(own(world.ecologyModel, 'day') && own(world.ecologyModel, 'populations'),
    'Missing ecology state');
  requireCondition(world.ecologyModel.day === frame.anchorDay, 'World ecology day disagrees with the anchor day');
  // The wolf count is read by the probe and the mirror check below, so prove the population record and
  // its wolves field are plain data first: a null or primitive pool must fault as INVALID_INPUT, not
  // as a TypeError from an early property access.
  const populations = world.ecologyModel.populations;
  record(populations);
  requireCondition(own(populations, 'wolves'), 'Missing wolf population');
  integer(populations.wolves);
  const probe = cloneData(world);
  probe.ecologyModel.populations.wolves += reservation.reserved;
  validateMemoryWorld(probe);
  requireCondition(populations.wolves === reservation.available,
    'World wolves disagree with the reservation');
  return frame;
}

// Freeze the anchor day and open a fresh ledger over the current wolf pool. The world is fully
// validated first and then copied; the caller's world is never mutated.
export function createEncounterWorld(world) {
  inspectDescriptorTree(world);
  requireSupportedProfile(world);
  validateMemoryWorld(world);
  const copy = cloneData(world);
  const reservation = createEncounterReservation(copy.ecologyModel.populations.wolves);
  return { version: ENCOUNTER_WORLD_VERSION, anchorDay: copy.ecologyModel.day, world: copy, reservation };
}

export function validateEncounterWorld(frame) {
  return validateFrame(frame);
}

// Hold one wolf back for the real player. The first call needs the living actor-4 in the forest with
// at least one wolf; the identity is read from the world, never from the caller. A repeat with the
// same id returns an equal copy without deducting again; a foreign id or a closed slot reuses the
// kernel's own codes. Nothing is committed and the input frame is left untouched.
export function beginPlayerWolfEncounter(frame, encounterId) {
  inspectDescriptorTree(frame);
  inspectDescriptorTree(encounterId);
  validateFrame(frame);
  identifier(encounterId);
  const reservation = frame.reservation;
  if (reservation.encounter === null) {
    const player = frame.world.playerModel;
    const actor = frame.world.actorModel.actors.find((entry) => entry.actorId === player.actorId);
    requireCondition(actor !== undefined && actor.alive === true, 'The player is not alive', 'RULE_REJECTED');
    requireCondition(actor.location === 'forest', 'The player is not in the forest', 'RULE_REJECTED');
    requireCondition(frame.world.ecologyModel.populations.wolves >= 1, 'No wolf left to reserve', 'RULE_REJECTED');
  }
  const next = cloneData(frame);
  next.reservation = reserveEncounter(next.reservation, encounterId);
  if (next.reservation.reserved === reservation.reserved + 1) next.world.ecologyModel.populations.wolves -= 1;
  return next;
}

// Return the held wolf. This is a resource release only: the player is not required to be alive or in
// the forest, and there is no damage, reward, time advance or implicit revival. Only a real
// active-to-closed transition adds the wolf back, so a repeated cancel stays equal.
export function cancelPlayerWolfEncounter(frame, encounterId) {
  inspectDescriptorTree(frame);
  inspectDescriptorTree(encounterId);
  validateFrame(frame);
  identifier(encounterId);
  const before = frame.reservation;
  const next = cloneData(frame);
  next.reservation = closeEncounterReservation(next.reservation, encounterId, 'released');
  if (next.reservation.reserved === before.reserved - 1) next.world.ecologyModel.populations.wolves += 1;
  return next;
}

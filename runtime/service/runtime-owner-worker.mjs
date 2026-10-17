import { parentPort, workerData } from 'node:worker_threads';
import { createRuntimeOwner } from './runtime-owner.mjs';
import { cloneData, fault, requireCondition } from '../core/data-contract.mjs';

const MAX_PENDING_RPC = 16;
let owner;
let tail = Promise.resolve();
let pending = 0;
let shuttingDown = false;

function serializableError(error, currentRevision) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'RUNTIME_OWNER_FAILED',
    message: typeof error?.message === 'string' ? error.message : 'Runtime owner operation failed',
    ...(Number.isSafeInteger(error?.currentRevision) ? { currentRevision: error.currentRevision } :
      Number.isSafeInteger(currentRevision) ? { currentRevision } : {}),
  };
}

function committedCommands() {
  requireCondition(typeof owner.getCommittedCommands === 'function',
    'Runtime owner does not expose its committed command list', 'OWNER_COMMAND_LIST_UNAVAILABLE');
  return cloneData(owner.getCommittedCommands());
}

function projectionGroup() {
  return {
    snapshot: owner.getSnapshot(),
    player: owner.playerAvailable ? owner.getPlayer() : null,
    mindInspector: owner.mindAvailable ? owner.getMindInspector() : null,
    encounter: owner.encounterAvailable ? owner.getEncounter() : null,
    scene: owner.sceneAvailable ? owner.getScene() : null,
    map: owner.mapAvailable ? owner.getMap() : null,
    activity: owner.activityAvailable ? owner.getActivity() : null,
  };
}

function ownerFlags() {
  return {
    playerAvailable: owner.playerAvailable === true,
    playerActionsAvailable: owner.playerActionsAvailable === true,
    mindAvailable: owner.mindAvailable === true,
    encounterAvailable: owner.encounterAvailable === true,
    ...(owner.mapAvailable === true ? { mapAvailable: true } : {}),
    ...(owner.sceneAvailable === true ? { sceneAvailable: true } : {}),
    ...(owner.activityAvailable === true ? { activityAvailable: true } : {}),
    ...(owner.playerWorkAvailable === true ? { playerWorkAvailable: true } : {}),
    commandDtoVersion: owner.commandDtoVersion,
  };
}

function postError(id, error, currentRevision) {
  parentPort.postMessage({ kind: 'error', id, error: serializableError(error, currentRevision) });
}

async function initialize() {
  try {
    owner = await createRuntimeOwner(cloneData(workerData));
    const group = projectionGroup();
    const commands = committedCommands();
    parentPort.postMessage({ kind: 'ready', group, flags: ownerFlags(), commands });
  } catch (error) {
    let revision;
    try { revision = owner?.getSnapshot?.().revision; } catch { /* Startup can fail before a projection exists. */ }
    try { await owner?.close?.(); } catch { /* Keep the startup failure as the reported cause. */ }
    postError(0, error, revision);
    parentPort.close();
  }
}

function parseRequest(message) {
  const request = cloneData(message);
  requireCondition(request && typeof request === 'object' && Object.keys(request).every(k => ['id', 'method', 'payload'].includes(k)),
    'Unknown RPC request fields', 'INVALID_RPC_REQUEST');
  requireCondition(Number.isSafeInteger(request.id) && request.id > 0, 'Invalid RPC request ID', 'INVALID_RPC_REQUEST');
  requireCondition(request.method === 'submit' || request.method === 'close', 'Unknown RPC method', 'INVALID_RPC_METHOD');
  requireCondition(request.method === 'close' ? !Object.hasOwn(request, 'payload') : Object.hasOwn(request, 'payload'),
    'Invalid RPC request payload', 'INVALID_RPC_REQUEST');
  return request;
}

parentPort.on('message', raw => {
  if (!owner || shuttingDown) return;
  let request;
  try { request = parseRequest(raw); }
  catch (error) { postError(0, error, owner.getSnapshot().revision); return; }
  if (request.method !== 'close' && pending >= MAX_PENDING_RPC) { postError(request.id, fault('LIMIT_EXCEEDED', 'Runtime owner RPC queue exceeds budget'), owner.getSnapshot().revision); return; }
  pending++;
  const operation = tail.then(async () => {
    if (request.method === 'submit') {
      const dto = cloneData(request.payload);
      const receipt = await owner.submit(dto);
      const group = projectionGroup();
      const commands = committedCommands();
      parentPort.postMessage({ kind: 'result', id: request.id, group, commands, receipt: cloneData(receipt) });
      return;
    }
    await owner.close();
    shuttingDown = true;
    parentPort.postMessage({ kind: 'result', id: request.id });
    parentPort.close();
  });
  tail = operation.catch(error => {
    let revision;try { revision = owner.getSnapshot().revision; } catch { /* A failed close may already have released its session. */ }
    postError(request.id, error, revision);
  }).finally(() => { pending--; });
});

initialize();

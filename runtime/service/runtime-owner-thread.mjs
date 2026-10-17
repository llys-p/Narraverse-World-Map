import { Worker } from 'node:worker_threads';
import { cloneData, fault, requireCondition } from '../core/data-contract.mjs';

const MAX_PENDING_RPC = 16;
const UNAVAILABLE = Object.freeze({
  getPlayer: ['playerAvailable', 'PLAYER_UNAVAILABLE'],
  getMindInspector: ['mindAvailable', 'MIND_UNAVAILABLE'],
  getEncounter: ['encounterAvailable', 'ENCOUNTER_UNAVAILABLE'],
  getScene: ['sceneAvailable', 'SCENE_UNAVAILABLE'],
  getMap: ['mapAvailable', 'MAP_UNAVAILABLE'],
  getActivity: ['activityAvailable', 'ACTIVITY_UNAVAILABLE'],
});

function remoteFault(payload) {
  const error = fault(typeof payload?.code === 'string' ? payload.code : 'OWNER_WORKER_FAILED',
    typeof payload?.message === 'string' ? payload.message : 'Runtime owner worker failed');
  if (Number.isSafeInteger(payload?.currentRevision)) error.currentRevision = payload.currentRevision;
  return error;
}

export async function createThreadedRuntimeOwner(options) {
  const safeOptions = cloneData(options);
  const worker = new Worker(new URL('./runtime-owner-worker.mjs', import.meta.url), { workerData: safeOptions });
  const exited = new Promise(resolve => worker.once('exit', resolve));
  let ready = false;
  let closing = false;
  let closed = false;
  let failed = false;
  let nextId = 1;
  let cache = null;
  let metadata = null;
  const pending = new Map();
  let readyResolve;
  let readyReject;
  const startup = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });

  const failWorker = error => {
    if (closed || failed) return;
    failed = true;
    const failure = error instanceof Error ? error : fault('OWNER_WORKER_FAILED', 'Runtime owner worker failed');
    if (!ready) readyReject(failure);
    for (const entry of pending.values()) entry.reject(failure);
    pending.clear();
    // A broken channel must not leave an unobservable writer running.
    // Preserve its lock for explicit recovery; never delete it from this thread.
    void worker.terminate().catch(() => {});
  };

  worker.on('error', error => failWorker(Object.assign(fault('OWNER_WORKER_FAILED', error.message), { cause: error })));
  worker.on('exit', code => {
    if (!closed && !failed) failWorker(fault('OWNER_WORKER_FAILED', `Runtime owner worker exited unexpectedly (${code})`));
  });

  worker.on('message', message => {
    if (!message || typeof message !== 'object') return failWorker(fault('INVALID_WORKER_MESSAGE', 'Invalid runtime owner worker message'));
    if (message.kind === 'ready') {
      if (ready || cache !== null) return failWorker(fault('INVALID_WORKER_MESSAGE', 'Duplicate runtime owner readiness message'));
      try {
        const nextCache = validatePublication(message);
        const nextMetadata = normalizeMetadata(message.flags);
        cache = nextCache;
        metadata = nextMetadata;
        ready = true;
        readyResolve({});
      } catch (error) {
        readyReject(error);
        failWorker(error);
      }
      return;
    }
    if (message.kind !== 'result' && message.kind !== 'error') {
      return failWorker(fault('INVALID_WORKER_MESSAGE', 'Unknown runtime owner worker message'));
    }
    if (!ready && message.kind === 'error' && message.id === 0) {
      const error = remoteFault(message.error);
      readyReject(error);
      failWorker(error);
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.kind === 'error') {
      entry.reject(remoteFault(message.error));
      return;
    }
    if (entry.method === 'submit') {
      try {
        const nextCache = validatePublication(message);
        const receipt = cloneData(message.receipt);
        cache = nextCache;
        entry.resolve(receipt);
      } catch (error) {
        entry.reject(error);
        failWorker(error);
      }
    } else {
      closed = true;
      entry.resolve(undefined);
    }
  });

  try {
    await startup;
  } catch (error) {
    await worker.terminate().catch(() => {});
    throw error;
  }

  function request(method, payload) {
    if (failed) return Promise.reject(fault('OWNER_WORKER_FAILED', 'Runtime owner worker is unavailable'));
    if (closed) return Promise.reject(fault('OWNER_CLOSED', 'Runtime owner is closed'));
    if (closing && method !== 'close') return Promise.reject(fault('OWNER_CLOSED', 'Runtime owner is closing'));
    if (method !== 'close' && pending.size >= MAX_PENDING_RPC) return Promise.reject(fault('LIMIT_EXCEEDED', 'Runtime owner RPC queue exceeds budget'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      try { worker.postMessage({ method, id, ...(payload === undefined ? {} : { payload: cloneData(payload) }) }); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }

  function readProjection(name) {
    if (failed) throw fault('OWNER_WORKER_FAILED', 'Runtime owner worker is unavailable');
    if (closed) throw fault('OWNER_CLOSED', 'Runtime owner is closed');
    const unavailable = UNAVAILABLE[name];
    if (unavailable && !metadata[unavailable[0]]) throw fault(unavailable[1], `${name} is unavailable`);
    const value = cache[name.slice(3).replace(/^./, c => c.toLowerCase())];
    if (value === null || value === undefined) throw fault(unavailable?.[1] ?? 'PROJECTION_UNAVAILABLE', `${name} projection is unavailable`);
    return cloneData(value);
  }

  const owner = {
    ...metadata,
    getSnapshot() { return readProjection('getSnapshot'); },
    getPlayer() { return readProjection('getPlayer'); },
    getEncounter() { return readProjection('getEncounter'); },
    getScene() { return readProjection('getScene'); },
    getMap() { return readProjection('getMap'); },
    getActivity() { return readProjection('getActivity'); },
    getMindInspector() { return readProjection('getMindInspector'); },
    getCommittedCommand(commandId) {
      if (failed) throw fault('OWNER_WORKER_FAILED', 'Runtime owner worker is unavailable');
      if (closed) throw fault('OWNER_CLOSED', 'Runtime owner is closed');
      const item = cache.commands.get(commandId);
      return item === undefined ? null : cloneData(item);
    },
    submit(dto) {
      if (failed || closing || closed) return Promise.reject(fault(failed ? 'OWNER_WORKER_FAILED' : 'OWNER_CLOSED', 'Runtime owner is unavailable'));
      let safeDto;
      try { safeDto = cloneData(dto); } catch (error) { return Promise.reject(error); }
      return request('submit', safeDto);
    },
    close() {
      if (closePromise) return closePromise;
      if (failed) return Promise.reject(fault('OWNER_WORKER_FAILED', 'Runtime owner worker is unavailable'));
      if (closed) return Promise.resolve();
      closing = true;
      closePromise = request('close').then(() => exited);
      return closePromise;
    },
  };
  let closePromise;
  return Object.freeze(owner);
}

function normalizeMetadata(flags) {
  const source = cloneData(flags);
  const result = Object.fromEntries(['playerAvailable', 'playerActionsAvailable', 'mindAvailable', 'encounterAvailable']
    .map(name => [name, source[name] === true]));
  for (const name of ['mapAvailable', 'sceneAvailable', 'activityAvailable', 'playerWorkAvailable']) {
    if (source[name] === true) result[name] = true;
  }
  requireCondition(Number.isSafeInteger(source.commandDtoVersion), 'Worker omitted command DTO version', 'INVALID_WORKER_MESSAGE');
  result.commandDtoVersion = source.commandDtoVersion;
  return result;
}

function validatePublication(message) {
  const group = cloneData(message.group);
  requireCondition(group && typeof group === 'object' && group.snapshot, 'Worker omitted runtime projection group', 'INVALID_WORKER_MESSAGE');
  const commands = cloneData(message.commands);
  requireCondition(Array.isArray(commands) && commands.length <= 128, 'Worker omitted committed commands', 'INVALID_WORKER_MESSAGE');
  for (const projection of Object.values(group)) {
    if (projection !== null) requireCondition(projection.simulationId === group.snapshot.simulationId &&
      projection.revision === group.snapshot.revision && projection.tick === group.snapshot.tick,
      'Worker projection revisions differ', 'INVALID_WORKER_MESSAGE');
  }
  const byId = new Map();
  for (const command of commands) {
    requireCondition(typeof command?.dto?.commandId === 'string', 'Invalid committed command entry', 'INVALID_WORKER_MESSAGE');
    byId.set(command.dto.commandId, command);
  }
  return { ...group, commands: byId };
}

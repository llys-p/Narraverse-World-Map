import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import { validateBundle, cloneBundle } from '../core/world-state.mjs';
import { fields, fault, requireCondition } from '../core/data-contract.mjs';

export const MAX_CHECKPOINT_BYTES = 64 * 1024 * 1024;
let temporarySequence = 0;

function* jsonParts(value) {
  if (value === null || typeof value !== 'object') { yield JSON.stringify(value); return; }
  const array = Array.isArray(value), keys = array ? value.keys() : Object.keys(value).sort();
  yield array ? '[' : '{'; let first = true;
  for (const key of keys) {
    if (!first) yield ','; first = false;
    if (!array) { yield JSON.stringify(key); yield ':'; }
    yield* jsonParts(value[key]);
  }
  yield array ? ']' : '}';
}

function encodeCheckpoint(envelope) {
  let length = 0;
  for (const part of jsonParts(envelope)) {
    length += Buffer.byteLength(part, 'utf8');
    requireCondition(length <= MAX_CHECKPOINT_BYTES, 'Checkpoint exceeds file budget', 'LIMIT_EXCEEDED');
  }
  // Allocate only after preflight. Neither a giant string nor an over-budget Buffer is built.
  const bytes = Buffer.alloc(length); let offset = 0;
  for (const part of jsonParts(envelope)) offset += bytes.write(part, offset, undefined, 'utf8');
  return bytes;
}

export async function saveCheckpoint(bundle, options, io = defaultIo) {
  fields(options, ['directory', 'rulesVersion', 'systems']);
  requireCondition(typeof options.directory === 'string' && options.directory.length > 0, 'Explicit checkpoint directory required');
  validateBundle(bundle, { rulesVersion: options.rulesVersion, systems: options.systems });
  const envelope = { formatVersion: 1, ...cloneBundle(bundle) };
  const bytes = encodeCheckpoint(envelope);
  const directory = path.resolve(options.directory);
  const target = path.join(directory, `checkpoint-r${bundle.snapshot.revision}.json`);
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${++temporarySequence}.tmp`);
  let handle, created = false;
  try {
    await io.mkdir(directory, { recursive: true });
    handle = await io.open(temporary, 'wx'); created = true;
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
    // link creates a name only if it does not exist; no exists/rename overwrite race.
    // Both names refer to the complete, flushed inode until our temporary name is removed.
    await io.link(temporary, target);
    return target;
  } catch (cause) {
    throw Object.assign(fault('SAVE_FAILED', 'Checkpoint publication failed'), { cause });
  } finally {
    if (handle) { try { await handle.close(); } catch {} }
    if (created) { try { await io.unlink(temporary); } catch {} }
  }
}

export async function loadCheckpoint(file, options, io = defaultIo) {
  fields(options, ['rulesVersion', 'systems']);
  requireCondition(typeof file === 'string' && file.length > 0, 'Explicit checkpoint path required');
  requireCondition(!/\.tmp$/i.test(file), 'Temporary file is not a checkpoint', 'INVALID_CHECKPOINT');
  let handle;
  try {
    handle = await io.open(path.resolve(file), 'r');
    const stat = await handle.stat();
    requireCondition(stat.isFile(), 'Checkpoint is not a regular file', 'INVALID_CHECKPOINT');
    requireCondition(stat.size <= MAX_CHECKPOINT_BYTES, 'Checkpoint exceeds file budget', 'LIMIT_EXCEEDED');
    // Bounded read: a concurrent file growth cannot cause an unbounded readFile allocation.
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      requireCondition(bytesRead > 0, 'Checkpoint was truncated during read', 'INVALID_CHECKPOINT'); offset += bytesRead;
    }
    const extra = await handle.read(Buffer.alloc(1), 0, 1, offset);
    requireCondition(extra.bytesRead === 0, 'Checkpoint changed size during read', 'INVALID_CHECKPOINT');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const envelope = JSON.parse(decoded);
    fields(envelope, ['formatVersion', 'snapshot', 'eventLog']);
    requireCondition(envelope.formatVersion === 1, 'Unknown checkpoint format', 'UNSUPPORTED_VERSION');
    const bundle = { snapshot: envelope.snapshot, eventLog: envelope.eventLog };
    validateBundle(bundle, options);
    return cloneBundle(bundle);
  } catch (cause) {
    if (cause.code === 'UNSUPPORTED_VERSION' || cause.code === 'LIMIT_EXCEEDED') throw cause;
    throw Object.assign(fault('INVALID_CHECKPOINT', 'Checkpoint could not be decoded/validated'), { cause });
  } finally {
    if (handle) {
      try { await handle.close(); }
      catch (cause) { throw Object.assign(fault('INVALID_CHECKPOINT', 'Checkpoint handle could not be closed'), { cause }); }
    }
  }
}

import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import { validateBundle, cloneBundle } from '../core/world-state.mjs';
import { fields, fault, requireCondition } from '../core/data-contract.mjs';

import { MAX_STATE_FILE_BYTES,publishStateFile,readStateFile } from './bounded-json-file.mjs';
export const MAX_CHECKPOINT_BYTES=MAX_STATE_FILE_BYTES;

export async function saveCheckpoint(bundle, options, io = defaultIo) {
  fields(options, ['directory', 'rulesVersion', 'systems']);
  requireCondition(typeof options.directory === 'string' && options.directory.length > 0, 'Explicit checkpoint directory required');
  validateBundle(bundle, { rulesVersion: options.rulesVersion, systems: options.systems });
  const envelope = { formatVersion: 1, ...cloneBundle(bundle) };
  const target=path.join(path.resolve(options.directory), `checkpoint-r${bundle.snapshot.revision}.json`);
  return publishStateFile(envelope,target,io);
}

export async function loadCheckpoint(file, options, io = defaultIo) {
  fields(options, ['rulesVersion', 'systems']);
  requireCondition(typeof file === 'string' && file.length > 0, 'Explicit checkpoint path required');
  requireCondition(!/\.tmp$/i.test(file), 'Temporary file is not a checkpoint', 'INVALID_CHECKPOINT');
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(await readStateFile(file,io));
    const envelope = JSON.parse(decoded);
    fields(envelope, ['formatVersion', 'snapshot', 'eventLog']);
    requireCondition(envelope.formatVersion === 1, 'Unknown checkpoint format', 'UNSUPPORTED_VERSION');
    const bundle = { snapshot: envelope.snapshot, eventLog: envelope.eventLog };
    validateBundle(bundle, options);
    return cloneBundle(bundle);
  } catch (cause) {
    if (cause.code === 'UNSUPPORTED_VERSION' || cause.code === 'LIMIT_EXCEEDED') throw cause;
    throw Object.assign(fault('INVALID_CHECKPOINT', 'Checkpoint could not be decoded/validated'), { cause });
  }
}

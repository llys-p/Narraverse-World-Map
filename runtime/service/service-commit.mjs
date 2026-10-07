import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fields,denseArray,requireCondition,cloneData,fault } from '../core/data-contract.mjs';
import { createSimulationSession } from '../core/command-engine.mjs';
import { projectPublicSnapshot,runtimeProfile,validateTimeCommandDto } from './http-contract.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { MAX_STATE_FILE_BYTES,publishStateFile,readStateFile } from '../persistence/bounded-json-file.mjs';
export const MAX_SERVICE_COMMANDS=128,MAX_SERVICE_FILES=128,MAX_PENDING_REQUESTS=16;
export function timeReceipt(dto,toRevision){return {apiVersion:1,commandId:dto.commandId,status:'committed',fromRevision:dto.expectedRevision,toRevision,tick:toRevision};}
export function validateServiceCommit(envelope){
  fields(envelope,['serviceFormatVersion','anchor','commands','bundle']);
  requireCondition([1,2].includes(envelope.serviceFormatVersion),'Unknown service format','UNSUPPORTED_VERSION');
  const profile=runtimeProfile(envelope.anchor),finalProfile=runtimeProfile(envelope.bundle);
  requireCondition(envelope.serviceFormatVersion===profile.serviceFormatVersion && envelope.serviceFormatVersion===finalProfile.serviceFormatVersion,
    'Service format/profile mismatch','UNSUPPORTED_VERSION');
  denseArray(envelope.commands,MAX_SERVICE_COMMANDS);
  projectPublicSnapshot(envelope.anchor);projectPublicSnapshot(envelope.bundle);
  const session=createSimulationSession(envelope.anchor,profile.systems),seen=new Set();let revision=envelope.anchor.snapshot.revision;
  for(const entry of envelope.commands){
    fields(entry,['dto','receipt']);const dto=validateTimeCommandDto(entry.dto);fields(entry.receipt,['apiVersion','commandId','status','fromRevision','toRevision','tick']);
    requireCondition(!seen.has(dto.commandId) && dto.expectedRevision===revision,'Invalid service command sequence');seen.add(dto.commandId);
    session.advanceTicks(dto.payload.ticks);revision+=dto.payload.ticks;
    requireCondition(isDeepStrictEqual(entry.receipt,timeReceipt(dto,revision)),'Service receipt does not match replay');
  }
  requireCondition(isDeepStrictEqual(session.getBundle(),envelope.bundle),'Service world does not match command replay');
}
export async function saveServiceCommit(envelope,directory,io=defaultIo){
  validateServiceCommit(envelope);
  return publishStateFile(envelope,path.join(path.resolve(directory),`service-commit-r${envelope.bundle.snapshot.revision}.json`),io);
}
export async function loadServiceCommit(file,io=defaultIo){
  requireCondition(!/\.tmp$/i.test(file),'Temporary file is not a service commit','INVALID_SERVICE_COMMIT');
  try{const envelope=parseStrictJson(await readStateFile(file,io),MAX_STATE_FILE_BYTES);validateServiceCommit(envelope);return cloneData(envelope);}
  catch(cause){if(['LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(cause.code))throw cause;
    throw Object.assign(fault('INVALID_SERVICE_COMMIT','Service commit could not be audited'),{cause});}
}

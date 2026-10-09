import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fields,denseArray,requireCondition,cloneData,fault } from '../core/data-contract.mjs';
import { createSimulationSession } from '../core/command-engine.mjs';
import { projectPublicSnapshot,runtimeProfile,validateServiceCommandDto,mindBackend,requireMotivationBackend,requireCognitionBackend } from './http-contract.mjs';
import { executePlayerIntent } from '../core/player-intents.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { MAX_STATE_FILE_BYTES,publishStateFile,readStateFile } from '../persistence/bounded-json-file.mjs';
export const MAX_SERVICE_COMMANDS=128,MAX_SERVICE_FILES=128,MAX_PENDING_REQUESTS=16;
export function timeReceipt(dto,toRevision){return {apiVersion:1,commandId:dto.commandId,status:'committed',fromRevision:dto.expectedRevision,toRevision,tick:toRevision};}
// M2 contract §7 reserved namespaces; M3-4A adds the cognition set. Old profiles keep their
// existing namespace rules unchanged — format6 rejects all seven internal prefixes on both
// command DTO versions, formats 1–5 never expand theirs.
const RESERVED_INTERNAL_PREFIXES={4:['mind-day-','society-day-'],5:['mind-day-','society-day-','motivation-day-'],
  6:['mind-day-','mind-settle-','society-day-','motivation-day-','experience-day-','cognition-day-','cognition-eval-']};
// Submit and journal audit use this same complete transition; the service owns no world rules.
export function transitionServiceCommand(bundle,dto){
  dto=validateServiceCommandDto(dto);
  const profile=runtimeProfile(bundle),mindPlayer=profile.serviceFormatVersion===4,motivation=profile.serviceFormatVersion===5,cognition=profile.serviceFormatVersion===6;
  const reserved=RESERVED_INTERNAL_PREFIXES[profile.serviceFormatVersion];
  if(reserved)for(const prefix of reserved)if(dto.commandId.startsWith(prefix))throw fault('INVALID_INPUT','Reserved internal command ID');
  requireCondition(dto.version===1 || [3,4,5,6].includes(profile.serviceFormatVersion),'Profile does not support player actions','COMMAND_UNSUPPORTED');
  if(dto.version===1){const session=createSimulationSession(bundle,profile.systems);session.advanceTicks(dto.payload.ticks);
    const next=session.getBundle();return {bundle:next,receipt:timeReceipt(dto,next.snapshot.revision)};}
  const execute=mindPlayer?mindBackend().runtime.executeMindPlayerIntent:cognition?requireCognitionBackend().runtime.executeCognitionPlayerIntent:
    motivation?requireMotivationBackend().runtime.executeMotivationPlayerIntent:executePlayerIntent;
  const {bundle:next,outcome,result}=execute(bundle,{commandId:dto.commandId,type:dto.type,payload:dto.payload});
  return {bundle:next,receipt:{apiVersion:1,receiptVersion:2,commandId:dto.commandId,status:'committed',fromRevision:dto.expectedRevision,
    toRevision:next.snapshot.revision,tick:next.snapshot.tick,type:dto.type,outcome,result}};
}
export function validateServiceCommit(envelope){
  fields(envelope,['serviceFormatVersion','anchor','commands','bundle']);
  requireCondition([1,2,3,4,5,6].includes(envelope.serviceFormatVersion),'Unknown service format','UNSUPPORTED_VERSION');
  const profile=runtimeProfile(envelope.anchor),finalProfile=runtimeProfile(envelope.bundle);
  requireCondition(envelope.serviceFormatVersion===profile.serviceFormatVersion && envelope.serviceFormatVersion===finalProfile.serviceFormatVersion,
    'Service format/profile mismatch','UNSUPPORTED_VERSION');
  denseArray(envelope.commands,MAX_SERVICE_COMMANDS);
  projectPublicSnapshot(envelope.anchor);projectPublicSnapshot(envelope.bundle);
  const seen=new Set();let replay=envelope.anchor,revision=envelope.anchor.snapshot.revision;
  for(const entry of envelope.commands){
    fields(entry,['dto','receipt']);const dto=validateServiceCommandDto(entry.dto);
    fields(entry.receipt,dto.version===1?['apiVersion','commandId','status','fromRevision','toRevision','tick']:
      ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','tick','type','outcome','result']);
    requireCondition(!seen.has(dto.commandId) && dto.expectedRevision===revision,'Invalid service command sequence');seen.add(dto.commandId);
    const next=transitionServiceCommand(replay,dto);replay=next.bundle;revision=replay.snapshot.revision;
    requireCondition(isDeepStrictEqual(entry.receipt,next.receipt),'Service receipt does not match replay');
  }
  requireCondition(isDeepStrictEqual(replay,envelope.bundle),'Service world does not match command replay');
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

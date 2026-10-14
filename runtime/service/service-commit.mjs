import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fields,denseArray,requireCondition,cloneData,fault } from '../core/data-contract.mjs';
import { createSimulationSession } from '../core/command-engine.mjs';
import { projectPublicSnapshot,projectEncounterSnapshot,projectSceneSnapshot,runtimeProfile,validateServiceCommandDto,validateSceneCommandDto,mindBackend,requireMotivationBackend,requireCognitionBackend,requireSurvivalBackend } from './http-contract.mjs';
import { executePlayerIntent } from '../core/player-intents.mjs';
import { executeEncounterIntent } from '../core/encounter-runtime.mjs';
import { SCENE_RULES,executeAuditedSceneIntent } from '../core/scene-runtime.mjs';
import { createAuditedBundle } from '../core/world-state.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { MAX_STATE_FILE_BYTES,publishStateFile,readStateFile } from '../persistence/bounded-json-file.mjs';
export const MAX_SERVICE_COMMANDS=128,MAX_SERVICE_FILES=128,MAX_PENDING_REQUESTS=16;
export function timeReceipt(dto,toRevision){return {apiVersion:1,commandId:dto.commandId,status:'committed',fromRevision:dto.expectedRevision,toRevision,tick:toRevision};}
// M2 contract §7 reserved namespaces; M3-4A adds the cognition set. Old profiles keep their
// existing namespace rules unchanged — format6 rejects all seven internal prefixes on both
// command DTO versions, formats 1–5 never expand theirs.
const RESERVED_INTERNAL_PREFIXES={4:['mind-day-','society-day-'],5:['mind-day-','society-day-','motivation-day-'],
  6:['mind-day-','mind-settle-','society-day-','motivation-day-','experience-day-','cognition-day-','cognition-eval-'],
  // Format7 keeps every format6 prefix and adds the survival namespace; formats 1–6 never expand.
  7:['mind-day-','mind-settle-','society-day-','motivation-day-','experience-day-','cognition-day-','cognition-eval-',
    'survival-day-'],8:['mind-day-','mind-settle-','society-day-','motivation-day-','experience-day-','cognition-day-','cognition-eval-','survival-day-']};
function transitionSceneCommand(bundle,dto){
  dto=validateSceneCommandDto(dto);
  requireCondition(runtimeProfile(bundle).serviceFormatVersion===9,'Scene service profile mismatch','UNSUPPORTED_VERSION');
  return executeAuditedSceneIntent(bundle,dto);
}
// Submit and journal audit use this same complete transition; the service owns no world rules.
export function transitionAuditedServiceCommand(bundle,dto){
  // Select only the new rules using data descriptors; old DTO/profile validation order stays intact.
  const snapshot=bundle!==null && typeof bundle==='object'?Object.getOwnPropertyDescriptor(bundle,'snapshot')?.value:null;
  if(snapshot!==null && typeof snapshot==='object' && Object.getOwnPropertyDescriptor(snapshot,'rulesVersion')?.value===SCENE_RULES)
    return transitionSceneCommand(bundle,dto);
  dto=validateServiceCommandDto(dto);
  // The reserved-namespace guard is a pure input check: it must fire before any profile or
  // backend lookup, so an internal command id is refused even if a backend is unavailable.
  const format=runtimeProfile(bundle).serviceFormatVersion;
  if(format===8)requireCondition(dto.version===3,'Encounter profile requires command DTO version 3','UNSUPPORTED_VERSION');
  else requireCondition(dto.version!==3,'Profile does not support command DTO version 3','COMMAND_UNSUPPORTED');
  const reserved=RESERVED_INTERNAL_PREFIXES[format];
  if(reserved)for(const prefix of reserved)if(dto.commandId.startsWith(prefix))throw fault('INVALID_INPUT','Reserved internal command ID');
  const profile=runtimeProfile(bundle),mindPlayer=format===4,motivation=format===5,
    cognition=format===6,survival=format===7;
  requireCondition(dto.version===1 || (dto.version===2 && [3,4,5,6,7].includes(format)) || (dto.version===3 && format===8),
    'Profile does not support player actions','COMMAND_UNSUPPORTED');
  if(dto.version===1){const session=createSimulationSession(bundle,profile.systems);session.advanceTicks(dto.payload.ticks);
    const next=session.getBundle();return {bundle:next,receipt:timeReceipt(dto,next.snapshot.revision)};}
  if(dto.version===3)return executeEncounterIntent(bundle,dto);
  const execute=survival?requireSurvivalBackend().runtime.executeSurvivalPlayerIntent:
    mindPlayer?mindBackend().runtime.executeMindPlayerIntent:cognition?requireCognitionBackend().runtime.executeCognitionPlayerIntent:
    motivation?requireMotivationBackend().runtime.executeMotivationPlayerIntent:executePlayerIntent;
  const {bundle:next,outcome,result}=execute(bundle,{commandId:dto.commandId,type:dto.type,payload:dto.payload});
  return {bundle:next,receipt:{apiVersion:1,receiptVersion:2,commandId:dto.commandId,status:'committed',fromRevision:dto.expectedRevision,
    toRevision:next.snapshot.revision,tick:next.snapshot.tick,type:dto.type,outcome,result}};
}
// Preserve detached mutable results for library consumers; only the owner/replay use the frozen path.
export function transitionServiceCommand(bundle,dto){
  const result=transitionAuditedServiceCommand(bundle,dto);
  return result.bundle.snapshot.rulesVersion===SCENE_RULES?
    {bundle:cloneData(result.bundle),receipt:cloneData(result.receipt)}:result;
}
export function validateServiceCommit(envelope){
  fields(envelope,['serviceFormatVersion','anchor','commands','bundle']);
  requireCondition([1,2,3,4,5,6,7,8,9].includes(envelope.serviceFormatVersion),'Unknown service format','UNSUPPORTED_VERSION');
  const profile=runtimeProfile(envelope.anchor),finalProfile=runtimeProfile(envelope.bundle);
  requireCondition(envelope.serviceFormatVersion===profile.serviceFormatVersion && envelope.serviceFormatVersion===finalProfile.serviceFormatVersion,
    'Service format/profile mismatch','UNSUPPORTED_VERSION');
  denseArray(envelope.commands,MAX_SERVICE_COMMANDS);
  const anchor=envelope.serviceFormatVersion===9?createAuditedBundle(envelope.anchor,{rulesVersion:profile.rulesVersion,systems:profile.systems}):envelope.anchor;
  const final=envelope.serviceFormatVersion===9?createAuditedBundle(envelope.bundle,{rulesVersion:finalProfile.rulesVersion,systems:finalProfile.systems}):envelope.bundle;
  projectPublicSnapshot(anchor);projectPublicSnapshot(final);
  if([8,9].includes(envelope.serviceFormatVersion)){projectEncounterSnapshot(anchor);projectEncounterSnapshot(final);}
  if(envelope.serviceFormatVersion===9){projectSceneSnapshot(anchor);projectSceneSnapshot(final);}
  const seen=new Set();let replay=anchor,revision=anchor.snapshot.revision;
  for(const entry of envelope.commands){
    fields(entry,['dto','receipt']);const dto=envelope.serviceFormatVersion===9?validateSceneCommandDto(entry.dto):validateServiceCommandDto(entry.dto);
    fields(entry.receipt,dto.version===1?['apiVersion','commandId','status','fromRevision','toRevision','tick']:
      dto.version===3?['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick','durationTicks','type','outcome','result']:
      ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','tick','type','outcome','result']);
    requireCondition(!seen.has(dto.commandId) && dto.expectedRevision===revision,'Invalid service command sequence');seen.add(dto.commandId);
    const next=transitionAuditedServiceCommand(replay,dto);replay=next.bundle;revision=replay.snapshot.revision;
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

import {serviceCommandLimit} from '../core/campaign-limits.mjs';
import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { isDeepStrictEqual,types } from 'node:util';
import { fields,denseArray,requireCondition,cloneData,fault } from '../core/data-contract.mjs';
import { createSimulationSession } from '../core/command-engine.mjs';
import { projectPublicSnapshot,projectPlayerSnapshot,projectMapSnapshot,projectEncounterSnapshot,projectSceneSnapshot,runtimeProfile,validateServiceCommandDto,validateSceneCommandDto,mindBackend,requireMotivationBackend,requireCognitionBackend,requireSurvivalBackend } from './http-contract.mjs';
import {projectWorldActivity} from './world-activity.mjs';
import { executePlayerIntent } from '../core/player-intents.mjs';
import { executeEncounterIntent } from '../core/encounter-runtime.mjs';
import {LIVELIHOOD_RULES,executeAuditedLivelihoodIntent} from '../core/scene-livelihood-runtime.mjs';
import { SCENE_RULES,executeAuditedSceneIntent } from '../core/scene-runtime.mjs';
import { CAMPAIGN_RULES,campaignRuntimeHooks,executeAuditedCampaignIntent,computeCampaignIntent } from '../core/scene-campaign-runtime.mjs';
import { createAuditedBundle,deriveCampaignBundle,hasAuditedBundleProof,hasStrictReplayEvidence } from '../core/world-state.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { MAX_STATE_FILE_BYTES,publishStateFile,publishStateFileWithFingerprint,readStateFile } from '../persistence/bounded-json-file.mjs';
export const MAX_SERVICE_COMMANDS=128,MAX_SERVICE_FILES=128,MAX_PENDING_REQUESTS=16;
// Certificates never cross the JSON boundary. Only private immutable envelopes
// constructed here can reuse an already audited prefix.
const auditedServiceCommits=new WeakSet();
const activeCampaignWriters=new Set();
function freezeData(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freezeData(child);Object.freeze(value);}return value;}
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
  const format=runtimeProfile(bundle).serviceFormatVersion;
  if(format===11)return executeAuditedCampaignIntent(bundle,validateSceneCommandDto(dto,5));
  dto=validateSceneCommandDto(dto,format===10?4:3);
  requireCondition([9,10].includes(format),'Scene service profile mismatch','UNSUPPORTED_VERSION');
  return format===10?executeAuditedLivelihoodIntent(bundle,dto):executeAuditedSceneIntent(bundle,dto);
}
// Submit and journal audit use this same complete transition; the service owns no world rules.
export function transitionAuditedServiceCommand(bundle,dto){
  // Select only the new rules using data descriptors; old DTO/profile validation order stays intact.
  const snapshot=bundle!==null && typeof bundle==='object'?Object.getOwnPropertyDescriptor(bundle,'snapshot')?.value:null;
  if(snapshot!==null && typeof snapshot==='object' && [SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(Object.getOwnPropertyDescriptor(snapshot,'rulesVersion')?.value))
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
  return [SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(result.bundle.snapshot.rulesVersion)?
    {bundle:cloneData(result.bundle),receipt:cloneData(result.receipt)}:result;
}
export function validateServiceCommit(envelope){
  // Independent public audit never inherits an in-memory successor proof.
  auditServiceCommit(cloneData(envelope));
}
// The final bundle has already passed the independent, full history audit.
// Reuse that replay only for the entire uninterrupted genesis journal. A
// mismatch is not an error: the original per-command replay remains authoritative.
function containsProxy(root){
  const seen=new WeakSet();
  function visit(value){
    if(value===null||typeof value!=='object')return false;
    if(types.isProxy(value))return true;
    if(seen.has(value))return false;seen.add(value);
    const descriptors=Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).some(key=>Object.hasOwn(descriptors[key],'value')&&visit(descriptors[key].value));
  }
  return visit(root);
}
function canReuseGenesisReplay(anchor,final,commands,rawFinal){
  const s=final.snapshot;
  if(s.rulesVersion!==CAMPAIGN_RULES||!['6','7'].includes(s.fixtureVersion)||anchor.snapshot.tick!==0||commands.length===0)return false;
  // History uses canonical data; the original journal audit also compares raw
  // objects strictly. Guard normalization differences and reject descriptors
  // before any deep comparison can invoke a caller-controlled getter.
  if(containsProxy(commands)||containsProxy(rawFinal))return false;
  inspectDescriptorTree(commands);
  const safeCommands=cloneData(commands);
  if(!isDeepStrictEqual(commands,safeCommands)||!isDeepStrictEqual(rawFinal,final)||
    !isDeepStrictEqual(safeCommands,s.world.encounterModel.inputHistory))return false;
  let tick=anchor.snapshot.tick,revision=anchor.snapshot.revision;
  for(const {dto,receipt} of commands){
    if(receipt.fromTick!==tick||receipt.fromRevision!==revision||dto.expectedRevision!==revision)return false;
    tick=receipt.tick;revision=receipt.toRevision;
  }
  return tick===s.tick&&revision===s.revision&&isDeepStrictEqual(anchor,campaignRuntimeHooks.replayOrigin(s));
}
function auditServiceCommit(envelope){
  fields(envelope,['serviceFormatVersion','anchor','commands','bundle']);
  requireCondition([1,2,3,4,5,6,7,8,9,10,11].includes(envelope.serviceFormatVersion),'Unknown service format','UNSUPPORTED_VERSION');
  const profile=runtimeProfile(envelope.anchor),finalProfile=runtimeProfile(envelope.bundle);
  requireCondition(envelope.serviceFormatVersion===profile.serviceFormatVersion && envelope.serviceFormatVersion===finalProfile.serviceFormatVersion,
    'Service format/profile mismatch','UNSUPPORTED_VERSION');
  denseArray(envelope.commands,serviceCommandLimit(envelope.bundle));
  // A pre-certified caller object may have an inductive successor proof. Only
  // a fresh full audit in this invocation may justify reusing history replay.
  const freshFinal=envelope.serviceFormatVersion===11&&!hasAuditedBundleProof(envelope.bundle);
  const anchor=[9,10,11].includes(envelope.serviceFormatVersion)?createAuditedBundle(envelope.anchor,{rulesVersion:profile.rulesVersion,systems:profile.systems}):envelope.anchor;
  const final=[9,10,11].includes(envelope.serviceFormatVersion)?createAuditedBundle(envelope.bundle,{rulesVersion:finalProfile.rulesVersion,systems:finalProfile.systems}):envelope.bundle;
  projectPublicSnapshot(anchor);projectPublicSnapshot(final);
  if([8,9,10,11].includes(envelope.serviceFormatVersion)){projectEncounterSnapshot(anchor);projectEncounterSnapshot(final);}
  if([9,10,11].includes(envelope.serviceFormatVersion)){projectSceneSnapshot(anchor);projectSceneSnapshot(final);}
  const reuse=freshFinal&&hasStrictReplayEvidence(final)&&canReuseGenesisReplay(anchor,final,envelope.commands,envelope.bundle);
  const seen=new Set();let replay=anchor,revision=anchor.snapshot.revision;
  for(const entry of envelope.commands){
    fields(entry,['dto','receipt']);const dto=envelope.serviceFormatVersion===11?validateSceneCommandDto(entry.dto,5):[9,10].includes(envelope.serviceFormatVersion)?validateSceneCommandDto(entry.dto,envelope.serviceFormatVersion===10?4:3):validateServiceCommandDto(entry.dto);
    fields(entry.receipt,dto.version===1?['apiVersion','commandId','status','fromRevision','toRevision','tick']:
      [3,4,5].includes(dto.version)?['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick','durationTicks','type','outcome','result']:
      ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','tick','type','outcome','result']);
    requireCondition(!seen.has(dto.commandId) && dto.expectedRevision===revision,'Invalid service command sequence');seen.add(dto.commandId);
    // 冷恢复已独立完整审计末态；日记从已审计锚点逐笔运行规范规则并核对回执。
    // 中间候选仅在本次同步审计中存在，不授予证书；末态必须与独立审计数据完全相同。
    // 运行中单写者仍使用双重后继核验，旧fixture也保持原路径。
    if(reuse){revision=entry.receipt.toRevision;continue;}
    const next=serviceCommandLimit(anchor)===512?computeCampaignIntent(replay,dto):transitionAuditedServiceCommand(replay,dto);replay=next.bundle;revision=replay.snapshot.revision;
    requireCondition(isDeepStrictEqual(entry.receipt,next.receipt),'Service receipt does not match replay');
  }
  if(!reuse)requireCondition(isDeepStrictEqual(replay,envelope.bundle),'Service world does not match command replay');
  return {anchor,final};
}
export async function saveServiceCommit(envelope,directory,io=defaultIo){
  if(!auditedServiceCommits.has(envelope))validateServiceCommit(envelope);
  return publishStateFile(envelope,path.join(path.resolve(directory),`service-commit-r${envelope.bundle.snapshot.revision}.json`),io);
}
export function createAuditedServiceCommit(envelope){
  if(auditedServiceCommits.has(envelope))return envelope;
  const {anchor,final}=auditServiceCommit(envelope);
  requireCondition(envelope.serviceFormatVersion===11,'Live service certification requires campaign format','UNSUPPORTED_VERSION');
  const immutable=Object.freeze({serviceFormatVersion:11,anchor,
    commands:freezeData(cloneData(envelope.commands)),bundle:final});
  auditedServiceCommits.add(immutable);return immutable;
}
export function advanceAuditedServiceCommit(previous,raw){
  previous=createAuditedServiceCommit(previous);
  const dto=validateSceneCommandDto(raw,5);
  requireCondition(previous.commands.length<serviceCommandLimit(previous.bundle),'Command history exceeds budget','LIMIT_EXCEEDED');
  requireCondition(dto.expectedRevision===previous.bundle.snapshot.revision,'Service prefix revision mismatch','REVISION_CONFLICT');
  requireCondition(!previous.commands.some(entry=>entry.dto.commandId===dto.commandId),'Duplicate service command','COMMAND_ID_CONFLICT');
  // This is the SAME complete deterministic transition used by full replay. Its
  // returned bundle has passed the full world/history audit, not a shape check.
  const {bundle,receipt}=transitionAuditedServiceCommand(previous.bundle,dto);
  const entry=freezeData({dto:cloneData(dto),receipt:cloneData(receipt)});
  const next=Object.freeze({serviceFormatVersion:11,anchor:previous.anchor,
    commands:Object.freeze([...previous.commands,entry]),bundle});
  auditedServiceCommits.add(next);return next;
}

// Only this closure owns the current durable head. Core successor certificates
// prove mathematical transfers; they confer no service publication authority.
export async function createCampaignLiveWriter(initial,directory,lockToken,io=defaultIo,inspectActivity=false){
  requireCondition(auditedServiceCommits.has(initial)&&initial.serviceFormatVersion===11,
    'Live writer requires an audited service head','INVALID_SERVICE_COMMIT');
  requireCondition(typeof lockToken==='string'&&typeof inspectActivity==='boolean','Invalid live writer options');
  directory=await io.realpath(path.resolve(directory));
  const identity=process.platform==='win32'?directory.toLowerCase():directory;
  requireCondition(!activeCampaignWriters.has(identity),'Runtime already has a live writer','OWNER_BUSY');
  activeCampaignWriters.add(identity);
  try{
  const lock=path.join(directory,'.runtime-owner.lock');
  const owns=async()=>requireCondition(await io.readFile(lock,'utf8')===lockToken,'Runtime ownership changed','OWNER_BUSY');
  let headFingerprint=null;
  const checkHead=async current=>{
    await owns();
    const revisions=(await io.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).map(n=>Number(n.match(/r(\d+)/)[1]));
    requireCondition(revisions.length>0&&revisions.length<=serviceCommandLimit(current.bundle)+1&&Math.max(...revisions)===current.bundle.snapshot.revision,
      'Live head is not the current durable revision','INVALID_SERVICE_COMMIT');
    const bytes=await readStateFile(path.join(directory,`service-commit-r${current.bundle.snapshot.revision}.json`),io),fingerprint=createHash('sha256').update(bytes).digest('hex');
    // 每次仍完整读文件。指纹只来自本拥有者已核验/成功发布的字节，变化则完整解析比对。
    if(fingerprint!==headFingerprint){const persisted=parseStrictJson(bytes,MAX_STATE_FILE_BYTES);
      requireCondition(isDeepStrictEqual(persisted,current),'Live head does not match durable state','INVALID_SERVICE_COMMIT');headFingerprint=fingerprint;}
  };
  await checkHead(initial);
  let head=initial,tail=Promise.resolve(),closed=false,closePromise;
  return Object.freeze({submit(raw){
    // Detach synchronously, before queuing: callers cannot mutate queued DTOs.
    let dto;try{requireCondition(!closed,'Live writer is closed','OWNER_CLOSED');dto=validateSceneCommandDto(cloneData(raw),5);}catch(error){return Promise.reject(error);}
    const operation=tail.then(async()=>{
      const parent=head;
      requireCondition(dto.expectedRevision===parent.bundle.snapshot.revision,'Live head revision mismatch','REVISION_CONFLICT');
      requireCondition(parent.commands.length<serviceCommandLimit(parent.bundle),'Command history exceeds budget','LIMIT_EXCEEDED');
      requireCondition(!parent.commands.some(e=>e.dto.commandId===dto.commandId),'Duplicate service command','COMMAND_ID_CONFLICT');
      await checkHead(parent);
      const {bundle,receipt}=deriveCampaignBundle(parent.bundle,dto);
      const next=Object.freeze({serviceFormatVersion:11,anchor:parent.anchor,
        commands:Object.freeze([...parent.commands,freezeData({dto:cloneData(dto),receipt:cloneData(receipt)})]),bundle});
      const systems=runtimeProfile(bundle).systems;
      // Prepare every fallible consumer before the durable commit point.
      const prepared={state:next,receipt,session:createSimulationSession(bundle,systems),
        projection:projectPublicSnapshot(bundle),playerProjection:projectPlayerSnapshot(bundle),
        encounterProjection:projectEncounterSnapshot(bundle),sceneProjection:projectSceneSnapshot(bundle),
        mapProjection:projectMapSnapshot(bundle,serviceCommandLimit(bundle)-bundle.snapshot.world.encounterModel.inputHistory.length),
        activityProjection:inspectActivity?projectWorldActivity(bundle):null};
      requireCondition(head===parent,'Live head changed','REVISION_CONFLICT');await checkHead(parent);
      // Direct private publication, never a public skip-validation parameter.
      // A failed/uncertain publication leaves no advanceable service certificate.
      const publication=await publishStateFileWithFingerprint(next,path.join(directory,`service-commit-r${bundle.snapshot.revision}.json`),io);
      head=next;headFingerprint=publication.sha256;auditedServiceCommits.add(next);return prepared;
    });
    tail=operation.catch(()=>{});return operation;
  },close(){if(!closePromise){closed=true;closePromise=tail.then(()=>{activeCampaignWriters.delete(identity);});}return closePromise;}});
  }catch(error){activeCampaignWriters.delete(identity);throw error;}
}
export async function loadServiceCommit(file,io=defaultIo){
  return readServiceCommit(file,io,false);
}
// Owner-only loading path returns the immutable result of the SAME full audit.
// Public loadServiceCommit keeps returning detached mutable data.
export async function loadRuntimeServiceCommit(file,io=defaultIo){
  return readServiceCommit(file,io,true);
}
async function readServiceCommit(file,io,certify){
  requireCondition(!/\.tmp$/i.test(file),'Temporary file is not a service commit','INVALID_SERVICE_COMMIT');
  try{const envelope=parseStrictJson(await readStateFile(file,io),MAX_STATE_FILE_BYTES);
    if(certify&&envelope.serviceFormatVersion===11)return createAuditedServiceCommit(envelope);
    validateServiceCommit(envelope);return cloneData(envelope);}
  catch(cause){if(['LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(cause.code))throw cause;
    throw Object.assign(fault('INVALID_SERVICE_COMMIT','Service commit could not be audited'),{cause});}
}

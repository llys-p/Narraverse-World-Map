import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPersonalityNeutral } from '../fixtures/personality-village.mjs';
import { createPlayerVillage } from '../fixtures/player-village.mjs';
import { createPlayerPlayVillage } from '../fixtures/player-play-village.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { createSimulationSession } from '../core/command-engine.mjs';
import { saveCheckpoint,loadCheckpoint } from '../persistence/checkpoint-store.mjs';
import { record,requireCondition,integer,cloneData,fault,canonicalJson } from '../core/data-contract.mjs';
import { projectPublicSnapshot,projectPlayerSnapshot,runtimeProfile,validateServiceCommandDto } from './http-contract.mjs';
import { saveServiceCommit,loadServiceCommit,transitionServiceCommand,MAX_SERVICE_FILES,MAX_SERVICE_COMMANDS,MAX_PENDING_REQUESTS } from './service-commit.mjs';
const LOCK='.runtime-owner.lock';
async function ownsLock(file,token,io){
  let handle;
  try{handle=await io.open(file,'r');}catch(error){if(error.code==='ENOENT')return false;throw error;}
  try{
    const expected=Buffer.from(token),stat=await handle.stat();if(!stat.isFile() || stat.size!==expected.length)return false;
    const bytes=Buffer.alloc(expected.length+1);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(bytesRead===0)break;offset+=bytesRead;}
    return offset===expected.length && bytes.subarray(0,offset).equals(expected);
  }finally{await handle.close();}
}
async function inspectDirectory(directory,io){
  const states=[],temporaryKinds=new Set(),entries=await io.opendir(directory);let count=0,temporaries=0;
  for await(const entry of entries){
    if(entry.name===LOCK)continue;
    const temporary=/^\.(service-commit|checkpoint)-r(0|[1-9][0-9]*)\.json\.[1-9][0-9]*\.[1-9][0-9]*\.tmp$/.exec(entry.name);
    if(temporary){
      requireCondition(entry.isFile(),'Runtime temporary is not a regular file');
      temporaryKinds.add(temporary[1]);
      requireCondition(++temporaries<=MAX_SERVICE_FILES,'Runtime temporary file budget exceeded','LIMIT_EXCEEDED');continue;
    }
    requireCondition(++count<=MAX_SERVICE_FILES,'Runtime directory exceeds file budget','LIMIT_EXCEEDED');
    const match=/^(checkpoint|service-commit)-r(0|[1-9][0-9]*)\.json$/.exec(entry.name);
    requireCondition(match && entry.isFile(),'Runtime directory contains foreign files');
    const revision=Number(match[2]);integer(revision);states.push({kind:match[1],file:path.join(directory,entry.name),revision});
  }
  requireCondition(new Set(states.map(s=>s.kind)).size<=1,'Mixed runtime storage formats');
  requireCondition(temporaries===0 || (states.length>0 && temporaryKinds.size===1 && temporaryKinds.has(states[0].kind)),
    'Incomplete or mixed runtime initialization');
  return states.sort((a,b)=>b.revision-a.revision);
}
// IO injection is a library test boundary; HTTP/CLI cannot supply handlers or bypass validation.
export async function createRuntimeOwner(options,io=fs){
  record(options);requireCondition(Object.keys(options).every(k=>['directory','seed','checkpoint','profile','writable'].includes(k)),'Unknown owner option');
  requireCondition(typeof options.directory==='string' && options.directory.length>0,'Explicit runtime directory required');
  const writable=options.writable??false;requireCondition(typeof writable==='boolean','Invalid write mode');
  if(options.profile!==undefined)requireCondition(['personality-neutral','player-village','player-play-village'].includes(options.profile),'Unknown runtime profile','UNSUPPORTED_VERSION');
  requireCondition(options.profile===undefined || options.checkpoint===undefined,'Profile and checkpoint are mutually exclusive');
  if(options.seed!==undefined){integer(options.seed);requireCondition(options.seed<=0xffffffff,'Invalid runtime seed');}
  if(options.checkpoint!==undefined)requireCondition(typeof options.checkpoint==='string' && options.checkpoint.length>0 && options.seed===undefined,'Checkpoint cannot reset seed');
  const directory=path.resolve(options.directory);await io.mkdir(directory,{recursive:true});
  await inspectDirectory(directory,io);const lockPath=path.join(directory,LOCK),token=JSON.stringify({ownerId:randomUUID(),pid:process.pid});let handle;
  try{handle=await io.open(lockPath,'wx');}catch(cause){if(cause.code==='EEXIST')throw fault('OWNER_BUSY','Runtime directory already has an owner');throw cause;}
  let released=false;
  const release=async()=>{
    if(released)return;released=true;await handle.close();
    try{if(await ownsLock(lockPath,token,io))await io.unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  };
  try{
    await handle.writeFile(token,'utf8');await handle.sync();const states=await inspectDirectory(directory,io);let bundle,state;
    if(states.length){
      requireCondition(options.checkpoint===undefined,'Cannot replace existing runtime checkpoint');
      requireCondition(options.profile===undefined,'Cannot reset existing runtime profile');
      if(states[0].kind==='service-commit'){state=await loadServiceCommit(states[0].file,io);bundle=state.bundle;}
      else{
        requireCondition(!writable,'Use an explicit checkpoint to initialize a new writable directory','UNSUPPORTED_VERSION');
        bundle=await loadCheckpoint(states[0].file,{rulesVersion:PERSONALITY_RULES,systems:memorySystems()},io);
      }
      requireCondition(bundle.snapshot.revision===states[0].revision,'State filename/revision mismatch',state?'INVALID_SERVICE_COMMIT':'INVALID_CHECKPOINT');
      requireCondition(options.seed===undefined || options.seed===bundle.snapshot.rng.seed,'Cannot reset existing runtime seed');
    }else{
      const create=options.profile==='player-play-village'?createPlayerPlayVillage:options.profile==='player-village'?createPlayerVillage:createPersonalityNeutral;
      bundle=options.checkpoint===undefined?create(options.seed??42).bundle:
        await loadCheckpoint(options.checkpoint,{rulesVersion:PERSONALITY_RULES,systems:memorySystems()},io);
      const {serviceFormatVersion}=runtimeProfile(bundle);
      if(writable || serviceFormatVersion>=2)state={serviceFormatVersion,anchor:cloneData(bundle),commands:[],bundle};
    }
    const {systems,serviceFormatVersion}=runtimeProfile(bundle),playerAvailable=serviceFormatVersion>=2,playerActionsAvailable=serviceFormatVersion===3;
    let session=createSimulationSession(bundle,systems),projection=projectPublicSnapshot(bundle),playerProjection=playerAvailable?projectPlayerSnapshot(bundle):null;
    if(!states.length){
      if(state)await saveServiceCommit(state,directory,io);
      else await saveCheckpoint(bundle,{directory,rulesVersion:PERSONALITY_RULES,systems},io);
    }
    let tail=Promise.resolve(),pending=0,closing=false,closePromise;
    const submit=raw=>{
      try{
        requireCondition(!closing && session!==null,'Runtime owner is closed','OWNER_CLOSED');
        requireCondition(writable,'Runtime is read only','WRITE_DISABLED');const dto=validateServiceCommandDto(raw);
        requireCondition(dto.version===1 || playerActionsAvailable,'Profile does not support player actions','COMMAND_UNSUPPORTED');
        requireCondition(pending<MAX_PENDING_REQUESTS,'Command queue exceeds budget','LIMIT_EXCEEDED');pending++;
        const operation=tail.then(async()=>{
          const old=state.commands.find(c=>c.dto.commandId===dto.commandId);
          if(old){requireCondition(canonicalJson(old.dto)===canonicalJson(dto),'Command ID has different input','COMMAND_ID_CONFLICT');return cloneData(old.receipt);}
          if(dto.expectedRevision!==projection.revision)throw Object.assign(fault('REVISION_CONFLICT','World revision has changed'),{currentRevision:projection.revision});
          requireCondition(state.commands.length<MAX_SERVICE_COMMANDS,'Command history exceeds budget','LIMIT_EXCEEDED');
          requireCondition(await ownsLock(lockPath,token,io),'Runtime ownership changed','OWNER_BUSY');
          const inventory=await inspectDirectory(directory,io);
          requireCondition(inventory.length<MAX_SERVICE_FILES,'Runtime directory exceeds file budget','LIMIT_EXCEEDED');
          requireCondition(inventory.length>0 && inventory[0].kind==='service-commit' && inventory[0].revision===projection.revision,'Runtime state files changed','INVALID_SERVICE_COMMIT');
          const {bundle:nextBundle,receipt}=transitionServiceCommand(state.bundle,dto),candidate=createSimulationSession(nextBundle,systems),
            nextProjection=projectPublicSnapshot(nextBundle),nextPlayerProjection=playerAvailable?projectPlayerSnapshot(nextBundle):null;
          const next={serviceFormatVersion,anchor:state.anchor,commands:[...state.commands,{dto,receipt}],bundle:nextBundle};
          await saveServiceCommit(next,directory,io);
          // The complete service file is the commit point. No fallible work precedes publication of the audited DTO.
          state=next;session=candidate;projection=nextProjection;playerProjection=nextPlayerProjection;return cloneData(receipt);
        }).finally(()=>{pending--;});
        tail=operation.catch(()=>{});return operation;
      }catch(error){return Promise.reject(error);}
    };
    return Object.freeze({playerAvailable,playerActionsAvailable,getSnapshot(){requireCondition(session!==null,'Runtime owner is closed','OWNER_CLOSED');return cloneData(projection);},
      getPlayer(){requireCondition(session!==null,'Runtime owner is closed','OWNER_CLOSED');requireCondition(playerAvailable,'Current world has no player','PLAYER_UNAVAILABLE');return cloneData(playerProjection);},submit,
      close(){if(!closePromise){closing=true;closePromise=tail.then(async()=>{session=null;await release();});}return closePromise;}});
  }catch(cause){await release();throw cause;}
}

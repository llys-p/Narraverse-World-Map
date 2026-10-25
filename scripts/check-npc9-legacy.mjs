// Compare the five existing fixtures against the exact parent checkout, without migrating saves.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const parent='a63e4cbda0b9ed2ae6c108265c8fea4671546a39';
const candidate=fileURLToPath(new URL('../',import.meta.url)),baseline=path.resolve(process.argv[2]);
const destination=path.resolve(process.argv[3]);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:baseline,encoding:'utf8'}).trim(),parent);
assert.equal(execFileSync('git',['diff','--name-only','HEAD'],{cwd:baseline,encoding:'utf8'}).trim(),'');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function run(root){
 const fixtures=await import(pathToFileURL(path.join(root,'runtime/fixtures/campaign-village.mjs')));
 const {createAuditedBundle,deriveCampaignBundle,validateBundle}=await import(pathToFileURL(path.join(root,'runtime/core/world-state.mjs')));
 const {canonicalJson}=await import(pathToFileURL(path.join(root,'runtime/core/data-contract.mjs')));
 const options={rulesVersion:'d-campaign-v1',systems:fixtures.campaignSystems()},results=[];
 const factories=['createCampaignVillage','createNpcCampaignVillage','createSocialCampaignVillage','createNegotiationCampaignVillage','createMemoryCampaignVillage'];
 for(const [i,name] of factories.entries()){
  let b=createAuditedBundle(fixtures[name](42,'legacy-compat-'+(i+1)).bundle,options),serial=0;
  const checkpoints=[{phase:'initial',sha256:hash(canonicalJson(b))}];
  const act=(type,payload)=>{b=deriveCampaignBundle(b,{version:5,commandId:'compat-'+(++serial),expectedRevision:b.snapshot.revision,type,payload}).bundle;};
  const social=action=>act('PlayerInteract',{targetId:'actor-2',action});
  const agreement=action=>act('PlayerAgreement',{targetId:'actor-2',agreementId:b.snapshot.world.mapModel.negotiationModel.agreement.id,action});
  if(i<2)act('AdvanceTime',{ticks:8});
  if(i===2){social('smash');social('help');social('apologize');act('PlayerInteract',{targetId:'actor-2',action:'talk',topic:'past'});}
  if(i>=3){act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:40,loanTicks:36}});agreement('accept');social('help');social('help');agreement('claim');act('AdvanceTime',{ticks:38});social('return');}
  validateBundle(b,options);checkpoints.push({phase:'after-commands-and-full-replay',sha256:hash(canonicalJson(b))});
  results.push({fixtureVersion:String(i+1),commands:serial,tick:b.snapshot.tick,checkpoints});
 }
 return results;
}
const old=await run(baseline),current=await run(candidate);
const matches=JSON.stringify(old)===JSON.stringify(current);
const report={schemaVersion:1,parent,node:process.version,externalModelCalls:0,matches,baseline:old,candidate:current};
await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
assert.equal(matches,true,'Legacy fixtures changed relative to the parent');
console.log(JSON.stringify({status:'verified',fixtures:5,fullBundleCheckpoints:10,matches,externalModelCalls:0}));

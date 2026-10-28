// Compare representative old-fixture histories with an independently checked-out parent.
import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const current=fileURLToPath(new URL('../',import.meta.url)),parent=process.argv[2];assert.ok(parent,'Pass an independent PR41 checkout directory.');
const baseline=path.resolve(parent),parentSha='931ff94b7580c190bd9a0def4b36b0c7f26d8ee9';
assert.notEqual(current.replace(/\/$/,''),baseline);assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:baseline,encoding:'utf8'}).trim(),parentSha);assert.equal(execFileSync('git',['status','--porcelain'],{cwd:baseline,encoding:'utf8'}).trim(),'');
async function run(root){
 const read=relative=>import(pathToFileURL(path.join(root,relative)).href),f=await read('runtime/fixtures/campaign-village.mjs'),engine=await read('runtime/core/scene-campaign-runtime.mjs'),state=await read('runtime/core/world-state.mjs'),{canonicalJson}=await read('runtime/core/data-contract.mjs'),projection=await read('runtime/service/http-contract.mjs');
 const factories=['createCampaignVillage','createNpcCampaignVillage','createSocialCampaignVillage','createNegotiationCampaignVillage','createMemoryCampaignVillage','createPlayableCampaignVillage','createTrustCampaignVillage'],result=[];
 for(const [i,name]of factories.entries()){
  let b=f[name](42,'legacy-trust-'+(i+1)).bundle;const receipts=[];
  const act=(type,payload={})=>{const dto={version:5,commandId:'compat-'+receipts.length,expectedRevision:b.snapshot.revision,type,payload},r=engine.computeCampaignIntent(b,dto);b=r.bundle;receipts.push(r.receipt);assert.equal(r.receipt.outcome,'succeeded');return r.receipt;};
  if(i>=5)act('PlayerQuest',{questId:'livelihood',action:'accept'});
  act('PlayerWork');act('PlayerBuy',{product:'food',quantity:1});act('PlayerRest');
  if(i>=2){act('PlayerInteract',{targetId:'actor-2',action:'help'});act('PlayerGiftFood',{recipientId:'actor-2'});}
  if(i>=3){const a=act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:20,loanTicks:36}}).result.agreement;act('PlayerAgreement',{targetId:'actor-2',agreementId:a.id,action:'accept'});act('PlayerInteract',{targetId:'actor-2',action:'help'});act('PlayerAgreement',{targetId:'actor-2',agreementId:a.id,action:'claim'});act('PlayerInteract',{targetId:'actor-2',action:'return'});}
  if(i>=5)act('PlayerQuest',{questId:'livelihood',action:'claim'});
  state.validateBundle(b,{rulesVersion:'d-campaign-v1',systems:f.campaignSystems()});
  const views={};for(const name of ['projectPublicSnapshot','projectMapSnapshot','projectPlayerSnapshot','projectEncounterSnapshot','projectSceneSnapshot'])views[name]=projection[name](b,100);
  result.push({fixture:i+1,commands:receipts.length,data:canonicalJson({bundle:b,receipts,views})});
 }return result;
}
const old=await run(baseline),next=await run(current),rows=[];
for(let i=0;i<old.length;i++){assert.equal(next[i].data,old[i].data,'Fixture '+old[i].fixture+' changed');rows.push({fixture:old[i].fixture,commands:old[i].commands,bytes:Buffer.byteLength(old[i].data),sha256:createHash('sha256').update(old[i].data).digest('hex')});}
console.log(JSON.stringify({status:'identical',baseline:parentSha,fixtures:rows,scope:'representative histories, receipts and five projections; no real saves; fixtures1–7 retain their PR41 rules',externalModelCalls:0},null,2));

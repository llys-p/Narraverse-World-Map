// Usage: node scripts/check-npc4-legacy-replay.mjs /path/to/detached-NPC3-parent
// Both trees stay read-only. No service, model call or persisted world is created.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCampaignVillage,createNpcCampaignVillage,createSocialCampaignVillage,campaignSystems} from '../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../runtime/core/world-state.mjs';
import {canonicalJson} from '../runtime/core/data-contract.mjs';
import {createHash} from 'node:crypto';
assert.ok(process.argv[2],'Explicit detached baseline tree required');
const root=path.resolve(process.argv[2]);
const oldFixture=await import(pathToFileURL(path.join(root,'runtime/fixtures/campaign-village.mjs')));
const oldState=await import(pathToFileURL(path.join(root,'runtime/core/world-state.mjs')));
for(const [version,factory] of [['1',createCampaignVillage],['2',createNpcCampaignVillage],['3',createSocialCampaignVillage]]){
 const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()},id='npc4-legacy-'+version;
 let current=createAuditedBundle(factory(42,id).bundle,options),baseline=oldState.createAuditedBundle(oldFixture[factory.name](42,id).bundle,{rulesVersion:'d-campaign-v1',systems:oldFixture.campaignSystems()});
 const commands=[['AdvanceTime',{ticks:4}],['MarchSet',{x:5,y:8}],['MarchStep',{}],['PlayerRest',{}],
  ...(version==='3'?[['PlayerInteract',{targetId:'actor-2',action:'help'}],['PlayerInteract',{targetId:'actor-2',action:'help'}],['PlayerInteract',{targetId:'actor-2',action:'ask-help'}],['PlayerInteract',{targetId:'actor-2',action:'return'}]]:[])];
 assert.equal(canonicalJson(current),canonicalJson(baseline));
 for(const [i,[type,payload]] of commands.entries()){
  const dto={version:5,commandId:'legacy-'+version+'-'+i,expectedRevision:current.snapshot.revision,type,payload};
  const a=deriveCampaignBundle(current,dto),b=oldState.deriveCampaignBundle(baseline,dto);
  assert.equal(canonicalJson(a),canonicalJson(b),'fixture '+version+' command '+i);current=a.bundle;baseline=b.bundle;
 }
 console.log(JSON.stringify({fixtureVersion:version,commands:commands.length,tick:current.snapshot.tick,revision:current.snapshot.revision,
  canonicalBundleSha256:createHash('sha256').update(canonicalJson(current)).digest('hex'),identical:true}));
}

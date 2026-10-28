import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';

test('existing playable fixture can fully audit a real overdue negotiated loan and its return',()=>{
 const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
 let b=createAuditedBundle(createPlayableCampaignVillage(42,'legacy-overdue').bundle,options),serial=0;
 const act=(type,payload={})=>{const r=computeCampaignIntent(b,{version:5,commandId:'legacy-overdue-'+(++serial),expectedRevision:b.snapshot.revision,type,payload});assert.equal(r.receipt.outcome,'succeeded');b=r.bundle;return r.receipt;};
 act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:40,loanTicks:36}});
 const agreementId=b.snapshot.world.mapModel.negotiationModel.agreement.id;
 act('PlayerAgreement',{targetId:'actor-2',agreementId,action:'accept'});
 act('PlayerInteract',{targetId:'actor-2',action:'help'});act('PlayerInteract',{targetId:'actor-2',action:'help'});
 act('PlayerAgreement',{targetId:'actor-2',agreementId,action:'claim'});act('AdvanceTime',{ticks:38});
 act('PlayerInteract',{targetId:'actor-2',action:'return'});
 assert.equal(b.snapshot.world.mapModel.negotiationModel.agreement.status,'returned-late');validateBundle(b,options);
});

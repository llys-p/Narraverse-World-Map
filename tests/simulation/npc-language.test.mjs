import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {interpretSocialText,intentKey,MAX_SOCIAL_TEXT} from '../../demo-social-language.mjs';
import {createSocialTextComposer,confirmedSocialContext,socialIntentLabel} from '../../demo-social-composer.mjs';
import {evaluateLanguageCases} from '../../scripts/check-npc-language.mjs';
import {validSocialPayload} from '../../runtime-social-contract.mjs';
import {createSocialCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot} from '../../runtime/service/http-contract.mjs';

const cases=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-language-v1/cases.json',import.meta.url)));
const hunter='actor-2';
function fixture(){
 const {bundle}=createSocialCampaignVillage(42,'language-unit');
 const initial=createAuditedBundle(bundle,{rulesVersion:'d-campaign-v1',systems:campaignSystems()});
 const group=b=>({snapshot:{simulationId:b.snapshot.simulationId,revision:b.snapshot.revision,tick:b.snapshot.tick},
  map:projectMapSnapshot(b,128),player:projectPlayerSnapshot(b),encounter:projectEncounterSnapshot(b)});
 return {initial,group};
}

test('75 labeled public development examples cover supported and withheld intents without false ready results',()=>{
 const report=evaluateLanguageCases(cases);
 assert.equal(report.cases,75);assert.equal(report.correct,75,JSON.stringify(report.rows.filter(r=>!r.correct)));
 assert.equal(report.supported,36);assert.equal(report.correctAccepted,36);assert.equal(report.falseReady,0);
 const actions=new Set();
 for(const c of cases)for(const p of interpretSocialText(c.text,c.context==='none'?null:{confirmed:true,tool:c.context==='tool'}).candidates){
  assert.equal(validSocialPayload(p),true);assert.ok(socialIntentLabel(p));actions.add(p.action);
 }
 assert.equal(actions.size,9);
});

test('negation, quotation, attributed speech, unsupported clauses and invalid input never become a ready action',()=>{
 const actions=['我抢走工具包','我砸坏工具包','我帮你修工具','我把工具还给你','我偷偷拿走工具'];
 for(const s of actions)for(const text of [`他说${s}`,`“${s}”`,`如果${s}`,`昨天${s}`,`${s}，再杀死村长`,`${s}而且跳舞`]){
  const r=interpretSocialText(text,{confirmed:true,tool:true});assert.equal(r.status,'unsupported',text);assert.deepEqual(r.candidates,[]);
 }
 for(const text of [null,{},'抢'.repeat(MAX_SOCIAL_TEXT+1),'我\u0000抢工具','我\u202e抢工具','我\ud800抢工具'])assert.equal(interpretSocialText(text).status,'invalid');
 assert.equal(interpretSocialText('我抢工具\n我修工具').status,'clarify');
 assert.equal(interpretSocialText('我抢\n工具').status,'unsupported');
 assert.equal(interpretSocialText('我想把它还给你').status,'clarify');
 const question=interpretSocialText('你还记得我之前帮过你吗');
 assert.deepEqual(question.candidates,[{targetId:hunter,action:'talk',topic:'past'}]);
});

test('development report distinguishes always-abstaining and always-acting baselines; rejects duplicate labels',()=>{
 const abstain=evaluateLanguageCases(cases,()=>({status:'unsupported',candidates:[],ruleIds:[]}));
 assert.equal(abstain.accepted,0);assert.equal(abstain.correctAccepted,0);assert.ok(abstain.correct<75);
 const constant=evaluateLanguageCases(cases,()=>({status:'ready',candidates:[{targetId:hunter,action:'rob'}],ruleIds:[]}));
 assert.equal(constant.accepted,75);assert.ok(constant.falseReady>60);
 assert.throws(()=>evaluateLanguageCases([cases[0],cases[0]]),/duplicate/);
 assert.throws(()=>evaluateLanguageCases([{...cases[0],basis:''}]),/Invalid/);
});

test('drafts, clarification and selecting one intent are pure; selected payload cannot mutate later commands',()=>{
 const {initial,group}=fixture(),g=group(initial),before=JSON.stringify(g),c=createSocialTextComposer();
 c.edit('先帮你修工具，然后借我工具',g,hunter);
 assert.equal(c.view(g,true,hunter).canSubmit,false);assert.throws(()=>c.command(g,true,hunter));
 assert.deepEqual(c.view(g,true,hunter).choices.map(x=>x.key),['help','ask-help']);
 c.choose(0,g,hunter);assert.equal(c.view(g,true,hunter).canSubmit,true);
 const p=c.command(g,true,hunter);assert.equal(p.action,'help');p.action='rob';
 assert.equal(c.command(g,true,hunter).action,'help');assert.equal(JSON.stringify(g),before);
 assert.throws(()=>c.choose(-1,g,hunter));assert.throws(()=>c.choose(2,g,hunter));
 c.edit('我已经帮你修好了工具',g,hunter);assert.equal(c.view(g,true,hunter).status,'unsupported');assert.throws(()=>c.command(g,true,hunter));
});

test('stale revisions, other people/worlds, unavailable tools and the shared write gate block execution',()=>{
 const {initial,group}=fixture(),g=group(initial),c=createSocialTextComposer();c.edit('帮你修工具',g,hunter);
 assert.equal(c.view(g,false,hunter).canSubmit,false);assert.throws(()=>c.command(g,false,hunter));
 const moved=structuredClone(g);moved.snapshot.revision++;c.observe(moved,hunter);
 assert.equal(c.view(moved,true,hunter).status,'stale');assert.throws(()=>c.command(moved,true,hunter));
 c.edit('帮你修工具',moved,hunter);assert.equal(c.view(moved,true,hunter).canSubmit,true);
 for(const changed of [
  g=>{g.player.self.identity.alive=false;},g=>{g.encounter.encounter={status:'active'};},g=>{g.map.order={status:'marching'};},
  g=>{g.map.social.actions.find(a=>a.action==='help').available=false;},
 ]){const blocked=structuredClone(moved);changed(blocked);assert.equal(c.view(blocked,true,hunter).canSubmit,false);assert.throws(()=>c.command(blocked,true,hunter));}
 assert.throws(()=>c.command(moved,true,'actor-3'));c.observe(moved,'actor-3');assert.equal(c.view(moved,true,hunter).status,'empty');
 c.edit('帮你修工具',g,hunter);const other=structuredClone(g);other.snapshot.simulationId='different-world';c.observe(other,hunter);
 assert.equal(c.view(other,true,hunter).text,'');assert.throws(()=>c.command(other,true,hunter));
 c.edit('帮你修工具',g,hunter);const old=structuredClone(g);delete old.map.social;c.observe(old,hunter);assert.equal(c.view(old,true,hunter).status,'empty');
});

test('only the validated current client receipt establishes a short referent; advance, reset, rejection and unrelated actions clear it',()=>{
 const {initial,group}=fixture(),g=group(initial),c=createSocialTextComposer();
 const dto={version:5,commandId:'language-context-help',expectedRevision:initial.snapshot.revision,type:'PlayerInteract',payload:{targetId:hunter,action:'help'}};
 const {bundle,receipt}=deriveCampaignBundle(initial,dto),next=group(bundle);
 c.edit('帮你修一下它',g,hunter);assert.equal(c.view(g,true,hunter).status,'clarify');
 // This boundary is invoked only by createDemoClient after its world/receipt checks.
 c.confirmed(receipt,dto,next);c.edit('帮你修一下它',next,hunter);assert.equal(c.view(next,true,hunter).status,'ready');
 c.edit('为什么',next,hunter);assert.equal(c.command(next,true,hunter).topic,'relationship');
 const other=structuredClone(next);other.snapshot.simulationId='another-world';c.edit('帮你修一下它',other,hunter);
 assert.equal(c.view(other,true,hunter).status,'clarify','a same-revision different world cannot inherit the referent');
 c.confirmed(receipt,dto,next);
 const forged=structuredClone(receipt);forged.result.asset.after.condition=100;
 assert.equal(confirmedSocialContext(forged,dto,next),null);assert.equal(confirmedSocialContext(receipt,{...dto,commandId:'wrong'},next),null);
 assert.equal(confirmedSocialContext(receipt,dto,g),null);
 const advanced=structuredClone(next);advanced.snapshot.revision++;c.observe(advanced,hunter);c.edit('帮你修一下它',advanced,hunter);
 assert.equal(c.view(advanced,true,hunter).status,'clarify');
 c.confirmed(receipt,dto,next);c.reset();c.edit('帮你修一下它',next,hunter);assert.equal(c.view(next,true,hunter).status,'clarify');
 const talk={...dto,commandId:'language-context-talk',expectedRevision:bundle.snapshot.revision,payload:{targetId:hunter,action:'talk',topic:'past'}};
 const talked=deriveCampaignBundle(bundle,talk),talkGroup=group(talked.bundle);c.confirmed(talked.receipt,talk,talkGroup);c.edit('帮你修一下它',talkGroup,hunter);
 assert.equal(c.view(talkGroup,true,hunter).status,'clarify');
 const returned={...dto,commandId:'language-context-return',expectedRevision:talked.bundle.snapshot.revision,payload:{targetId:hunter,action:'return'}};
 const rejected=deriveCampaignBundle(talked.bundle,returned);assert.equal(rejected.receipt.outcome,'rejected');
 c.confirmed(rejected.receipt,returned,group(rejected.bundle));c.edit('为什么',group(rejected.bundle),hunter);assert.equal(c.view(group(rejected.bundle),true,hunter).status,'clarify');
 c.confirmed(receipt,dto,next);c.confirmed({}, {type:'AdvanceTime'},next);c.edit('为什么',next,hunter);assert.equal(c.view(next,true,hunter).status,'clarify');
});

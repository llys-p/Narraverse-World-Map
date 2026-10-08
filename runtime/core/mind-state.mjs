// M1 mind state: fixed config/state shapes, Bounded observations and derived Belief.
// Belief/InnerStance are rebuilt from bounded observations and the query tick; they are
// never stored as a driftable cache. No schemas or host services live here.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition } from './data-contract.mjs';

export const MIND_RULES='m-mind-v1';
export const MIND_CONFIG_VERSION='mind-config-v1';
export const MIND_STATE_VERSION='mind-state-v1';
export const MIND_KNOWLEDGE_VERSION='mind-knowledge-v1';
export const MIND_DECISION_VERSION='mind-decision-v1';
export const MIND_INSPECTOR_VERSION='mind-inspector-v1';
export const MAX_MIND_ACTORS=2;
export const MAX_MIND_STIMULI=64;
export const MAX_MIND_STIMULI_PER_TICK=8;
export const MAX_MIND_OBSERVATIONS=8;
export const MIND_EVIDENCE_TTL_TICKS=288;
export const MAX_MIND_CANDIDATES=3;
export const MAX_MIND_KNOWLEDGE_BYTES=8192;
export const MAX_MIND_INSPECTOR_BYTES=65536;
export const MAX_MIND_TICK=1440000;
export const MIND_ACTOR_IDS=Object.freeze(['actor-2','actor-3']);
export const MIND_CHANNELS=Object.freeze(['statement','market-check','daily-public','own-rejection']);
export const MIND_STANCES=Object.freeze(['uncertain-supply','expect-supply','expect-no-supply']);
export const MIND_CHOICES=Object.freeze(['UseMedicine','BuyMedicine','NoAction']);
export const MIND_REASON_CODES=Object.freeze(['USE_OWN_MEDICINE','BUY_KNOWN_SUPPLY','NO_GOAL','WAIT','SUPPLY_UNKNOWN',
  'SUPPLY_UNAVAILABLE','FUNDS_INSUFFICIENT','INVENTORY_FULL','NO_PRIVATE_MEDICINE','HEALTH_FULL','READY']);
const CHANNEL_CONFIDENCE={statement:600,'market-check':900,'daily-public':900,'own-rejection':0};
const codeOrder=(a,b)=>a<b?-1:a>b?1:0;
const obsOrder=(a,b)=>a.observedTick-b.observedTick||a.sourceEventSeq-b.sourceEventSeq;

export function observationExpiryTick(observedTick){
  integer(observedTick,1);
  requireCondition(observedTick<=Number.MAX_SAFE_INTEGER-MIND_EVIDENCE_TTL_TICKS,'Mind observation expiry overflow','LIMIT_EXCEEDED');
  return observedTick+MIND_EVIDENCE_TTL_TICKS;
}

export function validateMindStimulus(stimulus){
  const statement=stimulus.kind==='statement';
  fields(stimulus,['stimulusId','tick','kind',...(statement?['speakerId','available']:[]),'listenerId']);
  identifier(stimulus.stimulusId);
  requireCondition(/^[A-Za-z0-9_-]+$/.test(stimulus.stimulusId),'Invalid mind stimulus identifier');
  integer(stimulus.tick,1);requireCondition(stimulus.tick<=MAX_MIND_TICK,'Mind stimulus tick budget exceeded','LIMIT_EXCEEDED');
  requireCondition(['statement','market-check'].includes(stimulus.kind),'Unknown mind stimulus kind');
  requireCondition(MIND_ACTOR_IDS.includes(stimulus.listenerId),'Unknown mind stimulus listener');
  if(statement)requireCondition(stimulus.speakerId==='actor-1' && typeof stimulus.available==='boolean','Invalid mind statement stimulus');
  return stimulus;
}

export function validateMindConfig(config){
  record(config);
  requireCondition(config.version===MIND_CONFIG_VERSION,'Unknown mind configuration','UNSUPPORTED_VERSION');
  fields(config,['version','actorIds','stimuli']);
  denseArray(config.actorIds,MAX_MIND_ACTORS);
  requireCondition(config.actorIds.length===MAX_MIND_ACTORS && config.actorIds[0]===MIND_ACTOR_IDS[0] && config.actorIds[1]===MIND_ACTOR_IDS[1],
    'Mind roster must be the two fixed identities');
  denseArray(config.stimuli,MAX_MIND_STIMULI);
  const ids=new Set();let previous=null,perTick=0,prevTick=-1;
  for(const stimulus of config.stimuli){
    validateMindStimulus(stimulus);
    requireCondition(!ids.has(stimulus.stimulusId),'Duplicate mind stimulus identifier');ids.add(stimulus.stimulusId);
    requireCondition(previous===null || stimulus.tick>previous.tick || (stimulus.tick===previous.tick && codeOrder(previous.stimulusId,stimulus.stimulusId)<0),
      'Unordered mind stimulus arrangement');
    perTick=stimulus.tick===prevTick?perTick+1:1;prevTick=stimulus.tick;
    requireCondition(perTick<=MAX_MIND_STIMULI_PER_TICK,'Mind stimulus tick batch budget exceeded','LIMIT_EXCEEDED');
    previous=stimulus;
  }
  return config;
}

export function createMindModel(config=undefined){
  validateMindConfig(config);const copy=cloneData(config);
  return {version:MIND_STATE_VERSION,config:copy,configFingerprint:canonicalJson(copy),scriptCursor:0,cursor:0,
    actors:copy.actorIds.map(actorId=>({actorId,observations:[],lastDecision:null,lastOutcome:null}))};
}

export function validateObservation(observation){
  fields(observation,['sourceEventSeq','occurrenceTick','observedTick','channel','sourceActorId','available','confidencePermille','expiresTick']);
  integer(observation.sourceEventSeq,1);integer(observation.occurrenceTick,1);integer(observation.observedTick,1);
  requireCondition(MIND_CHANNELS.includes(observation.channel),'Unknown mind observation channel');
  requireCondition(observation.confidencePermille===CHANNEL_CONFIDENCE[observation.channel],'Invalid mind observation confidence');
  requireCondition(observation.channel==='statement'?observation.sourceActorId==='actor-1':observation.sourceActorId===null,'Invalid mind observation source identity');
  requireCondition(observation.channel==='own-rejection'?observation.available===null:typeof observation.available==='boolean','Invalid mind observation availability');
  requireCondition(observation.occurrenceTick<=observation.observedTick,'Mind observation time moved backward');
  requireCondition(observation.expiresTick===observationExpiryTick(observation.observedTick),'Invalid mind observation expiry');
  return observation;
}

export function validateDecision(decision){
  fields(decision,['version','decisionId','actorId','tick','goalId','choice','reasonCode','candidates','evidenceRefs','knowledgeFingerprint']);
  requireCondition(decision.version===MIND_DECISION_VERSION,'Unknown mind decision version','UNSUPPORTED_VERSION');
  identifier(decision.decisionId);requireCondition(decision.actorId==='actor-2'||decision.actorId==='actor-3','Foreign mind decision identity');
  integer(decision.tick,144);requireCondition(decision.tick%144===0,'Mind decision must sit on a daily tick');
  if(decision.goalId!==null)integer(decision.goalId,1);
  requireCondition(MIND_CHOICES.includes(decision.choice),'Unknown mind choice');
  requireCondition(MIND_REASON_CODES.includes(decision.reasonCode),'Unknown mind decision reason');
  denseArray(decision.candidates,MAX_MIND_CANDIDATES);
  requireCondition(decision.candidates.length===MAX_MIND_CANDIDATES,'Missing mind candidates');
  requireCondition(decision.candidates.every((c,i)=>c.action===MIND_CHOICES[i]),'Out-of-order mind candidates');
  for(const candidate of decision.candidates){
    fields(candidate,['action','eligible','reasonCode']);
    requireCondition(MIND_CHOICES.includes(candidate.action) && typeof candidate.eligible==='boolean' &&
      MIND_REASON_CODES.includes(candidate.reasonCode),'Invalid mind candidate');
  }
  denseArray(decision.evidenceRefs,MAX_MIND_OBSERVATIONS*2);let previous=0;
  for(const sequence of decision.evidenceRefs){integer(sequence,1);requireCondition(sequence>previous,'Dirty/duplicate mind evidence');previous=sequence;}
  requireCondition(typeof decision.knowledgeFingerprint==='string' &&
    new TextEncoder().encode(decision.knowledgeFingerprint).length<=MAX_MIND_KNOWLEDGE_BYTES,'Mind decision fingerprint budget exceeded','LIMIT_EXCEEDED');
  return decision;
}

export function validateOutcome(outcome){
  fields(outcome,['decisionId','actorId','commandId','status','code','delta','price']);
  identifier(outcome.decisionId);requireCondition(outcome.actorId==='actor-2'||outcome.actorId==='actor-3','Foreign mind outcome identity');
  if(outcome.commandId!==null)identifier(outcome.commandId);
  requireCondition(['succeeded','rejected','no-action'].includes(outcome.status),'Unknown mind outcome status');
  requireCondition(outcome.code===null||outcome.code==='RULE_REJECTED','Invalid mind outcome code');
  requireCondition((outcome.status==='rejected')===(outcome.code==='RULE_REJECTED'),'Mind rejection status/code mismatch');
  fields(outcome.delta,['wallet','herbs','health']);
  for(const value of Object.values(outcome.delta))requireCondition(Number.isSafeInteger(value),'Invalid mind outcome delta');
  if(outcome.price!==null)integer(outcome.price,1);
  if(outcome.status!=='succeeded')requireCondition(outcome.delta.wallet===0 && outcome.delta.herbs===0 && outcome.delta.health===0 &&
    outcome.price===null,'Failed/no-action mind outcome carries deltas');
  return outcome;
}

export function validateMindStimulusPayload(payload){
  fields(payload,['stimulusId','kind','speakerId','listenerId','status','available']);
  identifier(payload.stimulusId);
  requireCondition(['statement','market-check'].includes(payload.kind),'Unknown mind stimulus result kind');
  requireCondition(payload.speakerId===null||payload.speakerId==='actor-1','Foreign mind stimulus speaker');
  requireCondition(MIND_ACTOR_IDS.includes(payload.listenerId),'Foreign mind stimulus listener');
  requireCondition(['delivered','unavailable'].includes(payload.status),'Unknown mind stimulus status');
  requireCondition(payload.status==='unavailable'?payload.available===null:typeof payload.available==='boolean','Invalid mind stimulus availability');
  requireCondition(payload.kind==='statement'?payload.speakerId==='actor-1':payload.speakerId===null,'Mind stimulus speaker/kind mismatch');
  return payload;
}

export function validateMindModel(model,sealed=true){
  record(model);
  requireCondition(typeof sealed==='boolean','Invalid mind seal mode');
  requireCondition(model.version===MIND_STATE_VERSION,'Unknown mind state version','UNSUPPORTED_VERSION');
  fields(model,['version','config','configFingerprint','scriptCursor','cursor','actors']);
  validateMindConfig(model.config);
  requireCondition(model.configFingerprint===canonicalJson(model.config),'Mind configuration fingerprint mismatch');
  integer(model.scriptCursor);requireCondition(model.scriptCursor<=model.config.stimuli.length,'Mind stimulus cursor exceeds configuration');
  integer(model.cursor);
  denseArray(model.actors,MAX_MIND_ACTORS);
  requireCondition(model.actors.length===MAX_MIND_ACTORS && model.actors.every((a,i)=>a.actorId===model.config.actorIds[i]),'Mind roster mismatch');
  for(const actor of model.actors){
    fields(actor,['actorId','observations','lastDecision','lastOutcome']);
    denseArray(actor.observations,MAX_MIND_OBSERVATIONS);
    const seen=new Set();let previous=null;
    for(const observation of actor.observations){
      validateObservation(observation);
      requireCondition(!seen.has(observation.sourceEventSeq),'Duplicate mind observation');seen.add(observation.sourceEventSeq);
      requireCondition(observation.sourceEventSeq<=model.cursor,'Mind observation cites a future event');
      requireCondition(previous===null || obsOrder(previous,observation)<0,'Unordered mind observations');previous=observation;
    }
    if(actor.lastDecision!==null)validateDecision(actor.lastDecision);
    if(actor.lastOutcome!==null)validateOutcome(actor.lastOutcome);
    // Committed boundaries require the decision/outcome pair to be complete and linked;
    // in-tick candidates between planning and resolution may carry a fresh decision only.
    requireCondition(sealed || actor.lastOutcome===null || actor.lastDecision!==null,'Orphaned mind outcome');
    if(sealed){
      requireCondition((actor.lastDecision===null)===(actor.lastOutcome===null),'Mind decision/outcome pairing mismatch');
      if(actor.lastDecision!==null)requireCondition(actor.lastDecision.actorId===actor.actorId &&
        actor.lastOutcome.actorId===actor.actorId && actor.lastOutcome.decisionId===actor.lastDecision.decisionId,'Mind sealed history identity mismatch');
      if(actor.lastDecision!==null)requireCondition((actor.lastDecision.choice==='NoAction')===(actor.lastOutcome.status==='no-action'),
        'Mind decision/outcome action mismatch');
    }
  }
  return model;
}

// Pure rebuild of the current supply belief from bounded observations at a query tick.
// Expired observations drop out of consideration; an own-rejection with the newest
// (observedTick, sourceEventSeq) position resets the belief to unknown until the next
// visible evidence arrives. No new events or ticks are triggered by derivation.
export function deriveMindBelief(observations,tick){
  denseArray(observations,MAX_MIND_OBSERVATIONS);for(const observation of observations)validateObservation(observation);integer(tick);
  const empty={topic:'public-herbs-available',value:'unknown',confidencePermille:0,evidenceRefs:[],contradictionRefs:[],lastUpdatedTick:null};
  const active=observations.filter(o=>tick<o.expiresTick);
  if(active.length===0)return empty;
  const newest=active[active.length-1];
  if(newest.channel==='own-rejection')return {topic:'public-herbs-available',value:'unknown',confidencePermille:0,
    evidenceRefs:[],contradictionRefs:[],lastUpdatedTick:newest.observedTick};
  const booleans=active.filter(o=>o.channel!=='own-rejection'),winner=booleans[booleans.length-1];
  const contradictionRefs=booleans.filter(o=>o.available!==winner.available).map(o=>o.sourceEventSeq).sort((a,b)=>a-b);
  return {topic:'public-herbs-available',value:winner.available?'available':'unavailable',confidencePermille:winner.confidencePermille,
    evidenceRefs:[winner.sourceEventSeq],contradictionRefs,lastUpdatedTick:winner.observedTick};
}

// innerStance is only a projection of the three-valued Belief; it is not an emotion.
export function innerStanceFor(belief){
  fields(belief,['topic','value','confidencePermille','evidenceRefs','contradictionRefs','lastUpdatedTick']);
  requireCondition(belief.topic==='public-herbs-available' && ['available','unavailable','unknown'].includes(belief.value),'Invalid supply belief');
  integer(belief.confidencePermille);
  return belief.value==='available'?'expect-supply':belief.value==='unavailable'?'expect-no-supply':'uncertain-supply';
}
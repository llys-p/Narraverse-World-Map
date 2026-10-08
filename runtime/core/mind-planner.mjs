// M1 narrow mind planner: a pure three-way recover-health choice over the §8 Knowledge DTO.
// It never reads the world, bundle, inventory queries or a model; it never mutates its input.
import { fields,record,integer,identifier,denseArray,canonicalJson,requireCondition,fault } from './data-contract.mjs';
import { MIND_KNOWLEDGE_VERSION,MIND_DECISION_VERSION,MAX_MIND_KNOWLEDGE_BYTES,
  MIND_ACTOR_IDS,MIND_CHOICES,MIND_STANCES,validateObservation,validateDecision } from './mind-state.mjs';

const SELF_FIELDS=['name','occupation','location','alive','health','hunger','fatigue','wallet','inventory','currentGoal','nextGoalId','cooldownUntilDay'];

function validateGoal(goal){
  if(goal===null)return null;
  fields(goal,['goalId','kind','step','startDay','deadlineDay','failures','target']);
  integer(goal.goalId,1);requireCondition(goal.kind==='recover-health','Mind planner only handles the narrow recover-health goal');
  requireCondition(['use','buy','wait'].includes(goal.step),'Unknown mind goal step');
  for(const key of ['startDay','deadlineDay','failures','target'])integer(goal[key]);
  requireCondition(goal.startDay>=1 && goal.deadlineDay===goal.startDay+20 && goal.target===800,'Mind goal deadline/target mismatch');
  return goal;
}

export function planMindDecision(knowledge){
  // Budget first: badly oversized DTOs fail as LIMIT_EXCEEDED before field semantics.
  const bytes=new TextEncoder().encode(canonicalJson(knowledge)).length;
  requireCondition(bytes<=MAX_MIND_KNOWLEDGE_BYTES,'Mind knowledge exceeds budget','LIMIT_EXCEEDED');
  fields(knowledge,['knowledgeVersion','phase','simulationId','actorId','tick','revision','self','quote','observations','belief','innerStance','committedIntent']);
  requireCondition(knowledge.knowledgeVersion===MIND_KNOWLEDGE_VERSION,'Unknown mind knowledge version','UNSUPPORTED_VERSION');
  requireCondition(knowledge.phase==='decision','Mind planner only accepts decision-phase knowledge');
  identifier(knowledge.simulationId);requireCondition(MIND_ACTOR_IDS.includes(knowledge.actorId),'Mind planner actor unavailable','MIND_ACTOR_UNAVAILABLE');
  integer(knowledge.tick,1);requireCondition(knowledge.tick%144===0,'Mind planner requires a daily decision tick');
  integer(knowledge.revision);requireCondition(knowledge.revision===knowledge.tick-1,'Mind planner revision must precede the decision tick');
  fields(knowledge.self,SELF_FIELDS);
  const self=knowledge.self;
  identifier(self.name);
  for(const key of ['occupation','location'])identifier(self[key]);
  requireCondition(typeof self.alive==='boolean','Invalid knowledge life state');
  for(const key of ['health','hunger','fatigue'])requireCondition(Number.isSafeInteger(self[key])&&self[key]>=0&&self[key]<=1000,'Knowledge need state outside budget');
  integer(self.wallet);fields(self.inventory,['food','herbs']);integer(self.inventory.food);integer(self.inventory.herbs);
  requireCondition(self.inventory.food<=1000&&self.inventory.herbs<=1000,'Knowledge inventory outside budget');
  validateGoal(self.currentGoal);integer(self.nextGoalId,1);integer(self.cooldownUntilDay);
  fields(knowledge.quote,['product','price','observedTick','sourceEventSeq']);
  requireCondition(knowledge.quote.product==='herbs','Unknown knowledge quote product');
  integer(knowledge.quote.price,1);integer(knowledge.quote.observedTick);
  if(knowledge.quote.sourceEventSeq!==null)integer(knowledge.quote.sourceEventSeq,1);
  denseArray(knowledge.observations,8);for(const observation of knowledge.observations)validateObservation(observation);
  fields(knowledge.belief,['topic','value','confidencePermille','evidenceRefs','contradictionRefs','lastUpdatedTick']);
  requireCondition(knowledge.belief.topic==='public-herbs-available' && ['available','unavailable','unknown'].includes(knowledge.belief.value),'Invalid knowledge belief');
  integer(knowledge.belief.confidencePermille);denseArray(knowledge.belief.evidenceRefs,16);denseArray(knowledge.belief.contradictionRefs,16);
  knowledge.belief.evidenceRefs.forEach(s=>integer(s,1));knowledge.belief.contradictionRefs.forEach(s=>integer(s,1));
  if(knowledge.belief.lastUpdatedTick!==null)integer(knowledge.belief.lastUpdatedTick);
  requireCondition(MIND_STANCES.includes(knowledge.innerStance),'Unknown knowledge stance');
  if(knowledge.committedIntent!==null){
    fields(knowledge.committedIntent,['goalId','kind']);integer(knowledge.committedIntent.goalId,1);
    requireCondition(knowledge.committedIntent.kind==='recover-health','Unknown committed intent kind');
  }
  if(!self.alive)throw fault('RULE_REJECTED','Mind planner does not decide for the dead');

  const day=knowledge.tick/144;
  let goal=self.currentGoal===null?null:{...self.currentGoal};
  let nextGoalId=self.nextGoalId;
  if(goal===null && self.health<=700 && day>=self.cooldownUntilDay){
    requireCondition(nextGoalId<Number.MAX_SAFE_INTEGER,'Mind goal counter overflow','LIMIT_EXCEEDED');
    goal={goalId:nextGoalId++,kind:'recover-health',step:'wait',startDay:day,deadlineDay:day+20,failures:0,target:800};
  }
  const has=goal!==null;
  const use=!has?{action:'UseMedicine',eligible:false,reasonCode:'NO_GOAL'}:
    self.inventory.herbs===0?{action:'UseMedicine',eligible:false,reasonCode:'NO_PRIVATE_MEDICINE'}:
    self.health>=1000?{action:'UseMedicine',eligible:false,reasonCode:'HEALTH_FULL'}:
    {action:'UseMedicine',eligible:true,reasonCode:'READY'};
  const buy=!has?{action:'BuyMedicine',eligible:false,reasonCode:'NO_GOAL'}:
    knowledge.belief.value!=='available'?{action:'BuyMedicine',eligible:false,
      reasonCode:knowledge.belief.value==='unknown'?'SUPPLY_UNKNOWN':'SUPPLY_UNAVAILABLE'}:
    knowledge.belief.confidencePermille<600?{action:'BuyMedicine',eligible:false,reasonCode:'SUPPLY_UNKNOWN'}:
    self.wallet<knowledge.quote.price?{action:'BuyMedicine',eligible:false,reasonCode:'FUNDS_INSUFFICIENT'}:
    self.inventory.herbs>=1000?{action:'BuyMedicine',eligible:false,reasonCode:'INVENTORY_FULL'}:
    {action:'BuyMedicine',eligible:true,reasonCode:'READY'};
  const wait={action:'NoAction',eligible:true,reasonCode:'WAIT'};
  const candidates=[use,buy,wait];
  const choice=candidates.find(c=>c.eligible).action;
  if(goal)goal.step=choice==='UseMedicine'?'use':choice==='BuyMedicine'?'buy':'wait';
  const reasonCode=choice==='UseMedicine'?'USE_OWN_MEDICINE':choice==='BuyMedicine'?'BUY_KNOWN_SUPPLY':buy.reasonCode;
  const evidenceRefs=[...new Set([...knowledge.belief.evidenceRefs,...knowledge.belief.contradictionRefs])].sort((a,b)=>a-b);
  const decision={version:MIND_DECISION_VERSION,decisionId:'mind-day-'+day+'-'+knowledge.actorId,actorId:knowledge.actorId,
    tick:knowledge.tick,goalId:goal?goal.goalId:null,choice,reasonCode,candidates,evidenceRefs,
    knowledgeFingerprint:canonicalJson(knowledge)};
  validateDecision(decision);
  return {goal,nextGoalId,decision};
}

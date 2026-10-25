// Read only the hunter's recorded state. Never run a planner or read future inputs.
import {HUNTER_SITES} from './npc-village-sites.mjs';
import {socialTravelTarget} from './npc-social.mjs';

const travelActions=['WorkForPay','BuyFood','Rest','NoAction'];
const actions=[...travelActions,'BuyMedicine','UseMedicine'];
const kinds=['secure-food','recover-health','recover-rest','aid-village'];
const destinations={WorkForPay:'work-site',BuyFood:'food-stall',Rest:'rest-site',NoAction:'rest-site'};
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));

// Also used at the Provider boundary: reconstruct all fields, drop unknown data.
export function sanitizeNpcLifeContext(value,tick){
 if(value?.version!==1)return null;
 const i=value.intent,p=value.plan,r=value.lastResult;
 const intent=i&&travelActions.includes(i.action)&&['safety','tool',null].includes(i.redirect)&&
  nat(i.decidedTick)&&i.decidedTick<=tick&&['travelling','at-destination','awaiting-review','stopped'].includes(i.phase)&&
  i.destination===(i.redirect==='safety'?'safety':i.redirect==='tool'?'rest-site':destinations[i.action])?
  {action:i.action,destination:i.destination,decidedTick:i.decidedTick,phase:i.phase,redirect:i.redirect}:null;
 const plan=p&&kinds.includes(p.kind)&&actions.includes(p.step)&&['ready','blocked'].includes(p.status)?
  {kind:p.kind,step:p.step,status:p.status}:null;
 const lastResult=r&&actions.includes(r.action)&&['succeeded','rejected','no-action'].includes(r.status)&&nat(r.tick)&&r.tick<=tick&&
  (r.action==='NoAction')===(r.status==='no-action')&&
  Number.isSafeInteger(r.walletChange)&&Number.isSafeInteger(r.foodChange)&&
  (r.status==='succeeded'||r.walletChange===0&&r.foodChange===0)?
  {action:r.action,status:r.status,tick:r.tick,walletChange:r.walletChange,foodChange:r.foodChange}:null;
 return {version:1,intent,plan,lastResult};
}

export function npcLifeContext(world,tick){
 const self=world.actorModel.actors.find(a=>a.actorId==='actor-2'),map=world.mapModel;
 const mind=world.motivationModel.actors.find(a=>a.actorId==='actor-2'),social=map.socialModel.actors.find(a=>a.actorId==='actor-2');
 const position=map.npcs.find(a=>a.actorId==='actor-2'),i=map.hunterIntent,p=mind.activePlan,d=mind.lastDecision,r=mind.lastOutcome;
 const lastResult=d?.actorId==='actor-2'&&r?.actorId==='actor-2'&&d.decisionId===r.decisionId?
  {action:d.choice,status:r.status,tick:d.tick,walletChange:r.delta.wallet,foodChange:r.delta.food}:null;
 // These are exactly the existing social movement overrides, using own knowledge
 // and the nearby player's perceived presence. Hidden asset state is not read.
 const redirect=social.fear>=40&&distance(position,map.position)<=3?'safety':
  social.knownHolder!=='actor-2'||social.knownCondition<40?'tool':null;
 const destination=redirect==='safety'?'safety':redirect==='tool'?'rest-site':destinations[i.action];
 const target=socialTravelTarget(world,HUNTER_SITES[i.action]);
 const phase=!self.alive?'stopped':!redirect&&lastResult&&lastResult.tick>=i.decidedTick?'awaiting-review':
  distance(position,target)===0?'at-destination':'travelling';
 return sanitizeNpcLifeContext({version:1,intent:{action:i.action,destination,decidedTick:i.decidedTick,phase,redirect},
  plan:p?{kind:p.kind,step:p.steps[p.stepIndex],status:p.status}:null,lastResult},tick);
}

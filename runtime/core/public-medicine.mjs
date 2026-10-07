// C4 self-published facts and planning inputs. Authority rechecks real assets.
import { fields,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition } from './data-contract.mjs';
import { validateSocietyWorld } from './society.mjs';
import { MAX_PERSISTENT_ACTORS } from './actors.mjs';

const REQUEST='MedicalRequestAnnounced',OFFER='MedicineOfferAnnounced';
const codeOrder=(a,b)=>a<b?-1:a>b?1:0;
function cappedPrice(postedPrice,maxPrice,markup){return markup>maxPrice-postedPrice?maxPrice:postedPrice+markup;}
function validateQuote(quote){
  fields(quote,['postedPrice','maxPrice','markup','discountEnabled']);integer(quote.postedPrice,1);integer(quote.maxPrice,1);integer(quote.markup);
  requireCondition(quote.postedPrice<=quote.maxPrice && quote.markup<=1000 && typeof quote.discountEnabled==='boolean','Invalid public medicine quote');
}
export function validateMedicineAnnouncement(fact){
  fields(fact,['type','sourceSystem','commandId','causationEventSeqs','entityIds','payload']);
  requireCondition([REQUEST,OFFER].includes(fact.type) && fact.sourceSystem==='society' && fact.commandId===null,'Invalid medicine announcement source');
  denseArray(fact.causationEventSeqs,0);denseArray(fact.entityIds,1);requireCondition(fact.entityIds.length===1,'Missing medicine announcer');
  const p=fact.payload;fields(p,['actorId','amount',fact.type===REQUEST?'maxPrice':'price','expiresTick']);
  identifier(p.actorId);integer(p.expiresTick,1);integer(p[fact.type===REQUEST?'maxPrice':'price'],1);
  requireCondition(fact.entityIds[0]===p.actorId && p.amount===1,'Medicine announcement identity/quantity mismatch');
}
function fact(type,actorId,price,expiresTick){return {type,sourceSystem:'society',commandId:null,causationEventSeqs:[],entityIds:[actorId],
  payload:{actorId,amount:1,[type===REQUEST?'maxPrice':'price']:price,expiresTick}};}

export function createMedicineAnnouncements(world,tick){
  validateSocietyWorld(world);integer(tick,1);requireCondition(tick===(world.societyModel.day+1)*144,'Announcement tick is not next daily decision');
  const quote=world.marketModel.prices.herbs,price=cappedPrice(quote,world.marketModel.config.products.herbs.maxPrice,world.societyModel.config.saleMarkup),facts=[];
  for(const actor of world.actorModel.actors){
    if(!actor.alive)continue;
    const estate=world.societyModel.agents.find(a=>a.state.actorId===actor.actorId);if(!estate)continue;const own=estate.state;
    // Willingness is a posted price, never the person's entire available balance.
    if(actor.health<=700 && own.inventory.herbs===0 && own.wallet>=quote)facts.push(fact(REQUEST,actor.actorId,price,tick));
    if(actor.occupation==='merchant' && own.inventory.herbs>0)facts.push(fact(OFFER,actor.actorId,price,tick));
  }
  return cloneData(facts);
}

export function selectPublicMedicineBuyer(announcements,sellerId,relationships,quote,tick){
  identifier(sellerId);integer(tick);validateQuote(quote);denseArray(announcements,MAX_PERSISTENT_ACTORS*2);
  const keys=new Set();for(const f of announcements){validateMedicineAnnouncement(f);const key=canonicalJson([f.type,f.payload.actorId]);
    requireCondition(!keys.has(key),'Duplicate medicine announcement');keys.add(key);}
  denseArray(relationships,MAX_PERSISTENT_ACTORS);const trust=new Map();
  for(const r of relationships){fields(r,['actorId','trust','lastSourceEventSeq']);identifier(r.actorId);integer(r.trust);integer(r.lastSourceEventSeq,1);
    requireCondition(r.actorId!==sellerId && r.trust<=1000 && !trust.has(r.actorId),'Invalid/duplicate public planning relation');trust.set(r.actorId,r.trust);}
  const offer=announcements.find(f=>f.type===OFFER && f.payload.actorId===sellerId && f.payload.expiresTick>=tick);
  if(!offer)return null;
  const regular=cappedPrice(quote.postedPrice,quote.maxPrice,quote.markup);
  requireCondition(offer.payload.price===regular,'Supply quote differs from current published price');
  const candidates=[];
  for(const f of announcements){
    if(f.type!==REQUEST || f.payload.actorId===sellerId || f.payload.expiresTick<tick)continue;
    const score=trust.get(f.payload.actorId)??0,price=quote.discountEnabled && score>=20?quote.postedPrice:regular;
    if(f.payload.maxPrice>=price)candidates.push({actorId:f.payload.actorId,price,score});
  }
  candidates.sort((a,b)=>b.score-a.score || codeOrder(a.actorId,b.actorId));
  return candidates.length?{actorId:candidates[0].actorId,price:candidates[0].price}:null;
}

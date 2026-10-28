// A quest observes committed borrowing, travel and return. It grants no assets or relation points.
import {fields,integer,requireCondition} from './data-contract.mjs';
import {TRUST_QUEST_ID} from '../../runtime-playable-contract.mjs';
export const trustDefinition={id:TRUST_QUEST_ID,title:'可选委托：借工具探路',description:'接取后向猎人实际借到工具，带着工具抵达森林，再按借期归还。偷抢或口头声称不算完成。',targets:[1,1],reward:'获得守约伙伴称号'};
const quest=w=>w.mapModel.playModel?.quests.find(q=>q.id===TRUST_QUEST_ID);
export const hasTrust=p=>p?.version==='playable-v2';
export function validateTrustLoan(p,tick){
 const q=p.quests.at(-1),loan=p.trustLoan;
 if(loan===null){requireCondition(q.progress.every(n=>n===0),'Trust progress without borrowing');return;}
 fields(loan,['borrowedSeq','borrowedTick','dueTick','exploredTick','returnedSeq','returnedTick']);
 integer(loan.borrowedSeq,1);integer(loan.borrowedTick);integer(loan.dueTick);
 requireCondition(q.acceptedTick!==null&&loan.borrowedTick>=q.acceptedTick&&loan.borrowedTick<=tick&&[36,72,144].includes(loan.dueTick-loan.borrowedTick),'Invalid trust loan clock');
 if(loan.exploredTick!==null){integer(loan.exploredTick);requireCondition(loan.exploredTick>loan.borrowedTick&&loan.exploredTick<=tick&&loan.exploredTick<=loan.dueTick,'Invalid exploration clock');}
 requireCondition((loan.returnedSeq===null)===(loan.returnedTick===null),'Incomplete return source');
 if(loan.returnedSeq!==null){integer(loan.returnedSeq,1);integer(loan.returnedTick);requireCondition(loan.returnedSeq>loan.borrowedSeq&&loan.returnedTick>loan.borrowedTick&&loan.returnedTick<=tick&&(loan.exploredTick===null||loan.returnedTick>=loan.exploredTick),'Invalid return source');}
 requireCondition(q.progress[0]===(loan.exploredTick===null?0:1),'Exploration/progress mismatch');
 if(q.progress[1])requireCondition(loan.exploredTick!==null&&loan.returnedTick!==null&&loan.returnedTick<=loan.dueTick&&loan.returnedTick<=q.deadlineTick,'Unfulfilled trust marked ready');
 requireCondition(!['locked','available'].includes(q.status),'Unaccepted trust has a loan');
}
export function observeTrustTick(world,tick){
 const p=world.mapModel.playModel;if(!hasTrust(p))return;const q=quest(world),loan=p.trustLoan;
 if(q.status!=='active')return;
 if(!world.actorModel.actors[1].alive){q.status='failed';return;}
 if(!loan||loan.returnedTick!==null)return;
 if(tick>loan.dueTick||world.mapModel.socialModel.asset.holderId!=='actor-4'){q.status='failed';return;}
 if(world.actorModel.actors[3].location==='forest'&&tick>loan.borrowedTick){loan.exploredTick??=tick;q.progress[0]=1;}
}
export function observeTrustCommand(world,dto,receipt,tick){
 const p=world.mapModel.playModel;if(!hasTrust(p)||receipt.outcome!=='succeeded')return;
 const q=quest(world),r=receipt.result,a=world.mapModel.socialModel.asset;
 const borrowed=dto.type==='PlayerInteract'&&dto.payload.action==='ask-help'||dto.type==='PlayerAgreement'&&dto.payload.action==='claim';
 if(q.status==='active'&&p.trustLoan===null&&borrowed&&r.effect==='lent'&&a.holderId==='actor-4'&&a.loanDueTick!==null){
  p.trustLoan={borrowedSeq:r.sourceEventSeq,borrowedTick:tick,dueTick:a.loanDueTick,exploredTick:null,returnedSeq:null,returnedTick:null};
 }
 const loan=p.trustLoan;
 // Even a failed/abandoned task records the real return; it never clears the world's debt itself.
 if(loan&&loan.returnedTick===null&&dto.type==='PlayerInteract'&&dto.payload.action==='return'&&r.effect==='returned'&&a.holderId==='actor-2'&&r.sourceEventSeq>loan.borrowedSeq){
  loan.returnedSeq=r.sourceEventSeq;loan.returnedTick=tick;
  if(q.status==='active'){
   if(loan.exploredTick!==null&&tick<=loan.dueTick&&tick<=q.deadlineTick){q.progress[1]=1;q.status='ready';}
   else q.status='failed';
  }
 }
}
export const trustLoanView=loan=>loan===null?null:Object.fromEntries(['borrowedTick','dueTick','exploredTick','returnedTick'].map(k=>[k,loan[k]]));
